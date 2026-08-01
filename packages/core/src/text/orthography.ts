/**
 * Is this text *possible* Gujarati, or only Gujarati-shaped?
 *
 * A PDF can carry a `ToUnicode` map — its own promise that its glyphs extract to real
 * Unicode — and have that map be wrong. The first Gujarati PDF this project met did exactly
 * that: Foxit had written a Shruti mapping in which the pre-base matra `િ` did not appear at
 * all, so `નિરાંતે` extracted as `નનરાુંતે`. Every character was a legitimate Gujarati code
 * point, the script tally read 100% `gujr`, and the text was nonsense.
 *
 * Script detection cannot catch that; only orthography can. These rules encode sequences the
 * writing system does not permit — two vowel signs in a row, a vowel sign with nothing to
 * attach to, a virama followed by a vowel instead of a consonant — so a broken mapping shows
 * up as an *impossibility*, not as a matter of taste.
 *
 * The rules are deliberately conservative. Every violation here is something no correctly
 * encoded text can contain, so a clean book scores exactly zero and the check can be trusted
 * to route a book to OCR.
 */
import type { Script } from "../book/schema.ts";
import { isConjoinableConsonant, isVirama } from "./akshara.ts";

type Range = readonly [number, number];

/**
 * Dependent vowel signs (matras) only — deliberately *not* anusvara, candrabindu, visarga or
 * nukta. Those legitimately follow a vowel sign (`ુ` + `ં` is the everyday `ું`), so folding
 * them in here would make the commonest spelling in the language look like a violation.
 */
const VOWEL_SIGN_RANGES: readonly Range[] = [
	[0x093a, 0x093b], // Devanagari vowel signs oe, ooe
	[0x093e, 0x094c], // Devanagari matras aa–au (0x094d is the virama, excluded)
	[0x094e, 0x094f], // Devanagari matras prishthamatra e, aw
	[0x0955, 0x0957], // Devanagari matras candra long e, ue, uue
	[0x0962, 0x0963], // Devanagari vocalic l, ll
	[0x0abe, 0x0ac5], // Gujarati matras aa–candra e
	[0x0ac7, 0x0ac9], // Gujarati matras e, ai, candra o
	[0x0acb, 0x0acc], // Gujarati matras o, au
	[0x0ae2, 0x0ae3], // Gujarati vocalic l, ll
];

/** Nukta — sits between a consonant and its vowel sign without breaking the pair. */
const NUKTAS: readonly number[] = [0x093c, 0x0abc];

/**
 * The pre-base matras: `િ` and `ि`, written to the *left* of the consonant they follow.
 *
 * They are the diagnostic for a broken mapping. A PDF stores glyphs in visual order, so a
 * pre-base matra's glyph comes *before* its consonant in the stream; producing correct
 * Unicode means reordering it back, and a mapping that gets anything wrong tends to get this
 * wrong first. They are also common enough that a page of prose without one is impossible.
 */
const PRE_BASE_MATRA: Readonly<Partial<Record<Script, number>>> = {
	gujr: 0x0abf,
	deva: 0x093f,
};

/** Script-bearing characters needed before absence of a pre-base matra means anything. */
const PRE_BASE_MIN_SAMPLE = 300;

function inRanges(point: number, ranges: readonly Range[]): boolean {
	for (const [low, high] of ranges) {
		if (point < low) {
			return false;
		}
		if (point <= high) {
			return true;
		}
	}
	return false;
}

/** A dependent vowel sign (matra), as opposed to any other combining mark. */
export function isVowelSign(codePoint: number): boolean {
	return inRanges(codePoint, VOWEL_SIGN_RANGES);
}

export function isNukta(codePoint: number): boolean {
	return NUKTAS.includes(codePoint);
}

export type OrthographyViolationKind =
	/** Two dependent vowel signs in a row — no Indic syllable has two vowels. */
	| "adjacent-vowel-signs"
	/** A vowel sign with no consonant to attach to. */
	| "vowel-sign-without-base"
	/** A virama followed by a vowel sign instead of by a consonant. */
	| "virama-before-vowel-sign"
	/** A virama with no consonant before it. */
	| "virama-without-base"
	/** A long text containing not one pre-base matra — mechanically impossible. */
	| "no-pre-base-matra";

