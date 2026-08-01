import { expect, test } from "bun:test";
import { englishWordRate, legacyFamiliesIn, type Triage, triagePdf } from "./classify.ts";
import { BROKEN_ENCODING_PAGES, ENGLISH_PAGES, GUJARATI_PAGES, LEGACY_PAGES } from "./fixtures.ts";
import { inspectPdfBytes, type PdfFacts, type PdfPageFacts } from "./inspect.ts";
import { blankPdf, legacyTextPdf, nestedFormPdf, scannedPdf, unicodeTextPdf } from "./synthetic.ts";

function triage(bytes: Uint8Array): Triage {
	return triagePdf(inspectPdfBytes(bytes));
}

function reasons(result: Triage): string {
	return result.reasons.join(" | ");
}

test("trusts a text layer that extracts as Gujarati", () => {
	const result = triage(unicodeTextPdf(GUJARATI_PAGES));
	expect(result.strategy).toBe("unicode-text");
	expect(result.needsOcr).toBe(false);
	expect(result.script).toBe("gujr");
	expect(result.confidence).toBe("high");
});

test("catches a text layer that is Unicode Gujarati and still corrupt", () => {
	// The failure the script tally cannot see: a PDF declaring a ToUnicode map that is wrong.
	// Every code point is legitimate Gujarati, the tally reads 100% gujr, the words are
	// impossible. Publishing this would render beautifully and read as nonsense.
	const result = triage(unicodeTextPdf(BROKEN_ENCODING_PAGES));
	expect(result.strategy).toBe("broken-encoding");
	expect(result.needsOcr).toBe(true);
	expect(result.script).toBe("gujr");
	expect(reasons(result)).toContain("not well-formed");
	expect(reasons(result)).toContain("that map is wrong");
});

test("does not call correctly encoded Gujarati broken", () => {
	// The check has to be worth trusting in both directions, or it just sends every book to OCR.
	const result = triage(unicodeTextPdf(GUJARATI_PAGES));
	expect(result.strategy).toBe("unicode-text");
	expect(result.needsOcr).toBe(false);
});

test("sends a legacy-font text layer to OCR", () => {
	// The whole point of the slice: this PDF *looks* like Gujarati and extracts as ASCII.
	const result = triage(legacyTextPdf(LEGACY_PAGES));
	expect(result.strategy).toBe("legacy-text");
	expect(result.needsOcr).toBe(true);
	expect(result.script).toBe("latn");
	expect(reasons(result)).toContain("not as an Indic script");
});

test("names the legacy font family when it recognises one", () => {
	const result = triage(legacyTextPdf(LEGACY_PAGES, "ShreeGuj-0768"));
	expect(result.legacyFonts).toEqual(["ShreeGuj-0768"]);
	expect(reasons(result)).toContain("known legacy font families");
});

test("catches a legacy font whose family it has never heard of", () => {
	// The font list is inevitably incomplete, so the script signal has to stand on its own —
	// otherwise every unlisted legacy font would be published as scripture.
	const result = triage(legacyTextPdf(LEGACY_PAGES, "Nirmal-Guj-Special-2004"));
	expect(result.strategy).toBe("legacy-text");
	expect(result.needsOcr).toBe(true);
	expect(result.legacyFonts).toEqual([]);
});

test("does not mistake genuine English prose for a legacy encoding", () => {
	// Both extract as Latin; only one of them is real language.
	const result = triage(legacyTextPdf(ENGLISH_PAGES, "Helvetica"));
	expect(result.strategy).toBe("unicode-text");
	expect(result.needsOcr).toBe(false);
	expect(result.script).toBe("latn");
});

test("sends a scan to OCR", () => {
	const result = triage(scannedPdf(6));
	expect(result.strategy).toBe("scanned");
	expect(result.needsOcr).toBe(true);
	expect(reasons(result)).toContain("page images");
});

test("re-OCRs a searchable scan even when its text layer is good Unicode", () => {
	// A Unicode text layer over a page image is somebody else's OCR of unknown quality. It is
	// worth diffing against ours later, but trusting it would publish unproofed scripture.
	const result = triage(scannedPdf(6, { text: GUJARATI_PAGES, textEncoding: "unicode" }));
	expect(result.strategy).toBe("scanned");
	expect(result.needsOcr).toBe(true);
	expect(reasons(result)).toContain("not worth trusting");
});

test("sends a searchable scan with a legacy text layer to OCR too", () => {
	const result = triage(scannedPdf(6, { text: LEGACY_PAGES }));
	expect(result.strategy).toBe("scanned");
	expect(result.needsOcr).toBe(true);
});

test("finds the legacy font when the body text hides inside a Form XObject", () => {
	const result = triage(nestedFormPdf(LEGACY_PAGES));
	expect(result.strategy).toBe("legacy-text");
	expect(result.legacyFonts).toEqual(["ShreeGuj-0768"]);
});

test("says it has nothing to go on rather than guessing", () => {
	const result = triage(blankPdf(4));
	expect(result.strategy).toBe("unknown");
	expect(result.needsOcr).toBe(true);
	expect(reasons(result)).toContain("blank");
});

test("reports an unreadable file as unknown, and still routes it to OCR", () => {
	const result = triage(new TextEncoder().encode("not a PDF"));
	expect(result.strategy).toBe("unknown");
	expect(result.needsOcr).toBe(true);
});

test("tells an encrypted file apart from a corrupt one", () => {
	// Worth distinguishing in the inventory: this is a file we could read with a password.
	const result = triagePdf({ ok: false, reason: "encrypted", detail: "password required" });
	expect(result.strategy).toBe("unknown");
	expect(result.needsOcr).toBe(true);
	expect(reasons(result)).toContain("encrypted");
});

