/**
 * Retiring refs across a published version (P1.5).
 *
 * Ids churn freely while a book is a draft, and that is safe precisely because nothing is
 * published: no reader has the book, so no highlight, flashcard or SRS item is keyed to anything.
 * The moment a version ships, that stops being true — and the format's answer is `aliases`, a map
 * from a retired ref to whatever inherited it (`docs/book-format.md` §3).
 *
 * This file computes that map at export time, from two things the studio already has:
 *
 * - **The last published package**, which is the only honest record of which refs a reader might
 *   be holding. The draft's own history is not it: a ref that existed for an hour between two
 *   re-imports was never handed to anybody.
 * - **`verses.lineage`**, which every restructuring operation writes. A split records the ref the
 *   tail was cut from, a merge records the ref it absorbed, a renumber records the id it used to
 *   have — so "where did this text go?" is recorded rather than reconstructed.
 *
 * Where lineage says nothing, the ref is a genuine deletion, and the format prescribes the answer:
 * alias it to the division that held it — *the text you annotated is gone, here is where it was*.
 *
 * The map **accumulates**. A client upgrades from whatever it installed, not from the version
 * before this one, so v1's retirements stay in v3's map — re-pointed if what they pointed at has
 * since moved again.
 */
import type { Book } from "@granthalaya/core";
import { bookRefs, formatRef, parentRef, parseRef } from "@granthalaya/core";
import type { VerseRow } from "@granthalaya/db";
import { refOf } from "./import.ts";

/** Chains are short in practice; the bound is a guard against a cycle, not a budget. */
const MAX_HOPS = 16;

/**
 * The alias map a new version should carry, or `undefined` when it needs none.
 *
 * `verseRows` is the compiled version's own rows — the same ones `buildStructure` walks — so the
 * lineage read here belongs to passages that actually exist in the package being written.
 */
export function deriveAliases(
	bookId: string,
	previous: Book,
	compiled: Book,
	verseRows: readonly VerseRow[],
): Record<string, string> | undefined {
	const live = bookRefs(compiled);

	// Old ref → the passage that inherited it. Lineage is stored as `divisionId#verseId`, without
	// the book id, because it is written by code that only ever works inside one book.
	const successor = new Map<string, string>();
	for (const row of verseRows) {
		const now = refOf(bookId, row.divisionId, row.id);
		for (const old of (row.lineage as string[] | null) ?? []) {
			const [divisionId, verseId] = old.split("#");
			if (divisionId === undefined || verseId === undefined) continue;
			successor.set(refOf(bookId, divisionId, verseId), now);
		}
	}

	/** Follow lineage until it lands somewhere that still exists. */
	function follow(from: string): string | null {
		const seen = new Set([from]);
		let current = from;
		for (let hop = 0; hop < MAX_HOPS; hop += 1) {
			const next = successor.get(current);
			if (next === undefined) return null;
			if (live.has(next)) return next;
			if (seen.has(next)) return null;
			seen.add(next);
			current = next;
		}
		return null;
	}

	/** The innermost container that still exists. The book id itself always does. */
	function nearestLiveAncestor(ref: string): string {
		const parsed = parseRef(ref);
		if (!parsed.ok) return bookId;
		for (let at = parentRef(parsed.ref); at !== null; at = parentRef(at)) {
			const formatted = formatRef(at);
			if (live.has(formatted)) return formatted;
		}
		return bookId;
	}

	const resolve = (ref: string): string =>
		live.has(ref) ? ref : (follow(ref) ?? nearestLiveAncestor(ref));

	const aliases: Record<string, string> = {};

	// Carry the published map forward, re-pointing anything that has moved again since.
	for (const [source, target] of Object.entries(previous.aliases ?? {})) {
		// A retired ref that has come back to life is not retired. (The format forbids a ref being
		// both, and `validateBook` rejects it — but the right fix is to drop the alias, not to
		// refuse the export.)
		if (live.has(source)) continue;
		aliases[source] = resolve(target);
	}

	// Everything the published version resolved and this one no longer does.
	for (const ref of bookRefs(previous)) {
		if (ref === bookId || live.has(ref) || aliases[ref] !== undefined) continue;
		aliases[ref] = resolve(ref);
	}

	return Object.keys(aliases).length === 0 ? undefined : aliases;
}
