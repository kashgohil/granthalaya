import { expect, test } from "bun:test";
import {
	aksharaSpans,
	aksharas,
	countAksharas,
	firstAkshara,
	isAksharaBoundary,
	sliceAksharas,
	truncateAksharas,
} from "./akshara.ts";

/** Named rather than inlined: joiners are invisible in a diff. */
const ZWNJ = "‌";
const ZWJ = "‍";

test("a conjunct is one akshara, however many consonants it binds", () => {
	expect(aksharas("ક્ષ")).toEqual(["ક્ષ"]);
	expect(aksharas("સ્ત્રી")).toEqual(["સ્ત્રી"]);
	expect(countAksharas("શ્રી")).toBe(1);
});

test("marks stay with the letter they hang off, above and below", () => {
	expect(aksharas("કૈં")).toEqual(["કૈં"]);
	expect(aksharas("દૃષ્ટિ")).toEqual(["દૃ", "ષ્ટિ"]);
	// A reph binds forward: the `ર્` belongs to the consonant it precedes, not the one before.
	expect(aksharas("ભૂર્ભુવઃ")).toEqual(["ભૂ", "ર્ભુ", "વઃ"]);
});

test("a word-final halant stays with the consonant it kills", () => {
	expect(aksharas("પ્રચોદયાત્")).toEqual(["પ્ર", "ચો", "દ", "યા", "ત્"]);
});

test("Devanagari segments by the same rules", () => {
	expect(aksharas("तत्सवितुर्वरेण्यम्")).toEqual(["त", "त्स", "वि", "तु", "र्व", "रे", "ण्य", "म्"]);
});

test("a joiner decides whether the conjunct holds together", () => {
	// ZWJ asks for a half-form, which renders as one shape — no cut is safe inside it.
	expect(aksharas(`ક્${ZWJ}ષ`)).toEqual([`ક્${ZWJ}ષ`]);
	// ZWNJ asks for the dead-consonant form, which renders as two — so it is a boundary.
	expect(aksharas(`ક્${ZWNJ}ષ`)).toEqual([`ક્${ZWNJ}`, "ષ"]);
});

test("Latin combining marks are not letters of their own", () => {
	// ISO 15919 spells vocalic r as `r` plus a combining ring below; there is no precomposed
	// form, so a naive split would leave the ring stranded on the next letter.
	expect(aksharas("r̥ta")).toEqual(["r̥", "t", "a"]);
});

test("spaces and punctuation come back as their own units", () => {
	expect(aksharas("યો નઃ ॥")).toEqual(["યો", " ", "નઃ", " ", "॥"]);
});

test("segmentation covers the input exactly, with no gaps or overlaps", () => {
	for (const text of ["ધિયો યો નઃ પ્રચોદયાત્ ॥ ૪ ॥", "तत्सवितुर्वरेण्यम्", "Granthalaya 2026"]) {
		const spans = aksharaSpans(text);
		expect(spans.map((span) => span.text).join("")).toBe(text);
		let offset = 0;
		for (const span of spans) {
			expect(span.start).toBe(offset);
			expect(span.end).toBeGreaterThan(span.start);
			offset = span.end;
		}
		expect(offset).toBe(text.length);
	}
});

test("text sliced mid-akshara keeps its orphaned marks in one piece", () => {
	// What a naive `slice` hands us. It must not explode into one unit per invisible mark.
	expect(aksharas("્ર")).toEqual(["્ર"]);
	expect(aksharas("ૃ")).toEqual(["ૃ"]);
});

test("the empty string has no aksharas and no first one", () => {
	expect(aksharas("")).toEqual([]);
	expect(countAksharas("")).toBe(0);
	expect(firstAkshara("")).toBeUndefined();
});

test("the first akshara is the whole letter — what a first-letter prompt shows", () => {
	expect(firstAkshara("પ્રચોદયાત્")).toBe("પ્ર");
	expect(firstAkshara("શ્રીફળ")).toBe("શ્રી");
	expect(firstAkshara("ૐ ભૂર્ભુવઃ")).toBe("ૐ");
});

test("boundaries are reported only where a cut is safe", () => {
	const text = "ક્ષર";
	expect(isAksharaBoundary(text, 0)).toBe(true);
	expect(isAksharaBoundary(text, 1)).toBe(false); // inside ક્ષ
	expect(isAksharaBoundary(text, 2)).toBe(false);
	expect(isAksharaBoundary(text, 3)).toBe(true); // between ક્ષ and ર
	expect(isAksharaBoundary(text, 4)).toBe(true);
	expect(isAksharaBoundary(text, 5)).toBe(false);
	expect(isAksharaBoundary(text, -1)).toBe(false);
});

test("slicing counts aksharas, not code units", () => {
	const text = "પ્રચોદયાત્";
	expect(sliceAksharas(text, 0, 2)).toBe("પ્રચો");
	expect(sliceAksharas(text, 2)).toBe("દયાત્");
	expect(sliceAksharas(text, -1)).toBe("ત્");
	expect(sliceAksharas(text, 0, 99)).toBe(text);
	expect(sliceAksharas(text, 3, 1)).toBe("");
});

test("truncation never cuts a conjunct in half", () => {
	expect(truncateAksharas("પ્રચોદયાત્", 3)).toBe("પ્રચોદ…");
	expect(truncateAksharas("પ્રચોદયાત્", 5)).toBe("પ્રચોદયાત્");
	expect(truncateAksharas("પ્રચોદયાત્", 0)).toBe("");
	// The trailing space is dropped rather than left dangling before the ellipsis.
	expect(truncateAksharas("યો નઃ", 2)).toBe("યો…");
});
