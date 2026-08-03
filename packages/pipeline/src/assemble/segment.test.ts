import { expect, test } from "bun:test";
import type { Block } from "../ocr/sarvam.ts";
import { admittedScripts } from "../ocr.ts";
import { isSectionEndMarker, type PageBlocks, printedPageNumber, segmentBook } from "./segment.ts";

let nextId = 0;
function block(text: string, tag = "paragraph", readingOrder?: number): Block {
	nextId += 1;
	return {
		id: `b${nextId}`,
		text,
		tag,
		readingOrder: readingOrder ?? nextId,
		bbox: [0, 0, 100, 100],
	};
}

function page(number: number, blocks: Block[]): PageBlocks {
	return { number, widthPx: 1414, heightPx: 2110, blocks };
}

const options = { script: "gujr", admitted: admittedScripts("gu-IN") } as const;

const segment = (pages: PageBlocks[]) => segmentBook(pages, options);

/** Every verse across every section, flattened — most assertions do not care about the split. */
const allVerses = (pages: PageBlocks[]) => segment(pages).sections.flatMap((s) => s.verses);

test("a printed number in double dandas ends a passage", () => {
	const verses = allVerses([page(1, [block("પહેલી વાત છે. ॥૧॥"), block("બીજી વાત છે. ॥૨॥")])]);
	expect(verses.map((verse) => verse.number?.value)).toEqual([1, 2]);
	// The danda stays with the text and the number moves to its own field — how P0.2's fixtures
	// are written. The number is display only, so it must not reach the verse hash.
	expect(verses[0]?.text).toBe("પહેલી વાત છે. ॥");
	expect(verses[0]?.number?.text).toBe("૧");
});

test("one block can hold more than one passage", () => {
	// Not an assumption worth making: nothing guarantees the OCR breaks a block per passage.
	const verses = allVerses([page(1, [block("પહેલી. ॥૧॥ બીજી. ॥૨॥ ત્રીજી. ॥૩॥")])]);
	expect(verses.map((verse) => verse.number?.value)).toEqual([1, 2, 3]);
	expect(verses[1]?.text).toBe("બીજી. ॥");
});

test("a passage that runs across a page break is put back together", () => {
	// Page 84 of the first real book ends mid-sentence and page 85 finishes it.
	const verses = allVerses([
		page(84, [block("ચંદ્રમા જેવા મુક્ત છે તે તો જેમ ચંદ્રમા ઊગે ત્યારે તેનો")]),
		page(85, [block("પ્રકાશ ઢંકાઈ જાય પણ સૂઝે ખરું. ॥૬૩॥")]),
	]);
	expect(verses).toHaveLength(1);
	expect(verses[0]?.text).toBe(
		"ચંદ્રમા જેવા મુક્ત છે તે તો જેમ ચંદ્રમા ઊગે ત્યારે તેનો પ્રકાશ ઢંકાઈ જાય પણ સૂઝે ખરું. ॥",
	);
	expect(verses[0]?.pages).toEqual([84, 85]);
	expect(verses[0]?.flags).toContain("spans-pages");
});

test("a section-title block opens a division", () => {
	const result = segment([
		page(1, [block("પહેલી વાત. ॥૧॥")]),
		page(2, [block("મુક્તના ભેદની વાતો", "section-title"), block("બીજી વાત. ॥૨॥")]),
	]);
	expect(result.sections).toHaveLength(2);
	expect(result.sections[0]?.title).toBeNull();
	expect(result.sections[1]?.title).toBe("મુક્તના ભેદની વાતો");
	expect(result.sections[1]?.verses.map((v) => v.number?.value)).toEqual([2]);
});

test("a printed end marker closes a division", () => {
	const result = segment([
		page(1, [block("પહેલી વાત. ॥૧॥"), block("॥ પુરુષોત્તમપણાની વાતો સમાપ્ત ॥")]),
		page(2, [block("બીજી વાત. ॥૨॥")]),
	]);
	expect(result.sections).toHaveLength(2);
	expect(result.sections[0]?.endMarker).toBe("॥ પુરુષોત્તમપણાની વાતો સમાપ્ત ॥");
	// The marker is a boundary, not scripture — it must not become a passage of its own.
	expect(result.sections[0]?.verses).toHaveLength(1);
});

