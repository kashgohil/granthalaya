import { expect, test } from "bun:test";
import { normalizeScriptureText } from "./normalize.ts";
import { checkOrthography } from "./orthography.ts";

const gujarati = { script: "gujr" } as const;

test("clean single-line text comes back untouched", () => {
	// The governing rule of this module: normalization is a no-op on text that is already right.
	const text = "અને વળી પોતે એમ વાત કરી જે, જે કશ્યપ તથા મરીચિ આદિક પ્રજાપતિ છે. ॥૬૧॥";
	const result = normalizeScriptureText(text, gujarati);
	expect(result.text).toBe(text);
	expect(result.changed).toBe(false);
	expect(result.repairs).toEqual([]);
	expect(result.linesJoined).toBe(0);
});

test("printed line breaks become flowing prose", () => {
	const result = normalizeScriptureText("જે કશ્યપ તથા\nમરીચિ આદિક\nપ્રજાપતિ છે.", gujarati);
	expect(result.text).toBe("જે કશ્યપ તથા મરીચિ આદિક પ્રજાપતિ છે.");
	expect(result.linesJoined).toBe(2);
	// Joins are counted, not listed: they happen on nearly every line.
	expect(result.repairs).toEqual([]);
});

test("verse form keeps the poet's line breaks", () => {
	const result = normalizeScriptureText("પહેલી લીટી\nબીજી લીટી", {
		...gujarati,
		joinLines: false,
	});
	expect(result.text).toBe("પહેલી લીટી\nબીજી લીટી");
});

test("a blank line is a real break and survives", () => {
	const result = normalizeScriptureText("પહેલો ફકરો\nચાલુ\n\nબીજો ફકરો", gujarati);
	expect(result.text).toBe("પહેલો ફકરો ચાલુ\nબીજો ફકરો");
});

test("a word split across two lines is put back together, and reported", () => {
	// From page 83 of the first real book: `વૈરાટ-` at a line end, `પુરુષમાં` on the next.
	const result = normalizeScriptureText("માટે જેટલો જીવ અને વૈરાટ-\nપુરુષમાં ભેદ છે", gujarati);
	expect(result.text).toBe("માટે જેટલો જીવ અને વૈરાટપુરુષમાં ભેદ છે");
	expect(result.repairs).toHaveLength(1);
	const [repair] = result.repairs;
	expect(repair?.kind).toBe("hyphen-join");
	expect(repair?.before).toBe("-");
	// The index points at the seam in the returned text — where the halves now meet.
	expect([...result.text].slice(repair?.at ?? 0, (repair?.at ?? 0) + 4).join("")).toBe("પુરુ");
});

test("a hyphen inside a line is the author's and is left alone", () => {
	// `લોક-ભોગ` and `ભક્તિ-ઉપાસના` are real compounds, not broken words.
	const text = "તથા લોક-ભોગ સંબંધી સુખ";
	const result = normalizeScriptureText(text, gujarati);
	expect(result.text).toBe(text);
	expect(result.repairs).toEqual([]);
});

test("verse lines are never merged across a hyphen", () => {
	const result = normalizeScriptureText("વૈરાટ-\nપુરુષમાં", {
		...gujarati,
		joinLines: false,
	});
	expect(result.text).toBe("વૈરાટ-\nપુરુષમાં");
});

test("control characters are stripped, because the format rejects them", () => {
	const result = normalizeScriptureText("ગોપાળાનંદસ્વામી", gujarati);
	expect(result.text).toBe("ગોપાળાનંદસ્વામી");
	expect(result.controlsRemoved).toBe(2);
});

test("a pre-base matra standing before its consonant is moved back", () => {
	// Visual order leaking through: the glyph for `િ` is printed to the *left* of the consonant
	// it actually follows, so a reading that never reorders emits it first. `નિરાંતે` — the word
	// the first real Gujarati PDF mangled — arrives as `િનરાંતે`.
	const result = normalizeScriptureText("િનરાંતે", gujarati);
	expect(result.text).toBe("નિરાંતે");
	expect(result.repairs[0]).toMatchObject({
		kind: "pre-base-matra-order",
		before: "િન",
		after: "નિ",
	});
	// The repair is only worth making if it turns impossible text into possible text.
	expect(checkOrthography("િનરાંતે", "gujr").ok).toBe(false);
	expect(checkOrthography(result.text, "gujr").ok).toBe(true);
});

test("a pre-base matra moves past the whole conjunct, not just its first consonant", () => {
	// `િ` + `સ્થ` is `સ્થિ`, never `સિ્થ` — putting it after the first consonant would produce
	// a virama-before-vowel-sign, which is exactly what orthography calls impossible.
	const result = normalizeScriptureText("િસ્થ", gujarati);
	expect(result.text).toBe("સ્થિ");
	expect(checkOrthography(result.text, "gujr").ok).toBe(true);
});

