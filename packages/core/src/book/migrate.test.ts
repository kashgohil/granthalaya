import { expect, test } from "bun:test";
import { sampleProse } from "../fixtures.ts";
import { bookRefs, migrateRef, migrateRefs, summarizeMigration } from "./migrate.ts";
import type { Book } from "./schema.ts";

const CHAPTER = "sample-prose/khand-1/3";

test("a ref that still resolves is left exactly where it is", () => {
	expect(migrateRef(sampleProse, `${CHAPTER}#p1`)).toEqual({
		from: `${CHAPTER}#p1`,
		to: `${CHAPTER}#p1`,
		status: "live",
	});
	// Divisions and the book itself are refs a deep link can hold, so they migrate too.
	expect(migrateRef(sampleProse, CHAPTER).status).toBe("live");
	expect(migrateRef(sampleProse, "sample-prose").status).toBe("live");
});

test("a retired ref is rewritten through the alias map", () => {
	expect(migrateRef(sampleProse, `${CHAPTER}#p0`)).toEqual({
		from: `${CHAPTER}#p0`,
		to: `${CHAPTER}#p1`,
		status: "rewritten",
	});
	// A deletion points at the division that held it: "the text is gone, here is where it was."
	expect(migrateRef(sampleProse, `${CHAPTER}#p9`)).toEqual({
		from: `${CHAPTER}#p9`,
		to: CHAPTER,
		status: "rewritten",
	});
});

test("a ref nothing claims is orphaned, never silently dropped", () => {
	const migrated = migrateRefs(sampleProse, [
		`${CHAPTER}#p1`,
		`${CHAPTER}#p0`,
		`${CHAPTER}#gone`,
		"other-book/x#v1",
	]);

	expect(migrated.map((entry) => entry.status)).toEqual([
		"live",
		"rewritten",
		"orphaned",
		"orphaned",
	]);
	expect(summarizeMigration(migrated)).toEqual({
		live: 1,
		rewritten: 1,
		orphaned: [`${CHAPTER}#gone`, "other-book/x#v1"],
	});
});

test("aliases chain, so an install two versions behind upgrades correctly", () => {
	// v2 retired #p0 into #p0b; v3 retires #p0b into #p1. A device still on v1 holds #p0.
	const v3: Book = {
		...structuredClone(sampleProse),
		aliases: {
			[`${CHAPTER}#p0`]: `${CHAPTER}#p0b`,
			[`${CHAPTER}#p0b`]: `${CHAPTER}#p1`,
		},
	};

	expect(migrateRef(v3, `${CHAPTER}#p0`)).toEqual({
		from: `${CHAPTER}#p0`,
		to: `${CHAPTER}#p1`,
		status: "rewritten",
	});
});

test("an alias cycle orphans rather than hangs the installer", () => {
	const looped: Book = {
		...structuredClone(sampleProse),
		aliases: { "sample-prose/a#x": "sample-prose/a#y", "sample-prose/a#y": "sample-prose/a#x" },
	};

	expect(migrateRef(looped, "sample-prose/a#x").status).toBe("orphaned");
});

test("bookRefs holds every unit and the book itself", () => {
	const refs = bookRefs(sampleProse);
	expect(refs.has("sample-prose")).toBe(true);
	expect(refs.has("sample-prose/khand-1")).toBe(true);
	expect(refs.has(`${CHAPTER}/quote-1#v1`)).toBe(true);
	expect(refs.has(`${CHAPTER}#p0`)).toBe(false);
});
