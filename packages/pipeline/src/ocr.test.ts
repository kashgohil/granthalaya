import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SarvamClient, SarvamError } from "./ocr/sarvam.ts";
import {
	admittedScripts,
	CONFIRM_ABOVE_PAGES,
	OCR_MANIFEST_FILE,
	type OcrManifest,
	type OcrOptions,
	ocrBook,
	parseOcrArgs,
	partitionBlocks,
	renderPageMarkdown,
	runOcr,
} from "./ocr.ts";
import { GUJARATI_PAGES } from "./pdf/fixtures.ts";
import { MANIFEST_FILE, type PageManifest } from "./pdf/rasterize.ts";

const temps: string[] = [];

afterAll(async () => {
	await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A rendered book on disk, without going near a PDF. */
async function rendered(pageCount = 4): Promise<{ pagesDir: string; out: string }> {
	const dir = await mkdtemp(join(tmpdir(), "granthalaya-ocr-"));
	temps.push(dir);
	const pagesDir = join(dir, "pages");
	const manifest: PageManifest = {
		source: "book.pdf",
		sourceSha256: "abc123",
		sourceBytes: 1000,
		pageCount,
		dpi: 300,
		format: "png",
		color: "gray",
		pages: Array.from({ length: pageCount }, (_, index) => ({
			number: index + 1,
			file: `page-000${index + 1}.png`,
			widthPx: 100,
			heightPx: 100,
			bytes: 10,
		})),
	};
	for (const page of manifest.pages) {
		await Bun.write(join(pagesDir, page.file), new Uint8Array([1, 2, 3]));
	}
	await Bun.write(join(pagesDir, MANIFEST_FILE), JSON.stringify(manifest));
	return { pagesDir, out: join(dir, "ocr") };
}

function block(text: string, tag = "paragraph", readingOrder = 1) {
	return { id: `b${readingOrder}`, text, tag, readingOrder, bbox: [0, 0, 10, 10] as const };
}

/** A client that answers with real Gujarati blocks, or with whatever a test asks for. */
function fakeClient(
	blocks: (fileName: string) => ReturnType<typeof block>[] = () => [
		block(GUJARATI_PAGES[0] as string),
	],
	fail = false,
): SarvamClient {
	return {
		digitise: async (files: { name: string }[]) => {
			if (fail) {
				throw new SarvamError("Sarvam 500: boom", 500, true);
			}
			return {
				jobId: "job-1",
				status: "completed",
				usage: {
					pagesTotal: files.length,
					pagesProcessed: files.length,
					pagesSucceeded: files.length,
					pagesFailed: 0,
				},
				pages: files.map((file) => ({
					fileName: file.name,
					pageNumber: 1,
					widthPx: 1414,
					heightPx: 2110,
					blocks: blocks(file.name),
				})),
			};
		},
	} as unknown as SarvamClient;
}

function optionsFor(pagesDir: string, out: string, over: Partial<OcrOptions> = {}): OcrOptions {
	const parsed = parseOcrArgs([pagesDir, "--out", out]);
	if (!parsed.ok) {
		throw new Error(parsed.error);
	}
	return { ...parsed.options, ...over };
}

async function manifestIn(dir: string): Promise<OcrManifest> {
	return (await Bun.file(join(dir, OCR_MANIFEST_FILE)).json()) as OcrManifest;
}

// --- argument parsing ---------------------------------------------------------------------

test("reads a book in Gujarati as printed markdown by default", () => {
	const parsed = parseOcrArgs(["content/pages/some-book"]);
	if (!parsed.ok) {
		throw new Error(parsed.error);
	}
	expect(parsed.options.language).toBe("gu-IN");
	expect(parsed.options.contentType).toBe("printed");
	expect(parsed.options.out).toBe("content/ocr/some-book");
	expect(parsed.options.yes).toBe(false);
});

test("keeps the book's own directory name when defaulting the output", () => {
	const parsed = parseOcrArgs(["content/pages/some-book/"]);
	if (!parsed.ok) {
		throw new Error(parsed.error);
	}
	expect(parsed.options.out).toBe("content/ocr/some-book");
});

test("refuses arguments it cannot honour", () => {
	const error = (args: string[]): string => {
		const parsed = parseOcrArgs(args);
		if (parsed.ok) {
			throw new Error("expected a failure");
		}
		return parsed.error;
	};
	expect(error([])).toContain("needs the directory");
	expect(error(["a", "b"])).toContain("one book at a time");
	expect(error(["dir", "--content-type", "scribbled"])).toContain("--content-type");
	expect(error(["dir", "--pages", "nope"])).toContain("--pages");
	expect(error(["dir", "--rpm", "-1"])).toContain("--rpm");
	expect(error(["dir", "--wat"])).toContain("Unknown option");
});

// --- a run ---------------------------------------------------------------------------------

test("writes one file per page and a manifest", async () => {
	const { pagesDir, out } = await rendered();
	const result = await ocrBook(optionsFor(pagesDir, out), fakeClient());
	if (!result.ok) {
		throw new Error(result.error);
	}

	expect(result.done).toBe(4);
	expect(result.manifest.pages).toHaveLength(4);
	expect(result.manifest.pages[0]?.file).toBe("page-0001.md");
	expect(await Bun.file(join(out, "page-0001.md")).text()).toBe(`${GUJARATI_PAGES[0]}\n`);
	expect(await manifestIn(out)).toEqual(result.manifest);
});

test("carries the source hash through from the render manifest", async () => {
	// The chain of custody: this PDF → these images → this text. Without it, proofed text
	// cannot be tied back to the edition it came from.
	const { pagesDir, out } = await rendered();
	const result = await ocrBook(optionsFor(pagesDir, out), fakeClient());
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.manifest.sourceSha256).toBe("abc123");
	expect(result.manifest.source).toBe("book.pdf");
});

test("scores every page for orthography as it lands", async () => {
	// Not proof the right word was read, but proof no impossible word was — free, per page,
	// with no ground-truth transcript.
	const { pagesDir, out } = await rendered();
	const result = await ocrBook(optionsFor(pagesDir, out), fakeClient());
	if (!result.ok) {
		throw new Error(result.error);
	}
	const page = result.manifest.pages[0];
	expect(page?.script).toBe("gujr");
	expect(page?.orthography.ok).toBe(true);
	expect(page?.orthography.rate).toBe(0);
	expect(page?.orthography.examined).toBeGreaterThan(0);
});

test("flags a page that came back as impossible Gujarati", async () => {
	// The failure mode that matters: text that renders beautifully and cannot be read.
	const { pagesDir, out } = await rendered(1);
	const broken = "તો આખુું વરસ બબચારી ચાુંચ નનરાુંતે કહ્ુું આખુું નનરાુંતે બબચારી કહ્ુું";
	const result = await ocrBook(
		optionsFor(pagesDir, out),
		fakeClient(() => [block(broken)]),
	);
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.manifest.pages[0]?.orthography.ok).toBe(false);
	expect(result.manifest.pages[0]?.orthography.violations).toBeGreaterThan(0);
});

