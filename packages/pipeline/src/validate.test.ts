import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleProse } from "@granthalaya/core/fixtures";
import { PACKAGE_FILENAME, runValidate, validatePackageAt } from "./index.ts";

const workspace = await mkdtemp(join(tmpdir(), "granthalaya-validate-"));

afterAll(async () => {
	await rm(workspace, { recursive: true, force: true });
});

/** Write a package into a fresh directory and return that directory. */
async function packageDir(name: string, book: unknown): Promise<string> {
	const directory = join(workspace, name);
	await Bun.write(join(directory, PACKAGE_FILENAME), JSON.stringify(book, null, 2));
	return directory;
}

test("a valid package reports clean, with its version and verse count", async () => {
	const directory = await packageDir("valid", sampleProse);
	const report = await validatePackageAt(directory);
	expect(report.ok).toBe(true);
	expect(report.text).toContain("sample-prose@1.1.0 (draft) — 5 verses");
	expect(report.text).toContain("no issues");
});

test("a package file can be named directly, not just its directory", async () => {
	const directory = await packageDir("direct", sampleProse);
	const report = await validatePackageAt(join(directory, PACKAGE_FILENAME));
	expect(report.ok).toBe(true);
});

test("a broken package reports each issue against the verse it belongs to", async () => {
	const broken = structuredClone(sampleProse);
	const chapter = broken.structure[0];
	if (chapter === undefined || chapter.kind === "verse") {
		throw new Error("fixture shape changed");
	}
	const discourse = chapter.children[0];
	if (discourse === undefined || discourse.kind === "verse") {
		throw new Error("fixture shape changed");
	}
	const verse = discourse.children[0];
	if (verse === undefined || verse.kind !== "verse") {
		throw new Error("fixture shape changed");
	}
	// Edit the text without restamping the hash — what a hand-edited package looks like.
	verse.layers.gu = "બદલાયેલું લખાણ.";
	verse.layers.hi = "अनुवाद";

	const report = await validatePackageAt(await packageDir("broken", broken));
	expect(report.ok).toBe(false);
	expect(report.text).toContain("sample-prose/khand-1/3#p1");
	expect(report.text).toContain("hash-mismatch");
	expect(report.text).toContain("undeclared-layer");
	expect(report.text).toContain("2 errors, 0 warnings");
});

test("malformed JSON is a report, not a crash", async () => {
	const path = join(workspace, "malformed.json");
	await Bun.write(path, "{ not json");
	const report = await validatePackageAt(path);
	expect(report.ok).toBe(false);
	expect(report.text).toContain("not valid JSON");
});

test("a path with no package there fails cleanly", async () => {
	const report = await validatePackageAt(join(workspace, "nothing-here"));
	expect(report.ok).toBe(false);
	expect(report.text).toContain("cannot read a book package here");
});

test("validate with no path explains itself instead of validating nothing", async () => {
	const report = await runValidate([]);
	expect(report.ok).toBe(false);
	expect(report.text).toContain("needs a path");
});

test("one bad package among several fails the whole run", async () => {
	const good = await packageDir("multi-good", sampleProse);
	const bad = join(workspace, "multi-missing");
	const report = await runValidate([good, bad]);
	expect(report.ok).toBe(false);
	expect(report.text).toContain("sample-prose@1.1.0");
	expect(report.text).toContain("cannot read a book package here");
});
