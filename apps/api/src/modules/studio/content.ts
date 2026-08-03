/**
 * Reading the pipeline's working area (P1.3).
 *
 * `content/` is where `render`, `ocr` and `assemble` leave their output. The studio only ever
 * reads it: the editable copy lives in Postgres, and the draft package on disk stays exactly as
 * the machine wrote it so a re-import always has something honest to diff against.
 *
 * The one non-obvious thing in here is how a book finds its page images. The package directory
 * (`books/gopalanand-swami-ni-vato`) and the pages directory
 * (`pages/gopalanand-swami-ni-vato-26-feb-2022`) are named differently and nothing links them by
 * name — but `assembly.json`'s `source.sha256` and `pages.json`'s `sourceSha256` are the same
 * value, because the pipeline carries that hash forward at every hop. Matching on it makes the
 * chain of custody load-bearing rather than merely recorded: the studio cannot put a page image
 * beside text that did not come off that exact file.
 */
import { isAbsolute, join, relative, resolve } from "node:path";
import { type Book, parseBook } from "@granthalaya/core";
import {
	type AssemblyReport,
	AssemblyReportSchema,
	type PageManifest,
	PageManifestSchema,
} from "./assembly.ts";

export const BOOKS_SUBDIR = "books";
export const PAGES_SUBDIR = "pages";

export class ContentError extends Error {}

/**
 * Resolve a client-supplied path inside the content root, or throw.
 *
 * The studio posts a directory name it was given by `listDrafts`, but "was given by us" is not a
 * property of the request that arrives — `../../etc` is just as postable.
 */
export function resolveInContent(contentDir: string, requested: string): string {
	if (isAbsolute(requested)) {
		throw new ContentError(`Expected a path inside the content directory, got: ${requested}`);
	}
	const root = resolve(contentDir);
	const target = resolve(root, requested);
	const rel = relative(root, target);
	if (rel.startsWith("..") || isAbsolute(rel)) {
		throw new ContentError(`Path escapes the content directory: ${requested}`);
	}
	return target;
}

/**
 * Glob a directory that may not exist yet.
 *
 * `content/` is a working area, not a fixture: a repo where nothing has been rendered has no
 * `pages/`, and a book whose images were never rendered is a thing the studio must be able to
 * report rather than crash on.
 */
async function scan(root: string, pattern: string): Promise<string[]> {
	try {
		return await Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: root, onlyFiles: true }));
	} catch {
		return [];
	}
}

async function readJson(path: string): Promise<unknown> {
	const file = Bun.file(path);
	if (!(await file.exists())) {
		throw new ContentError(`Not found: ${path}`);
	}
	try {
		return await file.json();
	} catch {
		throw new ContentError(`Not valid JSON: ${path}`);
	}
}

export type Draft = {
	/** Relative to the content root, e.g. `books/gopalanand-swami-ni-vato`. */
	readonly dir: string;
	readonly book: Book;
	readonly report: AssemblyReport;
	/** Relative to the content root, or null when no rendered pages match the source hash. */
	readonly pagesDir: string | null;
	readonly pageManifest: PageManifest | null;
};

/** A draft as it appears in a listing — enough to choose one, without parsing every verse. */
export type DraftSummary = {
	readonly dir: string;
	readonly bookId: string;
	readonly title: string;
	readonly verses: number;
	readonly sourceFile: string;
	readonly sourceSha256: string;
	readonly hasPages: boolean;
};

/**
 * Every directory under `content/books/` holding both a package and its assembly sidecar.
 *
 * A package without an assembly report is skipped rather than imported half-blind: the sidecar is
 * where the pages, the boxes and the repairs live, and a studio without them can show text but
 * cannot show a human what to check it against.
 */
export async function listDrafts(contentDir: string): Promise<DraftSummary[]> {
	const root = join(contentDir, BOOKS_SUBDIR);
	const summaries: DraftSummary[] = [];

	for (const entry of await scan(root, "*/book.json")) {
		const dir = join(BOOKS_SUBDIR, entry.replace(/\/book\.json$/, ""));
		try {
			const [book, report] = await Promise.all([
				readBookJson(join(contentDir, dir)),
				readAssemblyJson(join(contentDir, dir)),
			]);
			summaries.push({
				dir,
				bookId: book.id,
				title: book.title.gu ?? book.title.en ?? book.id,
				verses: report.counts.verses,
				sourceFile: report.source.file,
				sourceSha256: report.source.sha256,
				hasPages: (await findPagesDir(contentDir, report.source.sha256)) !== null,
			});
		} catch {
			// A directory that is not a readable draft is not an error to report here — it is
			// simply not on the list. `readDraft` says why, for the one somebody asks for.
		}
	}

	return summaries.sort((a, b) => a.bookId.localeCompare(b.bookId));
}

async function readBookJson(dir: string): Promise<Book> {
	const parsed = parseBook(await readJson(join(dir, "book.json")));
	if (!parsed.ok || parsed.book === undefined) {
		const first = parsed.issues[0];
		throw new ContentError(
			`book.json in ${dir} is not a valid package${first ? `: ${first.message}` : ""}`,
		);
	}
	return parsed.book;
}

async function readAssemblyJson(dir: string): Promise<AssemblyReport> {
	const parsed = AssemblyReportSchema.safeParse(await readJson(join(dir, "assembly.json")));
	if (!parsed.success) {
		const first = parsed.error.issues[0];
		throw new ContentError(
			`assembly.json in ${dir} is not readable by this studio${
				first ? `: ${first.path.join(".")} — ${first.message}` : ""
			}. It may have been written by an older \`assemble\`.`,
		);
	}
	return parsed.data;
}

/** The rendered pages whose manifest names the same source file, by hash. */
export async function findPagesDir(contentDir: string, sha256: string): Promise<string | null> {
	const root = join(contentDir, PAGES_SUBDIR);

	for (const entry of await scan(root, "*/pages.json")) {
		try {
			const manifest = PageManifestSchema.parse(await readJson(join(root, entry)));
			if (manifest.sourceSha256 === sha256) {
				return join(PAGES_SUBDIR, entry.replace(/\/pages\.json$/, ""));
			}
		} catch {
			// An unreadable manifest is not the one we are looking for.
		}
	}
	return null;
}

/** Everything import needs, read and validated. Throws `ContentError` with a reason. */
export async function readDraft(contentDir: string, dir: string): Promise<Draft> {
	const absolute = resolveInContent(contentDir, dir);
	const [book, report] = await Promise.all([readBookJson(absolute), readAssemblyJson(absolute)]);

	if (book.id !== report.book) {
		throw new ContentError(
			`book.json and assembly.json in ${dir} describe different books (${book.id} vs ${report.book}).`,
		);
	}

	const pagesDir = await findPagesDir(contentDir, report.source.sha256);
	const pageManifest =
		pagesDir === null
			? null
			: PageManifestSchema.parse(await readJson(join(contentDir, pagesDir, "pages.json")));

	return { dir, book, report, pagesDir, pageManifest };
}

/** The file behind `GET /admin/books/:id/pages/:page`. */
export function pageImagePath(contentDir: string, pagesDir: string, file: string): string {
	return resolveInContent(contentDir, join(pagesDir, file));
}
