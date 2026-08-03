import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateBook } from "@granthalaya/core";
import { ASSEMBLY_FILE, BOOK_FILE, parseAssembleArgs, runAssemble, slugify } from "./assemble.ts";
import type { Block } from "./ocr/sarvam.ts";
import { OCR_MANIFEST_FILE, type OcrManifest, type OcrPageResult } from "./ocr.ts";

const temps: string[] = [];

afterAll(async () => {
	await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "granthalaya-assemble-"));
	temps.push(dir);
	return dir;
}

let nextId = 0;
function block(text: string, tag = "paragraph"): Block {
	nextId += 1;
	return { id: `b${nextId}`, text, tag, readingOrder: nextId, bbox: [1, 2, 3, 4] };
}

/** Write an OCR output directory of the shape `ocr` produces. */
async function ocrDirectory(pages: { number: number; blocks: Block[] }[]): Promise<string> {
	const dir = await temp();
	const results: OcrPageResult[] = [];

	for (const page of pages) {
		const name = `page-${String(page.number).padStart(4, "0")}`;
		await Bun.write(
			join(dir, `${name}.blocks.json`),
			JSON.stringify({ page: page.number, widthPx: 1414, heightPx: 2110, blocks: page.blocks }),
		);
		results.push({
			number: page.number,
			file: `${name}.md`,
			blocksFile: `${name}.blocks.json`,
			chars: 0,
			blocks: page.blocks.length,
			setAside: [],
			script: "gujr",
			scriptShare: 1,
			orthography: { ok: true, violations: 0, examined: 100, rate: 0 },
		});
	}

	const manifest: OcrManifest = {
		source: "Test Book.pdf",
		sourceSha256: "a".repeat(64),
		engine: "sarvam-vision-v1",
		language: "gu-IN",
		contentType: "printed",
		pageCount: 442,
		pages: results,
		failures: [],
	};
	await Bun.write(join(dir, OCR_MANIFEST_FILE), JSON.stringify(manifest));
	return dir;
}

const BOOK = [
	{
		number: 83,
		blocks: [
			block("INDEX\n\n૫૬ ગોપાળાનંદસ્વામીની વાતો", "header"),
			block("પહેલી વાત જે પૂરતી લાંબી છે એમ જાણવું. ॥૬૧॥"),
		],
	},
	{
		number: 84,
		blocks: [
			block("INDEX\n\n૫૭ ગોપાળાનંદસ્વામીની વાતો", "header"),
			block("મુક્તના ભેદની વાતો", "section-title"),
			block("બીજી વાત જે પૂરતી લાંબી છે એમ જાણવું. ॥૬૨॥"),
		],
	},
];

// --- argument parsing -----------------------------------------------------------------------

test("the book id defaults to the OCR directory's name", () => {
	const parsed = parseAssembleArgs(["content/ocr/gopalanand-swami-ni-vato"]);
	expect(parsed.ok && parsed.options.bookId).toBe("gopalanand-swami-ni-vato");
	expect(parsed.ok && parsed.options.out).toBe("content/books/gopalanand-swami-ni-vato");
});

test("a trailing slash does not become part of the book id", () => {
	const parsed = parseAssembleArgs(["content/ocr/some-book/"]);
	expect(parsed.ok && parsed.options.bookId).toBe("some-book");
});

test("slugify closes the gap between a directory name and a legal ref segment", () => {
	// Refs end up in URLs, filenames and SQLite keys, so the segment grammar is narrow.
	expect(slugify("Gopalanand Swami Ni Vato 26 Feb 2022")).toBe(
		"gopalanand-swami-ni-vato-26-feb-2022",
	);
	expect(slugify("__weird--name__")).toBe("weird-name");
});

test("an id that is not a legal segment is refused rather than mangled", () => {
	const parsed = parseAssembleArgs(["dir", "--id", "Not A Segment"]);
	expect(parsed.ok).toBe(false);
});

test("unknown options and a missing directory are refused", () => {
	expect(parseAssembleArgs([]).ok).toBe(false);
	expect(parseAssembleArgs(["a", "b"]).ok).toBe(false);
	expect(parseAssembleArgs(["dir", "--nope"]).ok).toBe(false);
	expect(parseAssembleArgs(["dir", "--form", "sideways"]).ok).toBe(false);
});

// --- the run --------------------------------------------------------------------------------

