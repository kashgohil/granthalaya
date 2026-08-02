/**
 * Sarvam Vision — the Doc AI *digitise* pipeline, used as this project's OCR engine (P1.2).
 *
 * Chosen because it is the only candidate trained on Indic documents specifically rather than
 * treating Gujarati as one language among a hundred, and because it classifies page regions
 * (`paragraph`, `footnote`, `header`, `page-number`, `folio`) — which is exactly the apparatus
 * that must be kept out of scripture text.
 *
 * We send our own rendered page images, never the source PDF. Two reasons: the PDF's text
 * layer is the thing we established we cannot trust, and the images are the artefact pinned by
 * hash in the render manifest, so what was OCR'd is exactly what a human later proofreads.
 *
 * API shape: POST a job, poll until terminal, fetch results. Ten pages per job and ten
 * requests a minute, both enforced here rather than discovered at 429.
 *
 * Docs: https://docs.sarvam.ai/api-reference/doc-ai/job/digitise
 */

export const SARVAM_BASE_URL = "https://api.sarvam.ai";

/** The API's own ceiling: a digitise job takes at most ten pages. */
export const MAX_PAGES_PER_JOB = 10;

/** The API's published rate limit. Counted across every request, polls included. */
export const DEFAULT_REQUESTS_PER_MINUTE = 10;

/** Gujarati, as a BCP-47 tag — the `language` field is not optional in practice. */
export const GUJARATI = "gu-IN";

/**
 * Just the call signature, not `typeof fetch` — Bun's fetch carries extras (`preconnect`) that
 * a test stub has no business implementing.
 */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type SarvamOptions = {
	readonly apiKey: string;
	readonly baseUrl?: string;
	/** Injected so the client is testable without a network or a key. */
	readonly fetch?: FetchLike;
	readonly language?: string;
	readonly outputFormat?: "md" | "html";
	readonly contentType?: "printed" | "handwritten" | "mixed";
	/**
	 * Off by default, unlike the API. Our pages come from `render`, which never rotates them,
	 * so orientation correction can only introduce an error that was not there.
	 */
	readonly autoOrient?: boolean;
	readonly model?: string;
	readonly requestsPerMinute?: number;
	readonly pollIntervalMs?: number;
	/** Give up on a job that never reaches a terminal state. */
	readonly jobTimeoutMs?: number;
	/** Injected in tests so polling does not actually wait. */
	readonly sleep?: (ms: number) => Promise<void>;
};

export type PageFile = {
	/** Used to match the response back to a page, so it must be unique within a job. */
	readonly name: string;
	readonly bytes: Uint8Array;
};

/**
 * A region of a page, as Sarvam classified it.
 *
 * The single most useful thing this API gives us: the running head, the body and the footnote
 * arrive already told apart, which is the apparatus problem P1.2 would otherwise have to solve
 * from coordinates and guesswork.
 */
export type Block = {
	readonly id: string;
	readonly text: string;
	/** `paragraph`, `header`, `footer`, `footnote`, `page-number`, `folio`, `table`, `image`… */
	readonly tag: string;
	readonly readingOrder: number;
	/** `[x1, y1, x2, y2]` in image pixels, so a block maps back onto the rendered page. */
	readonly bbox: readonly [number, number, number, number];
};

export type DigitisedPage = {
	readonly fileName: string;
	readonly pageNumber: number;
	readonly widthPx: number;
	readonly heightPx: number;
	readonly blocks: readonly Block[];
};

export type JobUsage = {
	readonly pagesTotal: number;
	readonly pagesProcessed: number;
	readonly pagesSucceeded: number;
	readonly pagesFailed: number;
};

export type DigitiseResult = {
	readonly jobId: string;
	readonly status: string;
	readonly pages: readonly DigitisedPage[];
	readonly usage: JobUsage;
};

const TERMINAL = new Set(["completed", "partially_completed", "failed", "rejected"]);

/** A job that reached a terminal state without producing usable text. */
export class SarvamError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		/** True when trying again later could plausibly work. */
		readonly retryable = false,
	) {
		super(message);
		this.name = "SarvamError";
	}
}

/**
 * Ten requests a minute, counted across job creation, polling and result fetches alike.
 *
 * A sliding window rather than a fixed one: a fixed window lets twenty requests through either
 * side of a minute boundary, which is exactly the burst the limit exists to prevent.
 */
export class RateLimiter {
	private readonly stamps: number[] = [];

	constructor(
		private readonly perMinute: number,
		private readonly now: () => number = () => Date.now(),
		private readonly sleep: (ms: number) => Promise<void> = Bun.sleep,
	) {}

