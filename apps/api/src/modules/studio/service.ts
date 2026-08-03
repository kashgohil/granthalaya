/**
 * What the studio asks the database (P1.3).
 *
 * Two things here are recomputed rather than read back from the import, and both for the same
 * reason: the moment a human starts working, the machine's findings describe a book that no
 * longer exists.
 *
 * - **The verse-number sequence.** It is the only checksum this stage of the pipeline has — a
 *   passage the OCR dropped leaves no other trace, since the text simply reads on. Recomputing it
 *   from the current rows is what turns it from a report into an instrument: fix the gap and the
 *   gap disappears from the overview.
 * - **What only a human can supply.** `assemble` writes `unknown` into the source edition and the
 *   licence and names them; once somebody fills them in, the list has to shrink.
 */
import { parseIndicNumber } from "@granthalaya/core";
import type { Db, VerseStatus } from "@granthalaya/db";
import { books, divisions, pageNotes, pages, setAsideBlocks, verses } from "@granthalaya/db";
import { and, asc, count, eq } from "drizzle-orm";

export type StatusCounts = Record<VerseStatus, number> & { total: number };

export type SequenceCheck = {
	readonly first: number | null;
	readonly last: number | null;
	readonly numbered: number;
	readonly unnumbered: number;
	readonly missing: number[];
	readonly duplicates: number[];
	readonly outOfOrder: number[];
};

/**
 * The checksum, over printed numbers in reading order.
 *
 * `null` for a passage that printed no number — those are counted, not treated as a gap, because
 * an unnumbered passage is a known shape in this edition rather than evidence of a loss.
 */
export function checkSequence(numbers: readonly (string | null)[]): SequenceCheck {
	const values: number[] = [];
	let unnumbered = 0;
	for (const text of numbers) {
		const parsed = text === null ? null : parseIndicNumber(text);
		if (parsed === null) {
			unnumbered += 1;
			continue;
		}
		values.push(parsed.value);
	}

	const seen = new Set<number>();
	const duplicates: number[] = [];
	const outOfOrder: number[] = [];
	let previous: number | null = null;
	for (const value of values) {
		if (seen.has(value)) duplicates.push(value);
		seen.add(value);
		if (previous !== null && value !== previous + 1) outOfOrder.push(value);
		previous = value;
	}

	const first = values.length === 0 ? null : Math.min(...values);
	const last = values.length === 0 ? null : Math.max(...values);
	const missing: number[] = [];
	if (first !== null && last !== null) {
		for (let value = first; value <= last; value += 1) {
			if (!seen.has(value)) missing.push(value);
		}
	}

	return { first, last, numbered: values.length, unnumbered, missing, duplicates, outOfOrder };
}

/** The three fields `assemble` cannot know, checked against what is in the manifest now. */
export function stillNeedsHuman(manifest: unknown): string[] {
	const value = manifest as {
		title?: Record<string, string>;
		script?: string;
		source?: { edition?: string };
		license?: { id?: string };
	};
	const needs: string[] = [];
	if (value?.source?.edition === undefined || value.source.edition === "unknown") {
		needs.push("source.edition — which printed edition this is");
	}
	if (value?.license?.id === undefined || value.license.id === "unknown") {
		needs.push("license.id — whether we have the rights to publish it");
	}
	if (value?.script === "gujr" && value?.title?.gu === undefined) {
		needs.push("title.gu — the book's title as it is printed");
	}
	return needs;
}

export async function statusCounts(db: Db, bookId: string): Promise<StatusCounts> {
	const rows = await db
		.select({ status: verses.status, n: count() })
		.from(verses)
		.where(and(eq(verses.bookId, bookId), eq(verses.orphaned, false)))
		.groupBy(verses.status);

	const counts: StatusCounts = { raw: 0, proofed: 0, approved: 0, total: 0 };
	for (const row of rows) {
		counts[row.status] = row.n;
		counts.total += row.n;
	}
	return counts;
}

export type BookSummary = {
	id: string;
	title: unknown;
	packageDir: string;
	hasPages: boolean;
	bookPageCount: number;
	importedAt: string;
	updatedAt: string;
	counts: StatusCounts;
};

export async function listBooks(db: Db): Promise<BookSummary[]> {
	const rows = await db.select().from(books).orderBy(asc(books.id));
	return Promise.all(
		rows.map(async (row) => ({
			id: row.id,
			title: (row.manifest as { title?: unknown }).title ?? null,
			packageDir: row.packageDir,
			hasPages: row.pagesDir !== null,
			bookPageCount: row.bookPageCount,
			importedAt: row.importedAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
			counts: await statusCounts(db, row.id),
		})),
	);
}

