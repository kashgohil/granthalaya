import { expect, test } from "bun:test";
import { books, verses } from "@granthalaya/db";
import { createTestDb } from "@granthalaya/db/testing";
import { eq } from "drizzle-orm";
import { readDraft } from "./content.ts";
import { exportBook } from "./export.ts";
import { FIXTURE_BOOK_ID, writeDraftFixture } from "./fixtures.ts";
import { importDraft } from "./import.ts";
import { renumberVerse, splitVerse } from "./restructure.ts";
import { patchVerse } from "./verses.ts";

async function setup() {
	const fixture = await writeDraftFixture();
	const { db, close } = await createTestDb();
	await importDraft(db, await readDraft(fixture.contentDir, fixture.bookDir));
	return {
		db,
		fixture,
		teardown: async () => {
			await fixture.cleanup();
			await close();
		},
	};
}

/** Narrow an export result to its refusal, with the reasons a screen would show. */
function refusalOf(result: Awaited<ReturnType<typeof exportBook>>): readonly string[] {
	if (result === null || result.ok) throw new Error("expected export to refuse");
	return result.reasons;
}

/** …and to its success, for the same reason. */
function successOf(result: Awaited<ReturnType<typeof exportBook>>) {
	if (result === null || !result.ok) {
		throw new Error(
			`expected export to succeed: ${result === null ? "no book" : result.reasons.join("; ")}`,
		);
	}
	return result;
}

async function approveAll(db: Awaited<ReturnType<typeof setup>>["db"]) {
	const rows = await db.select().from(verses).where(eq(verses.bookId, FIXTURE_BOOK_ID));
	for (const row of rows) {
		await patchVerse(db, FIXTURE_BOOK_ID, row.divisionId, row.id, { status: "approved" });
	}
}

async function fillManifest(db: Awaited<ReturnType<typeof setup>>["db"]) {
	const [book] = await db.select().from(books).where(eq(books.id, FIXTURE_BOOK_ID));
	await db
		.update(books)
		.set({
			manifest: {
				...(book?.manifest as Record<string, unknown>),
				title: { gu: "ટેસ્ટ વાતો", en: "test vato" },
				source: { edition: "Swaminarayan Aksharpith, 2011" },
				license: { id: "all-rights-reserved" },
			},
		})
		.where(eq(books.id, FIXTURE_BOOK_ID));
}

test("export refuses until every passage is approved and nothing is unknown", async () => {
	const { db, fixture, teardown } = await setup();

	const reasons = refusalOf(await exportBook(db, fixture.contentDir, FIXTURE_BOOK_ID));
	expect(reasons.some((reason) => reason.includes("not approved yet"))).toBe(true);
	expect(reasons.some((reason) => reason.includes("source.edition"))).toBe(true);
	expect(reasons.some((reason) => reason.includes("license.id"))).toBe(true);

	// Reading is not clearing: proofed everywhere is still a refusal.
	const rows = await db.select().from(verses).where(eq(verses.bookId, FIXTURE_BOOK_ID));
	for (const row of rows) {
		await patchVerse(db, FIXTURE_BOOK_ID, row.divisionId, row.id, { status: "proofed" });
	}
	const stillRefused = await exportBook(db, fixture.contentDir, FIXTURE_BOOK_ID);
	expect(stillRefused?.ok).toBe(false);

	await teardown();
});

test("an approved book compiles to a valid, proofed package", async () => {
	const { db, fixture, teardown } = await setup();
	await approveAll(db);
	await fillManifest(db);

	const success = successOf(await exportBook(db, fixture.contentDir, FIXTURE_BOOK_ID));

	expect(success.verses).toBe(4);

	const written = await Bun.file(`${fixture.contentDir}/${success.file}`).json();
	// Not `published`: the catalog step is P1.5, and keeping them apart is what lets a proofed
	// book sit and be re-read before anybody installs it.
	expect(written.contentStatus).toBe("proofed");
	expect(written.structure).toHaveLength(2);
	expect(written.structure[0].children.map((unit: { id: string }) => unit.id)).toEqual([
		"v61",
		"v62",
	]);
	// The hash covers the proofed text, not the text `assemble` produced.
	expect(written.structure[0].children[0].hash).toMatch(/^f1a64:/);

	await teardown();
});

test("a version is written once", async () => {
	const { db, fixture, teardown } = await setup();
	await approveAll(db);
	await fillManifest(db);

	expect((await exportBook(db, fixture.contentDir, FIXTURE_BOOK_ID))?.ok).toBe(true);

	const again = refusalOf(await exportBook(db, fixture.contentDir, FIXTURE_BOOK_ID));
	expect(again[0]).toContain("already exists");

	// A correction ships as a new version, never as an edit to one already handed out.
	const bumped = await exportBook(db, fixture.contentDir, FIXTURE_BOOK_ID, {
		contentVersion: "0.2.0",
	});
	expect(bumped?.ok).toBe(true);

	await teardown();
});

test("a structural edit is reflected in the exported package", async () => {
	const { db, fixture, teardown } = await setup();

	await splitVerse(db, FIXTURE_BOOK_ID, "section-1", "v61", 10);
	await renumberVerse(db, FIXTURE_BOOK_ID, "section-1", "p1-2", "૬૭");
	await approveAll(db);
	await fillManifest(db);

	const success = successOf(await exportBook(db, fixture.contentDir, FIXTURE_BOOK_ID));

	const written = await Bun.file(`${fixture.contentDir}/${success.file}`).json();
	expect(written.structure[0].children.map((unit: { id: string }) => unit.id)).toEqual([
		"v61",
		"v67",
		"v62",
	]);

	await teardown();
});