test("batches into jobs of ten", async () => {
	const { pagesDir, out } = await rendered(25);
	let jobs = 0;
	const client = {
		digitise: async (files: { name: string }[]) => {
			jobs += 1;
			expect(files.length).toBeLessThanOrEqual(10);
			return {
				jobId: `job-${jobs}`,
				status: "completed",
				usage: {
					pagesTotal: files.length,
					pagesProcessed: files.length,
					pagesSucceeded: files.length,
					pagesFailed: 0,
				},
				pages: files.map((f) => ({
					fileName: f.name,
					pageNumber: 1,
					content: GUJARATI_PAGES[0] as string,
				})),
			};
		},
	} as unknown as SarvamClient;

	const result = await ocrBook(optionsFor(pagesDir, out), client);
	expect(result.ok).toBe(true);
	expect(jobs).toBe(3);
});

test("keeps going when one batch fails", async () => {
	// One bad batch is ten pages, not a book.
	const { pagesDir, out } = await rendered(2);
	const result = await ocrBook(optionsFor(pagesDir, out), fakeClient(undefined, true));
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.manifest.failures).toHaveLength(2);
	expect(result.manifest.pages).toHaveLength(0);
});

test("records a page the job silently skipped", async () => {
	const { pagesDir, out } = await rendered(2);
	const client = fakeClient();
	const partial = {
		digitise: async (files: { name: string }[]) => {
			const full = await client.digitise(files as never);
			return { ...full, pages: full.pages.slice(0, 1) };
		},
	} as unknown as SarvamClient;

	const result = await ocrBook(optionsFor(pagesDir, out), partial);
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.manifest.pages).toHaveLength(1);
	expect(result.manifest.failures[0]?.error).toContain("no text");
});

test("reads only the pages asked for", async () => {
	const { pagesDir, out } = await rendered(6);
	const options = optionsFor(pagesDir, out, { pages: [{ from: 2, to: 3 }] });
	const result = await ocrBook(options, fakeClient());
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.manifest.pages.map((page) => page.number)).toEqual([2, 3]);
});

