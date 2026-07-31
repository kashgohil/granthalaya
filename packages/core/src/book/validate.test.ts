import { expect, test } from "bun:test";
import { gayatriMantra, sampleProse } from "../fixtures.ts";
import { hashVerse } from "./hash.ts";
import type { Book, BookUnit } from "./schema.ts";
import { findLayer } from "./schema.ts";
import { validateBook } from "./validate.ts";

/** A deep clone the tests can vandalise without leaking damage into the shared fixture. */
function mutable(book: Book): Book {
	return structuredClone(book);
}

function codes(book: unknown): string[] {
	return validateBook(book).issues.map((issue) => issue.code);
}

/** The chapter that holds the prose fixture's leaves. */
function chapterOf(book: Book): BookUnit[] {
	const section = book.structure[0];
	if (section === undefined || section.kind === "verse") {
		throw new Error("fixture shape changed");
	}
	const chapter = section.children[0];
	if (chapter === undefined || chapter.kind === "verse") {
		throw new Error("fixture shape changed");
	}
	return chapter.children;
}

test("both reference fixtures validate clean", () => {
	for (const book of [gayatriMantra, sampleProse]) {
		const result = validateBook(book);
		expect(result.issues).toEqual([]);
		expect(result.ok).toBe(true);
	}
});

test("a fixture survives a JSON round trip unchanged", () => {
	for (const book of [gayatriMantra, sampleProse]) {
		const roundTripped = validateBook(JSON.parse(JSON.stringify(book)));
		expect(roundTripped.ok).toBe(true);
		expect(roundTripped.book).toEqual(book);
	}
});

test("a non-object, or a book missing required fields, fails on the schema", () => {
	expect(codes(null)).toEqual(["schema"]);
	expect(codes({ formatVersion: 1 })).not.toHaveLength(0);
	expect(validateBook({ formatVersion: 1 }).book).toBeUndefined();
});

test("unknown keys are rejected rather than silently carried", () => {
	const book = mutable(gayatriMantra) as Book & { extra?: string };
	book.extra = "surprise";
	expect(validateBook(book).ok).toBe(false);
});

test("a verse using an undeclared layer is an error", () => {
	const book = mutable(gayatriMantra);
	const verse = book.structure[0];
	if (verse === undefined || verse.kind !== "verse") {
		throw new Error("fixture shape changed");
	}
	verse.layers.hi = "अनुवाद";
	verse.hash = hashVerse(verse.layers);
	expect(codes(book)).toContain("undeclared-layer");
});

test("a layer's value must match its declared kind", () => {
	const book = mutable(gayatriMantra);
	const verse = book.structure[0];
	if (verse === undefined || verse.kind !== "verse") {
		throw new Error("fixture shape changed");
	}
	// `words` is declared as wordMeanings, so a bare string is wrong.
	verse.layers.words = "our";
	verse.hash = hashVerse(verse.layers);
	expect(codes(book)).toContain("layer-kind-mismatch");
});

test("every verse must carry the primary layer", () => {
	const book = mutable(gayatriMantra);
	const verse = book.structure[0];
	if (verse === undefined || verse.kind !== "verse") {
		throw new Error("fixture shape changed");
	}
	delete verse.layers[book.primaryLayer];
	expect(codes(book)).toContain("primary-layer-missing");
});

test("the primary layer must itself be declared", () => {
	const book = mutable(gayatriMantra);
	book.primaryLayer = "nope";
	expect(codes(book)).toContain("primary-layer-undeclared");
});

test("an undeclared primary layer is reported once, not once per verse", () => {
	const book = mutable(sampleProse);
	book.primaryLayer = "nope";
	// Otherwise a one-character typo buries its own cause under one error per verse.
	expect(codes(book)).toEqual(["primary-layer-undeclared"]);
});

test("the primary layer must be an original, never an apparatus layer", () => {
	const book = mutable(sampleProse);
	// `en` is a declared translation, and every verse has one — so this is only caught
	// by checking the layer's kind.
	book.primaryLayer = "en";
	expect(codes(book)).toEqual(["primary-layer-not-original"]);
});

test("siblings may not share an id", () => {
	const book = mutable(sampleProse);
	const children = chapterOf(book);
	const first = children[0];
	const second = children[1];
	if (first === undefined || second === undefined) {
		throw new Error("fixture shape changed");
	}
	second.id = first.id;
	expect(codes(book)).toContain("duplicate-sibling-id");
});

