import { expect, test } from "bun:test";
import {
	batchPages,
	estimateRupees,
	type FetchLike,
	MAX_PAGES_PER_JOB,
	type PageFile,
	RateLimiter,
	SarvamClient,
	SarvamError,
	type SarvamOptions,
} from "./sarvam.ts";

/**
 * A stand-in for the API. Records what was sent and replays scripted responses, so the client
 * is testable without a network, a key, or anyone's money.
 */
function stubApi(
	script: Partial<{
		digitise: { status: number; body: unknown };
		statuses: string[];
		results: unknown;
	}> = {},
) {
	const calls: { path: string; method: string; body?: FormData }[] = [];
	let polls = 0;
	const statuses = script.statuses ?? ["completed"];

	const json = (body: unknown, status = 200): Response =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});

	const fetchStub: FetchLike = async (input, init) => {
		const url = new URL(String(input));
		const method = init?.method ?? "GET";
		calls.push({
			path: url.pathname,
			method,
			body: init?.body instanceof FormData ? init.body : undefined,
		});

		if (url.pathname.endsWith("/digitise")) {
			const scripted = script.digitise;
			if (scripted !== undefined) {
				return json(scripted.body, scripted.status);
			}
			return json({ job_id: "job-1", status: "pending", run_id: "run-1" }, 201);
		}
		if (url.pathname.endsWith("/status")) {
			const status = statuses[Math.min(polls, statuses.length - 1)] as string;
			polls += 1;
			return json({
				job_id: "job-1",
				status,
				usage: { pages_total: 2, pages_processed: 2, pages_succeeded: 2, pages_failed: 0 },
			});
		}
		if (url.pathname.endsWith("/results")) {
			return json(script.results ?? LIVE_SHAPED_RESULTS);
		}
		return json({ detail: "not found" }, 404);
	};

	return { calls, fetch: fetchStub };
}

/**
 * The shape the API actually sends, taken from a real response — `filename`, `page_num` and
 * `blocks`, none of which match its own published OpenAPI schema.
 */
const LIVE_SHAPED_RESULTS = {
	job_id: "job-1",
	type: "digitise",
	status: "completed",
	usage: { pages_total: 2, pages_processed: 2, pages_succeeded: 2, pages_failed: 0 },
	documents: [
		{
			filename: "page-0001.png",
			page_count: 1,
			pages: [
				{
					page_num: 1,
					image_width: 1414,
					image_height: 2110,
					blocks: [
						{
							block_id: "p1-b2",
							text: "પ્રથમ પાનું",
							layout_tag: "paragraph",
							reading_order: 2,
							coordinates: { x1: 132, y1: 275, x2: 1285, y2: 1692 },
						},
						{
							block_id: "p1-b1",
							text: "૫૬ ગોપાળાનંદસ્વામીની વાતો",
							layout_tag: "header",
							reading_order: 1,
							coordinates: { x1: 113, y1: 24, x2: 1308, y2: 246 },
						},
					],
				},
			],
		},
		{
			filename: "page-0002.png",
			page_count: 1,
			pages: [
				{
					page_num: 1,
					image_width: 1414,
					image_height: 2110,
					blocks: [
						{
							block_id: "p1-b1",
							text: "બીજું પાનું",
							layout_tag: "paragraph",
							reading_order: 1,
							coordinates: { x1: 10, y1: 20, x2: 30, y2: 40 },
						},
					],
				},
			],
		},
	],
};

function client(api: ReturnType<typeof stubApi>, over: Partial<SarvamOptions> = {}): SarvamClient {
	return new SarvamClient({
		apiKey: "test-key",
		fetch: api.fetch,
		// Nothing in these tests should actually wait.
		sleep: async () => {},
		pollIntervalMs: 0,
		requestsPerMinute: 0,
		...over,
	});
}

const pages: PageFile[] = [
	{ name: "page-0001.png", bytes: new Uint8Array([1, 2, 3]) },
	{ name: "page-0002.png", bytes: new Uint8Array([4, 5, 6]) },
];

// --- batching ------------------------------------------------------------------------------

