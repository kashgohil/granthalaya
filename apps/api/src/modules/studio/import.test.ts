import { expect, test } from "bun:test";
import { books, divisions, pageNotes, setAsideBlocks, verses } from "@granthalaya/db";
import { createTestDb } from "@granthalaya/db/testing";
import { and, asc, eq } from "drizzle-orm";
import { readDraft } from "./content.ts";
import { draftBook, draftReport, FIXTURE_BOOK_ID, writeDraftFixture } from "./fixtures.ts";
import { importDraft, noteMarker } from "./import.ts";
import { checkSequence, stillNeedsHuman } from "./service.ts";

async function setup(options: Parameters<typeof writeDraftFixture>[0] = {}) {
	const fixture = await writeDraftFixture(options);
	const { db, close } = await createTestDb();
	return {
		db,
		fixture,
		importOnce: async (opts: Parameters<typeof writeDraftFixture>[0] = {}) => {
			if (opts.book !== undefined || opts.report !== undefined) {
				const rewritten = await writeDraftFixture({ ...opts, ...{} });
				const draft = await readDraft(rewritten.contentDir, rewritten.bookDir);
				const result = await importDraft(db, draft);
				await rewritten.cleanup();
				return result;
			}
			return importDraft(db, await readDraft(fixture.contentDir, fixture.bookDir));
		},
		teardown: async () => {
			await fixture.cleanup();
			await close();
		},
	};
}

test("a first import lands the whole draft, evidence and all", async () => {
	const { db, importOnce, teardown } = await setup();

	const result = await importOnce();

	expect(result.firstImport).toBe(true);
	expect(result.inserted).toBe(4);
	expect(result.pages).toBe(4);
	expect(result.notes).toBe(1);
	expect(result.setAside).toBe(2);
	expect(result.warnings).toEqual([]);

	const [book] = await db.select().from(books).where(eq(books.id, FIXTURE_BOOK_ID));
	// Found by source hash, not by name: the package dir and the pages dir are named differently.
	expect(book?.pagesDir).toBe("pages/test-vato-fixture");

	const rows = await db
		.select()
		.from(verses)
		.where(eq(verses.bookId, FIXTURE_BOOK_ID))
		.orderBy(asc(verses.divisionId), asc(verses.ordinal));
	expect(rows.map((row) => row.id)).toEqual(["v61", "v62", "v63", "p86-6"]);
	expect(rows.every((row) => row.status === "raw")).toBe(true);
	// Both sides of every future correction start out equal.
	expect(rows.every((row) => row.text === row.ocrText)).toBe(true);

	const spanning = rows.find((row) => row.id === "v62");
	expect(spanning?.pages).toEqual([1, 2]);
	expect(spanning?.flags).toEqual(["spans-pages"]);

	const unnumbered = rows.find((row) => row.id === "p86-6");
	expect(unnumbered?.number).toBeNull();
	expect(unnumbered?.confidence).toBeCloseTo(0.65);
	expect(unnumbered?.repairs).toHaveLength(1);

	await teardown();
});

test("a re-import replaces what nobody has read", async () => {
	const { db, importOnce, teardown } = await setup();
	await importOnce();

	const improved = draftBook({ texts: { v61: "એક વાર ગોપાળાનંદ સ્વામી બોલ્યા જે — સુધારેલું" } });
	const result = await importOnce({ book: improved, report: draftReport(improved) });

	expect(result.firstImport).toBe(false);
	expect(result.inserted).toBe(0);
	expect(result.refreshed).toBe(4);
	expect(result.reset).toBe(0);

	const [row] = await db
		.select()
		.from(verses)
		.where(and(eq(verses.bookId, FIXTURE_BOOK_ID), eq(verses.id, "v61")));
	expect(row?.text).toContain("સુધારેલું");
	expect(row?.ocrChanged).toBe(false);

	await teardown();
});

test("a re-import keeps a human's edit and sends it back to raw", async () => {
	const { db, importOnce, teardown } = await setup();
	await importOnce();

	// A human corrects v61 and approves it.
	await db
		.update(verses)
		.set({ text: "એક વાર ગોપાળાનંદ સ્વામી બોલ્યા જે — proofed", status: "approved" })
		.where(and(eq(verses.bookId, FIXTURE_BOOK_ID), eq(verses.id, "v61")));

	const improved = draftBook({ texts: { v61: "એક વાર ગોપાળાનંદ સ્વામી બોલ્યા જે — machine v2" } });
	const result = await importOnce({ book: improved, report: draftReport(improved) });

	expect(result.reset).toBe(1);

	const [row] = await db
		.select()
		.from(verses)
		.where(and(eq(verses.bookId, FIXTURE_BOOK_ID), eq(verses.id, "v61")));
	// The human's reading survives; the machine's new one is kept beside it to diff against.
	expect(row?.text).toContain("proofed");
	expect(row?.ocrText).toContain("machine v2");
	expect(row?.ocrChanged).toBe(true);
	expect(row?.status).toBe("raw");

	await teardown();
});

test("a re-import leaves an approved verse alone when the OCR agrees", async () => {
	const { db, importOnce, teardown } = await setup();
	await importOnce();

	await db
		.update(verses)
		.set({ text: "corrected by hand", status: "approved" })
		.where(and(eq(verses.bookId, FIXTURE_BOOK_ID), eq(verses.id, "v63")));

	const result = await importOnce();

	expect(result.reset).toBe(0);
	const [row] = await db
		.select()
		.from(verses)
		.where(and(eq(verses.bookId, FIXTURE_BOOK_ID), eq(verses.id, "v63")));
	expect(row?.status).toBe("approved");
	expect(row?.text).toBe("corrected by hand");

	await teardown();
});

