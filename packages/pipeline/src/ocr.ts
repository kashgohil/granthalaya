/**
 * `granthalaya ocr <pages-dir>` — read a book's rendered pages and get its text back (P1.2).
 *
 * Takes the directory `render` produced, not a PDF: the images are the artefact we decided to
 * trust, and the render manifest's source hash travels into the OCR manifest so the chain from
 * *this PDF* → *these images* → *this text* is unbroken and checkable.
 *
 * Every page is scored with `checkOrthography` as it lands. That does not prove the OCR read
 * the right word, but it catches every word Gujarati cannot spell — free, on every page, and
 * without a ground-truth transcript. A page that scores badly is where proofing should start.
 */

import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
	checkOrthography,
	type OrthographyReport,
	profileScript,
	type Script,
} from "@granthalaya/core";
import {
	type Block,
	batchPages,
	estimateRupees,
	MAX_PAGES_PER_JOB,
	type PageFile,
	SarvamClient,
	SarvamError,
	type SarvamOptions,
} from "./ocr/sarvam.ts";
import {
	MANIFEST_FILE,
	type PageManifest,
	type PageRange,
	parsePageSpec,
	resolvePageSpec,
} from "./pdf/rasterize.ts";

/** Where OCR output goes when `--out` is not given. */
export const DEFAULT_OCR_ROOT = "content/ocr";
export const OCR_MANIFEST_FILE = "ocr.json";

/** Above this, a run must say `--yes`. Small enough to try a chapter, large enough to notice. */
export const CONFIRM_ABOVE_PAGES = 50;

export type OcrOptions = {
	/** The directory `render` wrote — page images plus `pages.json`. */
	readonly pagesDir: string;
	readonly out: string;
	readonly language: string;
	readonly contentType: "printed" | "handwritten" | "mixed";
	readonly pages: readonly PageRange[] | null;
	readonly force: boolean;
	readonly dryRun: boolean;
	readonly yes: boolean;
	readonly requestsPerMinute: number;
};

export type OcrArgs =
	| { readonly ok: true; readonly options: OcrOptions }
	| { readonly ok: false; readonly error: string };

export const OCR_USAGE = [
	"Usage: granthalaya ocr <pages-dir> [options]",
	"",
	"  Read a book's rendered pages with Sarvam Vision and write its text out, one file per",
	"  page. Pages already done are kept, so a run can be stopped and resumed.",
	"",
	"  Needs SARVAM_API_KEY in the environment (repo-root .env — see .env.example).",
	"",
	"Options:",
	`  --out <dir>          where to write the text (default ${DEFAULT_OCR_ROOT}/<book>)`,
	"  --pages <spec>       which pages: 12, 1-40, 300-, or a comma-separated mix",
	"  --language <tag>     BCP-47 document language (default gu-IN)",
	"  --content-type <t>   printed, handwritten or mixed (default printed)",
	"  --dry-run            show the plan and the cost, call nothing",
	`  --yes                confirm a run of more than ${CONFIRM_ABOVE_PAGES} pages`,
	"  --force              re-read pages already done",
	"  --rpm <n>            requests per minute (default 10, the API's published limit)",
].join("\n");

