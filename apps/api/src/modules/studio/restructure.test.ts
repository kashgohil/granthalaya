import { expect, test } from "bun:test";
import { verses } from "@granthalaya/db";
import { createTestDb } from "@granthalaya/db/testing";
import { and, asc, eq } from "drizzle-orm";
import { readDraft } from "./content.ts";
import { FIXTURE_BOOK_ID, writeDraftFixture } from "./fixtures.ts";
import { importDraft } from "./import.ts";
import {
	deleteVerse,
	insertVerse,
	mergeVerse,
	RestructureError,
	renumberVerse,
	splitVerse,
	verseIdFor,
} from "./restructure.ts";
import { checkSequence } from "./service.ts";
import { queue } from "./verses.ts";

async function setup() {
	const fixture = await writeDraftFixture();
	const { db, close } = await createTestDb();
	await importDraft(db, await readDraft(fixture.contentDir, fixture.bookDir));
	return {
		db,
		fixture,
		bookOrder: async () =>
			(
				await db
					.select({ divisionId: verses.divisionId, id: verses.id, ordinal: verses.ordinal })
					.from(verses)
					.where(eq(verses.bookId, FIXTURE_BOOK_ID))
					.orderBy(asc(verses.divisionId), asc(verses.ordinal))
			).map((row) => `${row.divisionId}#${row.id}@${row.ordinal}`),
		row: async (divisionId: string, id: string) => {
			const [found] = await db
				.select()
				.from(verses)
				.where(
					and(
						eq(verses.bookId, FIXTURE_BOOK_ID),
						eq(verses.divisionId, divisionId),
						eq(verses.id, id),
					),
				);
			return found;
		},
		teardown: async () => {
			await fixture.cleanup();
			await close();
		},
	};
}

test("a verse id follows its printed number, and falls back to where it was found", () => {
	expect(verseIdFor("૬૩", 86, 0)).toBe("v63");
	expect(verseIdFor("63", 86, 0)).toBe("v63");
	expect(verseIdFor(null, 86, 5)).toBe("p86-6");
});

test("splitting leaves both halves in order, the tail unnumbered", async () => {
	const { db, bookOrder, row, teardown } = await setup();

	const result = await splitVerse(db, FIXTURE_BOOK_ID, "section-1", "v61", 10);

	expect(result).toEqual({ head: "v61", tail: "p1-2" });
	expect(await bookOrder()).toEqual([
		"section-1#v61@0",
		"section-1#p1-2@1",
		"section-1#v62@2",
		"section-2#v63@0",
		"section-2#p86-6@1",
	]);

	const tail = await row("section-1", "p1-2");
	expect(tail?.number).toBeNull();
	expect(tail?.origin).toBe("split");
	expect(tail?.lineage).toEqual(["section-1#v61"]);
	// It came off the same region of the same page, so a proofreader still has an image to
	// check it against.
	const head = await row("section-1", "v61");
	expect(tail?.blocks).toEqual(head?.blocks as never);
	expect(tail?.flags as string[]).toContain("no-number");
	// Both halves go back in the queue: the split changed what each of them says.
	expect(tail?.status).toBe("raw");
	expect((await row("section-1", "v61"))?.status).toBe("raw");

	await teardown();
});

test("a split must leave text on both sides", async () => {
	const { db, teardown } = await setup();

	await expect(splitVerse(db, FIXTURE_BOOK_ID, "section-1", "v61", 0)).rejects.toThrow(
		RestructureError,
	);
	await expect(splitVerse(db, FIXTURE_BOOK_ID, "section-1", "v61", 9999)).rejects.toThrow(
		RestructureError,
	);

	await teardown();
});

test("merging keeps the earlier passage's number, and unions the evidence", async () => {
	const { db, bookOrder, row, teardown } = await setup();
	const before = await row("section-1", "v61");

	const result = await mergeVerse(db, FIXTURE_BOOK_ID, "section-1", "v61", "next");

	expect(result).toEqual({ survivor: "v61", absorbed: "v62" });
	expect(await bookOrder()).toEqual(["section-1#v61@0", "section-2#v63@0", "section-2#p86-6@1"]);

	const merged = await row("section-1", "v61");
	// In a printed book the number closes a passage: text that follows belongs to the passage
	// that was already open.
	expect(merged?.number).toBe("૬૧");
	expect(merged?.text).toBe(`${before?.text} ${"પછી સ્વામીએ કહ્યું જે ભગવાનનું સ્વરૂપ"}`);
	// v62 spanned pages 1–2, so the merged passage genuinely came off three.
	expect(merged?.pages).toEqual([1, 2]);
	expect(merged?.lineage).toContain("section-1#v62");

	await teardown();
});

