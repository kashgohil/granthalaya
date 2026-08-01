/**
 * Which script a run of text is actually written in.
 *
 * The pipeline's first question about any PDF is "does its text layer extract as Gujarati?",
 * because a legacy non-Unicode font answers "no" while looking perfectly fine on screen
 * (`docs/book-format.md`, and the OCR-first rule in the roadmap). The studio asks the same
 * question of an authored layer — a translation pasted into the transliteration slot shows up
 * here as `latn` where `gujr` was declared.
 *
 * Both callers want a *proportion*, not a guess, so the unit of the answer is a tally over
 * script-bearing characters. Spaces, digits and punctuation are deliberately not counted:
 * a page of Gujarati verse carries plenty of ASCII digits and dandas, and letting those vote
 * would drag every real page toward `latn`.
 */
import type { Script } from "../book/schema.ts";

/** A script the format doesn't name. Kept as one bucket — triage only needs "not ours". */
export type ForeignScript = "other";

/** Ranges are searched in order and must stay sorted by their lower bound. */
type Range = readonly [number, number];

const LATIN_RANGES: readonly Range[] = [
	[0x0041, 0x005a], // A–Z
	[0x0061, 0x007a], // a–z
	[0x00c0, 0x00d6], // Latin-1 letters, À–Ö
	[0x00d8, 0x00f6], // Ø–ö (× and ÷ are symbols, not letters)
	[0x00f8, 0x024f], // Latin Extended-A and -B
	[0x0250, 0x02af], // IPA extensions
	[0x1e00, 0x1eff], // Latin Extended Additional — ISO 15919 needs ṛ ṇ ś ṭ ḍ ṁ
];

const DEVANAGARI_RANGES: readonly Range[] = [
	[0x0900, 0x097f], // Devanagari
	[0x1cd0, 0x1cff], // Vedic extensions
	[0xa8e0, 0xa8ff], // Devanagari extended
];

const GUJARATI_RANGES: readonly Range[] = [
	[0x0a80, 0x0aff], // Gujarati
];

/**
 * Characters that belong to no script and must not dilute the tally: whitespace, controls,
 * digits, punctuation and symbols, plus the combining diacritics that Latin transliteration
 * layers stack on their letters (Unicode calls those script-inherited — they take the script
 * of whatever they attach to, so counting them separately would double-count the letter).
 *
 * Indic digits and matras are *not* here: they live inside their script's block and are real
 * evidence of that script.
 */
const NEUTRAL_RANGES: readonly Range[] = [
	[0x0000, 0x0040], // controls, space, ASCII punctuation and digits, :;<=>?@
	[0x005b, 0x0060], // [ \ ] ^ _ `
	[0x007b, 0x00bf], // { | } ~, C1 controls, Latin-1 punctuation and symbols
	[0x00d7, 0x00d7], // ×
	[0x00f7, 0x00f7], // ÷
	[0x0300, 0x036f], // combining diacritical marks (script-inherited)
	[0x0964, 0x0965], // danda and double danda — Unicode encodes them once, in the
	// Devanagari block, but their script is Common: Gujarati ends
	// every verse with the same two characters. Counting them as
	// Devanagari would make each danda a vote against the script
	// the page is actually in. See `punctuation.ts`, which treats
	// them as shared for exactly this reason.
	[0x2000, 0x206f], // general punctuation
	[0x20a0, 0x20cf], // currency symbols
	[0x2190, 0x2bff], // arrows, maths, geometric shapes, dingbats
];

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

/**
 * The script of a single code point, or `null` when it carries no script evidence at all.
 *
 * `null` and `"other"` mean different things and the difference is the point: a space is
 * `null` and votes for nothing, while a Han character is `"other"` and votes against every
 * script we can read.
 */
export function scriptOf(codePoint: number): Script | ForeignScript | null {
	if (inRanges(codePoint, NEUTRAL_RANGES)) {
		return null;
	}
	if (inRanges(codePoint, LATIN_RANGES)) {
		return "latn";
	}
	if (inRanges(codePoint, GUJARATI_RANGES)) {
		return "gujr";
	}
	if (inRanges(codePoint, DEVANAGARI_RANGES)) {
		return "deva";
	}
	return "other";
}

export type ScriptTally = Readonly<Record<Script | ForeignScript, number>>;

export type ScriptProfile = {
	readonly counts: ScriptTally;
	/** Script-bearing characters counted. Zero for a blank or purely numeric run. */
	readonly total: number;
	/** The most frequent script, or `null` when `total` is 0. Ties break toward the rarer script. */
	readonly dominant: Script | ForeignScript | null;
	/** `dominant`'s share of `total`, in 0..1. Zero when there is nothing to judge. */
	readonly share: number;
};

/** Tie-break order, least common first, so a genuine mixture never reports as `latn`. */
const PREFERENCE: readonly (Script | ForeignScript)[] = ["gujr", "deva", "other", "latn"];

/** Tally the scripts in `text`, ignoring everything that carries no script. */
export function profileScript(text: string): ScriptProfile {
	const counts = { gujr: 0, deva: 0, latn: 0, other: 0 };
	let total = 0;

	for (const character of text) {
		const point = character.codePointAt(0);
		if (point === undefined) {
			continue;
		}
		const script = scriptOf(point);
		if (script !== null) {
			counts[script] += 1;
			total += 1;
		}
	}

	let dominant: Script | ForeignScript | null = null;
	for (const script of PREFERENCE) {
		if (counts[script] > 0 && (dominant === null || counts[script] > counts[dominant])) {
			dominant = script;
		}
	}

	return {
		counts,
		total,
		dominant,
		share: dominant === null ? 0 : counts[dominant] / total,
	};
}

/** The share of script-bearing characters in `text` written in `script`, in 0..1. */
export function scriptShare(text: string, script: Script | ForeignScript): number {
	const profile = profileScript(text);
	return profile.total === 0 ? 0 : profile.counts[script] / profile.total;
}
