import { expect, test } from "bun:test";
import { profileScript, scriptOf, scriptShare } from "./script.ts";

function points(text: string): (string | null)[] {
	return [...text].map((character) => scriptOf(character.codePointAt(0) as number));
}

test("names the three scripts the book format admits", () => {
	expect(scriptOf(0x0a95)).toBe("gujr"); // ક
	expect(scriptOf(0x0915)).toBe("deva"); // क
	expect(scriptOf(0x0041)).toBe("latn"); // A
});

test("treats spaces, digits and punctuation as carrying no script", () => {
	const neutral = " \t\n0123456789.,;:!?()[]{}\"'-—…";
	expect(points(neutral)).toEqual(Array(neutral.length).fill(null) as (string | null)[]);
});

test("treats the danda as shared Indic punctuation, not as Devanagari", () => {
	// Unicode encodes it once, in the Devanagari block, but its script is Common and every
	// Gujarati verse ends with one. Counting it as `deva` would make each verse boundary a
	// vote against the script the page is written in.
	expect(scriptOf(0x0964)).toBe(null);
	expect(scriptOf(0x0965)).toBe(null);
});

test("counts Indic digits and matras as their own script", () => {
	// Verse numbering is written in Gujarati digits as often as ASCII ones, and a matra is
	// the strongest single piece of evidence that a run really is Gujarati.
	expect(scriptOf(0x0ae7)).toBe("gujr"); // ૧
	expect(scriptOf(0x0abe)).toBe("gujr"); // ા
	expect(scriptOf(0x0966)).toBe("deva"); // ०
});

test("counts transliteration diacritics toward Latin without double-counting them", () => {
	// ISO 15919 writes ṛṣi either precomposed or as letter + combining mark; both are one
	// Latin letter's worth of evidence, never two.
	expect(scriptOf(0x1e5b)).toBe("latn"); // ṛ precomposed
	expect(scriptOf(0x0323)).toBe(null); // combining dot below
	expect(profileScript("ṛṣi").total).toBe(3);
	expect(profileScript("ṛṣi").total).toBe(3);
});

test("files scripts we cannot read under `other`", () => {
	expect(scriptOf(0x4e00)).toBe("other"); // 一
	expect(scriptOf(0x0627)).toBe("other"); // ا
});

test("profiles a Gujarati verse as overwhelmingly Gujarati", () => {
	const profile = profileScript("ૐ ભૂર્ભુવઃ સ્વઃ । તત્સવિતુર્વરેણ્યં ॥ ૧ ॥");
	expect(profile.dominant).toBe("gujr");
	expect(profile.share).toBe(1);
	expect(profile.counts.latn).toBe(0);
});

test("profiles legacy-font extraction as Latin", () => {
	// What a non-Unicode Gujarati font actually yields when its text layer is extracted:
	// the glyphs are Gujarati, the code points are ASCII.
	const profile = profileScript("Ap[ NA[T> lJvg");
	expect(profile.dominant).toBe("latn");
	expect(profile.counts.gujr).toBe(0);
});

test("breaks an exact tie toward the rarer script, never toward Latin", () => {
	// A page split evenly between a verse and its transliteration is evidence of Gujarati;
	// reporting it as `latn` would send a perfectly good Unicode book to OCR.
	const profile = profileScript("ભગવાન bhagwan");
	expect(profile.counts).toEqual({ gujr: 5, deva: 0, latn: 7, other: 0 });
	expect(profile.dominant).toBe("latn");

	const even = profileScript("ભગવાન bhagw");
	expect(even.counts.gujr).toBe(5);
	expect(even.counts.latn).toBe(5);
	expect(even.dominant).toBe("gujr");
});

test("has nothing to say about text with no letters in it", () => {
	const profile = profileScript("123 — 456 …");
	expect(profile.total).toBe(0);
	expect(profile.dominant).toBe(null);
	expect(profile.share).toBe(0);
	expect(scriptShare("123", "gujr")).toBe(0);
});

test("scriptShare measures one script against the script-bearing characters only", () => {
	// Half the characters are spaces and digits; they must not halve the answer.
	expect(scriptShare("ક ખ 12", "gujr")).toBe(1);
	expect(scriptShare("કખab", "gujr")).toBe(0.5);
});
