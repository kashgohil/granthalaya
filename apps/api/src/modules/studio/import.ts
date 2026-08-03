/**
 * Bringing a draft package into the studio, and bringing it in again (P1.3).
 *
 * Import is the easy half. **Re-import is the point.** These segmentation rules will be tuned
 * against real pages for a long time, and every tuning run rewrites `book.json` — so the studio
 * has to be able to take the new draft without discarding the hours of reading that produced the
 * old one. One rule does that work:
 *
 * > A row nobody has touched is replaced wholesale. A row somebody has touched keeps what they
 * > did, and goes back in the queue.
 *
 * "Touched" is decided by evidence rather than by a flag: a passage is untouched when its text is
 * still exactly the text the machine produced and its status is still `raw`. So a re-run that
 * improves a passage nobody has read yet simply improves it, and a re-run that disagrees with a
 * human is a disagreement a human resolves — never a silent overwrite in either direction.
 *
 * Nothing is deleted. A passage the newest assembly no longer produces is marked `orphaned`,
 * because a passage that vanishes between two runs is exactly the failure the verse-number
 * checksum exists to catch, and deleting it would delete the evidence too.
 */

import type { Book, BookDivision } from "@granthalaya/core";
import { formatRef, isVerse, parseIndicNumber, walkBook } from "@granthalaya/core";
import type { Db } from "@granthalaya/db";
import {
	books,
	divisions,
	pageNotes,
	pages,
	setAsideBlocks,
	verseRevisions,
	verses,
} from "@granthalaya/db";
import { eq, inArray } from "drizzle-orm";
import type { AssembledVerse, AssemblyReport } from "./assembly.ts";
import type { Draft } from "./content.ts";

export type ImportResult = {
	readonly bookId: string;
	readonly firstImport: boolean;
	readonly inserted: number;
	/** Untouched rows the new draft replaced outright. */
	readonly refreshed: number;
	/** Edited or already-proofed rows whose OCR text changed underneath them. */
	readonly reset: number;
	/** Rows the new draft no longer produces. Marked, never deleted. */
	readonly orphaned: number;
	/** Rows that were orphaned and have come back. */
	readonly restored: number;
	readonly pages: number;
	readonly notes: number;
	readonly setAside: number;
	/** Named so the studio can say what it could not do rather than looking like it worked. */
	readonly warnings: readonly string[];
};

/**
 * The division id used in the database and in every ref: the whole path, slash-joined.
 *
 * A unit's `id` is unique among its siblings only — two chapters in different parts may both be
 * `section-1`. `assemble` produces one flat level today, so this is almost always the id itself,
 * but the format has admitted nesting since P0.2 and a key that breaks the first time somebody
 * uses it is not a key.
 */
export function divisionKey(path: readonly string[]): string {
	return path.join("/");
}

/** The empty key is a verse sitting at the top of a book, which the format allows and
 * `assemble` never produces. It has no division row; `""` split naively would invent one. */
export function refOf(bookId: string, divisionId: string, verseId: string): string {
	const path = divisionId === "" ? [] : divisionId.split("/");
	return formatRef({ bookId, path, leaf: verseId });
}

type IncomingVerse = {
	readonly divisionId: string;
	readonly id: string;
	readonly ordinal: number;
	readonly number: string | null;
	readonly form: string;
	readonly text: string;
	readonly evidence: AssembledVerse | null;
};

type IncomingDivision = {
	readonly id: string;
	readonly parentId: string | null;
	readonly ordinal: number;
	readonly kind: string;
	readonly number: string | null;
	readonly title: unknown;
};

