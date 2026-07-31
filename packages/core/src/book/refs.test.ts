import { expect, test } from "bun:test";
import {
	bookRef,
	formatRef,
	isSegment,
	isVerseRef,
	parentRef,
	parseRef,
	refContains,
	refsEqual,
} from "./refs.ts";

function expectParsed(text: string) {
	const result = parseRef(text);
	if (!result.ok) {
		throw new Error(`expected ${text} to parse, got: ${result.error}`);
	}
	return result.ref;
}

test("the roadmap's canonical ref parses into its parts", () => {
	expect(expectParsed("vachanamrut/gadhada-1/21#v3")).toEqual({
		bookId: "vachanamrut",
		path: ["gadhada-1", "21"],
		leaf: "v3",
	});
});

test("a ref survives a parse/format round trip", () => {
	for (const text of [
		"vachanamrut",
		"vachanamrut/gadhada-1",
		"vachanamrut/gadhada-1/21",
		"vachanamrut/gadhada-1/21#v3",
		"gayatri-mantra#v1",
	]) {
		expect(formatRef(expectParsed(text))).toBe(text);
	}
});

test("only a ref with a fragment names a verse", () => {
	expect(isVerseRef(expectParsed("vachanamrut/gadhada-1/21"))).toBe(false);
	expect(isVerseRef(expectParsed("vachanamrut/gadhada-1/21#v3"))).toBe(true);
});

test("segments are lowercase kebab-case only", () => {
	for (const good of ["a", "21", "gadhada-1", "v3", "khand-1-a"]) {
		expect(isSegment(good)).toBe(true);
	}
	for (const bad of [
		"",
		"Gadhada",
		"gadhada_1",
		"-lead",
		"trail-",
		"double--hyphen",
		"a b",
		"a/b",
	]) {
		expect(isSegment(bad)).toBe(false);
	}
});

test("malformed refs are reported, never thrown", () => {
	for (const bad of ["", "Vachanamrut", "book//chapter", "book#a#b", "book/CH#v1", "book#V1"]) {
		const result = parseRef(bad);
		expect(result.ok).toBe(false);
	}
});

test("bookRef rejects illegal segments at construction", () => {
	expect(() => bookRef("vachanamrut", ["gadhada-1"], "v3")).not.toThrow();
	expect(() => bookRef("Vachanamrut")).toThrow();
	expect(() => bookRef("vachanamrut", ["Gadhada 1"])).toThrow();
});

test("a verse's parent is its containing division, and the book root has none", () => {
	expect(parentRef(expectParsed("vachanamrut/gadhada-1/21#v3"))).toEqual(
		expectParsed("vachanamrut/gadhada-1/21"),
	);
	expect(parentRef(expectParsed("vachanamrut/gadhada-1"))).toEqual(expectParsed("vachanamrut"));
	expect(parentRef(expectParsed("vachanamrut"))).toBeNull();
});

test("containment answers 'everything inside this chapter'", () => {
	const chapter = expectParsed("vachanamrut/gadhada-1/21");
	expect(refContains(chapter, expectParsed("vachanamrut/gadhada-1/21#v3"))).toBe(true);
	expect(refContains(chapter, chapter)).toBe(true);
	expect(refContains(chapter, expectParsed("vachanamrut/gadhada-1/22#v3"))).toBe(false);
	expect(refContains(chapter, expectParsed("vachanamrut/gadhada-1"))).toBe(false);
	expect(refContains(chapter, expectParsed("shikshapatri/gadhada-1/21#v3"))).toBe(false);
});

test("a verse contains nothing but itself", () => {
	const verse = expectParsed("vachanamrut/gadhada-1/21#v3");
	expect(refContains(verse, verse)).toBe(true);
	expect(refContains(verse, expectParsed("vachanamrut/gadhada-1/21"))).toBe(false);
});

test("refs are compared by value", () => {
	expect(refsEqual(expectParsed("a/b#c"), bookRef("a", ["b"], "c"))).toBe(true);
	// A division and a verse that share a spelling are different addresses.
	expect(refsEqual(expectParsed("a/b/c"), expectParsed("a/b#c"))).toBe(false);
});
