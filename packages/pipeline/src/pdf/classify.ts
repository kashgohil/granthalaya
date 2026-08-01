/**
 * Decide how a PDF's text must be got out of it (P1.1).
 *
 * The roadmap's rule is absolute: *never trust embedded text from a legacy-font PDF — render
 * to image and OCR instead*. This file is where that rule stops being a note and becomes a
 * function, so the decision is made the same way for every book and can be argued with in a
 * test rather than in a code review.
 *
 * The decisive signal is neither the font's name nor its flags but **what script the text
 * actually extracts as**. A legacy Gujarati font paints Gujarati glyphs onto Latin code
 * points: the page reads perfectly and the bytes behind it are ASCII. Any PDF whose Gujarati
 * comes out as Latin is lying about its text layer, whatever its metadata says.
 *
 * Every ambiguity resolves toward OCR. Re-OCRing a book that had a good text layer costs
 * machine time; trusting a legacy layer costs scripture fidelity, and would do it silently.
 *
 * Pure: takes facts, returns a verdict. No I/O, no MuPDF.
 */
import { checkOrthography, describeViolation, profileScript, type Script } from "@granthalaya/core";
import type { PdfFacts, PdfFont, PdfInspection, PdfPageFacts } from "./inspect.ts";

/** What the pipeline should do with this file. */
export type Strategy =
	/** The text layer is real Unicode and can be extracted directly. */
	| "unicode-text"
	/** There is a text layer, but it is legacy-encoded — render and OCR. */
	| "legacy-text"
	/**
	 * The text layer extracts as Indic Unicode and is nonetheless corrupt: the PDF's
	 * `ToUnicode` map is wrong. Render and OCR.
	 */
	| "broken-encoding"
	/** Page images with no trustworthy text layer — render and OCR. */
	| "scanned"
	/** Sampled pages disagree; the book needs a per-section decision. */
	| "mixed"
	/** Nothing to go on: blank, encrypted or unreadable. */
	| "unknown";

export type Confidence = "high" | "medium" | "low";

/** Per-page verdicts, aggregated into the document's. `blank` pages are not evidence. */
export type PageStrategy = "unicode-text" | "legacy-text" | "broken-encoding" | "scanned" | "blank";

export type PageVerdict = {
	readonly number: number;
	readonly strategy: PageStrategy;
	/** Script-bearing characters extracted from the page. */
	readonly chars: number;
	readonly imageCoverage: number;
	readonly script: Script | "other" | null;
};

export type Triage = {
	readonly strategy: Strategy;
	readonly confidence: Confidence;
	/**
	 * The single actionable bit. True for everything but a confident `unicode-text`, because
	 * the cost of the two mistakes is not symmetric.
	 */
	readonly needsOcr: boolean;
	/** Dominant script across the sampled text, or `null` when there is no text. */
	readonly script: Script | "other" | null;
	/** Evidence, heaviest first, phrased for the inventory a human reads. */
	readonly reasons: readonly string[];
	readonly pages: readonly PageVerdict[];
	/** Legacy font families found by name, if any. */
	readonly legacyFonts: readonly string[];
};

/** A page below this many script-bearing characters says nothing about the text layer. */
const MIN_TEXT_CHARS = 32;

/** Image coverage at or above this means the page *is* a picture. */
const IMAGE_DOMINANT = 0.5;

/** An Indic share this high over a whole page is unambiguous. */
const INDIC_SHARE = 0.5;

/** Below this share of common English words, Latin text is not natural language. */
const ENGLISH_WORD_RATE = 0.12;

/**
 * Impossible letter sequences per 1000 letters, above which an Indic text layer is corrupt
 * rather than merely odd.
 *
 * Correctly encoded text scores exactly zero — every rule in `checkOrthography` describes
 * something the writing system does not permit — and the broken Foxit/Shruti PDF this rule
 * was written for scores 45–55. One per 1000 leaves room for a stray editorial artefact
 * while keeping a factor of forty-five between a clean book and a corrupt one.
 */
const ORTHOGRAPHY_RATE = 1;

/** A strategy must hold this much of the sampled evidence, or the book is `mixed`. */
const CONSENSUS = 0.8;

/**
 * Legacy (non-Unicode) Gujarati and Devanagari font families, matched as substrings of the
 * font name with separators removed. Presence is corroborating evidence, never the verdict:
 * the list is inevitably incomplete, and a book set in an unlisted legacy font must still be
 * caught by the script signal alone.
 */
const LEGACY_FONT_FAMILIES: readonly string[] = [
	// Gujarati
	"shreeguj",
	"shreelipi",
	"gopika",
	"terafont",
	"lmg",
	"avantika",
	"bhashabharti",
	"saumil",
	"ekatra",
	"gujaratitimes",
	"gujaratisaral",
	"harikrishna",
	"ghanshyam",
	"sulekh",
	"vakil",
	"akshargujarati",
	// Devanagari, for the Sanskrit quotations these editions carry
	"krutidev",
	"devlys",
	"chanakya",
	"aps-dv",
	"apsdv",
	"shreedev",
	"kiran",
	"yogeshweb",
	"walkman",
];