test("absorbing an unnumbered half does not make a numbered passage unnumbered", async () => {
	const { db, row, teardown } = await setup();

	// Split then immediately merge back — the round trip a proofreader does after a mis-click.
	await splitVerse(db, FIXTURE_BOOK_ID, "section-1", "v61", 10);
	await mergeVerse(db, FIXTURE_BOOK_ID, "section-1", "v61", "next");

	const merged = await row("section-1", "v61");
	expect(merged?.number).toBe("૬૧");
	// The regression this test exists for: `no-number` came off the tail and was unioned in,
	// leaving a numbered passage flagged as having no number — and sorted into the queue as
	// something to go and fix.
	expect(merged?.flags).not.toContain("no-number");

	await teardown();
});

test("merging across a section boundary is refused", async () => {
	const { db, teardown } = await setup();

	// v62 is the last passage of section-1; "next" would be section-2's first.
	await expect(mergeVerse(db, FIXTURE_BOOK_ID, "section-1", "v62", "next")).rejects.toThrow(
		/section boundary/,
	);

	await teardown();
});

test("renumbering re-derives the id, and the old ref is remembered", async () => {
	const { db, row, teardown } = await setup();

	const result = await renumberVerse(db, FIXTURE_BOOK_ID, "section-2", "p86-6", "૬૪");

	expect(result).toEqual({ id: "v64", number: "૬૪" });
	const renamed = await row("section-2", "v64");
	expect(renamed?.flags).not.toContain("no-number");
	expect(renamed?.lineage).toContain("section-2#p86-6");
	expect(await row("section-2", "p86-6")).toBeUndefined();

	await teardown();
});

test("a passage the OCR missed can be typed in, and the checksum closes", async () => {
	const { db, teardown } = await setup();

	// The fixture runs ૬૧, ૬૨, ૬૩ — pretend the OCR dropped ૬૪ entirely, which is the failure
	// that leaves no other trace.
	const numbers = async () =>
		await db
			.select({ divisionId: verses.divisionId, number: verses.number })
			.from(verses)
			.where(eq(verses.bookId, FIXTURE_BOOK_ID))
			.orderBy(asc(verses.divisionId), asc(verses.ordinal));

	await renumberVerse(db, FIXTURE_BOOK_ID, "section-2", "p86-6", "૬૫");
	expect(checkSequence(await numbers()).missing).toEqual([64]);

	const inserted = await insertVerse(
		db,
		FIXTURE_BOOK_ID,
		"section-2",
		"v63",
		"જે પાનું ઓસીઆરે વાંચ્યું નહોતું",
		"૬૪",
	);
	expect(inserted.id).toBe("v64");
	expect(checkSequence(await numbers()).missing).toEqual([]);

	await teardown();
});

test("deleting closes the gap in reading order", async () => {
	const { db, bookOrder, teardown } = await setup();

	await deleteVerse(db, FIXTURE_BOOK_ID, "section-2", "v63");

	expect(await bookOrder()).toEqual(["section-1#v61@0", "section-1#v62@1", "section-2#p86-6@0"]);

	await teardown();
});

test("the queue's two orderings answer different questions", async () => {
	const { db, teardown } = await setup();

	const inBookOrder = await queue(db, FIXTURE_BOOK_ID, "book", {}, 50, 0);
	expect(inBookOrder.items.map((item) => item.id)).toEqual(["v61", "v62", "v63", "p86-6"]);

	const worstFirst = await queue(db, FIXTURE_BOOK_ID, "confidence", {}, 50, 0);
	expect(worstFirst.items[0]?.id).toBe("p86-6");

	// Filters narrow it without changing what the ordering means.
	const flagged = await queue(db, FIXTURE_BOOK_ID, "book", { flag: "spans-pages" }, 50, 0);
	expect(flagged.items.map((item) => item.id)).toEqual(["v62"]);
	expect(flagged.total).toBe(1);

	await teardown();
});

test("the queue paging is stable across a page boundary", async () => {
	const { db, teardown } = await setup();

	const first = await queue(db, FIXTURE_BOOK_ID, "book", {}, 2, 0);
	const second = await queue(db, FIXTURE_BOOK_ID, "book", {}, 2, 2);

	expect(first.total).toBe(4);
	expect(first.items.map((item) => item.id)).toEqual(["v61", "v62"]);
	expect(second.items.map((item) => item.id)).toEqual(["v63", "p86-6"]);

	await teardown();
});
