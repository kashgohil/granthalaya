/**
 * The proofing queue and one passage at a time (P1.3).
 *
 * The queue has two orderings and they answer different questions. **Book order** is the one that
 * actually finishes a book: every passage must be read against its page, not just the weak ones,
 * and reading a discourse in order is how a human notices that the passage before this one ended
 * mid-sentence. **Worst-first** is `assembly.json`'s own ordering — it starts where the evidence
 * is weakest, which is the right way in when a book is fresh off the pipeline.
 *
 * It is paged rather than virtualized. A 442-page book runs to a thousand-odd passages, and the
 * sample this was built against has seven; paging is what makes the difference invisible.
 */
import type { Db, VerseStatus } from "@granthalaya/db";
import { divisions, verseRevisions, verses } from "@granthalaya/db";
import { and, asc, count, desc, eq, or, type SQL, sql } from "drizzle-orm";
import { refOf } from "./import.ts";

export type QueueOrder = "book" | "confidence";

export type QueueFilters = {
	readonly status?: VerseStatus;
	readonly flag?: string;
	readonly divisionId?: string;
	/** Passages whose OCR text changed under a human's edit — a disagreement to resolve. */
	readonly ocrChanged?: boolean;
	/** Passages the newest draft no longer produces. Off by default; they are not proofable work. */
	readonly orphaned?: boolean;
	readonly page?: number;
};

const QUEUE_COLUMNS = {
	key: verses.key,
	divisionId: verses.divisionId,
	id: verses.id,
	ordinal: verses.ordinal,
	number: verses.number,
	status: verses.status,
	confidence: verses.confidence,
	flags: verses.flags,
	pages: verses.pages,
	origin: verses.origin,
	ocrChanged: verses.ocrChanged,
	orphaned: verses.orphaned,
	edited: sql<boolean>`${verses.text} <> ${verses.ocrText}`.as("edited"),
	chars: sql<number>`char_length(${verses.text})`.as("chars"),
	preview: sql<string>`left(${verses.text}, 120)`.as("preview"),
};

function conditions(bookId: string, filters: QueueFilters): SQL[] {
	const where: SQL[] = [eq(verses.bookId, bookId)];
	if (filters.status !== undefined) where.push(eq(verses.status, filters.status));
	if (filters.divisionId !== undefined) where.push(eq(verses.divisionId, filters.divisionId));
	if (filters.ocrChanged === true) where.push(eq(verses.ocrChanged, true));
	// Orphans are excluded unless asked for: they are a record of something that went wrong,
	// not a passage anybody can usefully proof.
	where.push(eq(verses.orphaned, filters.orphaned === true));
	// Neither predicate passes JSON through a parameter, and that is deliberate. `Bun.SQL`
	// serializes a bound value to JSON when the placeholder is cast to `jsonb`, so the obvious
	// `flags @> ${JSON.stringify([flag])}::jsonb` sends the *string* `"[\"spans-pages\"]"` and
	// matches nothing — silently, which is the worst way for a filter to fail. `jsonb_exists`
	// takes plain text and `to_jsonb(int)` builds the scalar server-side, so neither can be
	// re-encoded on the way in.
	if (filters.flag !== undefined) {
		where.push(sql`jsonb_exists(${verses.flags}, ${filters.flag})`);
	}
	if (filters.page !== undefined) {
		where.push(sql`${verses.pages} @> to_jsonb(${filters.page}::int)`);
	}
	return where;
}

export async function queue(
	db: Db,
	bookId: string,
	order: QueueOrder,
	filters: QueueFilters,
	limit: number,
	offset: number,
) {
	const where = and(...conditions(bookId, filters));

	// Verse ids do not sort (`v61` sits beside `p86-6`) and neither do division ids once a book
	// has more than nine sections, so book order comes off the stored ordinals.
	const ordering =
		order === "confidence"
			? [asc(verses.confidence), asc(divisions.ordinal), asc(verses.ordinal)]
			: [asc(divisions.ordinal), asc(verses.ordinal)];

	const [rows, [total]] = await Promise.all([
		db
			.select(QUEUE_COLUMNS)
			.from(verses)
			.leftJoin(
				divisions,
				and(eq(divisions.bookId, verses.bookId), eq(divisions.id, verses.divisionId)),
			)
			.where(where)
			.orderBy(...ordering)
			.limit(limit)
			.offset(offset),
		db.select({ n: count() }).from(verses).where(where),
	]);

	return {
		total: total?.n ?? 0,
		offset,
		limit,
		items: rows.map((row) => ({ ...row, ref: refOf(bookId, row.divisionId, row.id) })),
	};
}

/** Every distinct flag in this book, with counts — the queue's filter list, built from the data. */
export async function flagCounts(db: Db, bookId: string) {
	const rows = await db
		.select({
			flag: sql<string>`flag`.as("flag"),
			n: count(),
		})
		.from(sql`${verses}, jsonb_array_elements_text(${verses.flags}) as flag`)
		.where(and(eq(verses.bookId, bookId), eq(verses.orphaned, false)))
		.groupBy(sql`flag`)
		.orderBy(desc(count()));
	return rows;
}

