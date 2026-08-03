/**
 * What a page holds besides its scripture (P1.3).
 *
 * Two kinds of thing, kept apart because they mean opposite things.
 *
 * **Footnotes** are real content that was deliberately kept out of the discourse above them. They
 * are proofread here like any other text — but they are *not* attached to the words that pointed
 * at them, because pairing a gloss to a word decides meaning rather than text, and a wrong
 * pairing is invisible to orthography checks and number sequences alike. That is P1.4.
 *
 * **Set-aside blocks** are what the pipeline held back: page furniture, non-text tags, and
 * anything in a script the book does not admit. This is the screen that makes "nothing is dropped
 * silently" true rather than merely claimed — and it is the backstop for the one hazard the
 * filters cannot catch. Asked to read a decorative glyph, the OCR once answered with an English
 * *description* of it, tagged `paragraph`; the same description written in Gujarati would have
 * passed straight into a verse. Only a human looking at the page catches that.
 */
import type { Db, VerseStatus } from "@granthalaya/db";
import { pageNotes, setAsideBlocks, verses } from "@granthalaya/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { refOf } from "./import.ts";

/** Everything printed on one page, from the studio's point of view. */
export async function pageContext(db: Db, bookId: string, page: number) {
	const [notes, aside, passages] = await Promise.all([
		db
			.select()
			.from(pageNotes)
			.where(and(eq(pageNotes.bookId, bookId), eq(pageNotes.page, page)))
			.orderBy(asc(pageNotes.marker)),
		db
			.select()
			.from(setAsideBlocks)
			.where(and(eq(setAsideBlocks.bookId, bookId), eq(setAsideBlocks.page, page)))
			.orderBy(asc(setAsideBlocks.blockId)),
		db
			.select({
				divisionId: verses.divisionId,
				id: verses.id,
				number: verses.number,
				status: verses.status,
				blocks: verses.blocks,
			})
			.from(verses)
			.where(
				and(
					eq(verses.bookId, bookId),
					eq(verses.orphaned, false),
					// `to_jsonb(int)` builds the scalar server-side. Passing JSON through a bound
					// parameter cast to `jsonb` lets `Bun.SQL` encode it a second time — see the
					// note in `verses.ts`.
					sql`${verses.pages} @> to_jsonb(${page}::int)`,
				),
			)
			.orderBy(asc(verses.divisionId), asc(verses.ordinal)),
	]);

	return {
		page,
		notes,
		setAside: aside,
		passages: passages.map((row) => ({ ...row, ref: refOf(bookId, row.divisionId, row.id) })),
	};
}

export async function patchNote(
	db: Db,
	bookId: string,
	id: string,
	patch: { text?: string; status?: VerseStatus },
) {
	const [updated] = await db
		.update(pageNotes)
		.set({
			...(patch.text === undefined ? {} : { text: patch.text }),
			...(patch.status === undefined ? {} : { status: patch.status }),
			updatedAt: new Date(),
		})
		.where(and(eq(pageNotes.bookId, bookId), eq(pageNotes.id, id)))
		.returning();
	return updated ?? null;
}

/**
 * Mark a held-back block as looked at.
 *
 * `resolved` is a human's judgement that the block genuinely does not belong in the scripture —
 * not the machine's. It is the only thing that distinguishes "seven blocks were set aside" from
 * "seven blocks were set aside and somebody checked all of them".
 */
export async function resolveSetAside(
	db: Db,
	bookId: string,
	id: string,
	patch: { resolved?: boolean; note?: string | null },
) {
	const [updated] = await db
		.update(setAsideBlocks)
		.set({
			...(patch.resolved === undefined ? {} : { resolved: patch.resolved }),
			...(patch.note === undefined ? {} : { note: patch.note }),
		})
		.where(and(eq(setAsideBlocks.bookId, bookId), eq(setAsideBlocks.id, id)))
		.returning();
	return updated ?? null;
}