test("a passage the new draft no longer produces is orphaned, not deleted", async () => {
	const { db, importOnce, teardown } = await setup();
	await importOnce();

	// Drop the last passage of section 2 — a tuned `assemble` that no longer segments it out.
	const shorter = draftBook();
	const section = shorter.structure[1];
	if (section === undefined || section.kind === "verse") throw new Error("fixture changed shape");
	section.children = section.children.slice(0, -1);

	const result = await importOnce({ book: shorter, report: draftReport(shorter) });

	expect(result.orphaned).toBe(1);
	const [row] = await db
		.select()
		.from(verses)
		.where(and(eq(verses.bookId, FIXTURE_BOOK_ID), eq(verses.id, "p86-6")));
	// Still there, with its text and its evidence — a passage that vanishes between two runs is
	// exactly what the verse-number checksum exists to catch.
	expect(row?.orphaned).toBe(true);
	expect(row?.text).toContain("વિખ્યાતિ");

	await teardown();
});

test("a re-import does not undo what only a human could supply", async () => {
	const { db, importOnce, teardown } = await setup();
	await importOnce();

	await db
		.update(books)
		.set({
			manifest: {
				...(await db
					.select()
					.from(books)
					.where(eq(books.id, FIXTURE_BOOK_ID))
					.then((rows) => rows[0]?.manifest as Record<string, unknown>)),
				source: { edition: "Swaminarayan Aksharpith, 2011" },
				license: { id: "all-rights-reserved" },
			},
		})
		.where(eq(books.id, FIXTURE_BOOK_ID));
	await db
		.update(divisions)
		.set({ title: { gu: "પુરુષોત્તમપણાની વાતો", en: "On his Purushottam nature" } })
		.where(and(eq(divisions.bookId, FIXTURE_BOOK_ID), eq(divisions.id, "section-1")));

	await importOnce();

	const [book] = await db.select().from(books).where(eq(books.id, FIXTURE_BOOK_ID));
	const manifest = book?.manifest as { source: { edition: string } } | undefined;
	expect(manifest?.source.edition).toBe("Swaminarayan Aksharpith, 2011");
	expect(stillNeedsHuman(book?.manifest)).toEqual(["title.gu — the book's title as it is printed"]);

	const [section] = await db
		.select()
		.from(divisions)
		.where(and(eq(divisions.bookId, FIXTURE_BOOK_ID), eq(divisions.id, "section-1")));
	expect((section?.title as { en?: string } | undefined)?.en).toBe("On his Purushottam nature");

	await teardown();
});

test("footnotes and set-aside blocks come in with the text that justifies them", async () => {
	const { db, importOnce, teardown } = await setup();
	await importOnce();

	const [note] = await db.select().from(pageNotes).where(eq(pageNotes.bookId, FIXTURE_BOOK_ID));
	expect(note?.marker).toBe(4);
	expect(note?.status).toBe("raw");

	const aside = await db
		.select()
		.from(setAsideBlocks)
		.where(eq(setAsideBlocks.bookId, FIXTURE_BOOK_ID));
	expect(aside).toHaveLength(2);
	// The English description of a decorative glyph — the one a human has to look at, because no
	// filter would have caught the same sentence written in Gujarati.
	expect(aside.some((row) => row.text.startsWith("This image contains no text"))).toBe(true);
	expect(aside.every((row) => row.resolved === false)).toBe(true);

	await teardown();
});

test("a draft with no rendered pages imports, and says what is missing", async () => {
	const { importOnce, teardown } = await setup({ withPages: false });

	const result = await importOnce();

	expect(result.inserted).toBe(4);
	expect(result.pages).toBe(0);
	expect(result.warnings[0]).toContain("bun run render");

	await teardown();
});

/** One division's worth of rows, which is the shape the checksum reads. */
const inOneDivision = (numbers: (string | null)[]) =>
	numbers.map((number) => ({ divisionId: "section-1", number }));

test("the live sequence check finds gaps, repeats and jumps", () => {
	expect(checkSequence(inOneDivision(["૬૧", "૬૨", "૬૩", null]))).toMatchObject({
		numbered: 3,
		unnumbered: 1,
		missing: [],
		duplicates: [],
		outOfOrder: [],
		restarts: [],
	});
	// The failure this exists for: a passage the OCR dropped leaves no other trace.
	expect(checkSequence(inOneDivision(["૬૧", "૬૩"])).missing).toEqual([62]);
	expect(checkSequence(inOneDivision(["૬૧", "૬૧"])).duplicates).toEqual([61]);
	expect(checkSequence(inOneDivision(["૬૩", "૬૧"])).outOfOrder).toEqual([61]);
});

test("the live check reads the studio's rows the same way assemble read the pages", () => {
	// Both sides call `checkVerseSequence`, so a division that starts counting again is a run
	// boundary here too — not thirteen duplicates the human has to explain away.
	const rows = [
		{ divisionId: "section-1", number: "૧" },
		{ divisionId: "section-1", number: "૨" },
		{ divisionId: "section-2", number: "૧" },
	];
	expect(checkSequence(rows)).toMatchObject({
		duplicates: [],
		outOfOrder: [],
		restarts: [{ division: "section-2", at: 1 }],
	});
});

test("a footnote's own marker is read off its text", () => {
	expect(noteMarker("૪. મૂળમાયા")).toBe(4);
	expect(noteMarker("૧૨) બીજું")).toBe(12);
	expect(noteMarker("મૂળમાયા")).toBeNull();
});
