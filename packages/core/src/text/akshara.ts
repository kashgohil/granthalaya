/**
 * Akshara segmentation — splitting Gujarati (and Devanagari) text into the units a reader
 * perceives as single letters.
 *
 * An *akshara* is an orthographic syllable: a consonant, everything stacked on or under it,
 * and every further consonant bound to it by a virama. `ક્ષ` is three code points and one
 * akshara; `પ્રચોદયાત્` is ten code points and five. Splitting anywhere inside one produces
 * a dead consonant floating on its own or a matra with nothing to attach to — visible
 * corruption of scripture, which is the one thing this project cannot ship.
 *
 * Everything that cuts text needs this: progressive hiding and first-letter prompts (P5.2),
 * cloze blanks (P5.2), truncated titles in the library (P2.1), search result snippets (P2.6).
 * `String.slice`, `split("")` and `[...text]` are all wrong for those jobs; so is
 * `Intl.Segmenter`, which is absent from Hermes.
 *
 * Scope: Gujarati and Devanagari (the two scripts the book format admits alongside Latin),
 * plus combining-mark safety for Latin transliteration, where ISO 15919 spells `r̥` as
 * `r` + U+0325 with no precomposed form. Adding a script means adding its virama, its
 * consonant range and its mark ranges to the tables below — nothing else.
 */

/** Zero-width non-joiner: asks for the dead-consonant form, which renders detached. */
const ZWNJ = 0x200c;
/** Zero-width joiner: asks for a half-form, which renders as part of the conjunct. */
const ZWJ = 0x200d;

/** Virama (halant) — the character that binds two consonants into a conjunct. */
const VIRAMAS: readonly number[] = [
	0x094d, // Devanagari
	0x0acd, // Gujarati
];

/**
 * Consonants a virama can bind to. Independent vowels are deliberately excluded: a virama
 * before one is malformed text, and binding across it would swallow the vowel into the
 * previous letter rather than leaving the error visible.
 */
const CONSONANT_RANGES: readonly (readonly [number, number])[] = [
	[0x0915, 0x0939], // Devanagari ka–ha
	[0x0958, 0x095f], // Devanagari nukta'd consonants (qa, khha, …)
	[0x0978, 0x097f], // Devanagari extended consonants (marwari dda, zha, …)
	[0x0a95, 0x0ab9], // Gujarati ka–ha
	[0x0af9, 0x0af9], // Gujarati zha
];

/**
 * Marks that attach to the letter before them: matras, anusvara, candrabindu, visarga,
 * nukta, Vedic tone marks, and the generic Latin combining diacritics transliteration needs.
 * Ordered by code point so the lookup can stop early.
 */
const MARK_RANGES: readonly (readonly [number, number])[] = [
	[0x0300, 0x036f], // combining diacritical marks (Latin transliteration)
	[0x0900, 0x0903], // Devanagari candrabindu, anusvara, visarga
	[0x093a, 0x093c], // Devanagari vowel signs oe/ooe, nukta
	[0x093e, 0x094c], // Devanagari matras
	[0x094e, 0x094f], // Devanagari matras prishthamatra e, aw
	[0x0951, 0x0957], // Devanagari Vedic tones and matras
	[0x0962, 0x0963], // Devanagari vocalic l/ll matras
	[0x0a81, 0x0a83], // Gujarati candrabindu, anusvara, visarga
	[0x0abc, 0x0abc], // Gujarati nukta
	[0x0abe, 0x0ac5], // Gujarati matras aa–candra e
	[0x0ac7, 0x0ac9], // Gujarati matras e, ai, candra o
	[0x0acb, 0x0acc], // Gujarati matras o, au
	[0x0ae2, 0x0ae3], // Gujarati vocalic l/ll matras
	[0x0afa, 0x0aff], // Gujarati transliteration signs
	[0x1ab0, 0x1aff], // combining diacritical marks extended
	[0x1dc0, 0x1dff], // combining diacritical marks supplement
	[0x20d0, 0x20f0], // combining marks for symbols
	[0xfe00, 0xfe0f], // variation selectors
];