	async take(): Promise<void> {
		if (this.perMinute <= 0) {
			return;
		}
		for (;;) {
			const cutoff = this.now() - 60_000;
			while (this.stamps.length > 0 && (this.stamps[0] as number) <= cutoff) {
				this.stamps.shift();
			}
			if (this.stamps.length < this.perMinute) {
				this.stamps.push(this.now());
				return;
			}
			// Wait until the oldest request leaves the window, plus a little, so a clock that
			// rounds down does not spin.
			await this.sleep((this.stamps[0] as number) - cutoff + 50);
		}
	}
}

type Resolved = Required<Omit<SarvamOptions, "apiKey" | "baseUrl">> & {
	apiKey: string;
	baseUrl: string;
};

function resolve(options: SarvamOptions): Resolved {
	return {
		apiKey: options.apiKey,
		baseUrl: options.baseUrl ?? SARVAM_BASE_URL,
		fetch: options.fetch ?? globalThis.fetch,
		language: options.language ?? GUJARATI,
		outputFormat: options.outputFormat ?? "md",
		contentType: options.contentType ?? "printed",
		autoOrient: options.autoOrient ?? false,
		model: options.model ?? "sarvam-vision-v1",
		requestsPerMinute: options.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE,
		pollIntervalMs: options.pollIntervalMs ?? 5_000,
		jobTimeoutMs: options.jobTimeoutMs ?? 10 * 60_000,
		sleep: options.sleep ?? Bun.sleep,
	};
}

async function describeFailure(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { detail?: string; title?: string };
		return body.detail ?? body.title ?? response.statusText;
	} catch {
		return response.statusText;
	}
}

/**
 * A Sarvam Doc AI client. One instance per run so the rate limiter is shared across every
 * request it makes — a limiter per call would not limit anything.
 */
export class SarvamClient {
	private readonly options: Resolved;
	private readonly limiter: RateLimiter;

	constructor(options: SarvamOptions) {
		this.options = resolve(options);
		this.limiter = new RateLimiter(
			this.options.requestsPerMinute,
			() => Date.now(),
			this.options.sleep,
		);
	}

	private async request(path: string, init: RequestInit = {}): Promise<Response> {
		await this.limiter.take();
		const response = await this.options.fetch(`${this.options.baseUrl}${path}`, {
			...init,
			headers: { "api-subscription-key": this.options.apiKey, ...init.headers },
		});

		if (response.ok) {
			return response;
		}

		const detail = await describeFailure(response);
		if (response.status === 401 || response.status === 403) {
			throw new SarvamError(`Sarvam rejected the API key (${response.status}): ${detail}`, 403);
		}
		if (response.status === 402 || response.status === 503) {
			throw new SarvamError(`Sarvam billing problem (${response.status}): ${detail}`, 402);
		}
		// 429 is the rate limit and 5xx is theirs, not ours — both are worth another attempt.
		const retryable = response.status === 429 || response.status >= 500;
		throw new SarvamError(`Sarvam ${response.status}: ${detail}`, response.status, retryable);
	}

	/** Submit up to `MAX_PAGES_PER_JOB` page images as one digitise job. */
	async startDigitise(files: readonly PageFile[]): Promise<string> {
		if (files.length === 0) {
			throw new SarvamError("a digitise job needs at least one page");
		}
		if (files.length > MAX_PAGES_PER_JOB) {
			throw new SarvamError(
				`a digitise job takes at most ${MAX_PAGES_PER_JOB} pages, got ${files.length}`,
			);
		}

		const form = new FormData();
		for (const file of files) {
			// A fresh ArrayBuffer per part: passing a view over a shared buffer hands the whole
			// buffer to Blob, which would send every page in every part.
			form.append("file", new Blob([file.bytes.slice().buffer]), file.name);
		}
		form.append("language", this.options.language);
		form.append("output_format", this.options.outputFormat);
		form.append("content_type", this.options.contentType);
		form.append("auto_orient", String(this.options.autoOrient));
		form.append("model", this.options.model);

		const response = await this.request("/doc-ai/v1/job/digitise", { method: "POST", body: form });
		const body = (await response.json()) as { job_id?: string };
		if (typeof body.job_id !== "string" || body.job_id === "") {
			throw new SarvamError("Sarvam accepted the job but returned no job_id");
		}
		return body.job_id;
	}

