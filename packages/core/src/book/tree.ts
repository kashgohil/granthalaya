/**
 * Walking and resolving the structure tree.
 *
 * Everything here is a pure function over a parsed `Book`. The tree is small enough
 * (thousands of units at most) that linear traversal is fine; consumers that need random
 * access at scale — the mobile reader — build their own index into SQLite at install time.
 */
import { type BookRef, refsEqual } from "./refs.ts";
import type { Book, BookUnit, BookVerse } from "./schema.ts";
import { isVerse } from "./schema.ts";

/** A unit found during traversal, with everything needed to address and contextualise it. */
export type UnitVisit = {
	readonly unit: BookUnit;
	readonly ref: BookRef;
	/** Enclosing divisions, outermost first. Empty for a top-level unit. */
	readonly ancestors: readonly BookUnit[];
};

export type VerseVisit = UnitVisit & { readonly unit: BookVerse };

/**
 * Every unit in reading order, depth-first: a division is yielded before its children.
 * Generator rather than an array so callers can stop early on large books.
 */
export function* walkBook(book: Book): Generator<UnitVisit> {
	yield* walkUnits(book.id, book.structure, [], []);
}

function* walkUnits(
	bookId: string,
	units: readonly BookUnit[],
	path: readonly string[],
	ancestors: readonly BookUnit[],
): Generator<UnitVisit> {
	for (const unit of units) {
		if (isVerse(unit)) {
			yield { unit, ref: { bookId, path, leaf: unit.id }, ancestors };
		} else {
			const childPath = [...path, unit.id];
			yield { unit, ref: { bookId, path: childPath }, ancestors };
			yield* walkUnits(bookId, unit.children, childPath, [...ancestors, unit]);
		}
	}
}

/** Every verse in reading order — the sequence audio, search and SRS all iterate. */
export function bookVerses(book: Book): VerseVisit[] {
	const found: VerseVisit[] = [];
	for (const visit of walkBook(book)) {
		if (isVerse(visit.unit)) {
			found.push(visit as VerseVisit);
		}
	}
	return found;
}

/** Resolve a ref against a book, or `undefined` if nothing lives there any more. */
export function findUnit(book: Book, ref: BookRef): UnitVisit | undefined {
	if (ref.bookId !== book.id) {
		return undefined;
	}
	for (const visit of walkBook(book)) {
		if (refsEqual(visit.ref, ref)) {
			return visit;
		}
	}
	return undefined;
}

/** Resolve a ref that must name a verse. Division refs return `undefined`, not the division. */
export function findVerse(book: Book, ref: BookRef): VerseVisit | undefined {
	const visit = findUnit(book, ref);
	return visit !== undefined && isVerse(visit.unit) ? (visit as VerseVisit) : undefined;
}

/** Total verse count — the denominator behind reading progress and proofing meters. */
export function countVerses(book: Book): number {
	let total = 0;
	for (const visit of walkBook(book)) {
		if (isVerse(visit.unit)) {
			total += 1;
		}
	}
	return total;
}