/** Parse `ocr`'s arguments. Pure: no `process`, no I/O, no network. */
export function parseOcrArgs(args: readonly string[]): OcrArgs {
	const positional: string[] = [];
	let out: string | null = null;
	let language = "gu-IN";
	let contentType: "printed" | "handwritten" | "mixed" = "printed";
	let pages: readonly PageRange[] | null = null;
	let force = false;
	let dryRun = false;
	let yes = false;
	let requestsPerMinute = 10;

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
		} else if (arg === "--language") {
			const value = takeValue();
			if (value === null) {
				return { ok: false, error: "--language needs a BCP-47 tag, e.g. gu-IN" };
			}
			language = value;
		} else if (arg === "--content-type") {
			const value = takeValue();
			if (value !== "printed" && value !== "handwritten" && value !== "mixed") {
				return { ok: false, error: "--content-type needs printed, handwritten or mixed" };
			}
			contentType = value;
		} else if (arg === "--pages") {
			const value = takeValue();
			const parsed = value === null ? null : parsePageSpec(value);
			if (parsed === null) {
				return { ok: false, error: "--pages needs something like 12, 1-40, 300- or 1-3,9" };
			}
			pages = parsed;
		} else if (arg === "--rpm") {
			const value = takeValue();
			const parsed = value === null ? Number.NaN : Number(value);
			if (!Number.isInteger(parsed) || parsed < 0) {
				return { ok: false, error: "--rpm needs a whole number, 0 to switch the limit off" };
			}
			requestsPerMinute = parsed;
		} else if (arg === "--force") {
			force = true;
		} else if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg === "--yes") {
			yes = true;
		} else if (arg.startsWith("--")) {
			return { ok: false, error: `Unknown option: ${arg}` };
		} else {
			positional.push(arg);
		}
	}

	if (positional.length === 0) {
		return { ok: false, error: "ocr needs the directory that `render` wrote" };
	}
	if (positional.length > 1) {
		return { ok: false, error: "ocr takes one book at a time" };
	}

	const pagesDir = positional[0] as string;
	return {
		ok: true,
		options: {
			pagesDir,
			out: out ?? join(DEFAULT_OCR_ROOT, basename(pagesDir.replace(/\/+$/, ""))),
			language,
			contentType,
			pages,
			force,
			dryRun,
			yes,
			requestsPerMinute,
		},
	};
}

/**
 * Page furniture: true of the page, not of the text. Kept in the per-page JSON, never joined
 * into the body — a running head repeated 442 times would end up inside 442 verses.
 */
export const APPARATUS_TAGS = new Set(["header", "page-number", "folio"]);

/**
 * Notes are real content — glosses P1.4 will want as a layer — but they are not body text, so
 * they go below a rule rather than into the middle of a discourse.
 */
export const NOTE_TAGS = new Set(["footer", "footnote"]);

/** Blocks that carry no transcribable text at all. */
export const NON_TEXT_TAGS = new Set(["image", "photograph", "chart", "diagram", "advertisement"]);

/** The script each language is set in, for the languages this pipeline actually meets. */
const PRIMARY_SCRIPT: Readonly<Record<string, Script>> = {
	gu: "gujr",
	sa: "deva",
	hi: "deva",
	mr: "deva",
	en: "latn",
};

/**
 * The scripts a page of a book in `language` may legitimately come back in.
 *
 * The book's own script, plus Devanagari for any Indic language: a Sanskrit shloka quoted inside
 * a Gujarati discourse is printed in Devanagari on the same page, and it is scripture — the book
 * format has admitted exactly that shape since P0.2, where `sample-prose` carries a verse
 * quotation mid-discourse. Latin is never admitted for an Indic book, because it is the tripwire
 * that caught the model answering in English.
 */
export function admittedScripts(language: string): Script[] {
	const primary = PRIMARY_SCRIPT[language.split("-")[0]?.toLowerCase() ?? ""];
	if (primary === undefined || primary === "latn") {
		return primary === undefined ? [] : ["latn"];
	}
	return primary === "deva" ? ["deva"] : [primary, "deva"];
}

/**
 * Split a page's blocks into what belongs in the text and what does not.
 *
 * The third bucket exists because of a real hazard: asked to read a decorative glyph, the model
 * answered *"This image contains no text. It displays three identical black heart symbols…"* —
 * an English description, tagged `paragraph`, sitting mid-page. Left alone it would be
 * published as scripture. Any block in a script this book does not admit is set aside, and
 * recorded rather than dropped, so nothing disappears without a trace.
 *
 * An empty `scripts` list admits everything — the honest behaviour for a language whose script
 * we have not been told, since guessing would set aside the whole book.
 */