	async getStatus(jobId: string): Promise<{ status: string; usage: JobUsage }> {
		const response = await this.request(`/doc-ai/v1/job/${jobId}/status`);
		const body = (await response.json()) as {
			status?: string;
			usage?: {
				pages_total?: number;
				pages_processed?: number;
				pages_succeeded?: number;
				pages_failed?: number;
			};
		};
		return {
			status: body.status ?? "unknown",
			usage: {
				pagesTotal: body.usage?.pages_total ?? 0,
				pagesProcessed: body.usage?.pages_processed ?? 0,
				pagesSucceeded: body.usage?.pages_succeeded ?? 0,
				pagesFailed: body.usage?.pages_failed ?? 0,
			},
		};
	}

	/**
	 * Fetch a finished job's pages.
	 *
	 * The field names here are what the API *actually* sends, which is not what its published
	 * OpenAPI schema describes: `filename` not `file_name`, `page_num` not `page_number`, and
	 * `blocks` rather than a single `content` string. Both spellings are accepted so a future
	 * correction on their side does not break this.
	 */
	async getResults(jobId: string): Promise<DigitisedPage[]> {
		const response = await this.request(`/doc-ai/v1/job/${jobId}/results`);
		const body = (await response.json()) as {
			documents?: {
				filename?: string;
				file_name?: string;
				pages?: {
					page_num?: number;
					page_number?: number;
					image_width?: number;
					image_height?: number;
					blocks?: {
						block_id?: string;
						text?: string;
						layout_tag?: string;
						reading_order?: number;
						coordinates?: { x1?: number; y1?: number; x2?: number; y2?: number };
					}[];
					content?: string;
				}[];
			}[];
		};

		const pages: DigitisedPage[] = [];
		for (const document of body.documents ?? []) {
			for (const page of document.pages ?? []) {
				const blocks: Block[] = (page.blocks ?? []).map((block, index) => ({
					id: block.block_id ?? `b${index + 1}`,
					text: block.text ?? "",
					tag: block.layout_tag ?? "paragraph",
					readingOrder: block.reading_order ?? index + 1,
					bbox: [
						block.coordinates?.x1 ?? 0,
						block.coordinates?.y1 ?? 0,
						block.coordinates?.x2 ?? 0,
						block.coordinates?.y2 ?? 0,
					] as const,
				}));

				// Fall back to a plain `content` string if they ever ship the documented shape.
				if (blocks.length === 0 && typeof page.content === "string" && page.content !== "") {
					blocks.push({
						id: "b1",
						text: page.content,
						tag: "paragraph",
						readingOrder: 1,
						bbox: [0, 0, 0, 0] as const,
					});
				}

				pages.push({
					fileName: document.filename ?? document.file_name ?? "",
					pageNumber: page.page_num ?? page.page_number ?? 1,
					widthPx: page.image_width ?? 0,
					heightPx: page.image_height ?? 0,
					blocks: blocks.sort((a, b) => a.readingOrder - b.readingOrder),
				});
			}
		}
		return pages;
	}

	/** Poll until the job reaches a terminal state, or the timeout runs out. */
	async waitForJob(jobId: string): Promise<{ status: string; usage: JobUsage }> {
		const deadline = Date.now() + this.options.jobTimeoutMs;
		for (;;) {
			const state = await this.getStatus(jobId);
			if (TERMINAL.has(state.status)) {
				return state;
			}
			if (Date.now() >= deadline) {
				throw new SarvamError(
					`job ${jobId} was still "${state.status}" after ${Math.round(this.options.jobTimeoutMs / 1000)}s`,
					undefined,
					true,
				);
			}
			await this.options.sleep(this.options.pollIntervalMs);
		}
	}

	/** Submit one batch of pages and return their text. The whole round trip. */
	async digitise(files: readonly PageFile[]): Promise<DigitiseResult> {
		const jobId = await this.startDigitise(files);
		const { status, usage } = await this.waitForJob(jobId);

		if (status === "failed" || status === "rejected") {
			throw new SarvamError(`job ${jobId} came back "${status}"`, undefined, status === "failed");
		}

		return { jobId, status, pages: await this.getResults(jobId), usage };
	}
}

/** Split a run into jobs the API will accept. Pure. */
export function batchPages<T>(pages: readonly T[], size = MAX_PAGES_PER_JOB): T[][] {
	const batches: T[][] = [];
	for (let index = 0; index < pages.length; index += size) {
		batches.push(pages.slice(index, index + size));
	}
	return batches;
}

/** ₹0.5 per page, as published in February 2026. Reported before a run, never inferred after. */
export const RUPEES_PER_PAGE = 0.5;

export function estimateRupees(pageCount: number): number {
	return pageCount * RUPEES_PER_PAGE;
}