test("writes a package and a report that validate and agree", async () => {
	const ocr = await ocrDirectory(BOOK);
	const out = await temp();
	const result = await runAssemble([ocr, "--id", "test-book", "--out", out]);

	expect(result.ok).toBe(true);
	const book = await Bun.file(join(out, BOOK_FILE)).json();
	expect(validateBook(book).ok).toBe(true);

	const report = await Bun.file(join(out, ASSEMBLY_FILE)).json();
	expect(report.counts.verses).toBe(2);
	expect(report.sequence).toMatchObject({ first: 61, last: 62, missing: [], duplicates: [] });
	expect(report.numbering.offset).toBe(27);
});

test("reports what the run found without needing the files read", async () => {
	const ocr = await ocrDirectory(BOOK);
	const result = await runAssemble([ocr, "--id", "test-book", "--out", await temp()]);
	expect(result.text).toContain("2 sections, 2 passages");
	expect(result.text).toContain("printed page numbers run 27 behind");
	expect(result.text).toContain("numbering runs 61–62");
	expect(result.text).toContain("validates as a draft package");
});

test("a gap in the printed numbering is called out, not smoothed over", async () => {
	// The verse-number sequence is the only checksum this stage has: a passage the OCR missed
	// entirely leaves no other trace.
	const ocr = await ocrDirectory([
		{
			number: 1,
			blocks: [block("એક વાત જે પૂરતી લાંબી છે. ॥૧॥"), block("ત્રણ વાત જે પૂરતી લાંબી છે. ॥૩॥")],
		},
	]);
	const result = await runAssemble([ocr, "--id", "test-book", "--out", await temp()]);
	expect(result.text).toContain("MISSING numbers: 2");
});

test("a page range assembles only those pages", async () => {
	const ocr = await ocrDirectory(BOOK);
	const out = await temp();
	await runAssemble([ocr, "--id", "test-book", "--out", out, "--pages", "84"]);
	const report = await Bun.file(join(out, ASSEMBLY_FILE)).json();
	expect(report.source.pagesAssembled).toEqual([84]);
	expect(report.counts.verses).toBe(1);
});

test("a metadata file supplies what no machine can know", async () => {
	const ocr = await ocrDirectory(BOOK);
	const out = await temp();
	const meta = join(await temp(), "meta.json");
	await Bun.write(
		meta,
		JSON.stringify({
			title: { gu: "ગોપાળાનંદસ્વામીની વાતો", en: "Talks of Gopalanand Swami" },
			source: { edition: "Swaminarayan Aksharpith, 2022", year: 2022 },
			license: { id: "proprietary", holder: "Swaminarayan Aksharpith" },
		}),
	);

	const result = await runAssemble([ocr, "--id", "test-book", "--out", out, "--meta", meta]);
	expect(result.ok).toBe(true);
	const book = await Bun.file(join(out, BOOK_FILE)).json();
	expect(book.title.gu).toBe("ગોપાળાનંદસ્વામીની વાતો");
	expect(book.source.edition).toBe("Swaminarayan Aksharpith, 2022");
	expect(book.license.id).toBe("proprietary");
	// Nothing left to ask a human for, so the warning goes away.
	expect(result.text).not.toContain("Only you can supply");
	// The chain of custody survives a supplied `source` block.
	expect(book.source.notes).toContain("Test Book.pdf");
});

test("refuses a directory that has not been OCR'd", async () => {
	const result = await runAssemble([await temp(), "--id", "test-book"]);
	expect(result.ok).toBe(false);
	expect(result.text).toContain("run `bun run ocr`");
});

test("refuses a metadata file that is not there", async () => {
	const ocr = await ocrDirectory(BOOK);
	const result = await runAssemble([ocr, "--id", "test-book", "--meta", "/nope/meta.json"]);
	expect(result.ok).toBe(false);
	expect(result.text).toContain("no such metadata file");
});

test("re-running is free and produces the same thing", async () => {
	// Segmentation rules get tuned against real pages, and tuning is only cheap if the loop is.
	const ocr = await ocrDirectory(BOOK);
	const out = await temp();
	await runAssemble([ocr, "--id", "test-book", "--out", out]);
	const first = await Bun.file(join(out, BOOK_FILE)).text();
	await runAssemble([ocr, "--id", "test-book", "--out", out]);
	expect(await Bun.file(join(out, BOOK_FILE)).text()).toBe(first);
});
