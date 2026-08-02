import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GUJARATI_PAGES } from "./fixtures.ts";
import {
	DEFAULT_RASTERIZE_OPTIONS,
	MANIFEST_FILE,
	manifestMatches,
	type PageManifest,
	pageFileName,
	parsePageSpec,
	type RasterizeOptions,
	rasterizePdf,
	renderScale,
	resolvePageSpec,
} from "./rasterize.ts";
import { unicodeTextPdf } from "./synthetic.ts";

const temps: string[] = [];

afterAll(async () => {
	await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function workspace(pages = GUJARATI_PAGES): Promise<{ pdf: string; out: string }> {
	const dir = await mkdtemp(join(tmpdir(), "granthalaya-render-"));
	temps.push(dir);
	const pdf = join(dir, "book.pdf");
	await Bun.write(pdf, unicodeTextPdf(pages));
	return { pdf, out: join(dir, "pages") };
}

/** 72 DPI keeps the tests quick; what is under test is the plumbing, not the resolution. */
function options(over: Partial<RasterizeOptions> = {}): RasterizeOptions {
	return { ...DEFAULT_RASTERIZE_OPTIONS, dpi: 72, ...over };
}

async function manifestIn(dir: string): Promise<PageManifest> {
	return (await Bun.file(join(dir, MANIFEST_FILE)).json()) as PageManifest;
}

async function magic(path: string, length: number): Promise<number[]> {
	return [...new Uint8Array(await Bun.file(path).arrayBuffer()).slice(0, length)];
}

// --- naming and geometry ------------------------------------------------------------------

test("pads page numbers so a sorted listing is in page order", () => {
	// The thing that goes wrong first when pages are named `1.png`: page 10 sorts before page 2.
	expect(pageFileName(1, 12, "png")).toBe("page-0001.png");
	expect(pageFileName(442, 442, "png")).toBe("page-0442.png");
	expect(pageFileName(7, 20000, "jpeg")).toBe("page-00007.jpeg");
});

test("scales the render matrix off 72 units to the inch", () => {
	expect(renderScale(72)).toBe(1);
	expect(renderScale(300)).toBeCloseTo(4.1667, 4);
});

// --- the page spec ------------------------------------------------------------------------

test("parses a page spec in every shape a human would type", () => {
	expect(parsePageSpec("12")).toEqual([{ from: 12, to: 12 }]);
	expect(parsePageSpec("1-40")).toEqual([{ from: 1, to: 40 }]);
	expect(parsePageSpec("300-")).toEqual([{ from: 300, to: null }]);
	expect(parsePageSpec("1-3, 9, 20-")).toEqual([
		{ from: 1, to: 3 },
		{ from: 9, to: 9 },
		{ from: 20, to: null },
	]);
});

test("refuses a page spec it cannot make sense of", () => {
	// Silently rendering the wrong pages would be discovered pages into a proofing session.
	for (const spec of ["", "0", "abc", "5-2", "-10", "1--4", "1,,2", "1.5"]) {
		expect(parsePageSpec(spec)).toBeNull();
	}
});

test("resolves a spec against the book, clamped and de-duplicated", () => {
	expect(resolvePageSpec([{ from: 1, to: 3 }], 10)).toEqual([1, 2, 3]);
	expect(resolvePageSpec([{ from: 8, to: null }], 10)).toEqual([8, 9, 10]);
	expect(resolvePageSpec([{ from: 5, to: 900 }], 6)).toEqual([5, 6]);
	expect(resolvePageSpec([{ from: 20, to: null }], 6)).toEqual([]);
	expect(
		resolvePageSpec(
			[
				{ from: 3, to: 5 },
				{ from: 4, to: 6 },
			],
			10,
		),
	).toEqual([3, 4, 5, 6]);
});

// --- rendering --------------------------------------------------------------------------

test("renders every page and writes a manifest beside them", async () => {
	const { pdf, out } = await workspace();
	const result = await rasterizePdf(pdf, out, options());
	if (!result.ok) {
		throw new Error(result.error);
	}

	expect(result.failures).toEqual([]);
	expect(result.manifest.pages).toHaveLength(GUJARATI_PAGES.length);
	expect(result.manifest.pageCount).toBe(GUJARATI_PAGES.length);

	const first = result.manifest.pages[0];
	expect(first?.file).toBe("page-0001.png");
	expect(first?.widthPx).toBe(595);
	expect(first?.heightPx).toBe(842);
	expect(first?.bytes).toBeGreaterThan(0);

	// PNG's magic number — the file is an image, not a stack trace written to the right name.
	expect(await magic(join(out, "page-0001.png"), 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
	expect(await manifestIn(out)).toEqual(result.manifest);
});

test("pins the images to one exact source file", async () => {
	// The whole point of the manifest. Verses OCR'd from these images are traceable to the file
	// they came out of, so a re-downloaded or swapped PDF cannot be silently OCR'd as the old one.
	const { pdf, out } = await workspace();
	const result = await rasterizePdf(pdf, out, options());
	if (!result.ok) {
		throw new Error(result.error);
	}

	const bytes = new Uint8Array(await Bun.file(pdf).arrayBuffer());
	expect(result.manifest.sourceSha256).toBe(
		new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
	);
	expect(result.manifest.sourceBytes).toBe(bytes.byteLength);
	expect(result.manifest.source).toBe("book.pdf");
});

test("renders more pixels at a higher DPI", async () => {
	const { pdf, out } = await workspace();
	const result = await rasterizePdf(pdf, out, options({ dpi: 144, pages: [{ from: 1, to: 1 }] }));
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.manifest.pages[0]?.widthPx).toBe(1190);
	expect(result.manifest.pages[0]?.heightPx).toBe(1684);
	expect(result.manifest.dpi).toBe(144);
});

test("writes JPEG when asked, and names the file for what it is", async () => {
	const { pdf, out } = await workspace();
	const result = await rasterizePdf(
		pdf,
		out,
		options({ format: "jpeg", pages: [{ from: 1, to: 1 }] }),
	);
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.manifest.pages[0]?.file).toBe("page-0001.jpeg");
	expect(await magic(join(out, "page-0001.jpeg"), 3)).toEqual([0xff, 0xd8, 0xff]);
});

test("renders in colour on request and greyscale by default", async () => {
	// Greyscale is the default because OCR engines binarize anyway and it is a third of the
	// bytes; colour exists for editions that print headings or Sanskrit quotations in red.
	const { pdf, out } = await workspace();
	const grey = await rasterizePdf(pdf, out, options({ pages: [{ from: 1, to: 1 }] }));
	const colour = await rasterizePdf(
		pdf,
		join(out, "rgb"),
		options({ pages: [{ from: 1, to: 1 }], color: "rgb" }),
	);
	if (!grey.ok || !colour.ok) {
		throw new Error("render failed");
	}
	expect(grey.manifest.color).toBe("gray");
	expect(colour.manifest.color).toBe("rgb");
	expect(colour.manifest.pages[0]?.bytes).toBeGreaterThan(grey.manifest.pages[0]?.bytes ?? 0);
});

test("renders only the pages asked for", async () => {
	const { pdf, out } = await workspace();
	const result = await rasterizePdf(pdf, out, options({ pages: [{ from: 2, to: 3 }] }));
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.manifest.pages.map((page) => page.number)).toEqual([2, 3]);
	expect(await Bun.file(join(out, "page-0001.png")).exists()).toBe(false);
});

// --- resuming ---------------------------------------------------------------------------

test("keeps what an earlier run rendered", async () => {
	// A 442-page book is minutes of rendering and settings get tried more than once.
	const { pdf, out } = await workspace();
	const first = await rasterizePdf(pdf, out, options());
	const second = await rasterizePdf(pdf, out, options());
	if (!first.ok || !second.ok) {
		throw new Error("render failed");
	}
	expect(first.reused).toBe(0);
	expect(second.reused).toBe(GUJARATI_PAGES.length);
	expect(second.manifest.pages).toEqual(first.manifest.pages);
});

test("adds a second page range to the first instead of replacing it", async () => {
	const { pdf, out } = await workspace();
	await rasterizePdf(pdf, out, options({ pages: [{ from: 1, to: 1 }] }));
	const result = await rasterizePdf(pdf, out, options({ pages: [{ from: 3, to: 3 }] }));
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.manifest.pages.map((page) => page.number)).toEqual([1, 3]);
});

