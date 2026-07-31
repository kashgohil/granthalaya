/**
 * Verse addressing — the identity layer the whole product hangs off.
 *
 * A ref names either a division or a single verse:
 *
 *     vachanamrut                    the whole book
 *     vachanamrut/gadhada-1          a section
 *     vachanamrut/gadhada-1/21       a chapter
 *     vachanamrut/gadhada-1/21#v3    a verse — the atom
 *
 * Only a verse carries a `#`, so a ref can be classified without consulting the book
 * it points into. See `docs/book-format.md` §3 for the grammar and the stability rules
 * that make these safe to store in user data.
 */

/** A ref parsed into its parts. `leaf` is present exactly when the ref names a verse. */
export type BookRef = {
	readonly bookId: string;
	/** Division `id`s from the book root down, outermost first. Empty for a whole-book ref. */
	readonly path: readonly string[];
	readonly leaf?: string;
};

export type RefParseResult =
	| { readonly ok: true; readonly ref: BookRef }
	| { readonly ok: false; readonly error: string };

/**
 * Lowercase kebab, no leading/trailing/doubled hyphens. Deliberately narrow: refs end up
 * in URLs, filenames, deep links and SQLite keys, so anything needing escaping is banned.
 */
export const SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether a string is a legal path segment (book id, division id or verse id). */
export function isSegment(value: string): boolean {
	return SEGMENT_PATTERN.test(value);
}

/** Build a ref, throwing if any part is not a legal segment. Prefer this over string concat. */
export function bookRef(bookId: string, path: readonly string[] = [], leaf?: string): BookRef {
	for (const segment of [bookId, ...path, ...(leaf === undefined ? [] : [leaf])]) {
		if (!isSegment(segment)) {
			throw new TypeError(`Not a legal ref segment: ${JSON.stringify(segment)}`);
		}
	}
	return leaf === undefined ? { bookId, path } : { bookId, path, leaf };
}

/** Render a ref back to its canonical string form. Inverse of `parseRef`. */
export function formatRef(ref: BookRef): string {
	const base = [ref.bookId, ...ref.path].join("/");
	return ref.leaf === undefined ? base : `${base}#${ref.leaf}`;
}

/** Parse a ref string. Never throws — callers get an explanation they can show a user. */
export function parseRef(text: string): RefParseResult {
	if (text.length === 0) {
		return { ok: false, error: "Ref is empty" };
	}

	const hashCount = text.split("#").length - 1;
	if (hashCount > 1) {
		return { ok: false, error: `Ref has more than one "#": ${text}` };
	}

	const [base = "", leaf] = text.split("#");
	const [bookId, ...path] = base.split("/");

	if (bookId === undefined || !isSegment(bookId)) {
		return { ok: false, error: `Not a legal book id: ${JSON.stringify(bookId ?? "")}` };
	}
	for (const segment of path) {
		if (!isSegment(segment)) {
			return { ok: false, error: `Not a legal path segment: ${JSON.stringify(segment)}` };
		}
	}
	if (leaf !== undefined && !isSegment(leaf)) {
		return { ok: false, error: `Not a legal verse id: ${JSON.stringify(leaf)}` };
	}

	return { ok: true, ref: leaf === undefined ? { bookId, path } : { bookId, path, leaf } };
}

/** Whether the ref names a verse (the atom) rather than a division or a whole book. */
export function isVerseRef(ref: BookRef): boolean {
	return ref.leaf !== undefined;
}

/**
 * The ref one level up: a verse's containing division, a division's parent, `null` at the
 * book root. Used to answer "where did this annotation's text live?" after a deletion.
 */
export function parentRef(ref: BookRef): BookRef | null {
	if (ref.leaf !== undefined) {
		return { bookId: ref.bookId, path: ref.path };
	}
	if (ref.path.length === 0) {
		return null;
	}
	return { bookId: ref.bookId, path: ref.path.slice(0, -1) };
}

/** Whether `descendant` sits at or below `ancestor` — the test behind "everything in chapter 3". */
export function refContains(ancestor: BookRef, descendant: BookRef): boolean {
	if (ancestor.bookId !== descendant.bookId) {
		return false;
	}
	// A verse ref contains only itself; a division can't sit inside one.
	if (ancestor.leaf !== undefined) {
		return refsEqual(ancestor, descendant);
	}
	if (ancestor.path.length > descendant.path.length) {
		return false;
	}
	return ancestor.path.every((segment, index) => segment === descendant.path[index]);
}

/** Structural equality. Refs are compared by value, never by identity. */
export function refsEqual(a: BookRef, b: BookRef): boolean {
	return (
		a.bookId === b.bookId &&
		a.leaf === b.leaf &&
		a.path.length === b.path.length &&
		a.path.every((segment, index) => segment === b.path[index])
	);
}
