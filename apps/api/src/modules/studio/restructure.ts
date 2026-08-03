/**
 * Fixing segmentation, not just text (P1.3).
 *
 * `assemble` finds a book's structure in what the pages print — `॥૬૨॥` closes a passage, a
 * danda-wrapped completion line closes a work — and when the OCR misreads one of those marks the
 * structure comes out wrong in a way no amount of text editing can repair. A dropped `॥૬૨॥` welds
 * two passages into one; a spurious one splits a passage in half. Those are exactly what the
 * verse-number checksum reports as missing, duplicate and out-of-sequence numbers, and the report
 * would be pointless if the studio could not act on it.
 *
 * The alternative — tune `assemble`, re-run it, re-import — is not equivalent: it is a machine
 * overruling a human on a book they have already read part of.
 *
 * **Ids churn freely here, and that is safe precisely because nothing is published.** A verse ref
 * is the atom every annotation, highlight and SRS item will hang off, but none of those exist for
 * a draft: no reader has this book. Lineage is recorded anyway so a re-import can still match, and
 * P1.5's cross-version audit is what makes a rename safe once a version has shipped.
 */

import { parseIndicNumber } from "@granthalaya/core";
import type { Db, VerseStatus } from "@granthalaya/db";
import { divisions, verseRevisions, verses } from "@granthalaya/db";
import { and, asc, eq, gt, sql } from "drizzle-orm";

export class RestructureError extends Error {}

/**
 * A verse id from its printed number, or from where it sits when nothing was printed.
 *
 * The same rule `assemble` uses, and it matters that it is the same one: the number is the
 * edition's own identity for the passage, it survives re-extraction, and it is what a reader
 * would cite. A passage with no number falls back to a positional id and keeps its `no-number`
 * flag, so it stays visible in the queue as something for a human to settle.
 */
export function verseIdFor(number: string | null, fallbackPage: number | null, ordinal: number) {
	if (number !== null) {
		const parsed = parseIndicNumber(number);
		if (parsed !== null) return `v${parsed.value}`;
	}
	return `p${fallbackPage ?? 0}-${ordinal + 1}`;
}