test("re-renders everything when the settings moved under it", async () => {
	// Half a book at 150 DPI mixed with half at 300 is worse than neither.
	const { pdf, out } = await workspace();
	await rasterizePdf(pdf, out, options());
	const result = await rasterizePdf(pdf, out, options({ dpi: 96 }));
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.reused).toBe(0);
	// 595pt at 96 DPI is 793.3px, and the page rect is rounded outward rather than truncated —
	// a third of a pixel of ink is still ink.
	expect(result.manifest.pages[0]?.widthPx).toBe(794);
});

test("re-renders on force even when nothing changed", async () => {
	const { pdf, out } = await workspace();
	await rasterizePdf(pdf, out, options());
	const result = await rasterizePdf(pdf, out, options({ force: true }));
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.reused).toBe(0);
});

test("re-renders a page whose image was deleted underneath it", async () => {
	const { pdf, out } = await workspace();
	await rasterizePdf(pdf, out, options());
	await rm(join(out, "page-0002.png"));
	const result = await rasterizePdf(pdf, out, options());
	if (!result.ok) {
		throw new Error(result.error);
	}
	expect(result.reused).toBe(GUJARATI_PAGES.length - 1);
	expect(await Bun.file(join(out, "page-0002.png")).exists()).toBe(true);
});

test("decides a run is resumable only when the source is the same file", () => {
	const manifest: PageManifest = {
		source: "book.pdf",
		sourceSha256: "abc",
		sourceBytes: 10,
		pageCount: 4,
		dpi: 300,
		format: "png",
		color: "gray",
		pages: [],
	};
	const settings = options({ dpi: 300 });
	expect(manifestMatches(manifest, settings, "abc")).toBe(true);
	expect(manifestMatches(manifest, settings, "def")).toBe(false);
	expect(manifestMatches(manifest, options({ dpi: 150 }), "abc")).toBe(false);
	expect(manifestMatches(manifest, options({ dpi: 300, format: "jpeg" }), "abc")).toBe(false);
	expect(manifestMatches(manifest, options({ dpi: 300, color: "rgb" }), "abc")).toBe(false);
});

// --- files that will not render -----------------------------------------------------------

test("reports a file it cannot read rather than throwing", async () => {
	const result = await rasterizePdf("/nowhere/missing.pdf", "/tmp/unused", options());
	expect(result.ok).toBe(false);
});

test("reports a file that is not a PDF", async () => {
	const dir = await mkdtemp(join(tmpdir(), "granthalaya-render-"));
	temps.push(dir);
	const pdf = join(dir, "book.pdf");
	await Bun.write(pdf, "not a PDF");
	const result = await rasterizePdf(pdf, join(dir, "pages"), options());
	expect(result.ok).toBe(false);
});

test("says so when the page range misses the book entirely", async () => {
	const { pdf, out } = await workspace();
	const result = await rasterizePdf(pdf, out, options({ pages: [{ from: 900, to: null }] }));
	expect(result.ok).toBe(false);
	if (result.ok) {
		throw new Error("expected a failure");
	}
	expect(result.error).toContain("no pages in range");
});