/** Flatten the package's tree into rows, in reading order, joined to the assembly evidence. */
export function flattenDraft(
	book: Book,
	report: AssemblyReport,
): { incomingDivisions: IncomingDivision[]; incomingVerses: IncomingVerse[] } {
	const evidenceByRef = new Map(report.verses.map((verse) => [verse.ref, verse]));
	const incomingDivisions: IncomingDivision[] = [];
	const incomingVerses: IncomingVerse[] = [];
	const ordinalPerDivision = new Map<string, number>();

	for (const visit of walkBook(book)) {
		if (isVerse(visit.unit)) {
			const divisionId = divisionKey(visit.ref.path);
			const ordinal = ordinalPerDivision.get(divisionId) ?? 0;
			ordinalPerDivision.set(divisionId, ordinal + 1);
			const layerText = visit.unit.layers[book.primaryLayer];
			incomingVerses.push({
				divisionId,
				id: visit.unit.id,
				ordinal,
				number: visit.unit.number ?? null,
				form: visit.unit.form,
				text: typeof layerText === "string" ? layerText : "",
				evidence: evidenceByRef.get(refOf(book.id, divisionId, visit.unit.id)) ?? null,
			});
			continue;
		}

		const division = visit.unit as BookDivision;
		const path = visit.ref.path;
		incomingDivisions.push({
			id: divisionKey(path),
			parentId: path.length > 1 ? divisionKey(path.slice(0, -1)) : null,
			ordinal: incomingDivisions.length,
			kind: division.kind,
			number: division.number ?? null,
			title: division.title ?? null,
		});
	}

	return { incomingDivisions, incomingVerses };
}

/** The manifest, which is everything about a book except the text: `structure` is the text. */
export function manifestOf(book: Book): Record<string, unknown> {
	const { structure: _structure, ...manifest } = book;
	return manifest;
}

/** Page → what that page printed on itself, gathered from every block that recorded it. */
export function printedPages(report: AssemblyReport): Map<number, number> {
	const found = new Map<number, number>();
	const record = (page: number, printed: number | null) => {
		if (printed !== null && !found.has(page)) {
			found.set(page, printed);
		}
	};
	for (const verse of report.verses) {
		for (const block of verse.blocks) record(block.page, block.printedPage);
	}
	for (const note of report.notes) record(note.block.page, note.block.printedPage);
	for (const block of report.setAside) record(block.page, block.printedPage);
	return found;
}

/** A footnote's own marker, when it opens with one: `૧. મૂળમાયા` is note 1. */
export function noteMarker(text: string): number | null {
	const leading = /^\s*(\p{Nd}+)\s*[.)]/u.exec(text);
	if (!leading?.[1]) return null;
	return parseIndicNumber(leading[1])?.value ?? null;
}

/**
 * Import or re-import a draft.
 *
 * One transaction: a half-imported book is indistinguishable from a badly-segmented one, and
 * telling them apart later would mean re-reading pages.
 */