test("only a danda-wrapped completion line is an end marker", () => {
	expect(isSectionEndMarker("॥ પુરુષોત્તમપણાની વાતો સમાપ્ત ॥")).toBe(true);
	expect(isSectionEndMarker("॥ इति श्रीमद्भगवद्गीता ॥")).toBe(true);
	// A passage that merely mentions completion must not close the section it sits in.
	expect(isSectionEndMarker("એ વાત સમાપ્ત થઈ ત્યારે તે બોલ્યા. ॥૫॥")).toBe(false);
	expect(isSectionEndMarker("॥૬૧॥")).toBe(false);
});

test("the verse-number sequence is checked for gaps and repeats", () => {
	const result = segment([
		page(1, [block("એક. ॥૧॥"), block("બે. ॥૨॥"), block("ચાર. ॥૪॥"), block("ચાર ફરી. ॥૪॥")]),
	]);
	expect(result.sequence.first).toBe(1);
	expect(result.sequence.last).toBe(4);
	expect(result.sequence.missing).toEqual([3]);
	expect(result.sequence.duplicates).toEqual([4]);
	expect(result.sequence.outOfOrder).toEqual([4]);
});

test("a clean sequence reports nothing", () => {
	const result = segment([page(1, [block("એક. ॥૧॥"), block("બે. ॥૨॥"), block("ત્રણ. ॥૩॥")])]);
	expect(result.sequence).toMatchObject({
		first: 1,
		last: 3,
		numbered: 3,
		unnumbered: 0,
		missing: [],
		duplicates: [],
		outOfOrder: [],
	});
});

test("a passage with no printed number is kept and flagged, never dropped", () => {
	const verses = allVerses([page(1, [block("કોઈ ક્રમાંક વગરનું લખાણ જે અહીં અધૂરું રહે છે")])]);
	expect(verses).toHaveLength(1);
	expect(verses[0]?.number).toBeNull();
	expect(verses[0]?.flags).toContain("no-number");
	expect(verses[0]?.confidence).toBeLessThan(1);
});

test("the printed page number is read off the running head", () => {
	expect(printedPageNumber([block("INDEX\n\n૫૬ ગોપાળાનંદસ્વામીની વાતો", "header")], "gujr")).toBe(56);
	expect(printedPageNumber([block("મુક્તના ભેદની વાતો ૫૯", "header")], "gujr")).toBe(59);
	expect(printedPageNumber([block("INDEX", "header")], "gujr")).toBeNull();
	// A footnote's own label is not a folio, so `footer` is never consulted.
	expect(printedPageNumber([block("૧. મૂળમાયા", "footer")], "gujr")).toBeNull();
});

test("the gap between printed and PDF page numbers is reported as one offset", () => {
	const result = segment([
		page(83, [block("INDEX\n\n૫૬ ગોપાળાનંદસ્વામીની વાતો", "header"), block("વાત. ॥૧॥")]),
		page(85, [block("INDEX\n\n૫૮ ગોપાળાનંદસ્વામીની વાતો", "header"), block("વાત. ॥૨॥")]),
		page(86, [block("મુક્તના ભેદની વાતો ૫૯", "header"), block("વાત. ॥૩॥")]),
	]);
	expect(result.numbering.offset).toBe(27);
	expect(result.numbering.pagesWithPrintedNumber).toBe(3);
	expect(result.numbering.disagreements).toEqual([]);
});

test("one misread folio does not move the whole book", () => {
	const result = segment([
		page(83, [block("૫૬ શીર્ષક", "header"), block("વાત. ॥૧॥")]),
		page(84, [block("૫૭ શીર્ષક", "header"), block("વાત. ॥૨॥")]),
		page(85, [block("૯૯ શીર્ષક", "header"), block("વાત. ॥૩॥")]),
	]);
	expect(result.numbering.offset).toBe(27);
	expect(result.numbering.disagreements).toEqual([{ page: 85, printed: 99 }]);
});

test("footnotes are kept as content but never spliced into a passage", () => {
	const result = segment([
		page(1, [block("મુક્તના ભેદ કહ્યા છે.૧ ॥૧॥"), block("૧.અહીં મુક્તોમાં જે કહ્યું છે", "footer")]),
	]);
	const [verse] = result.sections[0]?.verses ?? [];
	expect(verse?.text).not.toContain("અહીં મુક્તોમાં");
	// The marker comes off the word, and is recorded so P1.4 can pair it with a human watching.
	expect(verse?.text).toContain("કહ્યા છે.");
	expect(verse?.footnoteMarkers).toEqual([1]);
	expect(result.notes).toHaveLength(1);
	expect(result.notes[0]?.text).toBe("૧.અહીં મુક્તોમાં જે કહ્યું છે");
});

