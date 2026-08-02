/**
 * `granthalaya render <pdf>` — turn a book's pages into the images it will be OCR'd and
 * proofed from (P1.2).
 *
 * The rendering lives in `pdf/rasterize.ts`; this file only parses arguments, picks the output
 * directory and reports. Parsing is kept pure so it can be unit-tested without a filesystem,
 * matching `triage.ts` and `commands.ts`.
 */
import { basename, extname, join } from "node:path";
import {
	DEFAULT_DPI,
	MANIFEST_FILE,
	MAX_DPI,
	MIN_DPI,
	type PageRange,
	parsePageSpec,
	type RasterizeOptions,
	rasterizePdf,
} from "./pdf/rasterize.ts";

/** Where rendered pages go when `--out` is not given — the layout `content/README.md` documents. */
export const DEFAULT_PAGES_ROOT = "content/pages";

export type RenderOptions = {
	readonly pdf: string;
	/** Resolved output directory, `content/pages/<slug>` unless `--out` said otherwise. */
	readonly out: string;
	readonly dpi: number;
	readonly format: "png" | "jpeg";
	readonly color: "gray" | "rgb";
	readonly quality: number;
	/** Parsed but not yet resolved: the book's page count is not known until it is opened. */
	readonly pages: readonly PageRange[] | null;
	readonly force: boolean;
};

export type RenderArgs =
	| { readonly ok: true; readonly options: RenderOptions }
	| { readonly ok: false; readonly error: string };

export const RENDER_USAGE = [
	"Usage: granthalaya render <file.pdf> [options]",
	"",
	"  Render a PDF's pages to images for OCR and proofing. Pages already rendered under the",
	"  same settings are kept, so a run can be stopped and resumed.",
	"",
	"Options:",
	`  --out <dir>      where to write the images (default ${DEFAULT_PAGES_ROOT}/<book>)`,
	`  --dpi <n>        resolution, ${MIN_DPI}-${MAX_DPI} (default ${DEFAULT_DPI})`,
	"  --pages <spec>   which pages: 12, 1-40, 300-, or a comma-separated mix",
	"  --format <fmt>   png or jpeg (default png — lossless, and JPEG rings around conjuncts)",
	"  --quality <n>    JPEG quality, 1-100 (default 92)",
	"  --color          render in colour instead of greyscale",
	"  --force          re-render pages already on disk",
].join("\n");

/**
 * A directory name from a book's file name. Latin-only on purpose: this is a path segment on
 * somebody's filesystem, not a title, and a Gujarati folder name is a wall of mojibake in the
 * wrong terminal.
 */
export function bookSlug(pdfPath: string): string {
	const name = basename(pdfPath, extname(pdfPath));
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug === "" ? "book" : slug;
}

/** Parse `render`'s arguments. Pure: no `process`, no I/O. */
export function parseRenderArgs(args: readonly string[]): RenderArgs {
	const positional: string[] = [];
	let out: string | null = null;
	let dpi = DEFAULT_DPI;
	let format: "png" | "jpeg" = "png";
	let color: "gray" | "rgb" = "gray";
	let quality = 92;
	let pages: readonly PageRange[] | null = null;
	let force = false;

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
		} else if (arg === "--dpi") {
			const value = takeValue();
			const parsed = value === null ? Number.NaN : Number(value);
			if (!Number.isInteger(parsed) || parsed < MIN_DPI || parsed > MAX_DPI) {
				return { ok: false, error: `--dpi needs a whole number between ${MIN_DPI} and ${MAX_DPI}` };
			}
			dpi = parsed;
		} else if (arg === "--pages") {
			const value = takeValue();
			const parsed = value === null ? null : parsePageSpec(value);
			if (parsed === null) {
				return { ok: false, error: "--pages needs something like 12, 1-40, 300- or 1-3,9" };
			}
			pages = parsed;
		} else if (arg === "--format") {
			const value = takeValue();
			if (value !== "png" && value !== "jpeg") {
				return { ok: false, error: "--format needs png or jpeg" };
			}
			format = value;
		} else if (arg === "--quality") {
			const value = takeValue();
			const parsed = value === null ? Number.NaN : Number(value);
			if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
				return { ok: false, error: "--quality needs a whole number between 1 and 100" };
			}
			quality = parsed;
		} else if (arg === "--color" || arg === "--colour") {
			color = "rgb";
		} else if (arg === "--force") {
			force = true;
		} else if (arg.startsWith("--")) {
			return { ok: false, error: `Unknown option: ${arg}` };
		} else {
			positional.push(arg);
		}
	}

	if (positional.length === 0) {
		return { ok: false, error: "render needs a PDF to render" };
	}
	// One book per run, deliberately: pages from two PDFs in one directory would collide on
	// page numbers and the manifest can only pin one source hash.
	if (positional.length > 1) {
		return { ok: false, error: "render takes one PDF at a time" };
	}

	const pdf = positional[0] as string;
	return {
		ok: true,
		options: {
			pdf,
			out: out ?? join(DEFAULT_PAGES_ROOT, bookSlug(pdf)),
			dpi,
			format,
			color,
			quality,
			pages,
			force,
		},
	};
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Human-readable byte size, matching the inventory's. */
function formatBytes(bytes: number): string {
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
	return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Drive a render run. Returns what the CLI should print and whether it succeeded. */
export async function runRender(args: readonly string[]): Promise<{ ok: boolean; text: string }> {
	const parsed = parseRenderArgs(args);
	if (!parsed.ok) {
		return { ok: false, text: `error  ${parsed.error}\n\n${RENDER_USAGE}` };
	}

	const { options } = parsed;
	// Progress goes to stderr, and only when that is a terminal: a book is hundreds of pages
	// and minutes of work, so silence looks like a hang, but a redirected log should stay clean.
	const live = process.stderr.isTTY === true;

	const rasterize: RasterizeOptions = {
		dpi: options.dpi,
		format: options.format,
		color: options.color,
		quality: options.quality,
		pages: options.pages,
		force: options.force,
	};

	const result = await rasterizePdf(options.pdf, options.out, rasterize, (number, done, total) => {
		if (!live) {
			return;
		}
		process.stderr.write(`\r  ${done + 1}/${total}  page ${number}\u001b[K`);
	});
	if (live) {
		process.stderr.write("\r\u001b[K");
	}

	if (!result.ok) {
		return { ok: false, text: `error  ${result.error}` };
	}

	const { manifest, failures, reused } = result;
	const total = manifest.pages.reduce((sum, page) => sum + page.bytes, 0);
	const largest = manifest.pages.reduce((max, page) => Math.max(max, page.bytes), 0);
	const first = manifest.pages[0];

	const lines = [
		`${basename(options.pdf)} — ${plural(manifest.pageCount, "page")}, ` +
			`${manifest.dpi} DPI ${manifest.color === "gray" ? "greyscale" : "colour"} ${manifest.format}`,
		`  ${plural(manifest.pages.length, "page")} rendered` +
			(reused > 0 ? ` (${reused} kept from an earlier run)` : ""),
		first === undefined
			? null
			: `  ${first.widthPx}×${first.heightPx} px, largest ${formatBytes(largest)}`,
		`  ${formatBytes(total)} in ${options.out}`,
		`  manifest: ${join(options.out, MANIFEST_FILE)}`,
	].filter((line) => line !== null);

	if (failures.length > 0) {
		lines.push(
			"",
			`${plural(failures.length, "page")} failed to render:`,
			...failures.slice(0, 10).map((failure) => `  page ${failure.number}: ${failure.error}`),
		);
	}

	return { ok: failures.length === 0, text: lines.join("\n") };
}
