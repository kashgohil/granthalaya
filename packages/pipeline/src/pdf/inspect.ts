/**
 * Read a PDF and write down what is measurably true about it (P1.1).
 *
 * This is the only file in the pipeline that touches MuPDF, and it deliberately draws no
 * conclusions: it reports text, fonts, images and page geometry, and `classify.ts` decides
 * what they mean. Keeping the two apart is what makes the classifier — the part that decides
 * whether a book gets OCR'd or trusted — testable without carrying a corpus of PDFs around.
 *
 * Nothing here throws. A PDF that is encrypted, truncated or not a PDF at all is a row in the
 * inventory saying so; a triage run over a folder must never die on its worst file.
 */
import * as mupdf from "mupdf";

/** How many pages to look at, however long the book is. */
export const DEFAULT_PAGE_SAMPLE = 12;

/** A font as the PDF declares it, not as it renders. */
export type PdfFont = {
	/** `BaseFont` with any subset prefix (`ABCDEF+`) stripped. */
	readonly name: string;
	/** The raw `BaseFont`, subset prefix intact — evidence that the font is embedded. */
	readonly rawName: string;
	/** `Type1`, `TrueType`, `Type0`, `Type3`, … */
	readonly subtype: string;
	/** A named encoding (`WinAnsiEncoding`, `Identity-H`), `Differences` for a custom one. */
	readonly encoding: string | null;
	/** A `ToUnicode` CMap: the PDF's own promise that its text extracts to real Unicode. */
	readonly hasToUnicode: boolean;
	/** A `FontFile`/`FontFile2`/`FontFile3` in the descriptor. */
	readonly embedded: boolean;
	/** True if any sampled page actually drew text with it. */
	readonly used: boolean;
};

export type PdfPageFacts = {
	/** 1-based, as a human would cite it. */
	readonly number: number;
	readonly widthPt: number;
	readonly heightPt: number;
	/** Everything the text layer yields, newline-joined per line. */
	readonly text: string;
	/** Fonts that drew text on this page, by the name structured text reports. */
	readonly fontNames: readonly string[];
	/** Share of the page covered by images, 0..1. Overlapping images are clamped, not summed. */
	readonly imageCoverage: number;
	/** Image XObjects drawn on this page. */
	readonly imageCount: number;
};

export type PdfFacts = {
	readonly ok: true;
	readonly pageCount: number;
	/** Pages actually inspected, spread across the book — see `samplePageIndices`. */
	readonly pages: readonly PdfPageFacts[];
	/** Every font declared by a sampled page, merged across pages. */
	readonly fonts: readonly PdfFont[];
	readonly title: string | null;
	readonly producer: string | null;
	readonly creator: string | null;
	readonly pdfVersion: string | null;
	/** MuPDF had to rebuild the cross-reference table — the file is damaged but readable. */
	readonly repaired: boolean;
};

export type PdfUnreadable = {
	readonly ok: false;
	/** `encrypted` is worth telling apart: it is a file we could read with a password. */
	readonly reason: "encrypted" | "unreadable";
	readonly detail: string;
};

export type PdfInspection = PdfFacts | PdfUnreadable;

/**
 * Which pages to look at. Spread evenly rather than taken from the front: front matter is
 * routinely typeset unlike the body — an English title page in a Gujarati book, a scanned
 * frontispiece in a text-layer one — so a prefix would misread the book more often than a
 * spread does. Deterministic, so two runs over the same corpus are comparable.
 */
export function samplePageIndices(pageCount: number, limit = DEFAULT_PAGE_SAMPLE): number[] {
	if (pageCount <= 0) {
		return [];
	}
	if (pageCount <= limit) {
		return Array.from({ length: pageCount }, (_, index) => index);
	}
	// Sample at the midpoint of `limit` equal slices: never the very first or last page, and
	// never the same page twice.
	const step = pageCount / limit;
	const indices = new Set<number>();
	for (let slice = 0; slice < limit; slice += 1) {
		indices.add(Math.min(pageCount - 1, Math.floor(step * (slice + 0.5))));
	}
	return [...indices].sort((a, b) => a - b);
}

/** Strip the six-letter subset tag PDF writers prepend to an embedded font's name. */
export function stripSubsetPrefix(name: string): string {
	return /^[A-Z]{6}\+/.test(name) ? name.slice(7) : name;
}