test("page furniture and wrong-script blocks are recorded, not dropped", () => {
	const result = segment([
		page(1, [
			block("INDEX\n\n૫૬ શીર્ષક", "header"),
			block("This image contains no text. It displays three identical black heart symbols."),
			block("વાત. ॥૧॥"),
		]),
	]);
	expect(result.sections[0]?.verses).toHaveLength(1);
	expect(result.setAside.map((b) => b.tag)).toEqual(["header", "paragraph"]);
	expect(result.setAside[1]?.text).toContain("heart symbols");
});

test("a Devanagari quotation stays in the discourse, set apart and flagged", () => {
	const verses = allVerses([
		page(1, [
			block("અને પોતે એમ વાત કરી જે"),
			block("धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः"),
			block("એમ જાણવું. ॥૧॥"),
		]),
	]);
	expect(verses).toHaveLength(1);
	expect(verses[0]?.text).toContain("धर्मक्षेत्रे");
	expect(verses[0]?.flags).toContain("contains-quotation");
	// A blank line rather than a space, so the shloka is not run into the prose around it.
	expect(verses[0]?.text).toContain("\nधर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः\n");
});

test("two blocks on one page are two printed paragraphs", () => {
	// Page 90 of the first real book: વાત ૬૭ runs on, and the second block begins with a
	// first-line indent. The OCR split them because the typesetter did, so the break is real —
	// folding it into a space is what made a 4,900-character passage read as one wall of text.
	const verses = allVerses([
		page(90, [
			block("આવી રીતનાં લક્ષણ જણાય ત્યારે એમ જાણવું જે, આ અક્ષરધામનો મુક્ત છે."),
			block("આ જે સાત પ્રકારના મુક્તનાં લક્ષણ કહ્યાં, તે પ્રકટ ભગવાનના મળેલા. ॥૬૭॥"),
		]),
	]);
	expect(verses).toHaveLength(1);
	expect(verses[0]?.text).toBe(
		"આવી રીતનાં લક્ષણ જણાય ત્યારે એમ જાણવું જે, આ અક્ષરધામનો મુક્ત છે.\n" +
			"આ જે સાત પ્રકારના મુક્તનાં લક્ષણ કહ્યાં, તે પ્રકટ ભગવાનના મળેલા. ॥",
	);
});

test("a block boundary across a page is a paragraph carrying on, not a new one", () => {
	// The other half of the rule above, and the reason it is not simply "every block boundary".
	// A paragraph continuing is the ordinary way a passage spans two pages; the only printed
	// signal for a new one at the top of a page is the indent, which block boxes cannot see.
	const verses = allVerses([
		page(84, [block("ચંદ્રમા જેવા મુક્ત છે તે તો જેમ ચંદ્રમા ઊગે ત્યારે તેનો")]),
		page(85, [block("પ્રકાશ ઢંકાઈ જાય પણ સૂઝે ખરું. ॥૬૩॥")]),
	]);
	expect(verses[0]?.text).not.toContain("\n");
	expect(verses[0]?.flags).toContain("spans-pages");
});

test("every passage carries the boxes its text came from", () => {
	// P1.3's side-by-side view has to map a line back onto the page image a human is looking at.
	const verses = allVerses([page(7, [block("વાત. ॥૧॥")])]);
	expect(verses[0]?.blocks).toEqual([
		{
			page: 7,
			printedPage: null,
			blockId: expect.any(String),
			tag: "paragraph",
			bbox: [0, 0, 100, 100],
		},
	]);
});

test("confidence falls as flags accumulate, and orders the proofing queue", () => {
	const clean = allVerses([page(1, [block("આ એક પૂરતું લાંબું વાક્ય છે જે સ્વચ્છ ગણાય. ॥૧॥")])]);
	expect(clean[0]?.flags).toEqual([]);
	expect(clean[0]?.confidence).toBe(1);

	const messy = allVerses([page(1, [block("ટૂંકું")])]);
	expect(messy[0]?.confidence).toBeLessThan(clean[0]?.confidence ?? 0);
	expect(messy[0]?.flags).toEqual(expect.arrayContaining(["no-number", "very-short"]));
});

test("an empty book segments to nothing rather than throwing", () => {
	const result = segment([page(1, [])]);
	expect(result.sections).toEqual([]);
	expect(result.sequence.numbered).toBe(0);
});
