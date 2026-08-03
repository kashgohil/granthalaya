import { expect, test } from "bun:test";
import { migrateRefs, parseBook } from "@granthalaya/core";
import { books, releases, verses } from "@granthalaya/db";
import { createTestDb } from "@granthalaya/db/testing";
import { eq } from "drizzle-orm";
import { readDraft } from "../studio/content.ts";
import { exportBook } from "../studio/export.ts";
import { FIXTURE_BOOK_ID, writeDraftFixture } from "../studio/fixtures.ts";
import { importDraft } from "../studio/import.ts";
import { deleteVerse, renumberVerse, splitVerse } from "../studio/restructure.ts";
import { patchVerse } from "../studio/verses.ts";
import { sha256Hex } from "./integrity.ts";
import { publishBook } from "./publish.ts";
import { catalogBook, catalogBooks, readPackageBytes } from "./service.ts";

/** An imported book with its edition filled in and every passage approved — export-ready. */
async function setup() {
	const fixture = await writeDraftFixture();
	const { db, close } = await createTestDb();
	await importDraft(db, await readDraft(fixture.contentDir, fixture.bookDir));

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

	const approveAll = async () => {
		for (const row of await db.select().from(verses).where(eq(verses.bookId, FIXTURE_BOOK_ID))) {
			await patchVerse(db, FIXTURE_BOOK_ID, row.divisionId, row.id, { status: "approved" });
		}
	};
	await approveAll();

	return {
		db,
		fixture,
		approveAll,
		teardown: async () => {
			await fixture.cleanup();
			await close();
		},
	};
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function exported(setup: Setup, contentVersion: string) {
	const result = await exportBook(setup.db, setup.fixture.contentDir, FIXTURE_BOOK_ID, {
		contentVersion,
	});
	if (result === null || !result.ok) {
		throw new Error(`export refused: ${result === null ? "no book" : result.reasons.join("; ")}`);
	}
	return result;
}

function refusalOf(result: Awaited<ReturnType<typeof publishBook>>): readonly string[] {
	if (result === null || result.ok) throw new Error("expected publish to refuse");
	return result.reasons;
}

function successOf(result: Awaited<ReturnType<typeof publishBook>>) {
	if (result === null || !result.ok) {
		throw new Error(
			`expected publish to succeed: ${result === null ? "no book" : result.reasons.join("; ")}`,
		);
	}
	return result;
}

test("publishing an exported package records it, hashes it, and flips it to published", async () => {
	const state = await setup();
	await exported(state, "1.0.0");

	const result = successOf(
		await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
			contentVersion: "1.0.0",
		}),
	);

	expect(result.verses).toBe(4);
	expect(result.file).toBe(`books/${FIXTURE_BOOK_ID}/published/${FIXTURE_BOOK_ID}-1.0.0.json`);

	const bytes = await Bun.file(`${state.fixture.contentDir}/${result.file}`).arrayBuffer();
	// The hash is over the bytes on disk, not over a re-encode of the parsed object.
	expect(sha256Hex(new Uint8Array(bytes))).toBe(result.sha256);
	expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);

	const published = parseBook(JSON.parse(new TextDecoder().decode(bytes))).book;
	expect(published?.contentStatus).toBe("published");
	// The proofed file it was compiled from is untouched — two artefacts, two statuses.
	const proofed = await Bun.file(
		`${state.fixture.contentDir}/books/${FIXTURE_BOOK_ID}/proofed/${FIXTURE_BOOK_ID}-1.0.0.json`,
	).json();
	expect(proofed.contentStatus).toBe("proofed");

	const [row] = await state.db.select().from(releases).where(eq(releases.bookId, FIXTURE_BOOK_ID));
	expect(row).toMatchObject({ contentVersion: "1.0.0", sha256: result.sha256, verses: 4 });
	// The catalog's copy of the manifest is for a listing, not for reading the book.
	expect(row?.manifest).not.toHaveProperty("structure");

	await state.teardown();
});

test("nothing can be published that was not exported first", async () => {
	const state = await setup();

	const reasons = refusalOf(
		await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
			contentVersion: "1.0.0",
		}),
	);
	expect(reasons[0]).toContain("does not exist");
	expect(reasons[0]).toContain("Export that version");

	await state.teardown();
});

test("a package that has not been proofed is refused", async () => {
	const state = await setup();
	await exported(state, "1.0.0");

	// The same package with its status wound back — what a hand-edited or re-assembled file
	// would look like arriving at this step.
	const path = `${state.fixture.contentDir}/books/${FIXTURE_BOOK_ID}/proofed/${FIXTURE_BOOK_ID}-1.0.0.json`;
	const draft = { ...(await Bun.file(path).json()), contentStatus: "draft" };
	await Bun.write(path, JSON.stringify(draft, null, "\t"));

	const reasons = refusalOf(
		await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
			contentVersion: "1.0.0",
		}),
	);
	expect(reasons.some((reason) => reason.includes('is "draft"'))).toBe(true);

	await state.teardown();
});

test("a version is published once", async () => {
	const state = await setup();
	await exported(state, "1.0.0");
	successOf(
		await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
			contentVersion: "1.0.0",
		}),
	);

	const again = refusalOf(
		await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
			contentVersion: "1.0.0",
		}),
	);
	expect(again.some((reason) => reason.includes("already published"))).toBe(true);

	await state.teardown();
});