export function partitionBlocks(
	blocks: readonly Block[],
	scripts: Script | readonly Script[],
): { body: Block[]; notes: Block[]; setAside: Block[] } {
	const admitted = new Set(typeof scripts === "string" ? [scripts] : scripts);
	const body: Block[] = [];
	const notes: Block[] = [];
	const setAside: Block[] = [];

	for (const block of [...blocks].sort((a, b) => a.readingOrder - b.readingOrder)) {
		if (block.text.trim() === "") {
			continue;
		}
		if (APPARATUS_TAGS.has(block.tag) || NON_TEXT_TAGS.has(block.tag)) {
			setAside.push(block);
			continue;
		}
		const profile = profileScript(block.text);
		if (
			admitted.size > 0 &&
			profile.total > 0 &&
			(profile.dominant === null || !admitted.has(profile.dominant as Script))
		) {
			setAside.push(block);
			continue;
		}
		(NOTE_TAGS.has(block.tag) ? notes : body).push(block);
	}

	return { body, notes, setAside };
}

/** The page as a human should read it: body in reading order, notes below a rule. */
export function renderPageMarkdown(body: readonly Block[], notes: readonly Block[]): string {
	const text = body.map((block) => block.text.trim()).join("\n\n");
	if (notes.length === 0) {
		return `${text}\n`;
	}
	return `${text}\n\n---\n\n${notes.map((block) => block.text.trim()).join("\n\n")}\n`;
}

export type OcrPageResult = {
	readonly number: number;
	readonly file: string;
	/** Blocks, tags and coordinates — what P1.3's proofing view and verse segmentation need. */
	readonly blocksFile: string;
	readonly chars: number;
	readonly blocks: number;
	/** Blocks kept out of the text: page furniture, and anything that came back in the wrong script. */
	readonly setAside: readonly { readonly tag: string; readonly text: string }[];
	/** What script the text came back as — a Latin answer means something went badly wrong. */
	readonly script: string;
	readonly scriptShare: number;
	readonly orthography: {
		readonly ok: boolean;
		readonly violations: number;
		readonly examined: number;
		/** Impossible sequences per 1000 letters. Clean Gujarati scores 0. */
		readonly rate: number;
	};
};

export type OcrManifest = {
	/** Carried from the render manifest: the chain of custody back to one exact PDF. */
	readonly source: string;
	readonly sourceSha256: string;
	readonly engine: string;
	readonly language: string;
	readonly contentType: string;
	readonly pageCount: number;
	readonly pages: readonly OcrPageResult[];
	readonly failures: readonly { readonly number: number; readonly error: string }[];
};

export type OcrOutcome =
	| {
			readonly ok: true;
			readonly manifest: OcrManifest;
			readonly done: number;
			readonly reused: number;
	  }
	| { readonly ok: false; readonly error: string };

function scoreOf(report: OrthographyReport): OcrPageResult["orthography"] {
	return {
		ok: report.ok,
		violations: report.count,
		examined: report.examined,
		rate: Math.round(report.rate * 100) / 100,
	};
}

function pageTextFile(imageFile: string, extension: string): string {
	return `${imageFile.replace(/\.[^.]+$/, "")}.${extension}`;
}

async function readJson<T>(path: string): Promise<T | null> {
	try {
		const file = Bun.file(path);
		return (await file.exists()) ? ((await file.json()) as T) : null;
	} catch {
		return null;
	}
}

/**
 * Turn a page's blocks into the record the manifest keeps, and write both artefacts.
 *
 * Shared by a live read and by recovery so the two cannot drift: what a resumed run records for
 * a page is byte-for-byte what the original run recorded, because it is the same function over
 * the same blocks.
 */
async function pageResultFrom(
	out: string,
	page: { readonly number: number; readonly file: string },
	blocks: readonly Block[],
	language: string,
): Promise<OcrPageResult> {
	const { body, notes, setAside } = partitionBlocks(blocks, admittedScripts(language));
	const text = renderPageMarkdown(body, notes);
	const file = pageTextFile(page.file, "md");
	await Bun.write(join(out, file), text);

	const profile = profileScript(text);
	return {
		number: page.number,
		file,
		blocksFile: pageTextFile(page.file, "blocks.json"),
		blocks: blocks.length,
		setAside: setAside.map((block) => ({
			tag: block.tag,
			text: block.text.length > 120 ? `${block.text.slice(0, 117)}…` : block.text,
		})),
		chars: text.length,
		script: profile.dominant ?? "none",
		scriptShare: Math.round(profile.share * 1000) / 1000,
		orthography: scoreOf(checkOrthography(text, "gujr")),
	};
}