export type OrthographyViolation = {
	readonly kind: OrthographyViolationKind;
	/** Index into the text, or -1 for a whole-text finding. */
	readonly at: number;
	/** A few characters around the fault, for a report a human reads. */
	readonly sample: string;
};

export type OrthographyReport = {
	/** True when nothing impossible was found. */
	readonly ok: boolean;
	/** Every violation found, capped — `count` is the real total. */
	readonly violations: readonly OrthographyViolation[];
	readonly count: number;
	/** Script-bearing characters of `script` examined. */
	readonly examined: number;
	/** Violations per 1000 examined characters. Zero for correctly encoded text. */
	readonly rate: number;
};

/** Enough examples to diagnose the fault; a corrupt book would otherwise return thousands. */
const MAX_REPORTED = 12;

function contextAround(text: string, index: number): string {
	return text.slice(Math.max(0, index - 6), Math.min(text.length, index + 6));
}

/**
 * Check `text` against the rules of `script`. Latin has no such constraints, so it always
 * passes — the caller decides which scripts are worth checking.
 */
export function checkOrthography(text: string, script: Script): OrthographyReport {
	const characters = [...text];
	const points = characters.map((character) => character.codePointAt(0) as number);
	const violations: OrthographyViolation[] = [];
	let count = 0;
	let examined = 0;

	const record = (kind: OrthographyViolationKind, at: number): void => {
		count += 1;
		if (violations.length < MAX_REPORTED) {
			violations.push({ kind, at, sample: contextAround(text, at) });
		}
	};

	if (script === "latn") {
		return { ok: true, violations: [], count: 0, examined: 0, rate: 0 };
	}

	/** The character a mark would attach to, looking back past a nukta. */
	const baseBefore = (index: number): number | null => {
		let at = index - 1;
		if (at >= 0 && isNukta(points[at] as number)) {
			at -= 1;
		}
		return at >= 0 ? (points[at] as number) : null;
	};

	for (let index = 0; index < points.length; index += 1) {
		const point = points[index] as number;
		if (isVowelSign(point) || isVirama(point) || isConjoinableConsonant(point)) {
			examined += 1;
		}

		if (isVowelSign(point)) {
			const previous = index > 0 ? (points[index - 1] as number) : null;
			if (previous !== null && isVowelSign(previous)) {
				record("adjacent-vowel-signs", index);
				continue;
			}
			const base = baseBefore(index);
			if (base === null || !isConjoinableConsonant(base)) {
				// A virama before a vowel sign is its own, more specific, fault.
				if (base === null || !isVirama(base)) {
					record("vowel-sign-without-base", index);
				}
			}
		}

		if (isVirama(point)) {
			const base = baseBefore(index);
			if (base === null || !isConjoinableConsonant(base)) {
				record("virama-without-base", index);
			}
			const next = index + 1 < points.length ? (points[index + 1] as number) : null;
			if (next !== null && isVowelSign(next)) {
				record("virama-before-vowel-sign", index);
			}
		}
	}

	// The statistical rule, worth one violation however long the text is: a page of prose
	// cannot avoid the pre-base matra, so its total absence means the mapping dropped it.
	const preBase = PRE_BASE_MATRA[script];
	if (preBase !== undefined && examined >= PRE_BASE_MIN_SAMPLE && !points.includes(preBase)) {
		count += 1;
		violations.unshift({
			kind: "no-pre-base-matra",
			at: -1,
			sample: `${examined} letters without a single ${String.fromCodePoint(preBase)}`,
		});
	}

	return {
		ok: count === 0,
		violations,
		count,
		examined,
		rate: examined === 0 ? 0 : (count / examined) * 1000,
	};
}

/** One line describing what is wrong, for the triage report. */
export function describeViolation(violation: OrthographyViolation): string {
	switch (violation.kind) {
		case "adjacent-vowel-signs":
			return `two vowel signs in a row (…${violation.sample}…)`;
		case "vowel-sign-without-base":
			return `a vowel sign with no consonant to attach to (…${violation.sample}…)`;
		case "virama-before-vowel-sign":
			return `a virama followed by a vowel instead of a consonant (…${violation.sample}…)`;
		case "virama-without-base":
			return `a virama with no consonant before it (…${violation.sample}…)`;
		case "no-pre-base-matra":
			return `not one pre-base matra in the whole text — ${violation.sample}`;
	}
}
