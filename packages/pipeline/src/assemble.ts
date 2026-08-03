/**
 * `granthalaya assemble <ocr-dir>` — turn a book's OCR into a draft package (P1.2).
 *
 * The last step of the extraction pipeline and the first input to the proofing studio. It reads
 * what `ocr` wrote, finds the book's structure in what the pages themselves print, normalizes
 * the text away from the typesetting, and emits two files: the P0.2 package, and the assembly
 * report that says where every passage came from and how much to trust it.
 *
 * It spends no money and calls nothing. Re-running it is free, which is the point: the
 * segmentation rules will be tuned against real pages, and tuning is only cheap if the loop is.
 */

import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { formatIssue, isSegment, type VerseForm, validateBook } from "@granthalaya/core";
import { assemblePackage, type BookMetadata, defaultMetadata } from "./assemble/package.ts";
import { readOcrOutput } from "./assemble/read.ts";
import { segmentBook } from "./assemble/segment.ts";
import { admittedScripts } from "./ocr.ts";
import { type PageRange, parsePageSpec, resolvePageSpec } from "./pdf/rasterize.ts";

/** Where a draft package goes when `--out` is not given. */
export const DEFAULT_BOOKS_ROOT = "content/books";
export const BOOK_FILE = "book.json";
export const ASSEMBLY_FILE = "assembly.json";

export type AssembleOptions = {
	/** The directory `ocr` wrote — per-page blocks plus `ocr.json`. */
	readonly ocrDir: string;
	readonly out: string;
	readonly bookId: string;
	readonly title: string | null;
	readonly language: string;
	readonly form: VerseForm;
	readonly pages: readonly PageRange[] | null;
	/** JSON file supplying the manifest fields no machine can know. */
	readonly meta: string | null;
};

export type AssembleArgs =
	| { readonly ok: true; readonly options: AssembleOptions }
	| { readonly ok: false; readonly error: string };

export const ASSEMBLE_USAGE = [
	"Usage: granthalaya assemble <ocr-dir> [options]",
	"",
	"  Find a book's structure in its OCR'd pages and write a draft package: the printed",
	"  numbers become passages, the printed headings and end markers become divisions, and",
	"  every decision is recorded with the page and the box it came from.",
	"",
	"  Writes book.json (the P0.2 package) and assembly.json (the proofing queue).",
	"",
	"Options:",
	`  --out <dir>          where to write (default ${DEFAULT_BOOKS_ROOT}/<book-id>)`,
	"  --id <segment>       book id (default: the OCR directory's name, slugified)",
	"  --title <text>       the book's title as printed",
	"  --language <tag>     BCP-47 language (default gu)",
	"  --form <kind>        verse or prose (default prose — folds printed line breaks away)",
	"  --pages <spec>       which pages: 12, 1-40, 300-, or a comma-separated mix",
	"  --meta <file>        JSON supplying source edition, licence and title",
].join("\n");

/**
 * Turn a directory name into a legal book id.
 *
 * Refs end up in URLs, filenames and SQLite keys, so the segment grammar is narrow; a
 * directory name is not, and the difference has to be closed somewhere.
 */