function inRanges(point: number, ranges: readonly (readonly [number, number])[]): boolean {
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

/** True for a consonant a virama can bind a following letter to. */
export function isConjoinableConsonant(point: number): boolean {
	return inRanges(point, CONSONANT_RANGES);
}

/** True for a combining mark: it belongs to the akshara before it, never on its own. */
export function isCombiningMark(point: number): boolean {
	return inRanges(point, MARK_RANGES);
}

/** True for a virama (halant) in any script this module knows. */
export function isVirama(point: number): boolean {
	return VIRAMAS.includes(point);
}

/** Code-unit width of the code point starting at `index` — 2 for a surrogate pair. */
function widthAt(text: string, index: number): number {
	const point = text.codePointAt(index);
	return point !== undefined && point > 0xffff ? 2 : 1;
}

function pointAt(text: string, index: number): number {
	return text.codePointAt(index) ?? 0;
}

/**
 * End offset of the akshara starting at `start`.
 *
 * The loop mirrors how a shaping engine reads a cluster: take a base, absorb everything
 * that hangs off it, and on a virama look ahead for a consonant to bind to. ZWJ is
 * transparent to that lookahead because it only selects a half-form; ZWNJ ends the cluster
 * because it explicitly asks for two separate shapes, which is exactly where a cut is safe.
 * That matches Unicode 15.1's conjunct-cluster rule (UAX #29, GB9c).
 */
function aksharaEnd(text: string, start: number): number {
	let index = start;

	// Leading marks mean the text was sliced mid-akshara or arrived malformed. Keep the whole
	// orphaned run in one piece rather than emitting a span per invisible character.
	while (index < text.length) {
		const point = pointAt(text, index);
		if (!isCombiningMark(point) && point !== ZWNJ && point !== ZWJ) {
			break;
		}
		index += widthAt(text, index);
	}

	// Consume the base. A leading virama is left for the loop below, which binds it to the
	// consonant after it — `્ર` sliced off the front of `પ્ર` is still one broken piece.
	if (index === start && index < text.length && !isVirama(pointAt(text, index))) {
		index += widthAt(text, index);
	}

	while (index < text.length) {
		const point = pointAt(text, index);

		if (isCombiningMark(point) || point === ZWJ) {
			index += widthAt(text, index);
			continue;
		}

		if (point === ZWNJ) {
			return index + widthAt(text, index);
		}

		if (!isVirama(point)) {
			return index;
		}

		let after = index + widthAt(text, index);
		while (after < text.length && pointAt(text, after) === ZWJ) {
			after += widthAt(text, after);
		}
		if (after < text.length && pointAt(text, after) === ZWNJ) {
			return after + widthAt(text, after);
		}
		if (after < text.length && isConjoinableConsonant(pointAt(text, after))) {
			// A conjunct: the consonant after the virama is part of *this* akshara.
			index = after + widthAt(text, after);
			continue;
		}
		// A word-final halant — `પ્રચોદયાત્`. It stays with the consonant it kills.
		return after;
	}

	return index;
}

/** One akshara and where it sits, in UTF-16 code units. */
export type AksharaSpan = {
	/** Inclusive start offset. */
	readonly start: number;
	/** Exclusive end offset. */
	readonly end: number;
	readonly text: string;
};

/**
 * Split `text` into aksharas with their offsets. Use this when you need to address the
 * pieces — hiding words progressively, placing a cloze blank, mapping a tap to a letter.
 */
export function aksharaSpans(text: string): AksharaSpan[] {
	const spans: AksharaSpan[] = [];
	let index = 0;
	while (index < text.length) {
		const end = aksharaEnd(text, index);
		spans.push({ start: index, end, text: text.slice(index, end) });
		index = end;
	}
	return spans;
}

/** Split `text` into aksharas. Whitespace and punctuation each come back as their own unit. */
export function aksharas(text: string): string[] {
	return aksharaSpans(text).map((span) => span.text);
}

export function countAksharas(text: string): number {
	let count = 0;
	let index = 0;
	while (index < text.length) {
		index = aksharaEnd(text, index);
		count += 1;
	}
	return count;
}

/**
 * The first akshara of `text` — the whole letter, not the first code point. This is what a
 * first-letter memorization prompt (P5.2) shows: `પ્રચોદયાત્` prompts with `પ્ર`, never with
 * a bare `પ` that reads as a different sound.
 */
export function firstAkshara(text: string): string | undefined {
	return text.length === 0 ? undefined : text.slice(0, aksharaEnd(text, 0));
}

/**
 * True when `offset` falls between two aksharas, so cutting there is safe. Cheap enough to
 * assert in tests around any code that computes offsets into scripture.
 */
export function isAksharaBoundary(text: string, offset: number): boolean {
	if (offset <= 0 || offset >= text.length) {
		return offset === 0 || offset === text.length;
	}
	let index = 0;
	while (index < offset) {
		index = aksharaEnd(text, index);
	}
	return index === offset;
}

/**
 * `slice`, counted in aksharas instead of code units. Negative indices count from the end,
 * as on arrays.
 */
export function sliceAksharas(text: string, start: number, end?: number): string {
	const spans = aksharaSpans(text);
	const from = start < 0 ? Math.max(spans.length + start, 0) : Math.min(start, spans.length);
	const toRaw = end === undefined ? spans.length : end;
	const to = toRaw < 0 ? Math.max(spans.length + toRaw, 0) : Math.min(toRaw, spans.length);
	if (from >= to) {
		return "";
	}
	const first = spans[from];
	const last = spans[to - 1];
	return first === undefined || last === undefined ? "" : text.slice(first.start, last.end);
}

/**
 * Shorten `text` to at most `limit` aksharas, appending `ellipsis` when anything was cut.
 * For chrome — book titles on a shelf, a search-result snippet — never for scripture itself.
 */
export function truncateAksharas(text: string, limit: number, ellipsis = "…"): string {
	if (limit <= 0) {
		return "";
	}
	if (countAksharas(text) <= limit) {
		return text;
	}
	return sliceAksharas(text, 0, limit).trimEnd() + ellipsis;
}
