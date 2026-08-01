/**
 * Generated book covers (P0.4).
 *
 * A scripture library has no cover art: the editions these books come from are plain cloth
 * and a title, and inventing artwork for them would be a small act of fiction in a project
 * whose first principle is fidelity. So a cover is *derived* — the book's id picks a cloth
 * colourway, and the book's own title, set in Rasa, is the artwork.
 *
 * The derivation is deterministic and offline. The same book looks the same on every device
 * with no network call and no asset to ship, and a newly published book already looks like
 * it belongs on the shelf.
 *
 * This module returns a spec, not pixels: the two renderers (React Native views and CSS)
 * draw it themselves, because the platforms disagree about everything except the numbers.
 */
import { fnv1a64 } from "../book/hash.ts";
import type { Book, LocalizedText } from "../book/schema.ts";
import { pickLocalized } from "../book/schema.ts";
import { firstAkshara } from "../text/akshara.ts";

/** One cloth colour and the ink that is legible on it. */
export type CoverColourway = {
	readonly id: string;
	/** The cloth. Renderers shade it into a gradient rather than filling it flat. */
	readonly base: string;
	/** Title and rule colour on that cloth — at least 4.5:1 against `base`. */
	readonly ink: string;
};

/**
 * Six bindings, all dark enough for the ink to be a light warm off-white. They are muted on
 * purpose: a shelf of six saturated covers competes with itself, and the point of the grid
 * is that the *titles* are what you read.
 */
export const COVER_COLOURWAYS: readonly CoverColourway[] = [
	{ id: "indigo", base: "#2E3B5E", ink: "#EDE3D2" },
	{ id: "terracotta", base: "#8A4126", ink: "#F7E8D8" },
	{ id: "sage", base: "#3F5740", ink: "#E9EFDE" },
	{ id: "plum", base: "#4A2E49", ink: "#F1E2ED" },
	{ id: "ochre", base: "#715211", ink: "#F8ECD3" },
	{ id: "ink", base: "#23201C", ink: "#E4DACA" },
];

/**
 * How the cloth is lit. A flat fill reads as a coloured rectangle; a board lit from the
 * top-left reads as a bound book — so both renderers shade the base into a gradient.
 *
 * The amounts live here rather than in the two components because they change what the ink
 * has to survive: `cover.test.ts` checks each colourway's ink against the *lit* corner, not
 * against the flat base, and it can only do that if the lighting is a shared number.
 */
export const COVER_SHADING = {
	/** Fraction toward white at the top-left corner. */
	highlight: 0.12,
	/** Fraction toward black at the bottom-right corner. */
	shadow: 0.14,
	/** How much the spine strip is darkened, as a multiplier on the base. */
	spine: 0.62,
} as const;

export type CoverSpec = {
	readonly colourway: CoverColourway;
	/** The title as it is set on the cover, in the book's own script. */
	readonly title: string;
	/**
	 * The first akshara of the title, shown small above the title as a printer's mark. Cut
	 * with `firstAkshara`, so a conjunct never comes apart (P0.3). Undefined for an empty
	 * title, which the schema forbids anyway.
	 */
	readonly initial: string | undefined;
};

/** The input a cover needs. A whole `Book` satisfies it; so does a catalogue entry. */
export type CoverSubject = {
	readonly id: string;
	readonly title: LocalizedText;
	readonly language?: string;
};

/**
 * Which colourway a book gets.
 *
 * Keyed on the book id and nothing else, so it survives every content correction: a cover
 * that changed when the text was re-proofed would make the shelf feel unstable, and the id
 * is the one field P0.2 guarantees is stable across versions.
 */
export function coverColourway(bookId: string): CoverColourway {
	const index = Number(fnv1a64(bookId) % BigInt(COVER_COLOURWAYS.length));
	return COVER_COLOURWAYS[index] as CoverColourway;
}

/**
 * The cover for a book, in a chosen display language.
 *
 * `languages` are the reader's UI preferences, not the book's: they pick which of the
 * title's localizations is set on the cloth. It falls back the way `pickLocalized` does, so
 * a book with only a Gujarati title shows its Gujarati title to an English reader rather
 * than showing nothing. Gujarati leads by default — a cover in the script the book is in.
 */
export function coverFor(
	subject: CoverSubject | Book,
	languages: readonly string[] = ["gu"],
): CoverSpec {
	const title = pickLocalized(subject.title, languages) ?? "";
	return {
		colourway: coverColourway(subject.id),
		title,
		initial: firstAkshara(title),
	};
}

/**
 * The proportions of a cover, shared by both renderers so a cover is the same object on the
 * shelf, in the book detail header and on a promo page.
 */
export const COVER_ASPECT_RATIO = 2 / 3;