test("says so when the pages were never rendered", async () => {
	const dir = await mkdtemp(join(tmpdir(), "granthalaya-ocr-"));
	temps.push(dir);
	const result = await ocrBook(optionsFor(dir, join(dir, "out")), fakeClient());
	expect(result.ok).toBe(false);
	if (result.ok) {
		throw new Error("expected a failure");
	}
	expect(result.error).toContain("render");
});

// --- resuming -------------------------------------------------------------------------------

test("keeps pages an earlier run already read", async () => {
	// Every re-read costs money, so resuming is not just a convenience here.
	const { pagesDir, out } = await rendered();
	await ocrBook(optionsFor(pagesDir, out), fakeClient());
	const second = await ocrBook(optionsFor(pagesDir, out), fakeClient());
	if (!second.ok) {
		throw new Error(second.error);
	}
	expect(second.done).toBe(0);
	expect(second.reused).toBe(4);
});

test("re-reads everything when the images came from a different PDF", async () => {
	const { pagesDir, out } = await rendered();
	await ocrBook(optionsFor(pagesDir, out), fakeClient());

	const manifest = (await Bun.file(join(pagesDir, MANIFEST_FILE)).json()) as PageManifest;
	await Bun.write(
		join(pagesDir, MANIFEST_FILE),
		JSON.stringify({ ...manifest, sourceSha256: "different" }),
	);

	const result = await ocrBook(optionsFor(pagesDir, out), fakeClient());
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.done).toBe(4);
	expect(result.reused).toBe(0);
});

// --- the CLI, and the money ------------------------------------------------------------------

test("shows the plan and the cost without sending anything", async () => {
	const { pagesDir, out } = await rendered(20);
	const result = await runOcr([pagesDir, "--out", out, "--dry-run"], {
		makeClient: () => {
			throw new Error("should not have built a client");
		},
	});
	expect(result.ok).toBe(true);
	expect(result.text).toContain("20 pages selected");
	expect(result.text).toContain("₹10.00");
	expect(result.text).toContain("nothing was sent");
});

test("will not spend real money on a big run without being told twice", async () => {
	const { pagesDir, out } = await rendered(CONFIRM_ABOVE_PAGES + 1);
	const result = await runOcr([pagesDir, "--out", out], {
		apiKey: "k",
		makeClient: () => {
			throw new Error("should not have built a client");
		},
	});
	expect(result.ok).toBe(false);
	expect(result.text).toContain("--yes");
});

test("goes ahead on a big run once confirmed", async () => {
	const { pagesDir, out } = await rendered(CONFIRM_ABOVE_PAGES + 1);
	const result = await runOcr([pagesDir, "--out", out, "--yes"], {
		apiKey: "k",
		makeClient: () => fakeClient(),
	});
	expect(result.ok).toBe(true);
	expect(result.text).toContain("came back as Gujarati");
});

test("does not ask for confirmation on a small run", async () => {
	const { pagesDir, out } = await rendered(4);
	const result = await runOcr([pagesDir, "--out", out], {
		apiKey: "k",
		makeClient: () => fakeClient(),
	});
	expect(result.ok).toBe(true);
	expect(result.text).toContain("4 pages read");
});

test("explains how to get a key rather than failing obscurely", async () => {
	const { pagesDir, out } = await rendered(4);
	const result = await runOcr([pagesDir, "--out", out], { apiKey: "" });
	expect(result.ok).toBe(false);
	expect(result.text).toContain("SARVAM_API_KEY");
	expect(result.text).toContain("dashboard.sarvam.ai");
});

test("points at the worst pages so proofing starts where it should", async () => {
	const { pagesDir, out } = await rendered(2);
	const broken = "તો આખુું વરસ બબચારી ચાુંચ નનરાુંતે કહ્ુું આખુું નનરાુંતે";
	const result = await runOcr([pagesDir, "--out", out], {
		apiKey: "k",
		makeClient: () =>
			fakeClient((name) => [
				block(name === "page-0002.png" ? broken : (GUJARATI_PAGES[0] as string)),
			]),
	});
	expect(result.text).toContain("start proofing here");
	expect(result.text).toContain("page 2:");
});

test("says there is nothing to do rather than charging for it twice", async () => {
	const { pagesDir, out } = await rendered(4);
	await runOcr([pagesDir, "--out", out], { apiKey: "k", makeClient: () => fakeClient() });
	const second = await runOcr([pagesDir, "--out", out], {
		apiKey: "k",
		makeClient: () => {
			throw new Error("should not have built a client");
		},
	});
	expect(second.ok).toBe(true);
	expect(second.text).toContain("nothing to do");
});

// --- what belongs in the text, and what does not --------------------------------------------

