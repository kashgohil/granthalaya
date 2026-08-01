import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENGLISH_PAGES, GUJARATI_PAGES, LEGACY_PAGES } from "./pdf/fixtures.ts";
import { legacyTextPdf, scannedPdf, unicodeTextPdf } from "./pdf/synthetic.ts";
import { collectPdfPaths, commonRoot, parseTriageArgs, runTriage, triagePaths } from "./triage.ts";

const scratch: string[] = [];

afterAll(async () => {
	await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A throwaway directory holding a small corpus of every shape triage has to tell apart. */
async function corpus(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "granthalaya-triage-"));
	scratch.push(dir);
	await Bun.write(join(dir, "gayatri.pdf"), unicodeTextPdf(GUJARATI_PAGES));
	await Bun.write(join(dir, "vachanamrut.PDF"), legacyTextPdf(LEGACY_PAGES));
	await Bun.write(join(dir, "nested", "scan.pdf"), scannedPdf(6));
	await Bun.write(join(dir, "nested", "preface.pdf"), legacyTextPdf(ENGLISH_PAGES, "Helvetica"));
	await Bun.write(join(dir, "notes.txt"), "not a PDF");
	return dir;
}

// --- argument parsing ----------------------------------------------------------------------

test("parses paths and options", () => {
	const parsed = parseTriageArgs([
		"books",
		"--out",
		"inv.md",
		"--json",
		"inv.json",
		"--sample",
		"4",
	]);
	expect(parsed).toEqual({
		ok: true,
		options: { paths: ["books"], out: "inv.md", json: "inv.json", sample: 4 },
	});
});

test("refuses a run with nothing to triage", () => {
	expect(parseTriageArgs([])).toMatchObject({ ok: false });
	expect(parseTriageArgs(["--json", "out.json"])).toMatchObject({ ok: false });
});

test("rejects a flag with a missing or nonsense value", () => {
	// `--out --json x` would otherwise silently write the inventory to a file called "--json".
	expect(parseTriageArgs(["books", "--out"])).toMatchObject({ ok: false });
	expect(parseTriageArgs(["books", "--out", "--json"])).toMatchObject({ ok: false });
	expect(parseTriageArgs(["books", "--sample", "0"])).toMatchObject({ ok: false });
	expect(parseTriageArgs(["books", "--sample", "half"])).toMatchObject({ ok: false });
	expect(parseTriageArgs(["books", "--verbose"])).toMatchObject({ ok: false });
});

// --- finding the files ---------------------------------------------------------------------

test("walks a directory for PDFs, whatever the extension's case, ignoring everything else", async () => {
	const dir = await corpus();
	const found = await collectPdfPaths([dir]);
	expect(found.map((path) => path.slice(dir.length + 1))).toEqual([
		"gayatri.pdf",
		"nested/preface.pdf",
		"nested/scan.pdf",
		"vachanamrut.PDF",
	]);
});

test("accepts a single file as well as a directory, and never lists one twice", async () => {
	const dir = await corpus();
	const one = join(dir, "gayatri.pdf");
	expect(await collectPdfPaths([one])).toEqual([one]);
	expect(await collectPdfPaths([dir, one])).toHaveLength(4);
});

test("finds the common root so report paths stay readable", () => {
	expect(commonRoot(["/books/a/x.pdf", "/books/a/y.pdf"])).toBe("/books/a");
	expect(commonRoot(["/books/a/x.pdf", "/books/b/y.pdf"])).toBe("/books");
	expect(commonRoot(["/x.pdf"])).toBe("");
	expect(commonRoot([])).toBe(null);
});

// --- the run itself ------------------------------------------------------------------------

test("triages a whole corpus and reaches the right verdict for each shape", async () => {
	const dir = await corpus();
	const report = await triagePaths({ paths: [dir], out: null, json: null, sample: 12 });

	const byPath = new Map(report.entries.map((entry) => [entry.path, entry.triage]));
	expect(byPath.get("gayatri.pdf")?.strategy).toBe("unicode-text");
	expect(byPath.get("vachanamrut.PDF")?.strategy).toBe("legacy-text");
	expect(byPath.get("nested/scan.pdf")?.strategy).toBe("scanned");
	expect(byPath.get("nested/preface.pdf")?.strategy).toBe("unicode-text");

	// Three of the four need OCR-or-nothing; only the two real text layers do not.
	expect(report.entries.filter((entry) => entry.triage.needsOcr)).toHaveLength(2);
	expect(report.ok).toBe(true);
});

test("reports paths relative to the corpus root", async () => {
	const dir = await corpus();
	const report = await triagePaths({ paths: [dir], out: null, json: null, sample: 12 });
	for (const entry of report.entries) {
		expect(entry.path.startsWith("/")).toBe(false);
	}
});

test("writes the markdown and JSON inventories where it is told to", async () => {
	const dir = await corpus();
	const out = join(dir, "inventory.md");
	const json = join(dir, "inventory.json");
	const result = await runTriage([dir, "--out", out, "--json", json]);

	expect(result.ok).toBe(true);
	expect(result.text).toContain(`inventory written to ${out}`);

	const markdown = await Bun.file(out).text();
	expect(markdown).toContain("# PDF inventory");
	expect(markdown).toContain("gayatri.pdf");
	expect(markdown).toContain("Candidates for the first book");

	const parsed = (await Bun.file(json).json()) as {
		summary: { total: number; needingOcr: number };
		files: { path: string; strategy: string; needsOcr: boolean }[];
	};
	expect(parsed.summary.total).toBe(4);
	expect(parsed.summary.needingOcr).toBe(2);
	expect(parsed.files.find((file) => file.path === "nested/scan.pdf")?.needsOcr).toBe(true);
});

test("prints the report to stdout when no output file is given", async () => {
	const dir = await corpus();
	const result = await runTriage([dir]);
	expect(result.text).toContain("# PDF inventory");
	expect(result.text).toContain("will need OCR");
});

test("fails rather than writing an empty inventory when there are no PDFs", async () => {
	const empty = await mkdtemp(join(tmpdir(), "granthalaya-empty-"));
	scratch.push(empty);
	const result = await runTriage([empty]);
	expect(result.ok).toBe(false);
	expect(result.text).toContain("no PDFs found");
});

test("exits non-zero when a file could not be read at all", async () => {
	const dir = await mkdtemp(join(tmpdir(), "granthalaya-broken-"));
	scratch.push(dir);
	await Bun.write(join(dir, "truncated.pdf"), "%PDF-1.7\nand then nothing");
	const result = await runTriage([dir]);
	expect(result.ok).toBe(false);
});

test("honours --sample so a long book is not read cover to cover", async () => {
	const dir = await mkdtemp(join(tmpdir(), "granthalaya-long-"));
	scratch.push(dir);
	await Bun.write(
		join(dir, "long.pdf"),
		unicodeTextPdf(Array(60).fill(GUJARATI_PAGES[0] as string)),
	);

	const report = await triagePaths({ paths: [dir], out: null, json: null, sample: 3 });
	expect(report.entries[0]?.pageCount).toBe(60);
	expect(report.entries[0]?.triage.pages).toHaveLength(3);
});
