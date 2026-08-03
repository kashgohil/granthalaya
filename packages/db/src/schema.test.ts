import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { books, releases, verses } from "./schema.ts";
import { createTestDb } from "./testing.ts";

/**
 * The one test here that is not about the schema.
 *
 * Drizzle's built-in `jsonb` pre-stringifies in `toDriver`; `Bun.SQL` serializes JS values itself.
 * Together they encoded twice, and every value in the live database was a jsonb *string* rather
 * than the array or object it claimed to be — which errored `jsonb_array_elements` and made every
 * `@>` containment filter silently match nothing.
 *
 * **No test running on PGlite could have caught it**: PGlite's driver does not double-encode, so
 * the suite stayed green while the real database was wrong. That is the blind spot in choosing an
 * in-process Postgres for tests, and it is why the property is pinned at the mapper instead —
 * this assertion is driver-independent, so it holds wherever the tests run.
 */
test("the jsonb mapper hands the driver the value, not a string of it", () => {
	const column = verses.flags;
	expect(column.mapToDriverValue(["hyphen-join"])).toEqual(["hyphen-join"]);
	expect(column.mapToDriverValue({ ok: true })).toEqual({ ok: true });
});

/**
 * The point of these two is the substitution itself: they prove the generated migrations apply
 * to a real Postgres that no developer had to start, and that a query written against the
 * driver-agnostic `Db` runs there. Every other test in the repo that touches the studio leans
 * on that.
 */

test("the generated migrations bring up a usable schema", async () => {
	const { db, close } = await createTestDb();

	await db.insert(books).values({
		id: "test-book",
		packageDir: "books/test-book",
		sourceFile: "test.pdf",
		sourceSha256: "abc",
		bookPageCount: 4,
		manifest: {},
		assembly: {},
	});

	const [row] = await db.select().from(books).where(eq(books.id, "test-book"));

	expect(row?.id).toBe("test-book");
	// Defaulted server-side, so this also proves the migration's defaults arrived.
	expect(row?.importedAt).toBeInstanceOf(Date);
	await close();
});

test("a verse defaults to raw, unedited and un-orphaned", async () => {
	const { db, close } = await createTestDb();

	await db.insert(books).values({
		id: "test-book",
		packageDir: "books/test-book",
		sourceFile: "test.pdf",
		sourceSha256: "abc",
		bookPageCount: 4,
		manifest: {},
		assembly: {},
	});
	const [verse] = await db
		.insert(verses)
		.values({
			bookId: "test-book",
			divisionId: "section-1",
			id: "v61",
			ordinal: 0,
			form: "prose",
			text: "કૃષ્ણ",
			ocrText: "કૃષ્ણ",
		})
		.returning();

	expect(verse?.status).toBe("raw");
	expect(verse?.orphaned).toBe(false);
	expect(verse?.ocrChanged).toBe(false);
	expect(verse?.origin).toBe("imported");
	// `gen_random_uuid()` is core Postgres from 13 on, and PGlite is 17 — no extension needed.
	expect(verse?.key).toMatch(/^[0-9a-f-]{36}$/);
	await close();
});

test("a jsonb array is stored as an array Postgres can query into", async () => {
	const { db, close } = await createTestDb();

	await db.insert(books).values({
		id: "test-book",
		packageDir: "books/test-book",
		sourceFile: "test.pdf",
		sourceSha256: "abc",
		bookPageCount: 4,
		manifest: {},
		assembly: {},
	});
	await db.insert(verses).values({
		bookId: "test-book",
		divisionId: "section-1",
		id: "v61",
		ordinal: 0,
		form: "prose",
		text: "કૃષ્ણ",
		ocrText: "કૃષ્ણ",
		flags: ["spans-pages"],
		pages: [83, 84],
	});

	// Reading it back proves nothing — a double-encoded value round-trips too. Asking Postgres
	// what it *is*, and to match on it, is what the queue's flag and page filters actually do.
	const [row] = await db
		.select({
			type: sql<string>`jsonb_typeof(${verses.flags})`,
			byFlag: sql<boolean>`${verses.flags} @> '["spans-pages"]'::jsonb`,
			byPage: sql<boolean>`${verses.pages} @> '[84]'::jsonb`,
		})
		.from(verses);

	expect(row?.type).toBe("array");
	expect(row?.byFlag).toBe(true);
	expect(row?.byPage).toBe(true);
	await close();
});

test("a release outlives the working copy it was compiled from", async () => {
	const { db, close } = await createTestDb();

	await db.insert(books).values({
		id: "test-book",
		packageDir: "books/test-book",
		sourceFile: "test.pdf",
		sourceSha256: "abc",
		bookPageCount: 4,
		manifest: {},
		assembly: {},
	});
	await db.insert(releases).values({
		bookId: "test-book",
		contentVersion: "1.0.0",
		file: "books/test-book/published/test-book-1.0.0.json",
		sha256: "0".repeat(64),
		bytes: 1234,
		verses: 4,
		manifest: { title: { en: "test" } },
	});

	// The one table here that does not cascade, on purpose: deleting a bad import must not erase
	// the record of bytes that are already on somebody's phone.
	await db.delete(books).where(eq(books.id, "test-book"));

	const rows = await db.select().from(releases).where(eq(releases.bookId, "test-book"));
	expect(rows).toHaveLength(1);
	expect(rows[0]?.publishedAt).toBeInstanceOf(Date);
	await close();
});

test("a version is released once — republishing it is a constraint violation", async () => {
	const { db, close } = await createTestDb();

	const release = {
		bookId: "test-book",
		contentVersion: "1.0.0",
		file: "books/test-book/published/test-book-1.0.0.json",
		sha256: "0".repeat(64),
		bytes: 1234,
		verses: 4,
		manifest: {},
	};
	await db.insert(releases).values(release);

	// Wrapped: drizzle's builder is a thenable, and `expect().rejects` wants a real promise.
	const republish = async () => {
		await db.insert(releases).values(release);
	};
	await expect(republish()).rejects.toThrow();
	await close();
});