test("splits a book into jobs the API will accept", () => {
	// Ten pages per job is the API's ceiling, so 442 pages is 45 jobs — enforced here rather
	// than discovered at the first 400.
	expect(batchPages(Array.from({ length: 442 }, (_, i) => i)).length).toBe(45);
	expect(batchPages([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
	expect(batchPages([])).toEqual([]);
	expect(batchPages(Array.from({ length: MAX_PAGES_PER_JOB }, (_, i) => i))).toHaveLength(1);
});

test("prices a run before it is run, not after", () => {
	expect(estimateRupees(442)).toBe(221);
	expect(estimateRupees(0)).toBe(0);
});

// --- the request ---------------------------------------------------------------------------

test("sends the pages as files, in Gujarati, as printed text", async () => {
	const api = stubApi();
	await client(api).digitise(pages);

	const submitted = api.calls.find((call) => call.path.endsWith("/digitise"));
	expect(submitted?.method).toBe("POST");
	const form = submitted?.body as FormData;
	expect(form.getAll("file")).toHaveLength(2);
	expect(form.get("language")).toBe("gu-IN");
	expect(form.get("content_type")).toBe("printed");
	expect(form.get("output_format")).toBe("md");
	// Our pages come from `render` and are never rotated, so orientation correction could only
	// introduce an error that was not there.
	expect(form.get("auto_orient")).toBe("false");
});

test("keeps each page's bytes to its own part", async () => {
	// A view over a shared buffer hands the whole buffer to Blob, which would send every page
	// in every part — and the failure would look like an OCR accuracy problem, not a bug.
	const api = stubApi();
	await client(api).digitise(pages);

	const form = api.calls.find((call) => call.path.endsWith("/digitise"))?.body as FormData;
	const parts = form.getAll("file") as File[];
	expect(await parts[0]?.bytes()).toEqual(new Uint8Array([1, 2, 3]));
	expect(await parts[1]?.bytes()).toEqual(new Uint8Array([4, 5, 6]));
});

test("names each part so the response can be matched back to a page", async () => {
	// The API sends `filename`, not the `file_name` its own OpenAPI schema advertises. Getting
	// this wrong matched nothing and reported every page as "returned no text".
	const api = stubApi();
	const result = await client(api).digitise(pages);
	expect(result.pages.map((page) => page.fileName)).toEqual(["page-0001.png", "page-0002.png"]);
	expect(result.pages[0]?.blocks[1]?.text).toBe("પ્રથમ પાનું");
});

test("reads the blocks the API really returns, with their tags and boxes", async () => {
	const api = stubApi();
	const result = await client(api).digitise(pages);
	const page = result.pages[0];

	expect(page?.widthPx).toBe(1414);
	expect(page?.heightPx).toBe(2110);
	// Sorted into reading order, whatever order they arrived in.
	expect(page?.blocks.map((block) => block.tag)).toEqual(["header", "paragraph"]);
	expect(page?.blocks[0]?.bbox).toEqual([113, 24, 1308, 246]);
	expect(page?.blocks[0]?.id).toBe("p1-b1");
});

test("still copes if they ever ship the shape they documented", async () => {
	const api = stubApi({
		results: {
			documents: [{ file_name: "page-0001.png", pages: [{ page_number: 1, content: "કંઈક" }] }],
		},
	});
	const result = await client(api).digitise(pages);
	expect(result.pages[0]?.fileName).toBe("page-0001.png");
	expect(result.pages[0]?.blocks[0]?.text).toBe("કંઈક");
});

test("refuses a batch bigger than the API accepts", async () => {
	const api = stubApi();
	const tooMany = Array.from({ length: 11 }, (_, index) => ({
		name: `page-${index}.png`,
		bytes: new Uint8Array([0]),
	}));
	expect(client(api).startDigitise(tooMany)).rejects.toThrow("at most 10 pages");
	expect(client(api).startDigitise([])).rejects.toThrow("at least one page");
});

test("authenticates with the header the API asks for", async () => {
	const seen: (string | null)[] = [];
	const api = stubApi();
	const wrapped: FetchLike = async (input, init) => {
		seen.push(new Headers(init?.headers).get("api-subscription-key"));
		return api.fetch(input, init);
	};
	await client(api, { fetch: wrapped }).digitise(pages);
	// Every request, not just the first: a poll without the key would 403 halfway through a book.
	expect(seen).not.toHaveLength(0);
	expect(new Set(seen)).toEqual(new Set(["test-key"]));
});

// --- polling -------------------------------------------------------------------------------

test("polls until the job reaches a terminal state", async () => {
	const api = stubApi({ statuses: ["pending", "running", "running", "completed"] });
	const result = await client(api).digitise(pages);
	expect(result.status).toBe("completed");
	expect(api.calls.filter((call) => call.path.endsWith("/status"))).toHaveLength(4);
});

test("returns what succeeded when a job only partly completed", async () => {
	// Nine good pages out of ten is worth keeping; the failures are reported, not thrown.
	const api = stubApi({ statuses: ["partially_completed"] });
	const result = await client(api).digitise(pages);
	expect(result.status).toBe("partially_completed");
	expect(result.pages).toHaveLength(2);
});

test("gives up on a job that never finishes", async () => {
	const api = stubApi({ statuses: ["running"] });
	expect(client(api, { jobTimeoutMs: -1 }).digitise(pages)).rejects.toThrow("still");
});

test("raises a failed or rejected job rather than returning empty text", async () => {
	// Silently writing empty pages would look like a book with blank pages, which is exactly
	// the failure a proofreader would not think to question.
	for (const status of ["failed", "rejected"]) {
		const api = stubApi({ statuses: [status] });
		expect(client(api).digitise(pages)).rejects.toThrow(status);
	}
});

// --- errors --------------------------------------------------------------------------------

test("says plainly when the key is wrong", async () => {
	const api = stubApi({ digitise: { status: 403, body: { detail: "invalid subscription key" } } });
	expect(client(api).digitise(pages)).rejects.toThrow("rejected the API key");
});

test("tells a billing problem apart from a bad request", async () => {
	// Different fix: one needs a credit card, the other needs a code change.
	const api = stubApi({ digitise: { status: 402, body: { detail: "insufficient credits" } } });
	expect(client(api).digitise(pages)).rejects.toThrow("billing");
});

test("marks rate limits and server errors as worth retrying", async () => {
	for (const [status, retryable] of [
		[429, true],
		[500, true],
		[400, false],
	] as const) {
		const api = stubApi({ digitise: { status, body: { detail: "nope" } } });
		try {
			await client(api).digitise(pages);
			throw new Error("expected a failure");
		} catch (cause) {
			expect(cause).toBeInstanceOf(SarvamError);
			expect((cause as SarvamError).retryable).toBe(retryable);
		}
	}
});

test("does not pretend a job started when no id came back", async () => {
	const api = stubApi({ digitise: { status: 201, body: { status: "pending" } } });
	expect(client(api).digitise(pages)).rejects.toThrow("no job_id");
});

// --- the rate limiter ----------------------------------------------------------------------

test("lets a burst through up to the limit, then waits", async () => {
	let now = 0;
	const waits: number[] = [];
	const limiter = new RateLimiter(
		10,
		() => now,
		async (ms) => {
			waits.push(ms);
			now += ms;
		},
	);

	for (let index = 0; index < 10; index += 1) {
		await limiter.take();
	}
	expect(waits).toEqual([]);

	await limiter.take();
	expect(waits).toHaveLength(1);
	expect(waits[0]).toBeGreaterThan(60_000 - 100);
});

test("slides the window instead of resetting it", async () => {
	// A fixed window lets twenty requests through either side of a minute boundary, which is
	// exactly the burst the limit exists to prevent.
	let now = 0;
	const limiter = new RateLimiter(
		2,
		() => now,
		async (ms) => {
			now += ms;
		},
	);
	await limiter.take();
	now += 30_000;
	await limiter.take();
	now += 31_000; // the first has aged out, the second has not
	await limiter.take();
	expect(now).toBe(61_000);
});

test("is a no-op when the limit is switched off", async () => {
	const limiter = new RateLimiter(
		0,
		() => 0,
		async () => {
			throw new Error("should not wait");
		},
	);
	for (let index = 0; index < 100; index += 1) {
		await limiter.take();
	}
});
