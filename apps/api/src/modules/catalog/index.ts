/**
 * The catalog's HTTP surface (P1.5) — the only public part of this API.
 *
 * Everything under `/admin` is the studio, behind a session, and photographs of a third-party
 * edition sit behind it. This is the other side: what a reader's phone talks to. It lists
 * published books and hands out package files, and it can do neither for anything that has not
 * been through proofing, because the only thing it reads is the `releases` table and the only
 * way into that table is `publishBook`.
 *
 * Three properties the routes are shaped around:
 *
 * - **A version is an address.** `/catalog/books/:bookId/:contentVersion` is immutable by
 *   construction, so it is served with a year-long `immutable` cache and an ETag that is the
 *   package's own SHA-256. A client that already has those bytes gets a 304.
 * - **`latest` is a redirect, not a resource.** It answers "which version should I install?"
 *   with a 302 to the concrete version, which keeps every cacheable URL immutable and leaves
 *   the client holding a version number it can store beside the install.
 * - **Integrity is stated before it is needed.** The listing carries each version's hash and
 *   byte count, so a client verifies a download against something it fetched separately rather
 *   than against a header that arrived with the bytes it is checking.
 */
import type { Db } from "@granthalaya/db";
import { Elysia } from "elysia";
import {
	catalogBook,
	catalogBooks,
	findRelease,
	latestRelease,
	readPackageBytes,
} from "./service.ts";

export type CatalogOptions = {
	readonly db: Db;
	readonly contentDir: string;
};

export function createCatalog({ db, contentDir }: CatalogOptions) {
	return new Elysia({ name: "catalog" })
		.get("/catalog/books", () => catalogBooks(db))

		.get("/catalog/books/:bookId", async ({ params, status }) => {
			const entry = await catalogBook(db, params.bookId);
			return (
				entry ?? status(404, { error: `No published book "${params.bookId}" in the catalog.` })
			);
		})

		.get(
			"/catalog/books/:bookId/:contentVersion",
			async ({ params, status, redirect, headers }) => {
				const { bookId, contentVersion } = params;

				// "latest" is a question about the catalog, not a version of the book. Answering it
				// with a redirect keeps every URL that serves bytes immutable.
				if (contentVersion === "latest") {
					const newest = await latestRelease(db, bookId);
					return newest === undefined
						? status(404, { error: `No published book "${bookId}" in the catalog.` })
						: redirect(
								`/catalog/books/${encodeURIComponent(bookId)}/${newest.contentVersion}`,
								302,
							);
				}

				const release = await findRelease(db, bookId, contentVersion);
				if (release === undefined) {
					return status(404, {
						error: `${bookId}@${contentVersion} is not published. GET /catalog/books/${bookId} lists the versions that are.`,
					});
				}

				const etag = `"${release.sha256}"`;
				if (headers["if-none-match"] === etag) {
					return new Response(null, { status: 304, headers: { etag } });
				}

				const file = await readPackageBytes(contentDir, release);
				if (!file.ok) {
					// Not a 404: the catalog says this version exists, and it does — the bytes behind
					// it are wrong, which is this server's fault to fix and never to paper over.
					return status(500, { error: file.reason });
				}

				return new Response(file.data, {
					headers: {
						"content-type": "application/json; charset=utf-8",
						"content-length": String(file.data.byteLength),
						etag,
						"cache-control": "public, max-age=31536000, immutable",
						// The same value as the ETag, named for what it is: a client verifies the
						// package against the hash it read from the catalog, and this is the copy it
						// can check en route without parsing anything.
						"x-content-sha256": release.sha256,
					},
				});
			},
		);
}
