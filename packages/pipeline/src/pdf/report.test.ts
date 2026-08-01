import { expect, test } from "bun:test";
import type { Confidence, Strategy, Triage } from "./classify.ts";
import type { PdfFont } from "./inspect.ts";
import {
	formatBytes,
	type InventoryEntry,
	inventoryJson,
	rankFirstBookCandidates,
	renderInventoryMarkdown,
	summarize,
} from "./report.ts";

function entry(
	path: string,
	strategy: Strategy,
	over: {
		readonly pageCount?: number;
		readonly confidence?: Confidence;
		readonly reasons?: readonly string[];
		readonly fonts?: readonly PdfFont[];
		readonly bytes?: number;
	} = {},
): InventoryEntry {
	const triage: Triage = {
		strategy,
		confidence: over.confidence ?? "high",
		needsOcr: strategy !== "unicode-text",
		script: strategy === "unicode-text" ? "gujr" : null,
		reasons: over.reasons ?? ["because the test said so"],
		pages: [],
		legacyFonts: [],
	};
	return {
		path,
		bytes: over.bytes ?? 1024 * 1024,
		pageCount: over.pageCount ?? 100,
		title: null,
		producer: null,
		fonts: over.fonts ?? [],
		triage,
	};
}

test("formats sizes at a glance", () => {
	expect(formatBytes(512)).toBe("512 B");
	expect(formatBytes(1024)).toBe("1.0 KB");
	expect(formatBytes(1024 * 1024 * 3.5)).toBe("3.5 MB");
	expect(formatBytes(1024 * 1024 * 200)).toBe("200 MB");
});

test("counts the corpus by strategy and by how much of it needs OCR", () => {
	const summary = summarize([
		entry("a.pdf", "unicode-text"),
		entry("b.pdf", "legacy-text"),
		entry("c.pdf", "scanned"),
		entry("d.pdf", "scanned"),
	]);
	expect(summary.total).toBe(4);
	expect(summary.needingOcr).toBe(3);
	expect(summary.byStrategy).toMatchObject({ scanned: 2, "unicode-text": 1, "legacy-text": 1 });
});

test("ranks first-book candidates by trustworthiness, then confidence, then length", () => {
	const ranked = rankFirstBookCandidates([
		entry("scan.pdf", "scanned", { pageCount: 20 }),
		entry("long-unicode.pdf", "unicode-text", { pageCount: 900 }),
		entry("short-unicode.pdf", "unicode-text", { pageCount: 40 }),
		entry("shaky-unicode.pdf", "unicode-text", { pageCount: 10, confidence: "low" }),
		entry("legacy.pdf", "legacy-text", { pageCount: 12 }),
	]);
	expect(ranked.map((candidate) => candidate.path)).toEqual([
		"short-unicode.pdf",
		"long-unicode.pdf",
		"shaky-unicode.pdf",
		"legacy.pdf",
		"scan.pdf",
	]);
});

test("leaves files it could not read out of the candidate list", () => {
	// Recommending a file we failed to open as the first book would be worse than silence.
	const ranked = rankFirstBookCandidates([
		entry("broken.pdf", "unknown"),
		entry("good.pdf", "unicode-text"),
	]);
	expect(ranked.map((candidate) => candidate.path)).toEqual(["good.pdf"]);
});

test("renders an inventory a human can act on", () => {
	const markdown = renderInventoryMarkdown(
		[
			entry("gayatri.pdf", "unicode-text", { pageCount: 4 }),
			entry("vachanamrut.pdf", "legacy-text", {
				pageCount: 640,
				reasons: ["the text layer extracts as latn (100%)"],
				fonts: [
					{
						name: "ShreeGuj-0768",
						rawName: "ShreeGuj-0768",
						subtype: "TrueType",
						encoding: "WinAnsiEncoding",
						hasToUnicode: false,
						embedded: false,
						used: true,
					},
				],
			}),
		],
		{ root: "/books", generatedAt: "2026-08-01" },
	);

	expect(markdown).toContain("# PDF inventory");
	expect(markdown).toContain("Source: `/books`");
	expect(markdown).toContain("2 files, 1 needing OCR.");
	expect(markdown).toContain("| `gayatri.pdf` | 4 |");
	// The verdict has to say what to *do*, not just what was found.
	expect(markdown).toContain("render pages to images and OCR — the text layer cannot be trusted");
	expect(markdown).toContain("ShreeGuj-0768 (TrueType, no ToUnicode)");
	expect(markdown).toContain("Candidates for the first book");
	// Rights are the one thing triage cannot establish, and the report must not imply it did.
	expect(markdown).toContain("Rights and source edition are **not** established");
});

test("says so plainly when there is nothing to report", () => {
	expect(renderInventoryMarkdown([])).toContain("No PDFs found.");
});

test("escapes a pipe in a filename instead of breaking the table", () => {
	const markdown = renderInventoryMarkdown([entry("odd|name.pdf", "scanned")]);
	expect(markdown).toContain("odd\\|name.pdf");
});

test("only lists the strategies actually present in the legend", () => {
	const markdown = renderInventoryMarkdown([entry("a.pdf", "scanned")]);
	expect(markdown).toContain("**scanned**");
	expect(markdown).not.toContain("**mixed**");
});

test("emits JSON P1.2 can drive extraction from", () => {
	const json = inventoryJson([entry("a.pdf", "legacy-text", { pageCount: 12 })], {
		generatedAt: "2026-08-01",
	}) as {
		generatedAt: string;
		summary: { needingOcr: number };
		files: { path: string; strategy: string; needsOcr: boolean; pageCount: number }[];
	};

	expect(json.generatedAt).toBe("2026-08-01");
	expect(json.summary.needingOcr).toBe(1);
	expect(json.files[0]).toMatchObject({
		path: "a.pdf",
		strategy: "legacy-text",
		needsOcr: true,
		pageCount: 12,
	});
});
