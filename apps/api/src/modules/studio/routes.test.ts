import { expect, test } from "bun:test";
import { createTestDb } from "@granthalaya/db/testing";
import { createApp } from "../../app.ts";
import { SESSION_COOKIE } from "../admin/service.ts";
import { FIXTURE_BOOK_ID, writeDraftFixture } from "./fixtures.ts";

const PASSWORD = "a-long-enough-password";

/** `Response.json()` is `unknown`, and asserting once here beats asserting at every use. */
// biome-ignore lint/suspicious/noExplicitAny: a test reading its own API's JSON
const body = async (response: Response): Promise<any> => response.json();

async function studio() {
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

	/** Everything the browser does: sign in once, then carry the cookie. */
	let cookie = "";
	const call = async (path: string, init: RequestInit = {}) =>
		app.handle(
			new Request(`http://localhost${path}`, {
				...init,
				// An explicit header wins, so a test can present a cookie of its own choosing.
				headers: { ...(cookie === "" ? {} : { cookie }), ...init.headers },
			}),
		);

	const signIn = async (password = PASSWORD) => {
		const response = await call("/admin/session", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ password }),
		});
		const header = response.headers.get("set-cookie");
		if (header !== null && response.status === 200) {
			cookie = header.split(";")[0] ?? "";
		}
		return response;
	};

	return {
		call,
		signIn,
		fixture,
		teardown: async () => {
			await fixture.cleanup();
			await close();
		},
	};
}

test("every studio route is closed until you sign in", async () => {
	const { call, teardown } = await studio();

	for (const path of [
		"/admin/drafts",
		"/admin/books",
		`/admin/books/${FIXTURE_BOOK_ID}`,
		`/admin/books/${FIXTURE_BOOK_ID}/pages/1`,
	]) {
		const response = await call(path);
		expect(response.status).toBe(401);
	}

	await teardown();
});

test("a wrong password is refused and mints no cookie", async () => {
	const { call, signIn, teardown } = await studio();

	const refused = await signIn("not-the-password");
	expect(refused.status).toBe(401);
	expect(refused.headers.get("set-cookie")).toBeNull();
	expect((await call("/admin/books")).status).toBe(401);

	await teardown();
});

test("signing in opens the studio, and signing out closes it again", async () => {
	const { call, signIn, teardown } = await studio();

	expect((await signIn()).status).toBe(200);
	expect((await call("/admin/books")).status).toBe(200);

	const state = await body(await call("/admin/session"));
	expect(state).toEqual({ authenticated: true, configured: true });

	await teardown();
});

test("a tampered session cookie is not a session", async () => {
	const { call, signIn, teardown } = await studio();
	await signIn();

	// The payload with no signature — exactly what shipped before the HMAC moved into
	// `service.ts`, and exactly what a stranger would try.
	const forged = `${SESSION_COOKIE}=admin.9999999999`;
	const response = await call("/admin/books", { headers: { cookie: forged } });
	expect(response.status).toBe(401);

	await teardown();
});

test("an API with no admin secrets answers 503, not 401", async () => {
	const { db, close } = await createTestDb();
	const app = createApp({ db, admin: null, contentDir: "/nonexistent" });

	const response = await app.handle(new Request("http://localhost/admin/books"));
	expect(response.status).toBe(503);
	expect((await body(response)).error).toContain("ADMIN_PASSWORD_HASH");

	// Health stays up: an unconfigured studio is not a broken API.
	expect((await app.handle(new Request("http://localhost/health"))).status).toBe(200);
	await close();
});

test("the draft on disk is listed, imported, and then reported as imported", async () => {
	const { call, signIn, teardown } = await studio();
	await signIn();

	const before = await body(await call("/admin/drafts"));
	expect(before).toHaveLength(1);
	expect(before[0]).toMatchObject({
		bookId: FIXTURE_BOOK_ID,
		verses: 4,
		hasPages: true,
		imported: false,
	});

	const imported = await body(
		await call("/admin/books", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ dir: before[0].dir }),
		}),
	);
	expect(imported).toMatchObject({ bookId: FIXTURE_BOOK_ID, inserted: 4, firstImport: true });

	const after = await body(await call("/admin/drafts"));
	expect(after[0].imported).toBe(true);

	await teardown();
});

test("the overview recomputes what is true now, beside what the machine concluded", async () => {
	const { call, signIn, fixture, teardown } = await studio();
	await signIn();
	await call("/admin/books", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ dir: fixture.bookDir }),
	});

	const overview = await body(await call(`/admin/books/${FIXTURE_BOOK_ID}`));

	expect(overview.counts).toMatchObject({
		raw: 4,
		proofed: 0,
		approved: 0,
		total: 4,
		divisions: 2,
	});
	expect(overview.sequence).toMatchObject({
		numbered: 3,
		unnumbered: 1,
		missing: [],
		restarts: [],
	});
	expect(overview.sequence.runs[0]).toMatchObject({ first: 61, last: 63 });
	expect(overview.needsHuman).toHaveLength(3);
	// The import snapshot is kept beside it, for provenance rather than for display.
	expect(overview.assembly.numbering.offset).toBe(27);
	expect(overview.divisions.map((d: { id: string }) => d.id)).toEqual(["section-1", "section-2"]);

	await teardown();
});

test("filling in the source edition shrinks what only a human can supply", async () => {
	const { call, signIn, fixture, teardown } = await studio();
	await signIn();
	await call("/admin/books", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ dir: fixture.bookDir }),
	});

	await call(`/admin/books/${FIXTURE_BOOK_ID}`, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			manifest: {
				source: { edition: "Swaminarayan Aksharpith, 2011" },
				license: { id: "all-rights-reserved" },
				title: { gu: "ગોપાળાનંદ સ્વામીની વાતો" },
			},
		}),
	});

	const overview = await body(await call(`/admin/books/${FIXTURE_BOOK_ID}`));
	expect(overview.needsHuman).toEqual([]);

	await teardown();
});

test("a page image is served, and only to a signed-in admin", async () => {
	const { call, signIn, fixture, teardown } = await studio();
	await signIn();
	await call("/admin/books", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ dir: fixture.bookDir }),
	});

	const image = await call(`/admin/books/${FIXTURE_BOOK_ID}/pages/1`);
	expect(image.status).toBe(200);
	expect(image.headers.get("content-type")).toContain("image/png");
	expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);

	// A page the book does not have is a 404, not an empty image.
	expect((await call(`/admin/books/${FIXTURE_BOOK_ID}/pages/99`)).status).toBe(404);

	await teardown();
});

test("a path that climbs out of the content directory is refused", async () => {
	const { call, signIn, teardown } = await studio();
	await signIn();

	const response = await call("/admin/books", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ dir: "../../../etc" }),
	});

	expect(response.status).toBe(422);
	expect((await body(response)).error).toContain("escapes the content directory");

	await teardown();
});
