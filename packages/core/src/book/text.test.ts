import { expect, test } from "bun:test";
import { gayatriMantra, sampleProse } from "../fixtures.ts";
import type { Book } from "./schema.ts";
import { ScriptureTextSchema, SingleLineTextSchema } from "./schema.ts";
import { validateBook } from "./validate.ts";

/** Named rather than inlined: control characters are invisible in a diff. */
const FORM_FEED = String.fromCharCode(0x0c);
const CARRIAGE_RETURN = String.fromCharCode(0x0d);
const TAB = String.fromCharCode(0x09);
const UNIT_SEPARATOR = String.fromCharCode(0x1f);
const DELETE = String.fromCharCode(0x7f);
const NEXT_LINE = String.fromCharCode(0x85);

const DEBRIS = [FORM_FEED, CARRIAGE_RETURN, TAB, UNIT_SEPARATOR, DELETE, NEXT_LINE];

test("scripture text rejects the control characters OCR leaves behind", () => {
	for (const character of DEBRIS) {
		expect(ScriptureTextSchema.safeParse(`લખાણ${character}વધુ`).success).toBe(false);
	}
});

test("scripture text keeps newlines — a verse may be laid out over several lines", () => {
	expect(ScriptureTextSchema.safeParse("પ્રથમ પંક્તિ\nબીજી પંક્તિ").success).toBe(true);
});

test("titles and labels allow no control characters at all, newline included", () => {
	expect(SingleLineTextSchema.safeParse("પ્રથમ ખંડ").success).toBe(true);
	expect(SingleLineTextSchema.safeParse("પ્રથમ\nખંડ").success).toBe(false);
	for (const character of DEBRIS) {
		expect(SingleLineTextSchema.safeParse(`ખંડ${character}`).success).toBe(false);
	}
});

test("ordinary Gujarati, Devanagari and Latin text passes untouched", () => {
	for (const text of [
		"ધિયો યો નઃ પ્રચોદયાત્ ॥",
		"तत्सवितुर्वरेण्यम्",
		"dhiyo yo naḥ pracodayāt",
		"— an em dash, “smart quotes”, and ૐ",
	]) {
		expect(ScriptureTextSchema.safeParse(text).success).toBe(true);
		expect(SingleLineTextSchema.safeParse(text).success).toBe(true);
	}
});

test("a verse carrying OCR debris fails validation rather than shipping", () => {
	const book: Book = structuredClone(sampleProse);
	const section = book.structure[0];
	if (section === undefined || section.kind === "verse") {
		throw new Error("fixture shape changed");
	}
	const chapter = section.children[0];
	if (chapter === undefined || chapter.kind === "verse") {
		throw new Error("fixture shape changed");
	}
	const verse = chapter.children[0];
	if (verse === undefined || verse.kind !== "verse") {
		throw new Error("fixture shape changed");
	}
	verse.layers.gu = `લખાણ${FORM_FEED}${CARRIAGE_RETURN}વધુ`;
	expect(validateBook(book).ok).toBe(false);
});

test("word glosses are held to the single-line rule too", () => {
	const book: Book = structuredClone(gayatriMantra);
	const verse = book.structure[0];
	if (verse === undefined || verse.kind !== "verse") {
		throw new Error("fixture shape changed");
	}
	verse.layers.words = [{ word: "નઃ", meaning: `our${CARRIAGE_RETURN}` }];
	expect(validateBook(book).ok).toBe(false);
});
