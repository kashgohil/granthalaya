/**
 * The admin studio's HTTP surface (P1.3).
 *
 * Every route here is behind the same `onBeforeHandle` — including the page images, which are
 * photographs of a third-party edition whose rights are confirmed per book before anything is
 * published. Elysia applies a hook to the routes declared after it on the same instance, so the
 * gate is a property of this file rather than a decoration each route has to remember.
 *
 * Response schemas are mostly left off. Eden infers the client's types from what the handlers
 * actually return, and restating P0.2's book shape in TypeBox would give the format a second
 * definition to drift from — it has one, in `packages/core`, and it is not this file.
 */
import type { Db } from "@granthalaya/db";
import { t } from "elysia";
import { type AdminConfig, adminInstance, adminRejection } from "../admin/guard.ts";
import { publishBook } from "../catalog/publish.ts";
import { listReleases, releaseSummary } from "../catalog/service.ts";
import { pageContext, patchNote, resolveSetAside } from "./apparatus.ts";
import { ContentError, listDrafts, pageImagePath, readDraft } from "./content.ts";
import { exportBook } from "./export.ts";
import { importDraft, refOf } from "./import.ts";
import {
	deleteVerse,
	insertVerse,
	mergeVerse,
	patchDivision,
	renumberVerse,
	splitVerse,
} from "./restructure.ts";
import {
	deleteBook,
	getBookOverview,
	getBookRow,
	getPage,
	listBooks,
	listPages,
	patchManifest,
} from "./service.ts";
import { flagCounts, getVerse, neighbours, patchVerse, queue, verseHistory } from "./verses.ts";

/** The workflow, as the API states it. `raw` is where import leaves everything. */
const VerseStatusSchema = t.Union([t.Literal("raw"), t.Literal("proofed"), t.Literal("approved")]);

export type StudioOptions = {
	readonly credentials: AdminConfig;
	readonly db: Db;
	readonly contentDir: string;
};