export async function importDraft(db: Db, draft: Draft): Promise<ImportResult> {
	const { book, report, pagesDir, pageManifest } = draft;
	const warnings: string[] = [];
	if (pagesDir === null) {
		warnings.push(
			`No rendered pages match this book's source hash (${report.source.sha256.slice(0, 12)}…). Proofing needs the page images — run \`bun run render\` on ${report.source.file}.`,
		);
	}

	const { incomingDivisions, incomingVerses } = flattenDraft(book, report);
	const printed = printedPages(report);

	return db.transaction(async (tx) => {
		const [existingBook] = await tx.select().from(books).where(eq(books.id, book.id));
		const firstImport = existingBook === undefined;

		const bookRow = {
			id: book.id,
			packageDir: draft.dir,
			pagesDir,
			sourceFile: report.source.file,
			sourceSha256: report.source.sha256,
			engine: report.source.engine,
			bookPageCount: report.source.bookPageCount,
			assembly: {
				numbering: report.numbering,
				sequence: report.sequence,
				counts: report.counts,
				needsHuman: report.needsHuman,
				runningHeads: report.runningHeads,
				pagesAssembled: report.source.pagesAssembled,
			},
			updatedAt: new Date(),
		};

		if (firstImport) {
			await tx.insert(books).values({ ...bookRow, manifest: manifestOf(book) });
		} else {
			// The manifest is not refreshed. Its three most important fields — the source
			// edition, the licence and the printed title — are exactly the ones `assemble`
			// writes `unknown` into and names as a human's job, so re-importing would undo the
			// one part of the package a machine can never supply.
			await tx.update(books).set(bookRow).where(eq(books.id, book.id));
		}

		for (const division of incomingDivisions) {
			await tx
				.insert(divisions)
				.values({
					bookId: book.id,
					id: division.id,
					parentId: division.parentId,
					ordinal: division.ordinal,
					kind: division.kind,
					number: division.number,
					title: division.title,
				})
				.onConflictDoUpdate({
					target: [divisions.bookId, divisions.id],
					// Reading order and kind are the machine's; the title is the human's. Section
					// titles are provisional until P1.4 can transliterate them, and a re-import
					// that reverted a corrected one would be silently destroying work.
					set: { ordinal: division.ordinal, kind: division.kind },
				});
		}

		const existingVerses = await tx.select().from(verses).where(eq(verses.bookId, book.id));
		const byRef = new Map<string, (typeof existingVerses)[number]>(
			existingVerses.map((row) => [`${row.divisionId}#${row.id}`, row]),
		);

		let inserted = 0;
		let refreshed = 0;
		let reset = 0;
		let restored = 0;

		for (const incoming of incomingVerses) {
			const key = `${incoming.divisionId}#${incoming.id}`;
			const existing = byRef.get(key);
			const evidence = incoming.evidence;
			const machineColumns = {
				ordinal: incoming.ordinal,
				form: incoming.form,
				confidence: evidence?.confidence ?? null,
				flags: evidence?.flags ?? [],
				pages: evidence?.pages ?? [],
				printedPages: evidence?.printedPages ?? [],
				blocks: evidence?.blocks ?? [],
				repairs: evidence?.repairs ?? [],
				footnoteMarkers: evidence?.footnoteMarkers ?? [],
				orthography: evidence?.orthography ?? null,
				updatedAt: new Date(),
			};

			if (existing === undefined) {
				const [row] = await tx
					.insert(verses)
					.values({
						bookId: book.id,
						divisionId: incoming.divisionId,
						id: incoming.id,
						number: incoming.number,
						text: incoming.text,
						ocrText: incoming.text,
						...machineColumns,
					})
					.returning({ key: verses.key });
				if (row !== undefined) {
					await tx.insert(verseRevisions).values({
						verseKey: row.key,
						bookId: book.id,
						action: firstImport ? "import" : "reimport",
						text: incoming.text,
						status: "raw",
						number: incoming.number,
					});
				}
				inserted += 1;
				continue;
			}

			const untouched = existing.status === "raw" && existing.text === existing.ocrText;
			const ocrChanged = existing.ocrText !== incoming.text;

			if (untouched) {
				// Nobody has read this one, so there is nothing to protect: take the new draft
				// whole, number and all.
				await tx
					.update(verses)
					.set({
						number: incoming.number,
						text: incoming.text,
						ocrText: incoming.text,
						ocrChanged: false,
						orphaned: false,
						...machineColumns,
					})
					.where(eq(verses.key, existing.key));
				refreshed += 1;
			} else {
				await tx
					.update(verses)
					.set({
						// The human's text, number and note stay. Only the machine's side moves.
						ocrText: incoming.text,
						ocrChanged,
						orphaned: false,
						...(ocrChanged ? { status: "raw" as const } : {}),
						...machineColumns,
					})
					.where(eq(verses.key, existing.key));
				if (ocrChanged) {
					await tx.insert(verseRevisions).values({
						verseKey: existing.key,
						bookId: book.id,
						action: "reimport",
						text: existing.text,
						status: "raw",
						number: existing.number,
						note: "Re-import brought different OCR text; back to raw for a second read.",
					});
					reset += 1;
				} else {
					refreshed += 1;
				}
			}

			if (existing.orphaned) {
				restored += 1;
			}
			byRef.delete(key);
		}

		// Whatever is left in the map is a passage this draft no longer produces. Rows the human
		// created (a split half, an inserted passage) were never in an assembly and are not
		// orphans — they are simply theirs.
		const vanished = [...byRef.values()].filter((row) => row.origin === "imported");
		if (vanished.length > 0) {
			await tx
				.update(verses)
				.set({ orphaned: true, updatedAt: new Date() })
				.where(
					inArray(
						verses.key,
						vanished.map((row) => row.key),
					),
				);
		}

		// Pages are the machine's entirely — they are pinned to the source file by hash and there
		// is nothing on them for a human to edit.
		await tx.delete(pages).where(eq(pages.bookId, book.id));
		if (pageManifest !== null) {
			await tx.insert(pages).values(
				pageManifest.pages.map((page) => ({
					bookId: book.id,
					number: page.number,
					printedPage: printed.get(page.number) ?? null,
					file: page.file,
					widthPx: page.widthPx,
					heightPx: page.heightPx,
				})),
			);
		}

		const notesWritten = await upsertNotes(tx, book.id, report);
		const setAsideWritten = await upsertSetAside(tx, book.id, report);

		return {
			bookId: book.id,
			firstImport,
			inserted,
			refreshed,
			reset,
			orphaned: vanished.length,
			restored,
			pages: pageManifest?.pages.length ?? 0,
			notes: notesWritten,
			setAside: setAsideWritten,
			warnings,
		};
	});
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Footnotes: proofread here, attached to their words in P1.4. Same touched/untouched rule. */
async function upsertNotes(tx: Tx, bookId: string, report: AssemblyReport): Promise<number> {
	const existing = await tx.select().from(pageNotes).where(eq(pageNotes.bookId, bookId));
	const byBlock = new Map<string, (typeof existing)[number]>(
		existing.map((row) => [blockKeyOf(row.block), row]),
	);

	for (const note of report.notes) {
		const key = `${note.block.page}:${note.block.blockId}`;
		const found = byBlock.get(key);
		if (found === undefined) {
			await tx.insert(pageNotes).values({
				bookId,
				page: note.page,
				printedPage: note.printedPage,
				marker: noteMarker(note.text),
				text: note.text,
				ocrText: note.text,
				block: note.block,
			});
			continue;
		}
		const untouched = found.status === "raw" && found.text === found.ocrText;
		await tx
			.update(pageNotes)
			.set({
				ocrText: note.text,
				marker: noteMarker(note.text),
				block: note.block,
				printedPage: note.printedPage,
				updatedAt: new Date(),
				...(untouched ? { text: note.text } : {}),
			})
			.where(eq(pageNotes.id, found.id));
	}
	return report.notes.length;
}

function blockKeyOf(block: unknown): string {
	const value = block as { page?: number; blockId?: string };
	return `${value?.page}:${value?.blockId}`;
}

/**
 * The blocks the pipeline held back.
 *
 * `resolved` is a human's judgement that a block genuinely does not belong in the scripture, so
 * it survives a re-import — but only for a block whose *text* is unchanged. If the OCR now reads
 * that region differently, the judgement was about something else.
 */
async function upsertSetAside(tx: Tx, bookId: string, report: AssemblyReport): Promise<number> {
	const existing = await tx.select().from(setAsideBlocks).where(eq(setAsideBlocks.bookId, bookId));
	const byBlock = new Map<string, (typeof existing)[number]>(
		existing.map((row) => [`${row.page}:${row.blockId}`, row]),
	);
	const seen = new Set<string>();

	for (const block of report.setAside) {
		const key = `${block.page}:${block.blockId}`;
		seen.add(key);
		const found = byBlock.get(key);
		if (found === undefined) {
			await tx.insert(setAsideBlocks).values({
				bookId,
				page: block.page,
				printedPage: block.printedPage,
				blockId: block.blockId,
				tag: block.tag,
				bbox: block.bbox,
				text: block.text,
			});
			continue;
		}
		await tx
			.update(setAsideBlocks)
			.set({
				tag: block.tag,
				bbox: block.bbox,
				printedPage: block.printedPage,
				text: block.text,
				...(found.text === block.text ? {} : { resolved: false }),
			})
			.where(eq(setAsideBlocks.id, found.id));
	}

	const gone = existing.filter((row) => !seen.has(`${row.page}:${row.blockId}`));
	if (gone.length > 0) {
		await tx.delete(setAsideBlocks).where(
			inArray(
				setAsideBlocks.id,
				gone.map((row) => row.id),
			),
		);
	}

	return report.setAside.length;
}