test("a dry run answers every question and writes nothing", async () => {
	const state = await setup();
	await exported(state, "1.0.0");

	const preview = successOf(
		await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
			contentVersion: "1.0.0",
			dryRun: true,
		}),
	);
	expect(preview.file).toBeNull();
	expect(preview.sha256).toMatch(/^[0-9a-f]{64}$/);
	expect(preview.warnings.some((warning) => warning.includes("Dry run"))).toBe(true);

	expect(await state.db.select().from(releases)).toHaveLength(0);
	expect(
		await Bun.file(
			`${state.fixture.contentDir}/books/${FIXTURE_BOOK_ID}/published/${FIXTURE_BOOK_ID}-1.0.0.json`,
		).exists(),
	).toBe(false);

	await state.teardown();
});

test("a second version that restructures the book retires its refs and passes the audit", async () => {
	const state = await setup();
	await exported(state, "1.0.0");
	successOf(
		await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
			contentVersion: "1.0.0",
		}),
	);

	// Everything a proofreader can do to a ref after a version has shipped: split one passage,
	// renumber the tail (which re-derives its id), and delete another outright.
	await splitVerse(state.db, FIXTURE_BOOK_ID, "section-1", "v61", 10);
	await renumberVerse(state.db, FIXTURE_BOOK_ID, "section-1", "p1-2", "૬૭");
	await deleteVerse(state.db, FIXTURE_BOOK_ID, "section-2", "p86-6");
	await state.approveAll();

	await exported(state, "2.0.0");
	const result = successOf(
		await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
			contentVersion: "2.0.0",
		}),
	);
	expect(result.diff?.refsDropped).toEqual([]);
	expect(result.diff?.versesRetired).toEqual([`${FIXTURE_BOOK_ID}/section-2#p86-6`]);

	// And the map does what it exists for: a reader holding the deleted passage's ref is told
	// where the text was, rather than losing the annotation without a word.
	const bytes = await Bun.file(`${state.fixture.contentDir}/${result.file}`).arrayBuffer();
	const published = parseBook(JSON.parse(new TextDecoder().decode(bytes))).book;
	if (published === undefined) throw new Error("published package does not parse");
	expect(migrateRefs(published, [`${FIXTURE_BOOK_ID}/section-2#p86-6`])[0]).toEqual({
		from: `${FIXTURE_BOOK_ID}/section-2#p86-6`,
		to: `${FIXTURE_BOOK_ID}/section-2`,
		status: "rewritten",
	});

	await state.teardown();
});

test("a package that drops a published ref with no alias is refused", async () => {
	const state = await setup();
	await exported(state, "1.0.0");
	successOf(
		await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
			contentVersion: "1.0.0",
		}),
	);

	// A package assembled by some other route — the alias map stripped out, which is exactly what
	// a careless re-export or a hand-edit would produce.
	const path = `${state.fixture.contentDir}/books/${FIXTURE_BOOK_ID}/proofed/${FIXTURE_BOOK_ID}-2.0.0.json`;
	const v1 = await Bun.file(
		`${state.fixture.contentDir}/books/${FIXTURE_BOOK_ID}/proofed/${FIXTURE_BOOK_ID}-1.0.0.json`,
	).json();
	const section2 = v1.structure[1];
	section2.children = section2.children.filter((unit: { id: string }) => unit.id !== "p86-6");
	await Bun.write(path, JSON.stringify({ ...v1, contentVersion: "2.0.0" }, null, "\t"));

	const result = await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
		contentVersion: "2.0.0",
	});
	const reasons = refusalOf(result);
	expect(reasons.some((reason) => reason.includes("no longer resolves"))).toBe(true);
	expect(reasons.some((reason) => reason.includes("orphaned"))).toBe(true);
	// The refusal still carries the diff, so a preview can show what it objected to.
	if (result === null || result.ok) throw new Error("unreachable");
	expect(result.diff?.refsDropped).toEqual([`${FIXTURE_BOOK_ID}/section-2#p86-6`]);

	await state.teardown();
});

test("the catalog lists only what has been published, newest version first", async () => {
	const state = await setup();
	expect(await catalogBooks(state.db)).toEqual([]);

	await exported(state, "1.0.0");
	await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
		contentVersion: "1.0.0",
	});
	await state.approveAll();
	await exported(state, "1.10.0");
	await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
		contentVersion: "1.10.0",
	});

	const entry = await catalogBook(state.db, FIXTURE_BOOK_ID);
	// Semver, not string order: `1.10.0` is the newest, and "latest" is the one thing the
	// catalog must never get wrong.
	expect(entry?.latest.contentVersion).toBe("1.10.0");
	expect(entry?.versions.map((version) => version.contentVersion)).toEqual(["1.10.0", "1.0.0"]);
	expect(entry?.title).toMatchObject({ en: "test vato" });
	expect(entry?.primaryLayer).toBe("gu");

	await state.teardown();
});

test("a published package that has been edited on disk is reported, never served", async () => {
	const state = await setup();
	await exported(state, "1.0.0");
	const result = successOf(
		await publishBook(state.db, state.fixture.contentDir, FIXTURE_BOOK_ID, {
			contentVersion: "1.0.0",
		}),
	);

	const path = `${state.fixture.contentDir}/${result.file}`;
	const tampered = { ...(await Bun.file(path).json()), tradition: "tampered" };
	await Bun.write(path, JSON.stringify(tampered, null, "\t"));

	const [row] = await state.db.select().from(releases).where(eq(releases.bookId, FIXTURE_BOOK_ID));
	if (row === undefined) throw new Error("no release row");
	const bytes = await readPackageBytes(state.fixture.contentDir, row);
	expect(bytes.ok).toBe(false);
	if (bytes.ok) throw new Error("unreachable");
	expect(bytes.reason).toContain("no longer matches the hash");

	await state.teardown();
});
