import { expect, test } from "bun:test";
import { bookVerses, hashVerse, validateBook } from "@granthalaya/core";
import type { Block } from "../ocr/sarvam.ts";
import type { OcrManifest } from "../ocr.ts";
import { admittedScripts } from "../ocr.ts";
import { assemblePackage, defaultMetadata, UNKNOWN } from "./package.ts";
import { type PageBlocks, segmentBook } from "./segment.ts";

let nextId = 0;
function block(text: string, tag = "paragraph"): Block {
	nextId += 1;
	return { id: `b${nextId}`, text, tag, readingOrder: nextId, bbox: [1, 2, 3, 4] };
}

function page(number: number, blocks: Block[]): PageBlocks {
	return { number, widthPx: 1414, heightPx: 2110, blocks };
}

const manifest: OcrManifest = {
	source: "Gopalanand Swami Ni Vato 26 Feb 2022.pdf",
	sourceSha256: "4b1936a7c2e5582041d5b0aaa66c85a4e14b5bf8bdd341a56e2142bf262020ab",
	engine: "sarvam-vision-v1",
	language: "gu-IN",
	contentType: "printed",
	pageCount: 442,
	pages: [],
	failures: [],
};

function assemble(pages: PageBlocks[], metadata = defaultMetadata("test-book")) {
	const segmented = segmentBook(pages, {
		script: "gujr",
		admitted: admittedScripts("gu-IN"),
	});
	return assemblePackage(
		segmented,
		manifest,
		metadata,
		pages.map((p) => p.number),
	);
}

const SAMPLE = [
	page(83, [
		block("INDEX\n\n૫૬ ગોપાળાનંદસ્વામીની વાતો", "header"),
		block("પહેલી વાત જે પૂરતી લાંબી છે એમ જાણવું. ॥૬૧॥"),
		block("॥ પુરુષોત્તમપણાની વાતો સમાપ્ત ॥"),
	]),
	page(84, [
		block("INDEX\n\n૫૭ ગોપાળાનંદસ્વામીની વાતો", "header"),
		block("મુક્તના ભેદની વાતો", "section-title"),
		block("બીજી વાત જે પૂરતી લાંબી છે એમ જાણવું. ॥૬૨॥"),
	]),
];

test("the package validates against the format it claims to be in", () => {
	const { book } = assemble(SAMPLE);
	const validation = validateBook(book);
	expect(validation.issues.filter((issue) => issue.severity === "error")).toEqual([]);
	expect(validation.ok).toBe(true);
});

test("a freshly assembled book is a draft, and says so structurally", () => {
	// The catalog serves only `published` packages, which is what makes P1.3's proofing gate a
	// property of the format rather than a step someone might skip.
	const { book } = assemble(SAMPLE);
	expect(book.contentStatus).toBe("draft");
});

test("verse ids come from the printed number", () => {
	// The edition's own identity for the passage: it survives re-extraction, and it is what a
	// reader would cite. Positional ids would move the moment a page was re-OCR'd.
	const { book } = assemble(SAMPLE);
	expect(bookVerses(book).map((visit) => visit.unit.id)).toEqual(["v61", "v62"]);
});

test("an unnumbered passage falls back to where it was found, and is not silently merged", () => {
	const { book, report } = assemble([page(9, [block("કોઈ ક્રમાંક વગરનું પૂરતું લાંબું લખાણ છે")])]);
	expect(bookVerses(book).map((visit) => visit.unit.id)).toEqual(["p9-1"]);
	expect(report.verses[0]?.flags).toContain("no-number");
});

test("the printed number is carried as display text, not as identity", () => {
	const { book } = assemble(SAMPLE);
	const [first] = bookVerses(book);
	expect(first?.unit.number).toBe("૬૧");
	// The hash covers the layers only, so correcting a misread number cannot orphan annotations.
	expect(first?.unit.hash).toBe(hashVerse(first?.unit.layers ?? {}));
});

test("divisions keep the title the edition printed", () => {
	const { book } = assemble(SAMPLE);
	expect(book.structure).toHaveLength(2);
	expect(book.structure[1]?.kind).toBe("section");
	expect((book.structure[1] as { title?: Record<string, string> }).title).toEqual({
		gu: "મુક્તના ભેદની વાતો",
	});
});