export function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Parse `assemble`'s arguments. Pure: no `process`, no I/O. */
export function parseAssembleArgs(args: readonly string[]): AssembleArgs {
	const positional: string[] = [];
	let out: string | null = null;
	let bookId: string | null = null;
	let title: string | null = null;
	let language = "gu";
	let form: VerseForm = "prose";
	let pages: readonly PageRange[] | null = null;
	let meta: string | null = null;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index] as string;
		const takeValue = (): string | null => {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("--")) {
				return null;
			}
			index += 1;
			return value;
		};

		if (arg === "--out") {
			const value = takeValue();
			if (value === null) {
				return { ok: false, error: "--out needs a directory" };
			}
			out = value;
		} else if (arg === "--id") {
			const value = takeValue();
			if (value === null || !isSegment(value)) {
				return { ok: false, error: "--id needs a lowercase kebab-case book id" };
			}
			bookId = value;
		} else if (arg === "--title") {
			const value = takeValue();
			if (value === null) {
				return { ok: false, error: "--title needs the book's title" };
			}
			title = value;
		} else if (arg === "--language") {
			const value = takeValue();
			if (value === null) {
				return { ok: false, error: "--language needs a BCP-47 tag, e.g. gu" };
			}
			language = value;
		} else if (arg === "--form") {
			const value = takeValue();
			if (value !== "verse" && value !== "prose") {
				return { ok: false, error: "--form needs verse or prose" };
			}
			form = value;
		} else if (arg === "--pages") {
			const value = takeValue();
			const parsed = value === null ? null : parsePageSpec(value);
			if (parsed === null) {
				return { ok: false, error: "--pages needs something like 12, 1-40, 300- or 1-3,9" };
			}
			pages = parsed;
		} else if (arg === "--meta") {
			const value = takeValue();
			if (value === null) {
				return { ok: false, error: "--meta needs a JSON file" };
			}
			meta = value;
		} else if (arg.startsWith("--")) {
			return { ok: false, error: `Unknown option: ${arg}` };
		} else {
			positional.push(arg);
		}
	}

	if (positional.length === 0) {
		return { ok: false, error: "assemble needs the directory that `ocr` wrote" };
	}
	if (positional.length > 1) {
		return { ok: false, error: "assemble takes one book at a time" };
	}

	const ocrDir = positional[0] as string;
	const id = bookId ?? slugify(basename(ocrDir.replace(/\/+$/, "")));
	if (!isSegment(id)) {
		return {
			ok: false,
			error: `cannot make a book id out of "${ocrDir}" — pass --id`,
		};
	}

	return {
		ok: true,
		options: {
			ocrDir,
			out: out ?? join(DEFAULT_BOOKS_ROOT, id),
			bookId: id,
			title,
			language,
			form,
			pages,
			meta,
		},
	};
}

/** Merge a `--meta` file over the defaults. Only the fields a human actually supplies. */
export function mergeMetadata(
	base: BookMetadata,
	overrides: Partial<BookMetadata> | null,
	title: string | null,
	language: string,
): BookMetadata {
	const merged: BookMetadata = {
		...base,
		...overrides,
		source: { ...base.source, ...overrides?.source },
		license: { ...base.license, ...overrides?.license },
		title: overrides?.title ?? (title === null ? base.title : { [language]: title }),
	};
	return merged;
}