test("holds low confidence when there is barely any evidence", () => {
	// Two pages agreeing is a coincidence, not a consensus.
	const result = triage(unicodeTextPdf(GUJARATI_PAGES.slice(0, 2)));
	expect(result.strategy).toBe("unicode-text");
	expect(result.confidence).toBe("low");
});

// --- aggregation across disagreeing pages ------------------------------------------------
// Built as facts rather than as a PDF: the parsing path is covered above, and what is under
// test here is purely how per-page verdicts combine.

function page(number: number, over: Partial<PdfPageFacts>): PdfPageFacts {
	return {
		number,
		widthPt: 595,
		heightPt: 842,
		text: "",
		fontNames: [],
		imageCoverage: 0,
		imageCount: 0,
		...over,
	};
}

function factsOf(pages: readonly PdfPageFacts[]): PdfFacts {
	return {
		ok: true,
		pageCount: pages.length,
		pages,
		fonts: [],
		title: null,
		producer: null,
		creator: null,
		pdfVersion: "PDF 1.7",
		repaired: false,
	};
}

test("calls a book mixed when its sampled pages genuinely disagree", () => {
	const result = triagePdf(
		factsOf([
			page(1, { text: GUJARATI_PAGES[0] as string }),
			page(2, { text: GUJARATI_PAGES[1] as string }),
			page(3, { imageCoverage: 1, imageCount: 1 }),
			page(4, { imageCoverage: 1, imageCount: 1 }),
			page(5, { imageCoverage: 1, imageCount: 1 }),
		]),
	);
	expect(result.strategy).toBe("mixed");
	expect(result.needsOcr).toBe(true);
	expect(result.confidence).toBe("low");
	expect(reasons(result)).toContain("decide per section");
});

test("does not call a book mixed over a single odd page", () => {
	// One scanned plate in a text-layer book is a plate, not a change of strategy.
	const pages = [
		...GUJARATI_PAGES.map((text, index) => page(index + 1, { text })),
		...GUJARATI_PAGES.map((text, index) => page(index + 5, { text })),
		...GUJARATI_PAGES.map((text, index) => page(index + 9, { text })),
		page(13, { imageCoverage: 1, imageCount: 1 }),
	];
	const result = triagePdf(factsOf(pages));
	expect(result.strategy).toBe("unicode-text");
	expect(result.confidence).toBe("medium");
});

test("ignores blank pages when weighing the evidence", () => {
	// Blank pages are common (section breaks, versos) and say nothing either way.
	const result = triagePdf(
		factsOf([
			page(1, {}),
			page(2, { text: GUJARATI_PAGES[0] as string }),
			page(3, {}),
			page(4, { text: GUJARATI_PAGES[1] as string }),
			page(5, {}),
			page(6, { text: GUJARATI_PAGES[2] as string }),
		]),
	);
	expect(result.strategy).toBe("unicode-text");
	expect(result.pages.filter((verdict) => verdict.strategy === "blank")).toHaveLength(3);
});

test("mentions a rebuilt cross-reference table", () => {
	const result = triagePdf({
		...factsOf(GUJARATI_PAGES.map((text, index) => page(index + 1, { text }))),
		repaired: true,
	});
	expect(reasons(result)).toContain("damaged");
});

// --- the signals themselves ---------------------------------------------------------------

test("scores English prose far above legacy soup", () => {
	expect(englishWordRate(ENGLISH_PAGES.join(" "))).toBeGreaterThan(0.25);
	expect(englishWordRate(LEGACY_PAGES.join(" "))).toBeLessThan(0.05);
});

test("scores too short a sample as no evidence at all", () => {
	expect(englishWordRate("the of and")).toBe(0);
});

test("matches legacy font families through case and separators", () => {
	expect(legacyFamiliesIn("ShreeGuj-0768")).toContain("shreeguj");
	expect(legacyFamiliesIn("Shree_Guj 0768")).toContain("shreeguj");
	expect(legacyFamiliesIn("KrutiDev010")).toContain("krutidev");
	expect(legacyFamiliesIn("Noto Serif Gujarati")).toEqual([]);
	expect(legacyFamiliesIn("Rasa-Regular")).toEqual([]);
});

test("does not flag a standard Latin font for having no ToUnicode map", () => {
	// Helvetica with WinAnsiEncoding extracts perfectly without one. The first version of this
	// check reported exactly those fonts, and said nothing about the font whose ToUnicode map
	// was actually wrong — it pointed the reader at the wrong evidence.
	const result = triage(legacyTextPdf(ENGLISH_PAGES, "Helvetica"));
	expect(reasons(result)).not.toContain("Helvetica");
});

test("flags a font that has neither a ToUnicode map nor a standard encoding", () => {
	const result = triagePdf({
		...factsOf(GUJARATI_PAGES.map((text, index) => page(index + 1, { text }))),
		fonts: [
			{
				name: "Shruti",
				rawName: "ABCDEE+Shruti",
				subtype: "Type0",
				encoding: "Identity-H",
				hasToUnicode: false,
				embedded: true,
				used: true,
			},
		],
	});
	expect(reasons(result)).toContain("Shruti");
	expect(reasons(result)).toContain("Identity-H");
});

test("never leaves needsOcr false for anything but a plain unicode-text verdict", () => {
	// The invariant the whole slice exists to guarantee.
	const results = [
		triage(unicodeTextPdf(GUJARATI_PAGES)),
		triage(legacyTextPdf(LEGACY_PAGES)),
		triage(scannedPdf(6)),
		triage(blankPdf(4)),
		triage(new TextEncoder().encode("not a PDF")),
	];
	for (const result of results) {
		expect(result.needsOcr).toBe(result.strategy !== "unicode-text");
	}
});
