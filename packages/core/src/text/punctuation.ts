/**
 * Danda handling.
 *
 * A danda (`।`) closes a line and a double danda (`॥`) closes a verse, usually with the
 * verse number nested between two of them — `॥ ૧ ॥`. In print they sit tight against the
 * text they close. A naive line-breaker treats the space before a danda like any other and
 * will happily start a line with a lone `॥`, or split `॥ ૧ ॥` across two lines, both of
 * which read as a typesetting error in a scripture.
 *
 * The fix is to make those spaces unbreakable at render time. This is deliberately a
 * *display* transform, never something written back into a book package: the package's text
 * is what `hashVerse` covers and what search and audio alignment run against, so slipping a
 * no-break space into it would change every verse hash and make stored text differ from the
 * text that was proofed.
 */

/** `।` U+0964 — closes a line. */
export const DANDA = "।";
/** `॥` U+0965 — closes a verse, and brackets the verse number. */
export const DOUBLE_DANDA = "॥";

/** Escaped rather than literal: an invisible character in source is a maintenance trap. */
const NO_BREAK_SPACE = "\u00a0";

/**
 * The whole terminal group: the space attaching the danda to the last word, the danda, an
 * optional verse number in Gujarati, Devanagari or Latin digits, and an optional closing
 * danda. Matching the group as a unit is what keeps `પ્રચોદયાત્ ॥ ૧ ॥` whole — protecting
 * each space in isolation would still leave the break between the number and the last danda.
 */
const DANDA_GROUP = / ?[।॥](?: ?[0-9०-९૦-૯]+)?(?: ?[।॥])?/g;

export function isDanda(character: string): boolean {
	return character === DANDA || character === DOUBLE_DANDA;
}

/**
 * Replace the spaces inside every danda group with no-break spaces, so a danda can never be
 * orphaned onto a line of its own.
 *
 * Render-time only — see the module note. Apply it where text meets the screen, not where it
 * meets storage.
 */
export function protectDanda(text: string): string {
	return text.replace(DANDA_GROUP, (group) => group.replaceAll(" ", NO_BREAK_SPACE));
}
