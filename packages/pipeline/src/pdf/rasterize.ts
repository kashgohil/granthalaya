/**
 * Render a PDF's pages to images, so they can be OCR'd and proofed against (P1.2).
 *
 * Triage decides *that* a book has to be OCR'd; this is the step that produces the only input
 * an OCR engine will ever see. The rule the whole content pipeline rests on — never trust a
 * Gujarati PDF's embedded text — means these images, not the file's own text layer, are the
 * source of truth for everything downstream. They are also what a human proofreads against in
 * P1.3, so they have to stay faithful to the page as published.
 *
 * Rendering a 442-page book is minutes of work and settings get tried more than once, so a run
 * is resumable: pages already on disk under the same settings are kept, and `force` re-renders.
 * The manifest is the contract with the OCR step — it pins the output to a specific source file
 * by content hash, so a swapped or re-downloaded PDF can never be silently OCR'd as the old one.
 */
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import * as mupdf from "mupdf";

/** 300 DPI is the floor every OCR engine's documentation asks for on printed text. */
export const DEFAULT_DPI = 300;
export const MIN_DPI = 72;
/** Past this a page image costs more than it can possibly tell an OCR engine. */
export const MAX_DPI = 1200;

/** Written into the output directory; P1.2's OCR step reads it rather than globbing. */
export const MANIFEST_FILE = "pages.json";

export type RenderFormat = "png" | "jpeg";
export type RenderColor = "gray" | "rgb";

export type RasterizeOptions = {
	readonly dpi: number;
	readonly format: RenderFormat;
	readonly color: RenderColor;
	/** JPEG only, 1..100. Ignored for PNG, which is lossless. */
	readonly quality: number;
	/**
	 * Which pages to render; `null` is the whole book. Carried as ranges rather than as page
	 * numbers because `300-` has no length until the book is open — resolving it any earlier
	 * means inventing a page count.
	 */
	readonly pages: readonly PageRange[] | null;
	/** Re-render pages already on disk instead of keeping them. */
	readonly force: boolean;
};

export const DEFAULT_RASTERIZE_OPTIONS: RasterizeOptions = {
	dpi: DEFAULT_DPI,
	format: "png",
	color: "gray",
	quality: 92,
	pages: null,
	force: false,
};

export type PageImage = {
	/** 1-based, as a human would cite it and as the file name spells it. */
	readonly number: number;
	/** File name, relative to the manifest beside it. */
	readonly file: string;
	readonly widthPx: number;
	readonly heightPx: number;
	readonly bytes: number;
};

export type PageFailure = {
	readonly number: number;
	readonly error: string;
};

/**
 * What a rendered book is. `sourceSha256` is the point of the whole record: it ties these
 * images, and every verse OCR'd out of them, to one exact file.
 */
export type PageManifest = {
	readonly source: string;
	readonly sourceSha256: string;
	readonly sourceBytes: number;
	/** Pages in the PDF, which is not the same as pages rendered when `pages` was given. */
	readonly pageCount: number;
	readonly dpi: number;
	readonly format: RenderFormat;
	readonly color: RenderColor;
	readonly pages: readonly PageImage[];
};

export type RasterizeOutcome =
	| {
			readonly ok: true;
			readonly manifest: PageManifest;
			readonly failures: readonly PageFailure[];
			/** Pages kept from an earlier run rather than rendered again. */
			readonly reused: number;
	  }
	| { readonly ok: false; readonly error: string };

// --- pure helpers -------------------------------------------------------------------------

/**
 * `page-0001.png`. Zero-padded to at least four digits so a directory listing, a glob and a
 * sort all agree on page order — the thing that goes wrong first when pages are named `1.png`.
 */
export function pageFileName(number: number, pageCount: number, format: RenderFormat): string {
	const width = Math.max(4, String(Math.max(pageCount, 1)).length);
	return `page-${String(number).padStart(width, "0")}.${format}`;
}