/**
 * Rebuild a page's record from the blocks file already on disk, or `null` if there isn't one.
 *
 * This is what stops a killed run costing money twice. The blocks are written the moment a batch
 * returns, but the manifest is a running summary — so a process that dies leaves paid pages on
 * disk with nothing claiming them. Reading them back is not an optimisation; it is the
 * difference between resuming and paying again.
 */
async function recoverPage(
	out: string,
	page: { readonly number: number; readonly file: string },
	language: string,
): Promise<OcrPageResult | null> {
	const saved = await readJson<{ blocks?: Block[] }>(
		join(out, pageTextFile(page.file, "blocks.json")),
	);
	if (saved === null || !Array.isArray(saved.blocks)) {
		return null;
	}
	return pageResultFrom(out, page, saved.blocks, language);
}

/**
 * The pages already read, and therefore already paid for.
 *
 * One function, used by the pre-flight estimate and by the run itself. They had a copy each, and
 * a copy each is how an estimate comes to promise ₹221 for a run that only reads 438 pages —
 * or, far worse, how a run comes to re-read what an estimate said was done.
 *
 * Two sources, in order of authority: the manifest, and then the blocks on disk. The second is
 * what covers a run that was killed before it could write the first.
 */
async function alreadyRead(
	options: OcrOptions,
	sourceSha256: string,
	wanted: readonly { readonly number: number; readonly file: string }[],
	previous: OcrManifest | null,
): Promise<Map<number, OcrPageResult>> {
	const kept = new Map<number, OcrPageResult>();
	// `--force` re-reads everything; a manifest for a different source is not a resume point.
	if (options.force || (previous !== null && previous.sourceSha256 !== sourceSha256)) {
		return kept;
	}

	for (const page of previous?.pages ?? []) {
		if (await Bun.file(join(options.out, page.file)).exists()) {
			kept.set(page.number, page);
		}
	}
	for (const page of wanted) {
		if (kept.has(page.number)) {
			continue;
		}
		const recovered = await recoverPage(options.out, page, options.language);
		if (recovered !== null) {
			kept.set(page.number, recovered);
		}
	}
	return kept;
}

/**
 * OCR a rendered book. The client is a parameter so a run can be driven by a stub in tests and
 * by the real API in anger.
 */
