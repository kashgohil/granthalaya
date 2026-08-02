import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GUJARATI_PAGES } from "./pdf/fixtures.ts";
import { MANIFEST_FILE, type PageManifest } from "./pdf/rasterize.ts";
import { unicodeTextPdf } from "./pdf/synthetic.ts";
import {
	bookSlug,
	DEFAULT_PAGES_ROOT,
	parseRenderArgs,
	type RenderOptions,
	runRender,
} from "./render.ts";

const temps: string[] = [];

afterAll(async () => {
	await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })));
});

function optionsOf(args: readonly string[]): RenderOptions {
	const parsed = parseRenderArgs(args);
	if (!parsed.ok) {
		throw new Error(parsed.error);
	}
	return parsed.options;
}

function errorOf(args: readonly string[]): string {
	const parsed = parseRenderArgs(args);
	if (parsed.ok) {
		throw new Error("expected a parse failure");
	}
	return parsed.error;
}

// --- argument parsing ---------------------------------------------------------------------

test("renders the whole book at 300 DPI greyscale PNG by default", () => {
	// The defaults are the decision: 300 DPI is what every OCR engine's documentation asks for,
	// greyscale because engines binarize anyway, PNG because JPEG rings around thin conjuncts.
	const options = optionsOf(["book.pdf"]);
	expect(options.dpi).toBe(300);
	expect(options.format).toBe("png");
	expect(options.color).toBe("gray");
	expect(options.pages).toBeNull();
	expect(options.force).toBe(false);
});

test("puts the pages under content/pages beside the book's own name", () => {
	expect(optionsOf(["content/source/Kabar and Kagdo.pdf"]).out).toBe(
		`${DEFAULT_PAGES_ROOT}/kabar-and-kagdo`,
	);
	expect(optionsOf(["book.pdf", "--out", "somewhere/else"]).out).toBe("somewhere/else");
});

test("slugs a book's file name into something safe to type", () => {
	expect(bookSlug("Gopalanand Swami Ni Vato 26 Feb 2022.pdf")).toBe(
		"gopalanand-swami-ni-vato-26-feb-2022",
	);
	expect(bookSlug("/a/b/Vachanamrut_(2011).PDF")).toBe("vachanamrut-2011");
	// A Gujarati file name leaves nothing Latin behind, and an empty path segment is worse than
	// a dull one.
	expect(bookSlug("વચનામૃત.pdf")).toBe("book");
});

test("takes every option it advertises", () => {
	const options = optionsOf([
		"book.pdf",
		"--dpi",
		"600",
		"--format",
		"jpeg",
		"--quality",
		"80",
		"--color",
		"--force",
		"--pages",
		"1-40",
	]);
	expect(options.dpi).toBe(600);
	expect(options.format).toBe("jpeg");
	expect(options.quality).toBe(80);
	expect(options.color).toBe("rgb");
	expect(options.force).toBe(true);
	expect(options.pages).toEqual([{ from: 1, to: 40 }]);
});

test("refuses arguments it cannot honour rather than guessing", () => {
	expect(errorOf([])).toContain("needs a PDF");
	// Two books into one directory would collide on page numbers, and the manifest can only
	// pin one source hash.
	expect(errorOf(["a.pdf", "b.pdf"])).toContain("one PDF at a time");
	expect(errorOf(["book.pdf", "--dpi", "40"])).toContain("--dpi");
	expect(errorOf(["book.pdf", "--dpi", "5000"])).toContain("--dpi");
	expect(errorOf(["book.pdf", "--dpi", "300.5"])).toContain("--dpi");
	expect(errorOf(["book.pdf", "--format", "tiff"])).toContain("--format");
	expect(errorOf(["book.pdf", "--quality", "0"])).toContain("--quality");
	expect(errorOf(["book.pdf", "--pages", "banana"])).toContain("--pages");
	expect(errorOf(["book.pdf", "--out"])).toContain("--out");
	expect(errorOf(["book.pdf", "--dither"])).toContain("Unknown option");
});

// --- driving a run ------------------------------------------------------------------------

async function book(): Promise<{ pdf: string; out: string }> {
	const dir = await mkdtemp(join(tmpdir(), "granthalaya-render-cli-"));
	temps.push(dir);
	const pdf = join(dir, "Test Book.pdf");
	await Bun.write(pdf, unicodeTextPdf(GUJARATI_PAGES));
	return { pdf, out: join(dir, "pages") };
}

test("renders a book and reports what it produced", async () => {
	const { pdf, out } = await book();
	const result = await runRender([pdf, "--out", out, "--dpi", "72"]);

	expect(result.ok).toBe(true);
	expect(result.text).toContain("Test Book.pdf");
	expect(result.text).toContain("72 DPI greyscale png");
	expect(result.text).toContain(`${GUJARATI_PAGES.length} pages rendered`);
	expect(result.text).toContain("595×842 px");
	expect(result.text).toContain(MANIFEST_FILE);

	const manifest = (await Bun.file(join(out, MANIFEST_FILE)).json()) as PageManifest;
	expect(manifest.pages).toHaveLength(GUJARATI_PAGES.length);
});

test("says how many pages it kept from an earlier run", async () => {
	const { pdf, out } = await book();
	await runRender([pdf, "--out", out, "--dpi", "72"]);
	const second = await runRender([pdf, "--out", out, "--dpi", "72"]);
	expect(second.ok).toBe(true);
	expect(second.text).toContain(`${GUJARATI_PAGES.length} kept from an earlier run`);
});

test("renders just the pages asked for", async () => {
	const { pdf, out } = await book();
	const result = await runRender([pdf, "--out", out, "--dpi", "72", "--pages", "2-"]);
	expect(result.ok).toBe(true);
	expect(result.text).toContain(`${GUJARATI_PAGES.length - 1} pages rendered`);
	expect(await Bun.file(join(out, "page-0001.png")).exists()).toBe(false);
});

test("fails loudly on a file it cannot render", async () => {
	const result = await runRender(["/nowhere/missing.pdf", "--out", "/tmp/unused"]);
	expect(result.ok).toBe(false);
	expect(result.text).toContain("error");
});

test("prints usage when the arguments are wrong", async () => {
	const result = await runRender([]);
	expect(result.ok).toBe(false);
	expect(result.text).toContain("Usage: granthalaya render");
});