/** PDF user space is 72 units to the inch, so the render matrix is just the DPI ratio. */
export function renderScale(dpi: number): number {
	return dpi / 72;
}

export type PageRange = { readonly from: number; readonly to: number | null };

/**
 * Parse `--pages`: `12`, `1-40`, `300-` (to the end), or any of those comma-separated.
 * Pure, and deliberately separate from resolving against a real page count — the spec is known
 * before the PDF is opened. `null` means the spec is malformed.
 */
export function parsePageSpec(spec: string): PageRange[] | null {
	const ranges: PageRange[] = [];

	for (const part of spec.split(",")) {
		const piece = part.trim();
		if (piece === "") {
			return null;
		}
		const match = /^(\d+)(-)?(\d+)?$/.exec(piece);
		if (match === null) {
			return null;
		}
		const from = Number(match[1]);
		const open = match[2] === "-";
		const to = match[3] === undefined ? (open ? null : from) : Number(match[3]);
		if (from < 1 || (to !== null && to < from)) {
			return null;
		}
		ranges.push({ from, to });
	}

	return ranges.length === 0 ? null : ranges;
}

/** 1-based page numbers, sorted and de-duplicated, clamped to what the book actually has. */
export function resolvePageSpec(ranges: readonly PageRange[], pageCount: number): number[] {
	const numbers = new Set<number>();
	for (const range of ranges) {
		const last = Math.min(range.to ?? pageCount, pageCount);
		for (let number = range.from; number <= last; number += 1) {
			numbers.add(number);
		}
	}
	return [...numbers].sort((a, b) => a - b);
}

/** Whether an earlier run's output can be kept, or the settings have moved under it. */
export function manifestMatches(
	manifest: PageManifest,
	options: RasterizeOptions,
	sourceSha256: string,
): boolean {
	return (
		manifest.sourceSha256 === sourceSha256 &&
		manifest.dpi === options.dpi &&
		manifest.format === options.format &&
		manifest.color === options.color
	);
}

// --- rendering ----------------------------------------------------------------------------