/** Common English words. A natural-language page hits these constantly; soup never does. */
const ENGLISH_WORDS: ReadonlySet<string> = new Set(
	(
		"the of and to a in is it that was for on are with as at be this have from or by one " +
		"had not but what all were we when your can said there use an each which she do how " +
		"their if will up other about out many then them these so some her would make like " +
		"him into time has look two more write see no way could people my than been who its " +
		"now did get come made may part over new also"
	).split(" "),
);

/**
 * Encodings that map bytes to Unicode on their own, so a font using one needs no `ToUnicode`
 * map to extract correctly. Helvetica with `WinAnsiEncoding` is not a problem and must not be
 * reported as one — the first version of this check flagged exactly those, and stayed silent
 * about the Shruti font whose `ToUnicode` map was actually wrong.
 */
const SELF_DESCRIBING_ENCODINGS: ReadonlySet<string> = new Set([
	"WinAnsiEncoding",
	"MacRomanEncoding",
	"MacExpertEncoding",
	"StandardEncoding",
	"PDFDocEncoding",
]);

/**
 * A font whose bytes cannot be turned back into Unicode by any declared means: no `ToUnicode`
 * map, and a custom or identity encoding rather than a standard one. Extraction from it is a
 * guess, whatever comes out.
 */
function isUnmappable(font: PdfFont): boolean {
	if (!font.used || font.hasToUnicode) {
		return false;
	}
	return font.encoding === null || !SELF_DESCRIBING_ENCODINGS.has(font.encoding);
}

/** Fold a font name to the form the legacy list is written in. */
function foldFontName(name: string): string {
	return name.toLowerCase().replace(/[\s_.]/g, "");
}

/** Legacy families this font's name matches. */
export function legacyFamiliesIn(fontName: string): string[] {
	const folded = foldFontName(fontName);
	return LEGACY_FONT_FAMILIES.filter((family) => folded.includes(family));
}

/**
 * How much of `text` reads as natural-language English, 0..1.
 *
 * This is what separates a genuine English PDF from legacy-font output, since both extract
 * as Latin. English prose is roughly a third common words; legacy soup — `Ap[ NA[T> lJvg` —
 * is essentially none.
 */
export function englishWordRate(text: string): number {
	const tokens = text.toLowerCase().match(/[a-z]+/g);
	if (tokens === null || tokens.length < 8) {
		return 0;
	}
	const hits = tokens.filter((token) => ENGLISH_WORDS.has(token)).length;
	return hits / tokens.length;
}

function classifyPage(page: PdfPageFacts): PageVerdict {
	const profile = profileScript(page.text);
	const base = {
		number: page.number,
		chars: profile.total,
		imageCoverage: page.imageCoverage,
		script: profile.dominant,
	};

	// A page that is mostly a picture is a scan, whatever text sits over it. A Unicode text
	// layer on a page image is somebody else's OCR of unknown quality — a useful cross-check
	// later, but not a substitute for running our own.
	if (page.imageCoverage >= IMAGE_DOMINANT) {
		return { ...base, strategy: "scanned" };
	}
	if (profile.total < MIN_TEXT_CHARS) {
		return { ...base, strategy: "blank" };
	}
	if (
		(profile.dominant === "gujr" || profile.dominant === "deva") &&
		profile.share >= INDIC_SHARE
	) {
		// Indic code points are not the end of the question. A PDF can carry a `ToUnicode` map
		// that is simply wrong, and then every character extracts as a legitimate Gujarati code
		// point while the words are nonsense. Only orthography catches that.
		const orthography = checkOrthography(page.text, profile.dominant);
		return {
			...base,
			strategy: orthography.rate > ORTHOGRAPHY_RATE ? "broken-encoding" : "unicode-text",
		};
	}
	// Latin-dominant. Real English is a real text layer; anything else is a legacy encoding.
	if (profile.dominant === "latn" && englishWordRate(page.text) >= ENGLISH_WORD_RATE) {
		return { ...base, strategy: "unicode-text" };
	}
	return { ...base, strategy: "legacy-text" };
}

function tally(verdicts: readonly PageVerdict[]): Map<PageStrategy, number> {
	const counts = new Map<PageStrategy, number>();
	for (const verdict of verdicts) {
		counts.set(verdict.strategy, (counts.get(verdict.strategy) ?? 0) + 1);
	}
	return counts;
}

function percent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

/** Classify an inspection. An unreadable file is `unknown`, and still needs OCR. */
export function triagePdf(inspection: PdfInspection): Triage {
	if (!inspection.ok) {
		return {
			strategy: "unknown",
			confidence: "high",
			needsOcr: true,
			script: null,
			reasons: [
				inspection.reason === "encrypted"
					? `encrypted — supply the password before triage can read it (${inspection.detail})`
					: `unreadable — ${inspection.detail}`,
			],
			pages: [],
			legacyFonts: [],
		};
	}
	return triageFacts(inspection);
}