test("the same id under different parents is fine — only the full ref must be unique", () => {
	const book = mutable(sampleProse);
	const children = chapterOf(book);
	const passage = children.find((unit) => unit.kind === "passage");
	const prose = children.find((unit) => unit.kind === "verse");
	if (passage === undefined || passage.kind === "verse" || prose === undefined) {
		throw new Error("fixture shape changed");
	}
	const nested = passage.children[0];
	if (nested === undefined) {
		throw new Error("fixture shape changed");
	}
	nested.id = prose.id;
	expect(validateBook(book).ok).toBe(true);
});

test("a stale recorded hash is caught", () => {
	const book = mutable(sampleProse);
	const verse = chapterOf(book)[0];
	if (verse === undefined || verse.kind !== "verse") {
		throw new Error("fixture shape changed");
	}
	verse.layers.gu = "સુધારેલું લખાણ.";
	expect(codes(book)).toContain("hash-mismatch");
});

test("a verse with no recorded hash is accepted — the field is optional", () => {
	const book = mutable(sampleProse);
	const verse = chapterOf(book)[0];
	if (verse === undefined || verse.kind !== "verse") {
		throw new Error("fixture shape changed");
	}
	verse.hash = undefined;
	expect(validateBook(book).ok).toBe(true);
});

test("an alias must not shadow a unit that still exists", () => {
	const book = mutable(sampleProse);
	book.aliases = { "sample-prose/khand-1/3#p1": "sample-prose/khand-1/3#p2" };
	expect(codes(book)).toContain("alias-source-live");
});

test("an alias target must resolve", () => {
	const book = mutable(sampleProse);
	book.aliases = { "sample-prose/khand-1/3#gone": "sample-prose/khand-1/3#nowhere" };
	expect(codes(book)).toContain("alias-target-missing");
});

test("an alias may point at a division — that is how a deletion is recorded", () => {
	const book = mutable(sampleProse);
	book.aliases = { "sample-prose/khand-1/3#gone": "sample-prose/khand-1/3" };
	expect(validateBook(book).ok).toBe(true);
});

test("an alias may point at the book itself, for content that left entirely", () => {
	const book = mutable(sampleProse);
	book.aliases = { "sample-prose/khand-9/1#v1": "sample-prose" };
	expect(validateBook(book).ok).toBe(true);
});

test("aliases into another book are rejected", () => {
	const book = mutable(sampleProse);
	book.aliases = { "other-book/1#v1": "sample-prose/khand-1/3#p1" };
	expect(codes(book)).toContain("alias-foreign-book");
});

test("an unparseable alias is reported, not thrown", () => {
	const book = mutable(sampleProse);
	book.aliases = { "Not A Ref": "sample-prose/khand-1/3#p1" };
	expect(codes(book)).toContain("alias-unparseable");
});

test("an empty division is rejected, which is what guarantees a book has verses", () => {
	const book = mutable(sampleProse);
	book.structure = [{ kind: "section", id: "empty", children: [] }];
	expect(validateBook(book).ok).toBe(false);
});

test("a missing transliteration scheme warns but does not block", () => {
	const book = mutable(gayatriMantra);
	const iso = findLayer(book, "iso");
	if (iso === undefined) {
		throw new Error("fixture shape changed");
	}
	iso.scheme = undefined;
	const result = validateBook(book);
	expect(result.issues.map((issue) => issue.code)).toContain("transliteration-scheme-missing");
	expect(result.ok).toBe(true);
});

test("layers keep the order the manifest declares them in", () => {
	// An array, not a map: JSON objects are unordered by spec, and a numeric layer id
	// would jump the queue even under JavaScript's key-order rules.
	expect(gayatriMantra.layers.map((layer) => layer.id)).toEqual(["gu", "iso", "en", "words"]);
	const reparsed = validateBook(JSON.parse(JSON.stringify(gayatriMantra))).book;
	expect(reparsed?.layers.map((layer) => layer.id)).toEqual(["gu", "iso", "en", "words"]);
});

test("the same layer id cannot be declared twice", () => {
	const book = mutable(gayatriMantra);
	const first = book.layers[0];
	const second = book.layers[1];
	if (first === undefined || second === undefined) {
		throw new Error("fixture shape changed");
	}
	second.id = first.id;
	expect(codes(book)).toContain("duplicate-layer-id");
});

test("issues carry a book ref so the studio can jump to the offending verse", () => {
	const book = mutable(sampleProse);
	const verse = chapterOf(book)[0];
	if (verse === undefined || verse.kind !== "verse") {
		throw new Error("fixture shape changed");
	}
	verse.layers.gu = "બદલાયેલું.";
	const issue = validateBook(book).issues.find((candidate) => candidate.code === "hash-mismatch");
	expect(issue?.path).toBe("sample-prose/khand-1/3#p1");
});
