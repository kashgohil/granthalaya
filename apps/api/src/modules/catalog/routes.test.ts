import { expect, test } from "bun:test";
import { parseBook } from "@granthalaya/core";
import { books, verses } from "@granthalaya/db";
import { createTestDb } from "@granthalaya/db/testing";
import { eq } from "drizzle-orm";
import { createApp } from "../../app.ts";
import { FIXTURE_BOOK_ID, writeDraftFixture } from "../studio/fixtures.ts";
import { patchVerse } from "../studio/verses.ts";
import { sha256Hex } from "./integrity.ts";

const PASSWORD = "a-long-enough-password";

// biome-ignore lint/suspicious/noExplicitAny: a test reading its own API's JSON
const body = async (response: Response): Promise<any> => response.json();

/**
 * A studio with one book imported, proofed and approved — everything up to the point where
 * publishing is the next thing that happens.
 */
async function shelf() {
	const fixture = await writeDraftFixture();
	const { db, close } = await createTestDb();
	const app = createApp({
		db,
		contentDir: fixture.contentDir,
		admin: {
			passwordHash: await Bun.password.hash(PASSWORD, { algorithm: "argon2id" }),
			cookieSecret: "test-cookie-secret",
		},
	});

	let cookie = "";
	const call = (path: string, init: RequestInit = {}) =>
		app.handle(
			new Request(`http://localhost${path}`, {
				...init,
				headers: {
					...(cookie === "" ? {} : { cookie }),
					...(init.body === undefined ? {} : { "content-type": "application/json" }),
					...init.headers,
				},
			}),
		);

	const signIn = async () => {
		const response = await call("/admin/session", {
			method: "POST",
			body: JSON.stringify({ password: PASSWORD }),
		});
		cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
	};

	await signIn();
	await call("/admin/books", { method: "POST", body: JSON.stringify({ dir: fixture.bookDir }) });
	await call(`/admin/books/${FIXTURE_BOOK_ID}`, {
		method: "PATCH",
		body: JSON.stringify({
			manifest: {
				title: { gu: "ટેસ્ટ વાતો", en: "test vato" },
				source: { edition: "Swaminarayan Aksharpith, 2011" },
				license: { id: "all-rights-reserved" },
			},
		}),
	});
	for (const row of await db.select().from(verses).where(eq(verses.bookId, FIXTURE_BOOK_ID))) {
		await patchVerse(db, FIXTURE_BOOK_ID, row.divisionId, row.id, { status: "approved" });
	}

	/** Export and publish one version over HTTP, the way the studio's buttons do. */
	const release = async (contentVersion: string) => {
		await call(`/admin/books/${FIXTURE_BOOK_ID}/export`, {
			method: "POST",
			body: JSON.stringify({ contentVersion }),
		});
		return call(`/admin/books/${FIXTURE_BOOK_ID}/publish`, {
			method: "POST",
			body: JSON.stringify({ contentVersion }),
		});
	};

	return {
		app,
		db,
		call,
		release,
		/** A request with no session at all — a reader's phone. */
		anonymous: (path: string, init: RequestInit = {}) =>
			app.handle(new Request(`http://localhost${path}`, init)),
		teardown: async () => {
			await fixture.cleanup();
			await close();
		},
	};
}

test("the catalog is public, and empty until something is published", async () => {
	const { anonymous, teardown } = await shelf();

	const list = await anonymous("/catalog/books");
	expect(list.status).toBe(200);
	expect(await body(list)).toEqual([]);

	expect((await anonymous(`/catalog/books/${FIXTURE_BOOK_ID}`)).status).toBe(404);
	expect((await anonymous(`/catalog/books/${FIXTURE_BOOK_ID}/1.0.0`)).status).toBe(404);

	await teardown();
});

test("publishing needs a session; the catalog it fills does not", async () => {
	const { app, release, anonymous, teardown } = await shelf();

	const refused = await app.handle(
		new Request(`http://localhost/admin/books/${FIXTURE_BOOK_ID}/publish`, { method: "POST" }),
	);
	expect(refused.status).toBe(401);

	expect((await release("1.0.0")).status).toBe(200);
	expect(await body(await anonymous("/catalog/books"))).toHaveLength(1);

	await teardown();
});