function triageFacts(facts: PdfFacts): Triage {
	const pages = facts.pages.map(classifyPage);
	const evidence = pages.filter((page) => page.strategy !== "blank");
	const legacyFonts = uniqueLegacyFonts(facts.fonts);
	const reasons: string[] = [];

	if (facts.repaired) {
		reasons.push("the cross-reference table was damaged and had to be rebuilt");
	}

	if (evidence.length === 0) {
		return {
			strategy: "unknown",
			confidence: pages.length === 0 ? "high" : "medium",
			needsOcr: true,
			script: null,
			reasons: [
				pages.length === 0
					? "the file has no pages"
					: `all ${pages.length} sampled pages are blank — no text and no images`,
				...reasons,
			],
			pages,
			legacyFonts,
		};
	}

	const counts = tally(evidence);
	const [leading, leadingCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] as [
		PageStrategy,
		number,
	];
	const consensus = leadingCount / evidence.length;

	const allText = facts.pages.map((page) => page.text).join("\n");
	const profile = profileScript(allText);
	const strategy: Strategy = consensus >= CONSENSUS ? (leading as Strategy) : "mixed";

	// Reasons, heaviest first — this is what lands in the inventory a human reads.
	if (strategy === "mixed") {
		const spread = [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([name, count]) => `${count} ${name}`)
			.join(", ");
		reasons.unshift(`sampled pages disagree (${spread}) — decide per section`);
	} else if (strategy === "scanned") {
		const scanned = evidence.filter((page) => page.strategy === "scanned").length;
		const mean =
			facts.pages.reduce((sum, page) => sum + page.imageCoverage, 0) / facts.pages.length;
		reasons.unshift(
			`${scanned} of ${evidence.length} sampled pages are page images (mean coverage ${percent(mean)})`,
		);
		const withText = evidence.filter(
			(page) => page.strategy === "scanned" && page.chars >= MIN_TEXT_CHARS,
		).length;
		if (withText > 0) {
			reasons.push(
				`${withText} carry a text layer over the image — somebody's OCR, worth diffing against ours but not worth trusting`,
			);
		}
	} else if (strategy === "legacy-text") {
		reasons.unshift(
			`the text layer extracts as ${profile.dominant ?? "nothing"} (${percent(profile.share)}), ` +
				"not as an Indic script — the glyphs are painted onto Latin code points",
		);
		const rate = englishWordRate(allText);
		reasons.push(
			`only ${percent(rate)} of its Latin words are common English, so it is an encoding, not prose`,
		);
	} else if (strategy === "broken-encoding") {
		// The most dangerous verdict to get wrong, so it leads with the evidence: this text
		// looks entirely correct — right script, right code points — and is not.
		const orthography = checkOrthography(allText, profile.dominant === "deva" ? "deva" : "gujr");
		reasons.unshift(
			`the text layer extracts as ${profile.dominant} but is not well-formed ${profile.dominant}: ` +
				`${orthography.count} impossible letter sequences in ${orthography.examined} letters ` +
				`(${orthography.rate.toFixed(0)} per 1000). The PDF declares a ToUnicode map and that map is wrong`,
		);
		for (const violation of orthography.violations.slice(0, 4)) {
			reasons.push(describeViolation(violation));
		}
		reasons.push(
			"the text would render beautifully and read as misspelled nonsense — OCR the pages instead",
		);
	} else {
		reasons.unshift(
			`the text layer extracts as ${profile.dominant} (${percent(profile.share)} of script-bearing characters)`,
		);
	}

	if (legacyFonts.length > 0) {
		reasons.push(`known legacy font families present: ${legacyFonts.join(", ")}`);
	}

	const unmappable = facts.fonts.filter(isUnmappable);
	if (strategy !== "scanned" && unmappable.length > 0) {
		reasons.push(
			`${unmappable.length} font${unmappable.length === 1 ? "" : "s"} in use can't be mapped back to Unicode ` +
				`(no ToUnicode map, and no standard encoding to fall back on): ` +
				unmappable.map((font) => `${font.name} [${font.encoding ?? "no encoding"}]`).join(", "),
		);
	}

	return {
		strategy,
		confidence: confidenceOf(strategy, consensus, evidence.length, legacyFonts.length > 0),
		// Everything except a plain `unicode-text` verdict goes to OCR.
		needsOcr: strategy !== "unicode-text",
		script: profile.dominant,
		reasons,
		pages,
		legacyFonts,
	};
}

function uniqueLegacyFonts(fonts: readonly PdfFont[]): string[] {
	const found = new Set<string>();
	for (const font of fonts) {
		if (legacyFamiliesIn(font.name).length > 0) {
			found.add(font.name);
		}
	}
	return [...found];
}

function confidenceOf(
	strategy: Strategy,
	consensus: number,
	sampled: number,
	corroborated: boolean,
): Confidence {
	if (strategy === "mixed" || strategy === "unknown") {
		return "low";
	}
	if (sampled < 3) {
		// Two pages agreeing is not a consensus, it is a coincidence.
		return "low";
	}
	if (consensus === 1 && (strategy !== "legacy-text" || corroborated)) {
		return "high";
	}
	return consensus >= CONSENSUS ? "medium" : "low";
}