test("a correctly placed pre-base matra is never touched", () => {
	const text = "મરીચિ આદિક પ્રજાપતિ";
	expect(normalizeScriptureText(text, gujarati).text).toBe(text);
});

test("a footnote's superscript is taken off the word it sits on", () => {
	// From page 86: `માયાનું આવરણ૧ કાંઈ ન રહે`.
	const result = normalizeScriptureText("તેમ તેની દૃષ્ટિમાં માયાનું આવરણ૧ કાંઈ ન રહે", gujarati);
	expect(result.text).toBe("તેમ તેની દૃષ્ટિમાં માયાનું આવરણ કાંઈ ન રહે");
	expect(result.footnoteMarkers).toEqual([1]);
	expect(result.repairs[0]).toMatchObject({ kind: "footnote-marker", before: "૧", marker: 1 });
});

test("a footnote marker after a full stop is caught too", () => {
	// From page 84: `તે સર્વે મુક્તના ભેદ કહ્યા છે.૧ તેમાં...`
	const result = normalizeScriptureText("મુક્તના ભેદ કહ્યા છે.૧ તેમાં જે", gujarati);
	expect(result.text).toBe("મુક્તના ભેદ કહ્યા છે. તેમાં જે");
	expect(result.footnoteMarkers).toEqual([1]);
});

test("a verse number in dandas is not a footnote marker", () => {
	// `॥` is not a Gujarati letter, so the digits after it are never welded onto a word.
	const text = "તેમાં છે એમ જાણવું. ॥૬૧॥";
	const result = normalizeScriptureText(text, gujarati);
	expect(result.text).toBe(text);
	expect(result.footnoteMarkers).toEqual([]);
});

test("a numbered list marker in parentheses is not a footnote marker", () => {
	// From page 86: `રીત કહીએ છીએ : (૧) આ લોકનો મુક્ત`.
	const text = "રીત કહીએ છીએ : (૧) આ લોકનો મુક્ત";
	expect(normalizeScriptureText(text, gujarati).text).toBe(text);
});

test("a standalone number after a space is left alone", () => {
	// A year or a quantity is separated from the word before it; a marker never is.
	const text = "સંવત ૧૮૭૬ ના વર્ષમાં";
	const result = normalizeScriptureText(text, gujarati);
	expect(result.text).toBe(text);
	expect(result.footnoteMarkers).toEqual([]);
});

test("a long digit run welded to a word is not treated as a marker", () => {
	// Markers run to two digits; anything longer is a number the OCR ran together with a word,
	// which is a misreading for a human to fix rather than for the machine to delete.
	const text = "શબ્દ૧૮૭૬";
	expect(normalizeScriptureText(text, gujarati).text).toBe(text);
});

test("footnote stripping can be switched off", () => {
	const text = "માયાનું આવરણ૧ કાંઈ";
	const result = normalizeScriptureText(text, { ...gujarati, stripFootnoteMarkers: false });
	expect(result.text).toBe(text);
	expect(result.footnoteMarkers).toEqual([]);
});

test("every reported index points at the right place in the returned text", () => {
	const result = normalizeScriptureText("અને વૈરાટ-\nપુરુષ છે.૧ તથા આવરણ૨ કાંઈ", gujarati);
	const characters = [...result.text];
	for (const repair of result.repairs) {
		// A removal leaves the following text at its index; a reorder leaves its own result there.
		const expected = repair.after === "" ? "" : repair.after;
		if (expected !== "") {
			expect(characters.slice(repair.at, repair.at + [...expected].length).join("")).toBe(expected);
		}
		expect(repair.at).toBeLessThanOrEqual(characters.length);
	}
	expect(result.footnoteMarkers).toEqual([1, 2]);
});

test("normalized real prose stays orthographically clean", () => {
	const page = [
		"અને વળી પોતે એમ વાત કરી જે, જે કશ્યપ તથા",
		"મરીચિ આદિક પ્રજાપતિ છે, તે જ્યારે બ્રહ્માનું ધ્યાન કરે ત્યારે",
		"તે પ્રજાને સર્જવાને અર્થે સમર્થ થાય છે. માટે જેટલો જીવ અને વૈરાટ-",
		"પુરુષમાં ભેદ છે, તેટલો વૈરાટ અને પ્રધાનપુરુષમાં ભેદ છે. ॥૬૧॥",
	].join("\n");
	const result = normalizeScriptureText(page, gujarati);
	expect(result.text).toContain("વૈરાટપુરુષમાં");
	expect(result.text).not.toContain("\n");
	expect(checkOrthography(result.text, "gujr").ok).toBe(true);
});
