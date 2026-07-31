import { expect, test } from "bun:test";
import { gayatriMantra, sampleProse } from "../fixtures.ts";
import { bookRef, formatRef, parseRef } from "./refs.ts";
import { pickLocalized } from "./schema.ts";
import { bookVerses, countVerses, findUnit, findVerse, walkBook } from "./tree.ts";

function refOf(text: string) {
	const result = parseRef(text);
	if (!result.ok) {
		throw new Error(result.error);
	}
	return result.ref;
}

test("a flat book of verses walks in reading order", () => {
	expect(bookVerses(gayatriMantra).map((visit) => formatRef(visit.ref))).toEqual([
		"gayatri-mantra#v1",
		"gayatri-mantra#v2",
		"gayatri-mantra#v3",
		"gayatri-mantra#v4",
	]);
});

test("a nested book yields divisions before their children, depth first", () => {
	expect([...walkBook(sampleProse)].map((visit) => formatRef(visit.ref))).toEqual([
		"sample-prose/khand-1",
		"sample-prose/khand-1/3",
		"sample-prose/khand-1/3#p1",
		"sample-prose/khand-1/3#p2",
		"sample-prose/khand-1/3/quote-1",
		"sample-prose/khand-1/3/quote-1#v1",
		"sample-prose/khand-1/3/quote-1#v2",
		"sample-prose/khand-1/3#p3",
	]);
});

test("prose leaves and verse leaves are both verses — the atom is the same", () => {
	const verses = bookVerses(sampleProse);
	expect(verses).toHaveLength(5);
	expect(verses.map((visit) => visit.unit.form)).toEqual([
		"prose",
		"prose",
		"verse",
		"verse",
		"prose",
	]);
	expect(countVerses(sampleProse)).toBe(5);
});

test("a verse knows the divisions it sits inside", () => {
	const nested = findVerse(sampleProse, refOf("sample-prose/khand-1/3/quote-1#v1"));
	expect(nested?.ancestors.map((unit) => unit.id)).toEqual(["khand-1", "3", "quote-1"]);
});

test("refs resolve to the unit they name", () => {
	expect(findUnit(sampleProse, refOf("sample-prose/khand-1/3"))?.unit.kind).toBe("chapter");
	expect(findUnit(sampleProse, refOf("sample-prose/khand-1/3#p2"))?.unit.id).toBe("p2");
});

test("a ref into a different book never resolves", () => {
	expect(findUnit(sampleProse, bookRef("gayatri-mantra", [], "v1"))).toBeUndefined();
});

test("a retired ref resolves to nothing — that is what the alias map is for", () => {
	const retired = refOf("sample-prose/khand-1/3#p0");
	expect(findUnit(sampleProse, retired)).toBeUndefined();
	const successor = sampleProse.aliases?.[formatRef(retired)];
	expect(successor).toBe("sample-prose/khand-1/3#p1");
	expect(findVerse(sampleProse, refOf(successor as string))).toBeDefined();
});

test("findVerse refuses to return a division", () => {
	const chapter = refOf("sample-prose/khand-1/3");
	expect(findUnit(sampleProse, chapter)).toBeDefined();
	expect(findVerse(sampleProse, chapter)).toBeUndefined();
});

test("localized text falls back through preferences, then to whatever exists", () => {
	expect(pickLocalized(sampleProse.title, ["gu"])).toBe("નમૂનારૂપ ગદ્ય પાઠ");
	expect(pickLocalized(sampleProse.title, ["fr", "en"])).toBe("Sample Prose Discourse");
	// A regional request is satisfied by the base language.
	expect(pickLocalized(sampleProse.title, ["gu-IN"])).toBe("નમૂનારૂપ ગદ્ય પાઠ");
	// Nothing matches, but a title must still render.
	expect(pickLocalized({ en: "Only English" }, ["gu"])).toBe("Only English");
});