function nameOf(value: mupdf.PDFObject): string | null {
	if (value.isNull() || value.isIndirect()) {
		return value.isIndirect() ? nameOf(value.resolve()) : null;
	}
	if (value.isName() || value.isString()) {
		return String(value).replace(/^\//, "");
	}
	if (value.isDictionary()) {
		// An `Encoding` dictionary — what matters is that it remaps glyphs at all.
		return value.get("Differences").isNull() ? "Dictionary" : "Differences";
	}
	return null;
}

function readFont(dict: mupdf.PDFObject): PdfFont | null {
	const rawName = nameOf(dict.get("BaseFont")) ?? nameOf(dict.get("Name"));
	const subtype = nameOf(dict.get("Subtype")) ?? "unknown";
	if (rawName === null) {
		return null;
	}

	// A Type0 font keeps its descriptor one level down, on the descendant CIDFont.
	const descendants = dict.get("DescendantFonts");
	const descendant = descendants.isArray() && descendants.length > 0 ? descendants.get(0) : null;
	const descriptor = (descendant ?? dict).get("FontDescriptor");
	const embedded =
		!descriptor.isNull() &&
		["FontFile", "FontFile2", "FontFile3"].some((key) => !descriptor.get(key).isNull());

	return {
		name: stripSubsetPrefix(rawName),
		rawName,
		subtype,
		encoding: nameOf(dict.get("Encoding")),
		hasToUnicode: !dict.get("ToUnicode").isNull(),
		embedded,
		used: false,
	};
}

/**
 * Collect the fonts a page can reach. Descends into Form XObjects, which carry resource
 * dictionaries of their own — a book whose body text sits inside a form would otherwise
 * look like it had no fonts at all.
 */
function collectFonts(resources: mupdf.PDFObject, into: Map<string, PdfFont>, depth = 0): void {
	if (resources.isNull() || depth > 4) {
		return;
	}

	const fonts = resources.get("Font");
	if (fonts.isDictionary()) {
		fonts.forEach((value) => {
			const dict = value.isIndirect() ? value.resolve() : value;
			if (!dict.isDictionary()) {
				return;
			}
			const font = readFont(dict);
			if (font !== null && !into.has(font.rawName)) {
				into.set(font.rawName, font);
			}
		});
	}

	const xobjects = resources.get("XObject");
	if (xobjects.isDictionary()) {
		xobjects.forEach((value) => {
			const xobject = value.isIndirect() ? value.resolve() : value;
			if (xobject.isDictionary() && nameOf(xobject.get("Subtype")) === "Form") {
				collectFonts(xobject.get("Resources"), into, depth + 1);
			}
		});
	}
}

type StructuredBlock = {
	type: string;
	bbox: { x: number; y: number; w: number; h: number };
	lines?: { text: string; font?: { name?: string } }[];
};

function readPage(page: mupdf.PDFPage, index: number, fonts: Map<string, PdfFont>): PdfPageFacts {
	const [x0, y0, x1, y1] = page.getBounds();
	const widthPt = Math.abs(x1 - x0);
	const heightPt = Math.abs(y1 - y0);

	collectFonts(page.getObject().get("Resources"), fonts);

	// `preserve-images` is what makes image blocks show up at all; without it a scanned page
	// is indistinguishable from a blank one.
	const structured = page.toStructuredText("preserve-whitespace,preserve-images");
	let blocks: StructuredBlock[] = [];
	try {
		blocks = (JSON.parse(structured.asJSON()) as { blocks?: StructuredBlock[] }).blocks ?? [];
	} finally {
		structured.destroy();
	}

	const lines: string[] = [];
	const fontNames = new Set<string>();
	let imageArea = 0;
	let imageCount = 0;

	for (const block of blocks) {
		if (block.type === "image") {
			imageCount += 1;
			imageArea += Math.abs(block.bbox.w * block.bbox.h);
			continue;
		}
		for (const line of block.lines ?? []) {
			lines.push(line.text);
			const name = line.font?.name;
			if (name !== undefined && name !== "") {
				fontNames.add(name);
			}
		}
	}

	const pageArea = widthPt * heightPt;
	return {
		number: index + 1,
		widthPt,
		heightPt,
		text: lines.join("\n"),
		fontNames: [...fontNames],
		imageCoverage: pageArea > 0 ? Math.min(1, imageArea / pageArea) : 0,
		imageCount,
	};
}

function metaOf(doc: mupdf.PDFDocument, key: string): string | null {
	try {
		const value = doc.getMetaData(key);
		return value === undefined || value === "" ? null : value;
	} catch {
		return null;
	}
}

/** Inspect PDF bytes. Never throws — an unreadable file comes back as `ok: false`. */
export function inspectPdfBytes(bytes: Uint8Array, sample = DEFAULT_PAGE_SAMPLE): PdfInspection {
	let doc: mupdf.PDFDocument;
	try {
		doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as mupdf.PDFDocument;
	} catch (cause) {
		return { ok: false, reason: "unreadable", detail: messageOf(cause) };
	}

	try {
		if (doc.needsPassword()) {
			return { ok: false, reason: "encrypted", detail: "the file is password-protected" };
		}

		const pageCount = doc.countPages();
		const fonts = new Map<string, PdfFont>();
		const pages: PdfPageFacts[] = [];

		for (const index of samplePageIndices(pageCount, sample)) {
			const page = doc.loadPage(index) as mupdf.PDFPage;
			try {
				pages.push(readPage(page, index, fonts));
			} finally {
				page.destroy();
			}
		}

		// A font is "used" if any sampled page drew text with it. Structured text reports the
		// name with its subset prefix, the resource dictionary with or without — compare on the
		// stripped form so an embedded subset matches its own declaration.
		const drew = new Set(
			pages.flatMap((page) => page.fontNames.map((name) => stripSubsetPrefix(name))),
		);

		return {
			ok: true,
			pageCount,
			pages,
			fonts: [...fonts.values()].map((font) => ({ ...font, used: drew.has(font.name) })),
			title: metaOf(doc, "info:Title"),
			producer: metaOf(doc, "info:Producer"),
			creator: metaOf(doc, "info:Creator"),
			pdfVersion: metaOf(doc, "format"),
			repaired: doc.wasRepaired(),
		};
	} catch (cause) {
		return { ok: false, reason: "unreadable", detail: messageOf(cause) };
	} finally {
		doc.destroy();
	}
}

/** Inspect a PDF on disk. A missing or unreadable file is a report, not a crash. */
export async function inspectPdfFile(
	path: string,
	sample = DEFAULT_PAGE_SAMPLE,
): Promise<PdfInspection> {
	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
	} catch (cause) {
		return { ok: false, reason: "unreadable", detail: messageOf(cause) };
	}
	return inspectPdfBytes(bytes, sample);
}

function messageOf(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}
