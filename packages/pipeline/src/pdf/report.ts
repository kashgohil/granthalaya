/**
 * Turn triage verdicts into the written inventory P1.1 asks for.
 *
 * Two renderings of one set of facts: markdown for the human who has to choose the first
 * book, and JSON for P1.2, which needs to know per file whether to read the text layer or
 * render pages for OCR. Pure — the command layer does the reading and writing.
 */

import type { Strategy, Triage } from "./classify.ts";
import type { PdfFont, PdfInspection } from "./inspect.ts";

/** One PDF's row in the inventory. Flattened so a report never carries page text around. */
export type InventoryEntry = {
	/** Path as the user gave it, or relative to the scanned directory. */
	readonly path: string;
	readonly bytes: number;
	readonly pageCount: number | null;
	readonly title: string | null;
	readonly producer: string | null;
	readonly fonts: readonly PdfFont[];
	readonly triage: Triage;
};

/** Flatten an inspection and its verdict into an inventory row. */
export function inventoryEntry(
	path: string,
	bytes: number,
	inspection: PdfInspection,
	triage: Triage,
): InventoryEntry {
	return {
		path,
		bytes,
		pageCount: inspection.ok ? inspection.pageCount : null,
		title: inspection.ok ? inspection.title : null,
		producer: inspection.ok ? inspection.producer : null,
		fonts: inspection.ok ? inspection.fonts : [],
		triage,
	};
}

/** What P1.2 should do with each strategy, in one line, for the report's legend. */
const STRATEGY_ACTION: Readonly<Record<Strategy, string>> = {
	"unicode-text": "extract the text layer directly",
	"legacy-text": "render pages to images and OCR — the text layer cannot be trusted",
	"broken-encoding":
		"render pages to images and OCR — the text layer is Unicode and corrupt, which is worse than legacy",
	scanned: "render pages to images and OCR",
	mixed: "split the book and decide per section",
	unknown: "inspect by hand before doing anything else",
};

export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export type InventorySummary = {
	readonly total: number;
	readonly byStrategy: Readonly<Record<Strategy, number>>;
	/** Files that will need OCR — the number that decides how much of P1.2 gets built. */
	readonly needingOcr: number;
};

export function summarize(entries: readonly InventoryEntry[]): InventorySummary {
	const byStrategy: Record<Strategy, number> = {
		"unicode-text": 0,
		"legacy-text": 0,
		"broken-encoding": 0,
		scanned: 0,
		mixed: 0,
		unknown: 0,
	};
	for (const entry of entries) {
		byStrategy[entry.triage.strategy] += 1;
	}
	return {
		total: entries.length,
		byStrategy,
		needingOcr: entries.filter((entry) => entry.triage.needsOcr).length,
	};
}

/**
 * Candidates for the first book, best first.
 *
 * P1.1 wants "the smallest trustworthy text", so the ranking is trustworthiness of the text
 * layer, then length. It cannot see whether a book is verse-structured — that is the part of
 * the choice a human still has to make, and the report says so rather than pretending.
 */
export function rankFirstBookCandidates(entries: readonly InventoryEntry[]): InventoryEntry[] {
	const rank: Readonly<Record<Strategy, number>> = {
		"unicode-text": 0,
		"legacy-text": 1,
		"broken-encoding": 2,
		scanned: 3,
		mixed: 4,
		unknown: 5,
	};
	const confidence = { high: 0, medium: 1, low: 2 } as const;

	return entries
		.filter((entry) => entry.triage.strategy !== "unknown")
		.sort((a, b) => {
			const byStrategy = rank[a.triage.strategy] - rank[b.triage.strategy];
			if (byStrategy !== 0) {
				return byStrategy;
			}
			const byConfidence = confidence[a.triage.confidence] - confidence[b.triage.confidence];
			if (byConfidence !== 0) {
				return byConfidence;
			}
			return (a.pageCount ?? Number.MAX_SAFE_INTEGER) - (b.pageCount ?? Number.MAX_SAFE_INTEGER);
		});
}

function escapeCell(value: string): string {
	return value.replaceAll("|", "\\|");
}

function plural(count: number, noun: string): string {
	return count === 1 ? noun : `${noun}s`;
}