export type AssembleOutcome =
	| {
			readonly ok: true;
			readonly text: string;
	  }
	| { readonly ok: false; readonly text: string };

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Drive an assembly run. Returns what the CLI should print and whether it succeeded. */
export async function runAssemble(args: readonly string[]): Promise<AssembleOutcome> {
	const parsed = parseAssembleArgs(args);
	if (!parsed.ok) {
		return { ok: false, text: `error  ${parsed.error}\n\n${ASSEMBLE_USAGE}` };
	}
	const { options } = parsed;

	const read = await readOcrOutput(options.ocrDir);
	if (!read.ok) {
		return { ok: false, text: `error  ${read.error}` };
	}
	const { manifest, pages, unreadable } = read.input;

	const selected =
		options.pages === null
			? pages
			: (() => {
					const wanted = new Set(resolvePageSpec(options.pages, manifest.pageCount));
					return pages.filter((page) => wanted.has(page.number));
				})();

	if (selected.length === 0) {
		return { ok: false, text: "error  no OCR'd pages in that range" };
	}

	let overrides: Partial<BookMetadata> | null = null;
	if (options.meta !== null) {
		const file = Bun.file(options.meta);
		if (!(await file.exists())) {
			return { ok: false, text: `error  no such metadata file: ${options.meta}` };
		}
		try {
			overrides = (await file.json()) as Partial<BookMetadata>;
		} catch (cause) {
			return { ok: false, text: `error  ${options.meta} is not valid JSON: ${String(cause)}` };
		}
	}

	const metadata = mergeMetadata(
		defaultMetadata(options.bookId, options.language),
		overrides,
		options.title,
		options.language,
	);

	const segmented = segmentBook(selected, {
		script: metadata.script,
		admitted: admittedScripts(options.language),
		form: options.form,
	});

	const { book, report } = assemblePackage(
		segmented,
		manifest,
		metadata,
		selected.map((page) => page.number),
	);

	// The package is checked against its own spec before it is written. A draft that does not
	// validate is a bug in this command, not something to hand to the studio.
	const validation = validateBook(book);

	await mkdir(options.out, { recursive: true });
	await Bun.write(join(options.out, BOOK_FILE), `${JSON.stringify(book, null, "\t")}\n`);
	await Bun.write(join(options.out, ASSEMBLY_FILE), `${JSON.stringify(report, null, "\t")}\n`);

	const { sequence, numbering, counts } = report;
	const lines = [
		`${options.ocrDir} → ${options.out}`,
		`  ${plural(selected.length, "page")} → ${plural(counts.sections, "section")}, ${plural(counts.verses, "passage")} (${counts.numbered} numbered)`,
		`  ${plural(counts.notes, "footnote")} kept aside, ${plural(counts.setAside, "block")} kept out of the text`,
	];

	if (numbering.offset !== null) {
		lines.push(
			`  printed page numbers run ${numbering.offset} behind the PDF's, on ${numbering.pagesWithPrintedNumber}/${selected.length} pages` +
				(numbering.disagreements.length > 0
					? ` — ${plural(numbering.disagreements.length, "page")} disagree`
					: ""),
		);
	}

	// One line per run. A book that counts straight through prints one; one with an appendix that
	// starts over prints two, which is the fact a single range would have hidden.
	for (const run of sequence.runs) {
		lines.push(
			`  numbering runs ${run.first}–${run.last}` +
				(sequence.runs.length > 1 ? ` (from ${run.division})` : ""),
		);
	}
	if (sequence.restarts.length > 0) {
		lines.push(
			`  numbering starts again at: ${sequence.restarts.map((restart) => `${restart.at} in ${restart.division}`).join(", ")}`,
		);
	}
	if (sequence.missing.length > 0) {
		lines.push(`  MISSING numbers: ${sequence.missing.slice(0, 20).join(", ")}`);
	}
	if (sequence.duplicates.length > 0) {
		lines.push(`  DUPLICATE numbers: ${sequence.duplicates.slice(0, 20).join(", ")}`);
	}
	if (sequence.unnumbered > 0) {
		lines.push(`  ${plural(sequence.unnumbered, "passage")} carried no printed number`);
	}
	if (unreadable.length > 0) {
		lines.push(`  ${plural(unreadable.length, "page")} had no readable blocks file`);
	}

	const weakest = report.verses.filter((verse) => verse.confidence < 1).slice(0, 5);
	if (weakest.length > 0) {
		lines.push("", "Least confident passages — start proofing here:");
		for (const verse of weakest) {
			lines.push(
				`  ${verse.ref} (${verse.confidence}) — ${verse.flags.join(", ")}  p${verse.pages.join(",")}`,
			);
		}
	}

	if (report.needsHuman.length > 0) {
		lines.push("", "Only you can supply these — the package carries placeholders:");
		for (const need of report.needsHuman) {
			lines.push(`  ${need}`);
		}
		if (report.runningHeads.length > 0) {
			lines.push(
				`  (the running head reads "${report.runningHeads[0]?.text}" on ${report.runningHeads[0]?.pages} of these pages)`,
			);
		}
	}

	if (!validation.ok) {
		lines.push(
			"",
			"The package does not validate — this is a bug in `assemble`:",
			...validation.issues
				.filter((issue) => issue.severity === "error")
				.slice(0, 10)
				.map((issue) => `  ${formatIssue(issue)}`),
		);
		return { ok: false, text: lines.join("\n") };
	}

	lines.push("", `  ${join(options.out, BOOK_FILE)} validates as a draft package`);
	return { ok: true, text: lines.join("\n") };
}