export async function getBookRow(db: Db, bookId: string) {
	const [row] = await db.select().from(books).where(eq(books.id, bookId));
	return row;
}

export type BookOverview = Awaited<ReturnType<typeof getBookOverview>>;

export async function getBookOverview(db: Db, bookId: string) {
	const book = await getBookRow(db, bookId);
	if (book === undefined) return null;

	const [divisionRows, verseRows, counts, noteCount, setAsideCount, unresolvedCount] =
		await Promise.all([
			db
				.select()
				.from(divisions)
				.where(eq(divisions.bookId, bookId))
				.orderBy(asc(divisions.ordinal)),
			db
				.select({
					divisionId: verses.divisionId,
					number: verses.number,
					orphaned: verses.orphaned,
				})
				.from(verses)
				.where(eq(verses.bookId, bookId))
				.orderBy(asc(verses.divisionId), asc(verses.ordinal)),
			statusCounts(db, bookId),
			db.select({ n: count() }).from(pageNotes).where(eq(pageNotes.bookId, bookId)),
			db.select({ n: count() }).from(setAsideBlocks).where(eq(setAsideBlocks.bookId, bookId)),
			db
				.select({ n: count() })
				.from(setAsideBlocks)
				.where(and(eq(setAsideBlocks.bookId, bookId), eq(setAsideBlocks.resolved, false))),
		]);

	const live = verseRows.filter((row) => !row.orphaned);

	return {
		id: book.id,
		manifest: book.manifest,
		packageDir: book.packageDir,
		pagesDir: book.pagesDir,
		sourceFile: book.sourceFile,
		sourceSha256: book.sourceSha256,
		engine: book.engine,
		bookPageCount: book.bookPageCount,
		importedAt: book.importedAt.toISOString(),
		updatedAt: book.updatedAt.toISOString(),
		/** What the machine concluded at import — a snapshot, kept for provenance. */
		assembly: book.assembly,
		/** What is true now. These two disagreeing is the studio doing its job. */
		sequence: checkSequence(live.map((row) => row.number)),
		needsHuman: stillNeedsHuman(book.manifest),
		counts: {
			...counts,
			divisions: divisionRows.length,
			orphaned: verseRows.length - live.length,
			notes: noteCount[0]?.n ?? 0,
			setAside: setAsideCount[0]?.n ?? 0,
			setAsideUnresolved: unresolvedCount[0]?.n ?? 0,
		},
		divisions: divisionRows.map((row) => ({
			id: row.id,
			title: row.title,
			number: row.number,
			kind: row.kind,
			endMarker: row.endMarker,
			verses: live.filter((verse) => verse.divisionId === row.id).length,
		})),
	};
}

/**
 * Patch the manifest.
 *
 * A shallow merge over the top-level keys, which is exactly the granularity the studio edits at
 * (title, source, licence). Deliberately not deep: a deep merge cannot express *removing* a
 * field, and `source: { edition, publisher }` overwritten by `source: { edition }` should drop
 * the publisher rather than keep a stale one beside a corrected edition.
 */
export async function patchManifest(
	db: Db,
	bookId: string,
	patch: Record<string, unknown>,
): Promise<unknown | null> {
	const book = await getBookRow(db, bookId);
	if (book === undefined) return null;
	const manifest = { ...(book.manifest as Record<string, unknown>), ...patch };
	await db.update(books).set({ manifest, updatedAt: new Date() }).where(eq(books.id, bookId));
	return manifest;
}

/** The page image file for a PDF page number, with the row that pins its size. */
export async function getPage(db: Db, bookId: string, number: number) {
	const [row] = await db
		.select()
		.from(pages)
		.where(and(eq(pages.bookId, bookId), eq(pages.number, number)));
	return row;
}

/** Distinct pages this book has text on, for the workbench's page jumper. */
export async function listPages(db: Db, bookId: string) {
	return db
		.select({
			number: pages.number,
			printedPage: pages.printedPage,
			widthPx: pages.widthPx,
			heightPx: pages.heightPx,
		})
		.from(pages)
		.where(eq(pages.bookId, bookId))
		.orderBy(asc(pages.number));
}

export async function deleteBook(db: Db, bookId: string): Promise<boolean> {
	const removed = await db.delete(books).where(eq(books.id, bookId)).returning({ id: books.id });
	return removed.length > 0;
}