function messageOf(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

async function readManifest(dir: string): Promise<PageManifest | null> {
	try {
		const file = Bun.file(join(dir, MANIFEST_FILE));
		return (await file.exists()) ? ((await file.json()) as PageManifest) : null;
	} catch {
		// A manifest we cannot parse is one we cannot trust; render from scratch.
		return null;
	}
}

function colorSpaceFor(color: RenderColor): mupdf.ColorSpace {
	return color === "gray" ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB;
}

function encode(pixmap: mupdf.Pixmap, options: RasterizeOptions): Uint8Array {
	return options.format === "png" ? pixmap.asPNG() : pixmap.asJPEG(options.quality, false);
}

/**
 * Render one page. Kept separate so the MuPDF objects it allocates are provably freed — a
 * 300 DPI pixmap is tens of megabytes, and a book is hundreds of them in a row.
 */
function renderPage(
	doc: mupdf.PDFDocument,
	index: number,
	options: RasterizeOptions,
): { bytes: Uint8Array; widthPx: number; heightPx: number } {
	const page = doc.loadPage(index) as mupdf.PDFPage;
	try {
		const scale = renderScale(options.dpi);
		// No alpha: an OCR engine wants ink on white, and a transparent background reads as
		// black once flattened. `showExtras: false` renders the page as published — a previous
		// reader's highlights are annotations, and they would end up in the scripture.
		const pixmap = page.toPixmap(
			mupdf.Matrix.scale(scale, scale),
			colorSpaceFor(options.color),
			false,
			false,
		);
		try {
			// Stamp the real resolution into the image so the OCR step and the proofing studio
			// can map a pixel box back to a point on the page without being told the DPI.
			pixmap.setResolution(options.dpi, options.dpi);
			return {
				bytes: encode(pixmap, options),
				widthPx: pixmap.getWidth(),
				heightPx: pixmap.getHeight(),
			};
		} finally {
			pixmap.destroy();
		}
	} finally {
		page.destroy();
	}
}

/**
 * Render `pdfPath`'s pages into `outDir` and write the manifest.
 *
 * Never throws: a page that fails to render is a row in `failures` and the rest of the book
 * still gets done. Losing 441 good pages to one malformed one is not a trade worth making.
 */
export async function rasterizePdf(
	pdfPath: string,
	outDir: string,
	options: RasterizeOptions = DEFAULT_RASTERIZE_OPTIONS,
	onProgress?: (number: number, done: number, total: number) => void,
): Promise<RasterizeOutcome> {
	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await Bun.file(pdfPath).arrayBuffer());
	} catch (cause) {
		return { ok: false, error: `cannot read ${pdfPath}: ${messageOf(cause)}` };
	}

	const sourceSha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

	let doc: mupdf.PDFDocument;
	try {
		doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as mupdf.PDFDocument;
	} catch (cause) {
		return { ok: false, error: `cannot open ${basename(pdfPath)}: ${messageOf(cause)}` };
	}

	try {
		if (doc.needsPassword()) {
			return { ok: false, error: `${basename(pdfPath)} is password-protected` };
		}

		const pageCount = doc.countPages();
		if (pageCount === 0) {
			return { ok: false, error: `${basename(pdfPath)} has no pages` };
		}

		const wanted =
			options.pages === null
				? Array.from({ length: pageCount }, (_, index) => index + 1)
				: resolvePageSpec(options.pages, pageCount);
		if (wanted.length === 0) {
			return { ok: false, error: `no pages in range — the book has ${pageCount}` };
		}

		await mkdir(outDir, { recursive: true });

		// Keep what an earlier run produced, but only if it was produced the same way. A manifest
		// from a different DPI or a different source file describes images that are no longer the
		// ones on disk, and half a book at 150 DPI mixed with half at 300 is worse than neither.
		const previous = await readManifest(outDir);
		const resumable =
			!options.force && previous !== null && manifestMatches(previous, options, sourceSha256);
		const kept = new Map<number, PageImage>();
		if (resumable && previous !== null) {
			for (const page of previous.pages) {
				if (await Bun.file(join(outDir, page.file)).exists()) {
					kept.set(page.number, page);
				}
			}
		}

		const rendered: PageImage[] = [];
		const failures: PageFailure[] = [];
		let reused = 0;

		for (const [done, number] of wanted.entries()) {
			onProgress?.(number, done, wanted.length);

			const existing = kept.get(number);
			if (existing !== undefined) {
				rendered.push(existing);
				reused += 1;
				continue;
			}

			const file = pageFileName(number, pageCount, options.format);
			try {
				const image = renderPage(doc, number - 1, options);
				await Bun.write(join(outDir, file), image.bytes);
				rendered.push({
					number,
					file,
					widthPx: image.widthPx,
					heightPx: image.heightPx,
					bytes: image.bytes.byteLength,
				});
			} catch (cause) {
				failures.push({ number, error: messageOf(cause) });
			}
		}

		// Pages this run did not touch stay in the manifest: rendering pages 1-40 today and
		// 41-80 tomorrow has to add up to a book, not replace one range with the other.
		const untouched = resumable && previous !== null ? previous.pages : [];
		const byNumber = new Map<number, PageImage>();
		for (const page of [...untouched, ...rendered]) {
			if (page.number <= pageCount && (await Bun.file(join(outDir, page.file)).exists())) {
				byNumber.set(page.number, page);
			}
		}

		const manifest: PageManifest = {
			source: basename(pdfPath),
			sourceSha256,
			sourceBytes: bytes.byteLength,
			pageCount,
			dpi: options.dpi,
			format: options.format,
			color: options.color,
			pages: [...byNumber.values()].sort((a, b) => a.number - b.number),
		};
		await Bun.write(join(outDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, "\t")}\n`);

		return { ok: true, manifest, failures, reused };
	} catch (cause) {
		return { ok: false, error: `${basename(pdfPath)}: ${messageOf(cause)}` };
	} finally {
		doc.destroy();
	}
}