/**
 * The test client the slice is "done when" — it does exactly what a phone does at install time:
 * list the shelf, read the integrity hash from the catalog, download the package, verify the
 * bytes against that hash, and parse what it verified.
 */
test("a client can list, download and verify a published book", async () => {
	const { release, anonymous, teardown } = await shelf();
	await release("1.0.0");

	const [entry] = await body(await anonymous("/catalog/books"));
	expect(entry).toMatchObject({ id: FIXTURE_BOOK_ID, language: "gu", script: "gujr" });
	expect(entry.latest.contentVersion).toBe("1.0.0");
	expect(entry.latest.url).toBe(`/catalog/books/${FIXTURE_BOOK_ID}/1.0.0`);

	const download = await anonymous(entry.latest.url);
	expect(download.status).toBe(200);
	expect(download.headers.get("content-type")).toContain("application/json");
	expect(download.headers.get("cache-control")).toContain("immutable");

	const bytes = new Uint8Array(await download.arrayBuffer());
	expect(bytes.byteLength).toBe(entry.latest.bytes);
	// Verified against the hash the catalog listed, not against a header that arrived with the
	// bytes being checked.
	expect(sha256Hex(bytes)).toBe(entry.latest.sha256);
	expect(download.headers.get("etag")).toBe(`"${entry.latest.sha256}"`);

	const book = parseBook(JSON.parse(new TextDecoder().decode(bytes))).book;
	expect(book?.contentStatus).toBe("published");
	expect(book?.contentVersion).toBe("1.0.0");
	expect(book?.structure).toHaveLength(2);

	await teardown();
});

test("bytes a client already has come back as a 304", async () => {
	const { release, anonymous, teardown } = await shelf();
	await release("1.0.0");

	const first = await anonymous(`/catalog/books/${FIXTURE_BOOK_ID}/1.0.0`);
	const etag = first.headers.get("etag") ?? "";

	const again = await anonymous(`/catalog/books/${FIXTURE_BOOK_ID}/1.0.0`, {
		headers: { "if-none-match": etag },
	});
	expect(again.status).toBe(304);
	expect((await again.arrayBuffer()).byteLength).toBe(0);

	await teardown();
});

test("`latest` is a redirect to a concrete version, so every URL that serves bytes is immutable", async () => {
	const { release, anonymous, teardown } = await shelf();
	await release("1.0.0");
	await release("1.1.0");

	const response = await anonymous(`/catalog/books/${FIXTURE_BOOK_ID}/latest`, {
		redirect: "manual",
	});
	expect(response.status).toBe(302);
	expect(response.headers.get("location")).toBe(`/catalog/books/${FIXTURE_BOOK_ID}/1.1.0`);

	await teardown();
});

test("a refused publish comes back as a 409 carrying what to go and fix", async () => {
	const { call, teardown } = await shelf();

	// Nothing has been exported, so there is nothing to publish.
	const response = await call(`/admin/books/${FIXTURE_BOOK_ID}/publish`, {
		method: "POST",
		body: JSON.stringify({ contentVersion: "1.0.0" }),
	});
	expect(response.status).toBe(409);
	expect((await body(response)).reasons[0]).toContain("Export that version");

	await teardown();
});

test("the studio's overview shows what has already been handed out", async () => {
	const { call, release, teardown } = await shelf();
	await release("1.0.0");

	const overview = await body(await call(`/admin/books/${FIXTURE_BOOK_ID}`));
	expect(overview.releases).toHaveLength(1);
	expect(overview.releases[0]).toMatchObject({ contentVersion: "1.0.0", verses: 4 });

	await teardown();
});

test("a book with no releases still lists in the studio and not in the catalog", async () => {
	const { call, anonymous, db, teardown } = await shelf();

	expect(await body(await call("/admin/books"))).toHaveLength(1);
	expect(await body(await anonymous("/catalog/books"))).toEqual([]);
	// The studio's own row is what `contentStatus` says it is: a draft nobody has published.
	const [row] = await db.select().from(books).where(eq(books.id, FIXTURE_BOOK_ID));
	const manifest = row?.manifest as { contentStatus: string } | undefined;
	expect(manifest?.contentStatus).toBe("draft");

	await teardown();
});