test("the package carries its own chain of custody", () => {
	// *This PDF* → *these images* → *this text* → *this package*. Proofed scripture that cannot
	// be tied back to the edition it came from is not publishable.
	const { book, report } = assemble(SAMPLE);
	expect(book.source.notes).toContain("Gopalanand Swami Ni Vato 26 Feb 2022.pdf");
	expect(book.source.notes).toContain(manifest.sourceSha256);
	expect(report.source.sha256).toBe(manifest.sourceSha256);
	expect(report.source.bookPageCount).toBe(442);
	expect(report.source.pagesAssembled).toEqual([83, 84]);
});

test("what only a human can know is named rather than invented", () => {
	const { book, report } = assemble(SAMPLE);
	expect(book.source.edition).toBe(UNKNOWN);
	expect(book.license.id).toBe(UNKNOWN);
	expect(report.needsHuman.join(" ")).toContain("source.edition");
	expect(report.needsHuman.join(" ")).toContain("license.id");
});

test("the running head is offered as evidence for the title, without the folio", () => {
	const { report } = assemble(SAMPLE);
	// `INDEX` is a button the PDF's viewer draws, not something the edition prints, and the
	// number changes every page — neither is evidence about what this book is called.
	expect(report.runningHeads[0]).toEqual({ text: "ગોપાળાનંદસ્વામીની વાતો", pages: 2 });
	expect(report.runningHeads.map((head) => head.text)).not.toContain("INDEX");
});

test("the report is a proofing queue: least confident first", () => {
	const { report } = assemble([
		page(1, [block("આ એક પૂરતું લાંબું અને સ્વચ્છ વાક્ય છે એમ જાણવું. ॥૧॥"), block("ટૂંકું")]),
	]);
	expect(report.verses[0]?.confidence).toBeLessThan(report.verses[1]?.confidence ?? 1);
});

test("every passage in the report can be found in the package by its ref", () => {
	// The ref is the only thing joining the two artefacts, so it has to resolve.
	const { book, report } = assemble(SAMPLE);
	const refs = new Set(
		bookVerses(book).map((visit) => `${book.id}/${visit.ref.path.join("/")}#${visit.ref.leaf}`),
	);
	for (const verse of report.verses) {
		expect(refs.has(verse.ref)).toBe(true);
	}
});

test("footnotes and set-aside blocks reach the report rather than the package", () => {
	const { book, report } = assemble([
		page(1, [
			block("INDEX", "header"),
			block("વાત જે પૂરતી લાંબી છે એમ જાણવું.૧ ॥૧॥"),
			block("૧.એક ટીકા", "footer"),
		]),
	]);
	expect(JSON.stringify(book)).not.toContain("એક ટીકા");
	expect(report.notes[0]?.text).toBe("૧.એક ટીકા");
	expect(report.setAside.map((entry) => entry.tag)).toEqual(["header"]);
	expect(report.verses[0]?.footnoteMarkers).toEqual([1]);
});

/**
 * The failure the first full run found.
 *
 * 442 pages produced an *invalid* package: the index at the back restarts its numbering more than
 * once inside one division, so a section ended up with several children called `v1`, which the
 * format forbids.
 *
 * Deciding which of them is really `૧` is a human's job, and the studio is where it happens.
 * Emitting a package nobody can open is not.
 */
test("two passages printing the same number still make a valid package", () => {
	const { book, report } = assemble([
		page(414, [
			block("પહેલી. ॥૧॥"),
			block("બીજી. ॥૨॥"),
			// The index restarts, exactly as pages 414–419 of the real book do.
			block("ફરીથી પહેલી. ॥૧॥"),
			block("ફરીથી બીજી. ॥૨॥"),
		]),
	]);

	expect(validateBook(book).ok).toBe(true);

	const ids = bookVerses(book).map((visit) => visit.unit.id);
	expect(ids).toEqual(["v1", "v2", "v1-2", "v2-2"]);
	// The suffix is an id, not a correction: each passage still carries what the page printed.
	expect(bookVerses(book).map((visit) => visit.unit.number)).toEqual(["૧", "૨", "૧", "૨"]);
	// And the collision is already flagged, so it sorts into the proofing queue to be settled.
	expect(report.verses.some((verse) => verse.flags.includes("duplicate-number"))).toBe(true);
});