export async function getVerse(db: Db, bookId: string, divisionId: string, verseId: string) {
	const [row] = await db
		.select()
		.from(verses)
		.where(
			and(eq(verses.bookId, bookId), eq(verses.divisionId, divisionId), eq(verses.id, verseId)),
		);
	return row;
}

/**
 * The passage before and after, in book order.
 *
 * The workbench needs them for two different reasons: to move with `j`/`k` without refetching the
 * whole queue, and because merging is defined against a neighbour — you cannot offer "merge with
 * the next passage" without knowing there is one.
 */
export async function neighbours(db: Db, bookId: string, divisionId: string, verseId: string) {
	const current = await getVerse(db, bookId, divisionId, verseId);
	if (current === undefined) return { previous: null, next: null };

	const [division] = await db
		.select({ ordinal: divisions.ordinal })
		.from(divisions)
		.where(and(eq(divisions.bookId, bookId), eq(divisions.id, divisionId)));
	const divisionOrdinal = division?.ordinal ?? 0;

	const [previous] = await db
		.select({ divisionId: verses.divisionId, id: verses.id })
		.from(verses)
		.leftJoin(
			divisions,
			and(eq(divisions.bookId, verses.bookId), eq(divisions.id, verses.divisionId)),
		)
		.where(
			and(
				eq(verses.bookId, bookId),
				eq(verses.orphaned, false),
				or(
					sql`${divisions.ordinal} < ${divisionOrdinal}`,
					and(eq(divisions.ordinal, divisionOrdinal), sql`${verses.ordinal} < ${current.ordinal}`),
				),
			),
		)
		.orderBy(desc(divisions.ordinal), desc(verses.ordinal))
		.limit(1);

	const [next] = await db
		.select({ divisionId: verses.divisionId, id: verses.id })
		.from(verses)
		.leftJoin(
			divisions,
			and(eq(divisions.bookId, verses.bookId), eq(divisions.id, verses.divisionId)),
		)
		.where(
			and(
				eq(verses.bookId, bookId),
				eq(verses.orphaned, false),
				or(
					sql`${divisions.ordinal} > ${divisionOrdinal}`,
					and(eq(divisions.ordinal, divisionOrdinal), sql`${verses.ordinal} > ${current.ordinal}`),
				),
			),
		)
		.orderBy(asc(divisions.ordinal), asc(verses.ordinal))
		.limit(1);

	return {
		previous: previous ? { divisionId: previous.divisionId, id: previous.id } : null,
		next: next ? { divisionId: next.divisionId, id: next.id } : null,
	};
}

export type VersePatch = {
	readonly text?: string;
	readonly number?: string | null;
	readonly status?: VerseStatus;
	readonly note?: string | null;
};

/**
 * Edit one passage.
 *
 * Every change writes a revision before it lands, which is cheap insurance in a project whose
 * first principle is fidelity: a proofreader who overwrites the right reading at 1am can get it
 * back, and a package that turns out wrong can be traced to the edit that made it wrong.
 *
 * `ocrChanged` clears on any edit. It means "the machine disagreed with you and you have not
 * looked yet"; the moment you look, it has done its job.
 */
export async function patchVerse(
	db: Db,
	bookId: string,
	divisionId: string,
	verseId: string,
	patch: VersePatch,
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(verses)
			.where(
				and(eq(verses.bookId, bookId), eq(verses.divisionId, divisionId), eq(verses.id, verseId)),
			);
		if (current === undefined) return null;

		const text = patch.text ?? current.text;
		const number = patch.number === undefined ? current.number : patch.number;
		const status = patch.status ?? current.status;
		const note = patch.note === undefined ? current.note : patch.note;

		const textChanged = text !== current.text;
		const numberChanged = number !== current.number;
		const statusChanged = status !== current.status;

		if (!textChanged && !numberChanged && !statusChanged && note === current.note) {
			return current;
		}

		await tx.insert(verseRevisions).values({
			verseKey: current.key,
			bookId,
			action: numberChanged ? "renumber" : textChanged ? "edit" : "status",
			text,
			status,
			number,
			...(note === null ? {} : { note }),
		});

		const [updated] = await tx
			.update(verses)
			.set({
				text,
				number,
				status,
				note,
				...(textChanged ? { ocrChanged: false } : {}),
				updatedAt: new Date(),
			})
			.where(eq(verses.key, current.key))
			.returning();

		return updated ?? null;
	});
}

export async function verseHistory(db: Db, verseKey: string) {
	return db
		.select()
		.from(verseRevisions)
		.where(eq(verseRevisions.verseKey, verseKey))
		.orderBy(desc(verseRevisions.at))
		.limit(50);
}