export function createStudio({ credentials, db, contentDir }: StudioOptions) {
	return (
		adminInstance("studio")
			.onBeforeHandle(({ cookie, status }) => {
				const rejection = adminRejection(credentials, cookie);
				return rejection === null ? undefined : status(rejection.code, rejection.body);
			})

			.get("/admin/drafts", async () => {
				const [drafts, imported] = await Promise.all([listDrafts(contentDir), listBooks(db)]);
				const importedIds = new Set(imported.map((book) => book.id));
				return drafts.map((draft) => ({ ...draft, imported: importedIds.has(draft.bookId) }));
			})

			.post(
				"/admin/books",
				async ({ body, status }) => {
					try {
						return await importDraft(db, await readDraft(contentDir, body.dir));
					} catch (cause) {
						// A draft that cannot be read is the admin's problem to fix on disk, not a
						// bug — say which file and why, and stay a 4xx.
						if (cause instanceof ContentError) {
							return status(422, { error: cause.message });
						}
						throw cause;
					}
				},
				{ body: t.Object({ dir: t.String({ minLength: 1 }) }) },
			)

			.get("/admin/books", () => listBooks(db))

			.get("/admin/books/:bookId", async ({ params, status }) => {
				const overview = await getBookOverview(db, params.bookId);
				if (overview === null) {
					return status(404, { error: `No book ${params.bookId} in the studio.` });
				}
				// What has already been handed out, beside what is being worked on. The studio is
				// the only place both are visible, and the pair is what makes the next version's
				// bump an informed decision rather than a guess.
				const published = await listReleases(db, params.bookId);
				return { ...overview, releases: published.map(releaseSummary) };
			})

			.patch(
				"/admin/books/:bookId",
				async ({ params, body, status }) => {
					const manifest = await patchManifest(db, params.bookId, body.manifest);
					return manifest === null
						? status(404, { error: `No book ${params.bookId} in the studio.` })
						: { manifest };
				},
				{ body: t.Object({ manifest: t.Record(t.String(), t.Unknown()) }) },
			)

			.delete("/admin/books/:bookId", async ({ params, status }) => {
				// Everything here can be rebuilt by re-importing *except* the proofing, so this is
				// the one destructive route in the studio and the UI does not offer it. It is for
				// a bad import, before anybody has read anything.
				return (await deleteBook(db, params.bookId))
					? { deleted: params.bookId }
					: status(404, { error: `No book ${params.bookId} in the studio.` });
			})

			.get("/admin/books/:bookId/pages", ({ params }) => listPages(db, params.bookId))

			.get(
				"/admin/books/:bookId/pages/:page",
				async ({ params, status }) => {
					const book = await getBookRow(db, params.bookId);
					if (book?.pagesDir == null) {
						return status(404, {
							error: `No rendered pages for ${params.bookId}. Run \`bun run render\` on its source PDF.`,
						});
					}
					const page = await getPage(db, params.bookId, params.page);
					if (page === undefined) {
						return status(404, {
							error: `Book ${params.bookId} has no page ${params.page}.`,
						});
					}

					const file = Bun.file(pageImagePath(contentDir, book.pagesDir, page.file));
					if (!(await file.exists())) {
						return status(404, {
							error: `${page.file} is missing from ${book.pagesDir} — the manifest lists it but the file is gone.`,
						});
					}
					return new Response(file, {
						headers: {
							"content-type": file.type,
							// These exact bytes are pinned to the source PDF by hash: they cannot
							// change without the book being re-rendered.
							"cache-control": "private, max-age=31536000, immutable",
						},
					});
				},
				{ params: t.Object({ bookId: t.String(), page: t.Number() }) },
			)

			.get(
				"/admin/books/:bookId/pages/:page/context",
				({ params }) => pageContext(db, params.bookId, params.page),
				{ params: t.Object({ bookId: t.String(), page: t.Number() }) },
			)

			// ── The queue ──────────────────────────────────────────────────────────────────────
			.get(
				"/admin/books/:bookId/queue",
				({ params, query }) =>
					queue(
						db,
						params.bookId,
						query.order === "confidence" ? "confidence" : "book",
						{
							status: query.status,
							flag: query.flag,
							divisionId: query.divisionId,
							ocrChanged: query.ocrChanged,
							orphaned: query.orphaned,
							page: query.page,
						},
						Math.min(query.limit ?? 50, 200),
						query.offset ?? 0,
					),
				{
					query: t.Object({
						order: t.Optional(t.Union([t.Literal("book"), t.Literal("confidence")])),
						status: t.Optional(VerseStatusSchema),
						flag: t.Optional(t.String()),
						divisionId: t.Optional(t.String()),
						ocrChanged: t.Optional(t.Boolean()),
						orphaned: t.Optional(t.Boolean()),
						page: t.Optional(t.Number()),
						limit: t.Optional(t.Number()),
						offset: t.Optional(t.Number()),
					}),
				},
			)

			.get("/admin/books/:bookId/flags", ({ params }) => flagCounts(db, params.bookId))

			// ── One passage ────────────────────────────────────────────────────────────────────
			.get("/admin/books/:bookId/verses/:divisionId/:verseId", async ({ params, status }) => {
				const { bookId, divisionId, verseId } = params;
				const verse = await getVerse(db, bookId, divisionId, verseId);
				if (verse === undefined) {
					return status(404, { error: `No passage ${divisionId}#${verseId}.` });
				}
				const [around, history] = await Promise.all([
					neighbours(db, bookId, divisionId, verseId),
					verseHistory(db, verse.key),
				]);
				return { ...verse, ref: refOf(bookId, divisionId, verseId), ...around, history };
			})

			.patch(
				"/admin/books/:bookId/verses/:divisionId/:verseId",
				async ({ params, body, status }) => {
					const updated = await patchVerse(
						db,
						params.bookId,
						params.divisionId,
						params.verseId,
						body,
					);
					return updated ?? status(404, { error: "No such passage." });
				},
				{
					body: t.Object({
						text: t.Optional(t.String()),
						number: t.Optional(t.Nullable(t.String())),
						status: t.Optional(VerseStatusSchema),
						note: t.Optional(t.Nullable(t.String())),
					}),
				},
			)

			// ── Structure ──────────────────────────────────────────────────────────────────────
			.post(
				"/admin/books/:bookId/verses/:divisionId/:verseId/split",
				({ params, body }) =>
					splitVerse(db, params.bookId, params.divisionId, params.verseId, body.offset),
				{ body: t.Object({ offset: t.Number() }) },
			)

			.post(
				"/admin/books/:bookId/verses/:divisionId/:verseId/merge",
				({ params, body }) =>
					mergeVerse(db, params.bookId, params.divisionId, params.verseId, body.direction),
				{ body: t.Object({ direction: t.Union([t.Literal("previous"), t.Literal("next")]) }) },
			)

			.post(
				"/admin/books/:bookId/verses/:divisionId/:verseId/number",
				({ params, body }) =>
					renumberVerse(db, params.bookId, params.divisionId, params.verseId, body.number),
				{ body: t.Object({ number: t.Nullable(t.String()) }) },
			)

			.post(
				"/admin/books/:bookId/verses",
				({ params, body }) =>
					insertVerse(
						db,
						params.bookId,
						body.divisionId,
						body.afterVerseId ?? null,
						body.text,
						body.number ?? null,
					),
				{
					body: t.Object({
						divisionId: t.String(),
						afterVerseId: t.Optional(t.Nullable(t.String())),
						text: t.String({ minLength: 1 }),
						number: t.Optional(t.Nullable(t.String())),
					}),
				},
			)

			.delete("/admin/books/:bookId/verses/:divisionId/:verseId", ({ params }) =>
				deleteVerse(db, params.bookId, params.divisionId, params.verseId),
			)

			.patch(
				"/admin/books/:bookId/divisions/:divisionId",
				async ({ params, body, status }) => {
					const updated = await patchDivision(db, params.bookId, params.divisionId, body);
					return updated ?? status(404, { error: "No such division." });
				},
				{
					body: t.Object({
						title: t.Optional(t.Record(t.String(), t.String())),
						number: t.Optional(t.Nullable(t.String())),
					}),
				},
			)

			// ── The apparatus ──────────────────────────────────────────────────────────────────
			.patch(
				"/admin/books/:bookId/notes/:noteId",
				async ({ params, body, status }) => {
					const updated = await patchNote(db, params.bookId, params.noteId, body);
					return updated ?? status(404, { error: "No such footnote." });
				},
				{
					body: t.Object({
						text: t.Optional(t.String()),
						status: t.Optional(VerseStatusSchema),
					}),
				},
			)

			.patch(
				"/admin/books/:bookId/set-aside/:blockId",
				async ({ params, body, status }) => {
					const updated = await resolveSetAside(db, params.bookId, params.blockId, body);
					return updated ?? status(404, { error: "No such block." });
				},
				{
					body: t.Object({
						resolved: t.Optional(t.Boolean()),
						note: t.Optional(t.Nullable(t.String())),
					}),
				},
			)

			// ── Export ─────────────────────────────────────────────────────────────────────────
			.post(
				"/admin/books/:bookId/export",
				async ({ params, body, status }) => {
					const result = await exportBook(db, contentDir, params.bookId, body ?? {});
					if (result === null) {
						return status(404, { error: `No book ${params.bookId} in the studio.` });
					}
					// A refusal is the expected outcome most of the time, and it carries the list of
					// things to go and fix — 409 rather than 400, because nothing about the request
					// was wrong.
					return result.ok ? result : status(409, result);
				},
				{
					body: t.Optional(
						t.Object({
							contentVersion: t.Optional(t.String()),
							dryRun: t.Optional(t.Boolean()),
						}),
					),
				},
			)

			// ── Publish ────────────────────────────────────────────────────────────────────────
			// The studio's half of P1.5: it hands an already-exported package to the catalog. It
			// lives here rather than in `modules/catalog/` because it is an admin action and the
			// session gate is a property of this instance; the work itself is `catalog/publish.ts`.
			.post(
				"/admin/books/:bookId/publish",
				async ({ params, body, status }) => {
					const result = await publishBook(db, contentDir, params.bookId, body ?? {});
					if (result === null) {
						return status(404, { error: `No book ${params.bookId} in the studio.` });
					}
					// Same shape as export: a refusal carries the list of things to go and fix, and
					// nothing about the request was wrong, so 409 rather than 400.
					return result.ok ? result : status(409, result);
				},
				{
					body: t.Optional(
						t.Object({
							contentVersion: t.Optional(t.String()),
							dryRun: t.Optional(t.Boolean()),
						}),
					),
				},
			)
	);
}