/** Make an id unique within its division by suffixing, rather than refusing the edit. */
async function freeId(
	tx: Tx,
	bookId: string,
	divisionId: string,
	wanted: string,
	exclude?: string,
): Promise<string> {
	const taken = new Set(
		(
			await tx
				.select({ id: verses.id })
				.from(verses)
				.where(and(eq(verses.bookId, bookId), eq(verses.divisionId, divisionId)))
		).map((row) => row.id),
	);
	if (exclude !== undefined) taken.delete(exclude);
	if (!taken.has(wanted)) return wanted;
	for (let suffix = 2; suffix < 100; suffix += 1) {
		const candidate = `${wanted}-${suffix}`;
		if (!taken.has(candidate)) return candidate;
	}
	throw new RestructureError(`Cannot find a free id near ${wanted}.`);
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function load(tx: Tx, bookId: string, divisionId: string, verseId: string) {
	const [row] = await tx
		.select()
		.from(verses)
		.where(
			and(eq(verses.bookId, bookId), eq(verses.divisionId, divisionId), eq(verses.id, verseId)),
		);
	if (row === undefined) {
		throw new RestructureError(`No passage ${divisionId}#${verseId} in this book.`);
	}
	return row;
}

/** Shift everything at or after `from` down by one, to open a slot. */
async function openSlot(tx: Tx, bookId: string, divisionId: string, from: number) {
	await tx
		.update(verses)
		.set({ ordinal: sql`${verses.ordinal} + 1` })
		.where(
			and(
				eq(verses.bookId, bookId),
				eq(verses.divisionId, divisionId),
				sql`${verses.ordinal} >= ${from}`,
			),
		);
}

async function closeGap(tx: Tx, bookId: string, divisionId: string, from: number) {
	await tx
		.update(verses)
		.set({ ordinal: sql`${verses.ordinal} - 1` })
		.where(
			and(eq(verses.bookId, bookId), eq(verses.divisionId, divisionId), gt(verses.ordinal, from)),
		);
}

/**
 * Split a passage in two at a character offset.
 *
 * The second half carries the evidence forward — same pages, same blocks — because it came off
 * the same region of the same page, and a proofreader still needs the image to check it against.
 * It gets no printed number, so it lands with the `no-number` flag and a positional id, which is
 * what puts it in the queue for somebody to number.
 */
export async function splitVerse(
	db: Db,
	bookId: string,
	divisionId: string,
	verseId: string,
	offset: number,
) {
	return db.transaction(async (tx) => {
		const row = await load(tx, bookId, divisionId, verseId);
		const characters = [...row.text];
		if (offset <= 0 || offset >= characters.length) {
			throw new RestructureError(
				`Split point ${offset} is outside the passage (${characters.length} characters).`,
			);
		}

		const head = characters.slice(0, offset).join("").trimEnd();
		const tail = characters.slice(offset).join("").trimStart();
		if (head === "" || tail === "") {
			throw new RestructureError("A split must leave text on both sides.");
		}

		const pages = (row.pages as number[]) ?? [];
		const newId = await freeId(
			tx,
			bookId,
			divisionId,
			verseIdFor(null, pages[0] ?? null, row.ordinal + 1),
		);

		await openSlot(tx, bookId, divisionId, row.ordinal + 1);

		await tx
			.update(verses)
			.set({ text: head, status: "raw", updatedAt: new Date() })
			.where(eq(verses.key, row.key));
		await tx.insert(verseRevisions).values({
			verseKey: row.key,
			bookId,
			action: "split",
			text: head,
			status: "raw",
			number: row.number,
			note: `Split at character ${offset}; the rest became ${newId}.`,
		});

		const [created] = await tx
			.insert(verses)
			.values({
				bookId,
				divisionId,
				id: newId,
				ordinal: row.ordinal + 1,
				number: null,
				form: row.form,
				text: tail,
				// The machine never produced this passage, so it has no OCR text of its own. The
				// tail it was cut from is the honest answer, and it keeps the "edited?" test
				// (`text <> ocrText`) meaningful.
				ocrText: tail,
				status: "raw",
				origin: "split",
				lineage: [`${divisionId}#${verseId}`],
				confidence: row.confidence,
				flags: [...new Set([...((row.flags as string[]) ?? []), "no-number"])],
				pages: row.pages,
				printedPages: row.printedPages,
				blocks: row.blocks,
				repairs: [],
				footnoteMarkers: [],
				orthography: null,
			})
			.returning();

		if (created !== undefined) {
			await tx.insert(verseRevisions).values({
				verseKey: created.key,
				bookId,
				action: "split",
				text: tail,
				status: "raw",
				note: `Split off ${divisionId}#${verseId}.`,
			});
		}

		return { head: verseId, tail: newId };
	});
}

/**
 * Merge a passage into the one before or after it.
 *
 * The surviving passage keeps the *earlier* one's number and id, because in a printed book the
 * number closes a passage: if `॥૬૨॥` was misread and two passages ran together, the text that
 * follows belongs to the passage that was already open.
 *
 * Evidence is unioned rather than replaced — the merged passage genuinely came off both pages,
 * and the side-by-side view has to be able to show both.
 */
export async function mergeVerse(
	db: Db,
	bookId: string,
	divisionId: string,
	verseId: string,
	direction: "previous" | "next",
) {
	return db.transaction(async (tx) => {
		const row = await load(tx, bookId, divisionId, verseId);
		const [other] = await tx
			.select()
			.from(verses)
			.where(
				and(
					eq(verses.bookId, bookId),
					eq(verses.divisionId, divisionId),
					eq(verses.ordinal, direction === "next" ? row.ordinal + 1 : row.ordinal - 1),
				),
			);
		if (other === undefined) {
			throw new RestructureError(
				`There is no ${direction} passage in ${divisionId} to merge with. Merging across a section boundary would change which work a passage belongs to — move the boundary instead.`,
			);
		}

		const [first, second] = direction === "next" ? [row, other] : [other, row];
		// A prose passage that ran across a page break was joined with a space by `assemble`;
		// two that were wrongly separated should join the same way.
		const joined = `${first.text.trimEnd()} ${second.text.trimStart()}`;
		const union = <T>(a: unknown, b: unknown): T[] => [
			...new Set([...((a as T[]) ?? []), ...((b as T[]) ?? [])]),
		];

		await tx
			.update(verses)
			.set({
				text: joined,
				status: "raw",
				pages: union<number>(first.pages, second.pages).sort((a, b) => a - b),
				printedPages: union(first.printedPages, second.printedPages),
				blocks: [...((first.blocks as unknown[]) ?? []), ...((second.blocks as unknown[]) ?? [])],
				repairs: [
					...((first.repairs as unknown[]) ?? []),
					...((second.repairs as unknown[]) ?? []),
				],
				footnoteMarkers: union<number>(first.footnoteMarkers, second.footnoteMarkers),
				// Flags describe the *survivor*, so the two that a merge can settle are recomputed
				// rather than unioned: absorbing an unnumbered half does not make a numbered
				// passage unnumbered, and two short fragments joined are not a short fragment.
				flags: union<string>(first.flags, second.flags).filter(
					(flag) => flag !== "very-short" && !(flag === "no-number" && first.number !== null),
				),
				lineage: union<string>(first.lineage, [
					...((second.lineage as string[]) ?? []),
					`${divisionId}#${second.id}`,
				]),
				updatedAt: new Date(),
			})
			.where(eq(verses.key, first.key));

		await tx.insert(verseRevisions).values({
			verseKey: first.key,
			bookId,
			action: "merge",
			text: joined,
			status: "raw",
			number: first.number,
			note: `Merged ${second.id} into ${first.id}.`,
		});

		await tx.delete(verses).where(eq(verses.key, second.key));
		await closeGap(tx, bookId, divisionId, second.ordinal);

		return { survivor: first.id, absorbed: second.id };
	});
}

/** A passage the OCR missed entirely — the failure the number sequence exists to catch. */
export async function insertVerse(
	db: Db,
	bookId: string,
	divisionId: string,
	afterVerseId: string | null,
	text: string,
	number: string | null,
) {
	return db.transaction(async (tx) => {
		let ordinal = 0;
		let form = "prose";
		let pages: unknown = [];
		if (afterVerseId !== null) {
			const after = await load(tx, bookId, divisionId, afterVerseId);
			ordinal = after.ordinal + 1;
			form = after.form;
			pages = after.pages;
		}
		await openSlot(tx, bookId, divisionId, ordinal);

		const pageList = (pages as number[]) ?? [];
		const id = await freeId(
			tx,
			bookId,
			divisionId,
			verseIdFor(number, pageList[pageList.length - 1] ?? null, ordinal),
		);

		const [created] = await tx
			.insert(verses)
			.values({
				bookId,
				divisionId,
				id,
				ordinal,
				number,
				form,
				text,
				ocrText: "",
				status: "raw",
				origin: "inserted",
				// No pixel boxes: the machine never saw this text, so there is nothing to line up
				// against on the page image. The proofreader typed it from the page themselves.
				flags: number === null ? ["no-number"] : [],
				pages: pageList,
			})
			.returning();

		if (created !== undefined) {
			await tx.insert(verseRevisions).values({
				verseKey: created.key,
				bookId,
				action: "insert",
				text,
				status: "raw",
				number,
				note: "Typed in by hand — the OCR did not produce this passage.",
			});
		}

		return { id };
	});
}

/**
 * Remove a passage.
 *
 * The one genuinely destructive operation in the studio, for the one case that needs it: a
 * "passage" that is not text at all — a caption, a running head the tag filter missed, a
 * duplicate of the one before it. Everything else is a merge or an edit.
 */
export async function deleteVerse(db: Db, bookId: string, divisionId: string, verseId: string) {
	return db.transaction(async (tx) => {
		const row = await load(tx, bookId, divisionId, verseId);
		await tx.delete(verses).where(eq(verses.key, row.key));
		await closeGap(tx, bookId, divisionId, row.ordinal);
		return { deleted: verseId };
	});
}

/**
 * Renumber a passage, which re-derives its id.
 *
 * Deliberately coupled: the number *is* the identity, and a passage whose id said `v61` while its
 * printed number said `૬૩` would be a lie in the one field a reader would cite.
 */
export async function renumberVerse(
	db: Db,
	bookId: string,
	divisionId: string,
	verseId: string,
	number: string | null,
) {
	return db.transaction(async (tx) => {
		const row = await load(tx, bookId, divisionId, verseId);
		const pages = (row.pages as number[]) ?? [];
		const wanted = verseIdFor(number, pages[0] ?? null, row.ordinal);
		const id = await freeId(tx, bookId, divisionId, wanted, verseId);

		const flags = ((row.flags as string[]) ?? []).filter((flag) => flag !== "no-number");
		await tx
			.update(verses)
			.set({
				id,
				number,
				flags: number === null ? [...flags, "no-number"] : flags,
				lineage: [...new Set([...((row.lineage as string[]) ?? []), `${divisionId}#${verseId}`])],
				updatedAt: new Date(),
			})
			.where(eq(verses.key, row.key));

		await tx.insert(verseRevisions).values({
			verseKey: row.key,
			bookId,
			action: "renumber",
			text: row.text,
			status: row.status,
			number,
			note: id === verseId ? null : `Id followed the number: ${verseId} → ${id}.`,
		});

		return { id, number };
	});
}

/** A section's title, once a human can read it off the page. Positional ids stay until P1.4. */
export async function patchDivision(
	db: Db,
	bookId: string,
	divisionId: string,
	patch: { title?: unknown; number?: string | null },
) {
	const [updated] = await db
		.update(divisions)
		.set({
			...(patch.title === undefined ? {} : { title: patch.title }),
			...(patch.number === undefined ? {} : { number: patch.number }),
		})
		.where(and(eq(divisions.bookId, bookId), eq(divisions.id, divisionId)))
		.returning();
	return updated ?? null;
}

/** Book order, for the export and for anything that needs the whole structure at once. */
export async function orderedStructure(db: Db, bookId: string) {
	const [divisionRows, verseRows] = await Promise.all([
		db.select().from(divisions).where(eq(divisions.bookId, bookId)).orderBy(asc(divisions.ordinal)),
		db
			.select()
			.from(verses)
			.where(and(eq(verses.bookId, bookId), eq(verses.orphaned, false)))
			.orderBy(asc(verses.ordinal)),
	]);
	return { divisions: divisionRows, verses: verseRows };
}

export type { VerseStatus };
