/**
 * `granthalaya triage <path>…` — inventory a folder of PDFs and decide how each one's text
 * has to be got out of it (P1.1).
 *
 * The rules live in `pdf/classify.ts` and the rendering in `pdf/report.ts`; this file only
 * finds the files, drives the two, and writes the results out. Argument parsing is kept pure
 * so it can be unit-tested without a filesystem, matching `commands.ts`.
 */
import { basename, join, relative, resolve } from "node:path";
import { triagePdf } from "./pdf/classify.ts";
import { DEFAULT_PAGE_SAMPLE, inspectPdfFile } from "./pdf/inspect.ts";
import {
	type InventoryEntry,
	inventoryEntry,
	inventoryJson,
	renderInventoryMarkdown,
	summarize,
} from "./pdf/report.ts";

export type TriageOptions = {
	readonly paths: readonly string[];
	/** Write the markdown inventory here instead of to stdout. */
	readonly out: string | null;
	/** Also write the machine-readable inventory here, for P1.2 to drive extraction from. */
	readonly json: string | null;
	/** Pages to inspect per file. */
	readonly sample: number;
};

export type TriageArgs =
	| { readonly ok: true; readonly options: TriageOptions }
	| { readonly ok: false; readonly error: string };

export const TRIAGE_USAGE = [
	"Usage: granthalaya triage <path>... [options]",
	"",
	"  Classify every PDF under <path> as a true Unicode text layer, a legacy-font text",
	"  layer, or scanned images, and write the inventory P1.1 asks for.",
	"",
	"Options:",
	"  --out <file>     write the markdown inventory to a file instead of stdout",
	"  --json <file>    also write the inventory as JSON",
	`  --sample <n>     pages to inspect per file (default ${DEFAULT_PAGE_SAMPLE})`,
].join("\n");

/** Parse `triage`'s arguments. Pure: no `process`, no I/O. */
export function parseTriageArgs(args: readonly string[]): TriageArgs {
	const paths: string[] = [];
	let out: string | null = null;
	let json: string | null = null;
	let sample = DEFAULT_PAGE_SAMPLE;

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

		if (arg === "--out" || arg === "--json") {
			const value = takeValue();
			if (value === null) {
				return { ok: false, error: `${arg} needs a file path` };
			}
			if (arg === "--out") {
				out = value;
			} else {
				json = value;
			}
		} else if (arg === "--sample") {
			const value = takeValue();
			const parsed = value === null ? Number.NaN : Number(value);
			if (!Number.isInteger(parsed) || parsed < 1) {
				return { ok: false, error: "--sample needs a whole number of pages, at least 1" };
			}
			sample = parsed;
		} else if (arg.startsWith("--")) {
			return { ok: false, error: `Unknown option: ${arg}` };
		} else {
			paths.push(arg);
		}
	}

	if (paths.length === 0) {
		return { ok: false, error: "triage needs at least one file or directory" };
	}
	return { ok: true, options: { paths, out, json, sample } };
}

function isPdf(path: string): boolean {
	return path.toLowerCase().endsWith(".pdf");
}

/**
 * Every PDF under the given paths, de-duplicated and sorted so two runs over the same corpus
 * produce comparable reports. A path may be a single file or a directory to walk.
 */
export async function collectPdfPaths(paths: readonly string[]): Promise<string[]> {
	const found = new Set<string>();

	for (const path of paths) {
		const absolute = resolve(path);
		if (isPdf(path) && (await Bun.file(absolute).exists())) {
			found.add(absolute);
			continue;
		}
		const glob = new Bun.Glob("**/*");
		try {
			for await (const entry of glob.scan({ cwd: absolute, onlyFiles: true, dot: false })) {
				if (isPdf(entry)) {
					found.add(join(absolute, entry));
				}
			}
		} catch {
			// Not a directory either — reported as an unreadable entry below.
			found.add(absolute);
		}
	}

	return [...found].sort();
}

export type TriageReport = {
	/** False when a file could not be read at all, so the CLI can exit non-zero. */
	readonly ok: boolean;
	readonly markdown: string;
	readonly entries: readonly InventoryEntry[];
};

/** Inspect and classify every PDF under `options.paths`. */
export async function triagePaths(
	options: TriageOptions,
	onProgress?: (path: string, index: number, total: number) => void,
): Promise<TriageReport> {
	const files = await collectPdfPaths(options.paths);
	const root = commonRoot(files);
	const entries: InventoryEntry[] = [];

	for (const [index, file] of files.entries()) {
		onProgress?.(file, index, files.length);
		const inspection = await inspectPdfFile(file, options.sample);
		const size = Bun.file(file).size;
		entries.push(
			inventoryEntry(
				root === null ? file : relative(root, file) || basename(file),
				size,
				inspection,
				triagePdf(inspection),
			),
		);
	}

	const generatedAt = new Date().toISOString().slice(0, 10);
	return {
		ok: entries.every((entry) => entry.triage.strategy !== "unknown"),
		markdown: renderInventoryMarkdown(entries, { root: root ?? undefined, generatedAt }),
		entries,
	};
}

/** The deepest directory containing every file, so report paths stay short and readable. */
export function commonRoot(files: readonly string[]): string | null {
	if (files.length === 0) {
		return null;
	}
	const split = files.map((file) => file.split("/").slice(0, -1));
	const first = split[0] as string[];
	let shared = first.length;
	for (const parts of split.slice(1)) {
		let index = 0;
		while (index < shared && index < parts.length && parts[index] === first[index]) {
			index += 1;
		}
		shared = index;
	}
	return shared === 0 ? null : first.slice(0, shared).join("/");
}

/** Drive a whole triage run and write its outputs. Returns what the CLI should print. */
export async function runTriage(args: readonly string[]): Promise<{ ok: boolean; text: string }> {
	const parsed = parseTriageArgs(args);
	if (!parsed.ok) {
		return { ok: false, text: `error  ${parsed.error}\n\n${TRIAGE_USAGE}` };
	}

	const { options } = parsed;
	// Progress goes to stderr, and only when that is a terminal, so a redirected report stays
	// clean. A corpus big enough to need OCR takes long enough that silence looks like a hang.
	const live = process.stderr.isTTY === true;
	const report = await triagePaths(options, (path, index, total) => {
		if (!live) {
			return;
		}
		process.stderr.write(`\r  ${index + 1}/${total}  ${basename(path)}\u001b[K`);
	});
	if (live && report.entries.length > 0) {
		process.stderr.write("\r\u001b[K");
	}

	if (report.entries.length === 0) {
		return { ok: false, text: "error  no PDFs found under the given paths" };
	}

	const generatedAt = new Date().toISOString().slice(0, 10);
	if (options.json !== null) {
		await Bun.write(
			options.json,
			`${JSON.stringify(inventoryJson(report.entries, { generatedAt }), null, "\t")}\n`,
		);
	}
	if (options.out !== null) {
		await Bun.write(options.out, report.markdown);
	}

	const summary = summarize(report.entries);
	const written = [
		options.out === null ? null : `inventory written to ${options.out}`,
		options.json === null ? null : `JSON written to ${options.json}`,
	].filter((line) => line !== null);

	const tail = [
		`${summary.total} file${summary.total === 1 ? "" : "s"}: ` +
			(Object.entries(summary.byStrategy) as [string, number][])
				.filter(([, count]) => count > 0)
				.map(([strategy, count]) => `${count} ${strategy}`)
				.join(", "),
		`${summary.needingOcr} will need OCR.`,
		...written,
	].join("\n");

	return { ok: report.ok, text: options.out === null ? `${report.markdown}\n${tail}` : tail };
}