export async function ocrBook(
	options: OcrOptions,
	client: SarvamClient,
	onProgress?: (done: number, total: number) => void,
): Promise<OcrOutcome> {
	const manifest = await readJson<PageManifest>(join(options.pagesDir, MANIFEST_FILE));
	if (manifest === null) {
		return {
			ok: false,
			error: `no ${MANIFEST_FILE} in ${options.pagesDir} — run \`bun run render\` on the PDF first`,
		};
	}

	const wanted =
		options.pages === null
			? manifest.pages
			: (() => {
					const numbers = new Set(resolvePageSpec(options.pages, manifest.pageCount));
					return manifest.pages.filter((page) => numbers.has(page.number));
				})();

	if (wanted.length === 0) {
		return { ok: false, error: "no rendered pages in that range" };
	}

	await mkdir(options.out, { recursive: true });

	const previous = await readJson<OcrManifest>(join(options.out, OCR_MANIFEST_FILE));
	const kept = await alreadyRead(options, manifest.sourceSha256, wanted, previous);

	const todo = wanted.filter((page) => !kept.has(page.number));
	const results: OcrPageResult[] = [];
	const failures: { number: number; error: string }[] = [];
	let done = 0;

	const writeManifest = async (): Promise<OcrManifest> => {
		const merged = new Map<number, OcrPageResult>();
		for (const page of [...(previous?.pages ?? []), ...kept.values(), ...results]) {
			if (await Bun.file(join(options.out, page.file)).exists()) {
				merged.set(page.number, page);
			}
		}
		const written: OcrManifest = {
			source: manifest.source,
			sourceSha256: manifest.sourceSha256,
			engine: "sarvam-vision-v1",
			language: options.language,
			contentType: options.contentType,
			pageCount: manifest.pageCount,
			pages: [...merged.values()].sort((a, b) => a.number - b.number),
			failures,
		};
		await Bun.write(
			join(options.out, OCR_MANIFEST_FILE),
			`${JSON.stringify(written, null, "\t")}\n`,
		);
		return written;
	};

	for (const batch of batchPages(todo, MAX_PAGES_PER_JOB)) {
		try {
			// Inside the try with the request: an image that cannot be read is one batch's
			// problem, and letting it escape here would abandon a run that has already spent
			// money on every batch before it.
			const files: PageFile[] = [];
			for (const page of batch) {
				const bytes = new Uint8Array(
					await Bun.file(join(options.pagesDir, page.file)).arrayBuffer(),
				);
				files.push({ name: page.file, bytes });
			}

			const result = await client.digitise(files);
			const byName = new Map(result.pages.map((page) => [page.fileName, page]));

			for (const page of batch) {
				const digitised = byName.get(page.file);
				if (digitised === undefined) {
					failures.push({ number: page.number, error: "the job returned no text for this page" });
					continue;
				}

				// The blocks go down first and whole: tags, reading order and coordinates are what
				// P1.3's proofing view and verse segmentation both need, and they are the only
				// copy of what was paid for. Nothing the API returned is discarded, including
				// what was kept out of the text.
				await Bun.write(
					join(options.out, pageTextFile(page.file, "blocks.json")),
					`${JSON.stringify({ page: page.number, widthPx: digitised.widthPx, heightPx: digitised.heightPx, blocks: digitised.blocks }, null, "\t")}\n`,
				);
				results.push(await pageResultFrom(options.out, page, digitised.blocks, options.language));
			}
		} catch (cause) {
			// One bad batch is ten pages, not a book. Record and carry on.
			const message = cause instanceof SarvamError ? cause.message : String(cause);
			for (const page of batch) {
				failures.push({ number: page.number, error: message });
			}
		}

		done += batch.length;
		onProgress?.(done, todo.length);

		// Checkpoint after every batch. Recovery from the blocks on disk is the backstop, but a
		// manifest that is current to within ten pages means a killed run barely needs it.
		await writeManifest();
	}

	const written = await writeManifest();
	return { ok: true, manifest: written, done: results.length, reused: kept.size };
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** How many pages a run would actually send, for the estimate and the confirmation gate. */
export async function planOcr(
	options: OcrOptions,
): Promise<{ ok: true; total: number; todo: number } | { ok: false; error: string }> {
	const manifest = await readJson<PageManifest>(join(options.pagesDir, MANIFEST_FILE));
	if (manifest === null) {
		return {
			ok: false,
			error: `no ${MANIFEST_FILE} in ${options.pagesDir} — run \`bun run render\` on the PDF first`,
		};
	}

	const wanted =
		options.pages === null
			? manifest.pages
			: (() => {
					const numbers = new Set(resolvePageSpec(options.pages, manifest.pageCount));
					return manifest.pages.filter((page) => numbers.has(page.number));
				})();

	const previous = await readJson<OcrManifest>(join(options.out, OCR_MANIFEST_FILE));
	const kept = await alreadyRead(options, manifest.sourceSha256, wanted, previous);
	return {
		ok: true,
		total: wanted.length,
		todo: wanted.filter((page) => !kept.has(page.number)).length,
	};
}

export type OcrDeps = {
	readonly apiKey?: string;
	readonly makeClient?: (options: SarvamOptions) => SarvamClient;
	readonly onProgress?: (done: number, total: number) => void;
};

/** Drive an OCR run. Returns what the CLI should print and whether it succeeded. */
export async function runOcr(
	args: readonly string[],
	deps: OcrDeps = {},
): Promise<{ ok: boolean; text: string }> {
	const parsed = parseOcrArgs(args);
	if (!parsed.ok) {
		return { ok: false, text: `error  ${parsed.error}\n\n${OCR_USAGE}` };
	}
	const { options } = parsed;

	const plan = await planOcr(options);
	if (!plan.ok) {
		return { ok: false, text: `error  ${plan.error}` };
	}

	const estimate = `${plan.todo} to read → about ₹${estimateRupees(plan.todo).toFixed(2)}`;
	if (options.dryRun) {
		return {
			ok: true,
			text: [
				`${options.pagesDir} → ${options.out}`,
				`  ${plural(plan.total, "page")} selected, ${estimate}`,
				`  ${options.language}, ${options.contentType}`,
				"  dry run — nothing was sent",
			].join("\n"),
		};
	}

	if (plan.todo === 0) {
		return { ok: true, text: `nothing to do — all ${plan.total} pages are already read` };
	}

	// Spending money is worth one deliberate keystroke. Small runs stay frictionless.
	if (plan.todo > CONFIRM_ABOVE_PAGES && !options.yes) {
		return {
			ok: false,
			text:
				`error  this would read ${plan.todo} pages (${estimate}).\n` +
				"       Re-run with --yes to confirm, or --dry-run to see the plan.",
		};
	}

	const apiKey = deps.apiKey ?? process.env.SARVAM_API_KEY;
	if (apiKey === undefined || apiKey === "") {
		return {
			ok: false,
			text:
				"error  SARVAM_API_KEY is not set.\n" +
				"       Get a key at https://dashboard.sarvam.ai and put it in the repo-root .env\n" +
				"       (see .env.example). Bun loads it automatically.",
		};
	}

	const make = deps.makeClient ?? ((sarvam: SarvamOptions) => new SarvamClient(sarvam));
	const client = make({
		apiKey,
		language: options.language,
		contentType: options.contentType,
		requestsPerMinute: options.requestsPerMinute,
	});

	const result = await ocrBook(options, client, deps.onProgress);
	if (!result.ok) {
		return { ok: false, text: `error  ${result.error}` };
	}

	const { manifest } = result;
	const scored = manifest.pages.filter((page) => page.orthography.examined > 0);
	const worst = [...scored].sort((a, b) => b.orthography.rate - a.orthography.rate).slice(0, 5);
	const clean = scored.filter((page) => page.orthography.ok).length;
	const gujarati = manifest.pages.filter((page) => page.script === "gujr").length;

	const lines = [
		`${manifest.source} → ${options.out}`,
		`  ${plural(result.done, "page")} read` +
			(result.reused > 0 ? `, ${result.reused} kept from an earlier run` : "") +
			` — about ₹${estimateRupees(result.done).toFixed(2)}`,
		`  ${gujarati}/${manifest.pages.length} came back as Gujarati`,
		`  ${clean}/${scored.length} pages are orthographically clean`,
		`  manifest: ${join(options.out, OCR_MANIFEST_FILE)}`,
	];

	if (worst.length > 0 && (worst[0]?.orthography.rate ?? 0) > 0) {
		lines.push(
			"",
			"Worst pages by impossible-sequence rate — start proofing here:",
			...worst
				.filter((page) => page.orthography.rate > 0)
				.map(
					(page) =>
						`  page ${page.number}: ${page.orthography.violations} in ${page.orthography.examined} letters (${page.orthography.rate}/1000)`,
				),
		);
	}

	if (manifest.failures.length > 0) {
		lines.push(
			"",
			`${plural(manifest.failures.length, "page")} failed:`,
			...manifest.failures.slice(0, 10).map((f) => `  page ${f.number}: ${f.error}`),
		);
	}

	return { ok: manifest.failures.length === 0, text: lines.join("\n") };
}
