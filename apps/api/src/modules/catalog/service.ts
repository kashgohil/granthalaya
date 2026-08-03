/**
 * What the catalog knows (P1.5).
 *
 * The catalog is a *record*, not a working copy: one row per published version, and the package
 * itself sitting immutably on disk beside it. Reading is therefore split in two —
 *
 * - **Listing** answers off `releases` rows. A shelf of books must not cost a parse of every
 *   megabyte-scale package, so each row carries the manifest fields a listing shows.
 * - **Downloading** answers off the file, and verifies it against the recorded SHA-256 first.
 *   A published package that no longer hashes to its record is a fault to report, never to
 *   serve: the whole point of pinning it is that nobody downstream can tell the difference.
 *
 * Sorting is in TypeScript rather than SQL because versions are semver — `1.10.0` sorts below
 * `1.9.0` in every collation Postgres has, and "latest" is the one thing this file must never
 * get wrong.
 */
import type {
	Book,
	LayerDeclaration,
	License,
	LocalizedText,
	SourceEdition,
} from "@granthalaya/core";
import { compareVersions } from "@granthalaya/core";
import type { Db, ReleaseRow } from "@granthalaya/db";
import { releases } from "@granthalaya/db";
import { and, eq } from "drizzle-orm";
import { resolveInContent } from "../studio/content.ts";
import { sha256Hex } from "./integrity.ts";

/** The URL a client fetches the bytes from. Relative, so it works behind any host. */
export function packageUrl(bookId: string, version: string): string {
	return `/catalog/books/${encodeURIComponent(bookId)}/${encodeURIComponent(version)}`;
}

export type ReleaseSummary = {
	readonly contentVersion: string;
	/** SHA-256 of the package file. What a client checks after downloading. */
	readonly sha256: string;
	readonly bytes: number;
	readonly verses: number;
	readonly publishedAt: string;
	readonly url: string;
};

/**
 * One book on the shelf.
 *
 * The manifest fields are the *latest* version's — a title or a licence can be corrected between
 * versions, and a catalog listing describes what you would install today.
 */
export type CatalogEntry = {
	readonly id: string;
	readonly formatVersion: number;
	readonly title: LocalizedText;
	readonly subtitle?: LocalizedText;
	readonly language: string;
	readonly script: string;
	readonly tradition?: string;
	readonly source: SourceEdition;
	readonly license: License;
	readonly layers: readonly LayerDeclaration[];
	readonly primaryLayer: string;
	readonly latest: ReleaseSummary;
	/** Every published version, newest first. Older ones stay installable and stay byte-identical. */
	readonly versions: readonly ReleaseSummary[];
};

export function releaseSummary(row: ReleaseRow): ReleaseSummary {
	return {
		contentVersion: row.contentVersion,
		sha256: row.sha256,
		bytes: row.bytes,
		verses: row.verses,
		publishedAt: row.publishedAt.toISOString(),
		url: packageUrl(row.bookId, row.contentVersion),
	};
}

/** Newest first. The sort is semver, not lexicographic — see the note at the top of the file. */
function newestFirst(rows: readonly ReleaseRow[]): ReleaseRow[] {
	return [...rows].sort((a, b) => compareVersions(b.contentVersion, a.contentVersion));
}

export async function listReleases(db: Db, bookId: string): Promise<ReleaseRow[]> {
	return newestFirst(await db.select().from(releases).where(eq(releases.bookId, bookId)));
}

/** The version a new one has to be an increase on, and the one an upgrade diffs against. */
export async function latestRelease(db: Db, bookId: string): Promise<ReleaseRow | undefined> {
	return (await listReleases(db, bookId))[0];
}

export async function findRelease(
	db: Db,
	bookId: string,
	contentVersion: string,
): Promise<ReleaseRow | undefined> {
	const [row] = await db
		.select()
		.from(releases)
		.where(and(eq(releases.bookId, bookId), eq(releases.contentVersion, contentVersion)));
	return row;
}

function entryOf(rows: readonly ReleaseRow[]): CatalogEntry | undefined {
	const ordered = newestFirst(rows);
	const latest = ordered[0];
	if (latest === undefined) {
		return undefined;
	}
	const manifest = latest.manifest as Omit<Book, "structure" | "aliases">;

	return {
		id: latest.bookId,
		formatVersion: manifest.formatVersion,
		title: manifest.title,
		...(manifest.subtitle === undefined ? {} : { subtitle: manifest.subtitle }),
		language: manifest.language,
		script: manifest.script,
		...(manifest.tradition === undefined ? {} : { tradition: manifest.tradition }),
		source: manifest.source,
		license: manifest.license,
		layers: manifest.layers,
		primaryLayer: manifest.primaryLayer,
		latest: releaseSummary(latest),
		versions: ordered.map(releaseSummary),
	};
}

/** The whole shelf, by book id. Only published packages are here — that is what the table is. */
export async function catalogBooks(db: Db): Promise<CatalogEntry[]> {
	const rows = await db.select().from(releases);

	const byBook = new Map<string, ReleaseRow[]>();
	for (const row of rows) {
		const list = byBook.get(row.bookId) ?? [];
		list.push(row);
		byBook.set(row.bookId, list);
	}

	return [...byBook.values()]
		.map(entryOf)
		.filter((entry): entry is CatalogEntry => entry !== undefined)
		.sort((a, b) => a.id.localeCompare(b.id));
}

export async function catalogBook(db: Db, bookId: string): Promise<CatalogEntry | undefined> {
	return entryOf(await listReleases(db, bookId));
}

export type PackageBytes =
	/** The raw bytes, as read. An `ArrayBuffer` because that is what a `Response` body takes. */
	| { readonly ok: true; readonly data: ArrayBuffer }
	/** The file is gone, or no longer hashes to what was published. Both are faults, not 404s. */
	| { readonly ok: false; readonly reason: string };

/**
 * The published bytes, verified against the hash recorded when they were published.
 *
 * Re-hashing on every download is a few milliseconds on a package of this size, and it buys the
 * one guarantee the catalog makes: what a client verifies against the catalog's hash is what a
 * human approved. Serving a file that had drifted would push the discovery of the drift onto
 * every device that installed it.
 */
export async function readPackageBytes(contentDir: string, row: ReleaseRow): Promise<PackageBytes> {
	const file = Bun.file(resolveInContent(contentDir, row.file));
	if (!(await file.exists())) {
		return {
			ok: false,
			reason: `${row.file} is missing. The catalog has a record of ${row.bookId}@${row.contentVersion} but the package it points at is gone.`,
		};
	}

	const data = await file.arrayBuffer();
	const digest = sha256Hex(data);
	if (digest !== row.sha256) {
		return {
			ok: false,
			reason: `${row.file} no longer matches the hash it was published with (${digest} ≠ ${row.sha256}). A published version is immutable; this file has been edited.`,
		};
	}

	return { ok: true, data };
}
