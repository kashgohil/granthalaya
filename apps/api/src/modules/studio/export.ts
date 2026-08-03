/**
 * Compiling proofed text back into a package (P1.3).
 *
 * This is the step the whole slice exists for. `assemble` produces a package no human has read
 * and the format says so — `contentStatus: "draft"`, and the catalog serves only `published`. A
 * human reads every passage against its page image, and this turns that reading back into the one
 * artefact a reader can install.
 *
 * It refuses far more readily than it writes, and the refusals are the feature:
 *
 * - **Every passage must be `approved`.** Not "proofed" — read is not the same as cleared.
 * - **Nothing may still be `unknown`.** A package whose source edition is a placeholder cannot be
 *   cited, and fidelity that cannot be checked is not fidelity.
 * - **A version is written once.** Corrections ship as a new `contentVersion`, never as an edit
 *   to a file that has already been handed out.
 *
 * `contentStatus` comes out as `proofed`, not `published`. Publishing is P1.5's catalog step, and
 * keeping them apart is what lets a proofed book sit and be re-read before anyone installs it.
 */
import { join } from "node:path";
import type { Book, BookUnit, BookVerse } from "@granthalaya/core";
import { hashVerse, validateBook } from "@granthalaya/core";
import type { Db, DivisionRow, VerseRow } from "@granthalaya/db";
import { resolveInContent } from "./content.ts";
import { orderedStructure } from "./restructure.ts";
import { getBookRow, statusCounts, stillNeedsHuman } from "./service.ts";

export type ExportRefusal = {
	readonly ok: false;
	readonly reasons: readonly string[];
};

export type ExportSuccess = {
	readonly ok: true;
	readonly file: string;
	readonly contentVersion: string;
	readonly verses: number;
	readonly warnings: readonly string[];
};

export type ExportResult = ExportRefusal | ExportSuccess;

/** Rebuild the structure tree from flat rows, honouring `parentId` for nested divisions. */
export function buildStructure(
	divisionRows: readonly DivisionRow[],
	verseRows: readonly VerseRow[],
	primaryLayer: string,
): BookUnit[] {
	const versesByDivision = new Map<string, VerseRow[]>();
	for (const verse of verseRows) {
		const list = versesByDivision.get(verse.divisionId) ?? [];
		list.push(verse);
		versesByDivision.set(verse.divisionId, list);
	}
	for (const list of versesByDivision.values()) {
		list.sort((a, b) => a.ordinal - b.ordinal);
	}

	const toVerse = (row: VerseRow): BookVerse => {
		const layers = { [primaryLayer]: row.text };
		return {
			kind: "verse",
			id: row.id,
			...(row.number === null ? {} : { number: row.number }),
			form: row.form === "verse" ? "verse" : "prose",
			layers,
			// Recomputed, never carried over: the text is not the text `assemble` hashed.
			hash: hashVerse(layers),
		};
	};

	const childrenOf = (parentId: string | null): BookUnit[] =>
		divisionRows
			.filter((division) => (division.parentId ?? null) === parentId)
			.sort((a, b) => a.ordinal - b.ordinal)
			.map((division) => ({
				kind: (division.kind as "section") ?? "section",
				// The id stored is the whole path; a unit's own id is its last segment.
				id: division.id.split("/").at(-1) ?? division.id,
				...(division.number === null ? {} : { number: division.number }),
				...(division.title === null ? {} : { title: division.title as Record<string, string> }),
				children: [
					...childrenOf(division.id),
					...(versesByDivision.get(division.id) ?? []).map(toVerse),
				],
			}))
			// A division must contain something; one that has been emptied out is dropped rather
			// than shipped as an invalid package.
			.filter((unit) => unit.children.length > 0);

	// Verses sitting above any division — the format allows it, `assemble` never produces it.
	return [...childrenOf(null), ...(versesByDivision.get("") ?? []).map(toVerse)];
}

export type ExportOptions = {
	readonly contentVersion?: string;
	/** Write it even though passages are still unapproved. For looking, never for publishing. */
	readonly dryRun?: boolean;
};

export async function exportBook(
	db: Db,
	contentDir: string,
	bookId: string,
	options: ExportOptions = {},
): Promise<ExportResult | null> {
	const book = await getBookRow(db, bookId);
	if (book === undefined) return null;

	const manifest = book.manifest as Omit<Book, "structure">;
	const counts = await statusCounts(db, bookId);
	const reasons: string[] = [];

	if (counts.total === 0) {
		reasons.push("This book has no passages.");
	}
	if (counts.approved !== counts.total) {
		reasons.push(
			`${counts.total - counts.approved} of ${counts.total} passages are not approved yet (${counts.proofed} proofed, ${counts.raw} unread). Reading a passage is not the same as clearing it.`,
		);
	}
	for (const need of stillNeedsHuman(manifest)) {
		reasons.push(`Still unknown — ${need}`);
	}

	const contentVersion = options.contentVersion ?? manifest.contentVersion;
	const relative = join(book.packageDir, "proofed", `${bookId}-${contentVersion}.json`);
	const target = resolveInContent(contentDir, relative);
	if (await Bun.file(target).exists()) {
		reasons.push(
			`${relative} already exists. A published version is immutable — bump contentVersion instead of rewriting one that has been handed out.`,
		);
	}

	if (reasons.length > 0 && options.dryRun !== true) {
		return { ok: false, reasons };
	}

	const { divisions: divisionRows, verses: verseRows } = await orderedStructure(db, bookId);
	const compiled: Book = {
		...manifest,
		contentVersion,
		contentStatus: "proofed",
		structure: buildStructure(divisionRows, verseRows, manifest.primaryLayer),
	};

	// The package is validated against P0.2 before it is written. A studio that can produce an
	// invalid package is a bug in the studio, not something to hand to the catalog and find out.
	const validation = validateBook(compiled);
	if (!validation.ok) {
		return {
			ok: false,
			reasons: [
				"The compiled package does not validate against the book format:",
				...validation.issues
					.filter((issue) => issue.severity === "error")
					.slice(0, 10)
					.map((issue) => `${issue.path ?? ""} ${issue.message}`.trim()),
			],
		};
	}

	if (options.dryRun === true) {
		return {
			ok: true,
			file: relative,
			contentVersion,
			verses: verseRows.length,
			warnings: [...reasons, "Dry run — nothing was written."],
		};
	}

	await Bun.write(target, `${JSON.stringify(compiled, null, "\t")}\n`);

	return {
		ok: true,
		file: relative,
		contentVersion,
		verses: verseRows.length,
		warnings: validation.issues
			.filter((issue) => issue.severity === "warning")
			.map((issue) => `${issue.path ?? ""} ${issue.message}`.trim()),
	};
}