/** Render the inventory as markdown — the document P1.1 is done when it exists. */
export function renderInventoryMarkdown(
	entries: readonly InventoryEntry[],
	options: { readonly root?: string; readonly generatedAt?: string } = {},
): string {
	const lines: string[] = ["# PDF inventory", ""];

	if (options.root !== undefined) {
		lines.push(`Source: \`${options.root}\``);
	}
	if (options.generatedAt !== undefined) {
		lines.push(`Generated: ${options.generatedAt} by \`granthalaya triage\``);
	}
	lines.push("");

	if (entries.length === 0) {
		lines.push("No PDFs found.", "");
		return lines.join("\n");
	}

	const summary = summarize(entries);
	lines.push(
		`${summary.total} file${summary.total === 1 ? "" : "s"}, ` +
			`${summary.needingOcr} needing OCR.`,
		"",
		"| File | Pages | Size | Strategy | Confidence | Script | OCR |",
		"|---|---:|---:|---|---|---|---|",
	);

	for (const entry of entries) {
		const cells = [
			`\`${escapeCell(entry.path)}\``,
			entry.pageCount ?? "—",
			formatBytes(entry.bytes),
			entry.triage.strategy,
			entry.triage.confidence,
			entry.triage.script ?? "—",
			entry.triage.needsOcr ? "**yes**" : "no",
		];
		lines.push(`| ${cells.join(" | ")} |`);
	}

	lines.push("", "## What each strategy means", "");
	for (const strategy of Object.keys(STRATEGY_ACTION) as Strategy[]) {
		if (summary.byStrategy[strategy] > 0) {
			lines.push(
				`- **${strategy}** (${summary.byStrategy[strategy]}) — ${STRATEGY_ACTION[strategy]}`,
			);
		}
	}

	const candidates = rankFirstBookCandidates(entries).slice(0, 5);
	if (candidates.length > 0) {
		lines.push(
			"",
			"## Candidates for the first book",
			"",
			"Ranked by how much the text layer can be trusted, then by length. Triage cannot",
			"see whether a book is verse-structured or whether we have the rights to it — that",
			"part of the choice is still yours.",
			"",
		);
		candidates.forEach((entry, index) => {
			const pages =
				entry.pageCount === null
					? "unknown length"
					: `${entry.pageCount} ${plural(entry.pageCount, "page")}`;
			lines.push(
				`${index + 1}. \`${entry.path}\` — ${entry.triage.strategy} ` +
					`(${entry.triage.confidence} confidence), ${pages}`,
			);
		});
	}

	lines.push("", "## Per-file detail", "");
	for (const entry of entries) {
		lines.push(`### \`${entry.path}\``, "");
		if (entry.title !== null) {
			lines.push(`- Title metadata: ${entry.title}`);
		}
		if (entry.producer !== null) {
			lines.push(`- Produced by: ${entry.producer}`);
		}
		lines.push(
			`- Verdict: **${entry.triage.strategy}** (${entry.triage.confidence} confidence) — ` +
				STRATEGY_ACTION[entry.triage.strategy],
		);
		for (const reason of entry.triage.reasons) {
			lines.push(`  - ${reason}`);
		}
		const used = entry.fonts.filter((font) => font.used);
		if (used.length > 0) {
			lines.push(
				`- Fonts in use: ${used
					.map(
						(font) =>
							`${font.name} (${font.subtype}${font.hasToUnicode ? ", ToUnicode" : ", no ToUnicode"}` +
							`${font.embedded ? ", embedded" : ""})`,
					)
					.join("; ")}`,
			);
		}
		lines.push("");
	}

	lines.push(
		"---",
		"",
		"Rights and source edition are **not** established by this report. Confirm both before",
		"publishing anything derived from these files.",
		"",
	);

	return lines.join("\n");
}

/** The same inventory as JSON, for P1.2 to drive extraction from. */
export function inventoryJson(
	entries: readonly InventoryEntry[],
	options: { readonly root?: string; readonly generatedAt?: string } = {},
): unknown {
	return {
		root: options.root ?? null,
		generatedAt: options.generatedAt ?? null,
		summary: summarize(entries),
		files: entries.map((entry) => ({
			path: entry.path,
			bytes: entry.bytes,
			pageCount: entry.pageCount,
			title: entry.title,
			producer: entry.producer,
			strategy: entry.triage.strategy,
			confidence: entry.triage.confidence,
			needsOcr: entry.triage.needsOcr,
			script: entry.triage.script,
			reasons: entry.triage.reasons,
			legacyFonts: entry.triage.legacyFonts,
			fonts: entry.fonts,
			pages: entry.triage.pages,
		})),
	};
}