test("keeps page furniture out of the body", async () => {
	// A running head repeated 442 times would otherwise end up inside 442 verses.
	const { body, notes, setAside } = partitionBlocks(
		[
			block("૫૬ ગોપાળાનંદસ્વામીની વાતો", "header", 1),
			block(GUJARATI_PAGES[0] as string, "paragraph", 2),
			block("૧. મૂળમાયા", "footer", 3),
		],
		"gujr",
	);
	expect(body.map((b) => b.tag)).toEqual(["paragraph"]);
	expect(notes.map((b) => b.tag)).toEqual(["footer"]);
	expect(setAside.map((b) => b.tag)).toEqual(["header"]);
});

test("sets aside a block that came back in the wrong script", async () => {
	// The hazard seen on the first real page: asked to read a decorative glyph, the model
	// answered with an English *description* of it, tagged `paragraph`, mid-page. Published
	// unchecked, that sentence becomes scripture.
	const description =
		"This image contains no text. It displays three identical black heart symbols with curly lines on top against a white background.";
	const { body, setAside } = partitionBlocks(
		[block(GUJARATI_PAGES[0] as string, "paragraph", 1), block(description, "paragraph", 2)],
		"gujr",
	);
	expect(body).toHaveLength(1);
	expect(setAside[0]?.text).toBe(description);
});

test("keeps a Devanagari shloka quoted inside a Gujarati discourse", async () => {
	// These pages carry Sanskrit inline, and it is scripture, not furniture — the book format
	// has admitted a verse quotation mid-discourse since P0.2. Setting it aside because it is
	// not Gujarati would quietly delete the quotation from the book.
	const shloka = "धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः";
	const { body, setAside } = partitionBlocks(
		[block(GUJARATI_PAGES[0] as string, "paragraph", 1), block(shloka, "paragraph", 2)],
		admittedScripts("gu-IN"),
	);
	expect(body).toHaveLength(2);
	expect(setAside).toHaveLength(0);
});

test("Latin is still the tripwire for a Gujarati book", async () => {
	const { body, setAside } = partitionBlocks(
		[block("This image contains no text.", "paragraph", 1)],
		admittedScripts("gu-IN"),
	);
	expect(body).toHaveLength(0);
	expect(setAside).toHaveLength(1);
});

test("admittedScripts pairs an Indic book with Devanagari, never with Latin", () => {
	expect(admittedScripts("gu-IN")).toEqual(["gujr", "deva"]);
	expect(admittedScripts("gu")).toEqual(["gujr", "deva"]);
	expect(admittedScripts("sa")).toEqual(["deva"]);
	expect(admittedScripts("en-GB")).toEqual(["latn"]);
	// A language we have not been told about admits everything: guessing would set aside the
	// whole book, which is a worse failure than admitting a stray block for a human to catch.
	expect(admittedScripts("xx")).toEqual([]);
});

test("records what it set aside rather than dropping it", async () => {
	// Nothing the API returned may vanish without a trace — a silent drop is indistinguishable
	// from text the OCR never saw.
	const { pagesDir, out } = await rendered(1);
	const result = await ocrBook(
		optionsFor(pagesDir, out),
		fakeClient(() => [
			block("૫૬ ગોપાળાનંદસ્વામીની વાતો", "header", 1),
			block(GUJARATI_PAGES[0] as string, "paragraph", 2),
		]),
	);
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.manifest.pages[0]?.setAside).toEqual([
		{ tag: "header", text: "૫૬ ગોપાળાનંદસ્વામીની વાતો" },
	]);
});

test("writes the blocks alongside the text", async () => {
	// Tags, reading order and coordinates are what P1.3's side-by-side proofing view and verse
	// segmentation both need; only keeping the joined text would throw them away.
	const { pagesDir, out } = await rendered(1);
	const result = await ocrBook(optionsFor(pagesDir, out), fakeClient());
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.manifest.pages[0]?.blocksFile).toBe("page-0001.blocks.json");

	const written = (await Bun.file(join(out, "page-0001.blocks.json")).json()) as {
		page: number;
		widthPx: number;
		blocks: { tag: string; bbox: number[] }[];
	};
	expect(written.page).toBe(1);
	expect(written.widthPx).toBe(1414);
	expect(written.blocks[0]?.bbox).toEqual([0, 0, 10, 10]);
});

test("puts notes below a rule instead of inside the discourse", async () => {
	const markdown = renderPageMarkdown(
		[block("શરીર", "paragraph", 1)],
		[block("૧. મૂળમાયા", "footer", 2)],
	);
	expect(markdown).toBe("શરીર\n\n---\n\n૧. મૂળમાયા\n");
	expect(renderPageMarkdown([block("શરીર", "paragraph", 1)], [])).toBe("શરીર\n");
});
