import { expect, test } from "bun:test";
import { GUJARATI_PAGES, LEGACY_PAGES } from "./fixtures.ts";
import { inspectPdfBytes, samplePageIndices, stripSubsetPrefix } from "./inspect.ts";
import { blankPdf, legacyTextPdf, nestedFormPdf, scannedPdf, unicodeTextPdf } from "./synthetic.ts";

function facts(bytes: Uint8Array, sample?: number) {
	const inspection = inspectPdfBytes(bytes, sample);
	if (!inspection.ok) {
		throw new Error(`expected a readable PDF, got ${inspection.reason}: ${inspection.detail}`);
	}
	return inspection;
}

test("samples every page of a short book", () => {
	expect(samplePageIndices(4, 12)).toEqual([0, 1, 2, 3]);
	expect(samplePageIndices(0)).toEqual([]);
});

test("spreads the sample across a long book instead of taking a prefix", () => {
	// Front matter is routinely typeset unlike the body — an English title page, a scanned
	// frontispiece — so a prefix would misread the book more often than a spread does.
	const indices = samplePageIndices(400, 8);
	expect(indices).toHaveLength(8);
	expect(indices[0]).toBeGreaterThan(0);
	expect(indices.at(-1)).toBeLessThan(399);
	expect([...indices].sort((a, b) => a - b)).toEqual(indices);
	expect(new Set(indices).size).toBe(8);
});

test("samples deterministically, so two runs over a corpus are comparable", () => {
	expect(samplePageIndices(137, 12)).toEqual(samplePageIndices(137, 12));
});

test("strips the subset tag a PDF writer prepends to an embedded font", () => {
	expect(stripSubsetPrefix("ABCDEF+Rasa-Regular")).toBe("Rasa-Regular");
	expect(stripSubsetPrefix("Rasa-Regular")).toBe("Rasa-Regular");
	expect(stripSubsetPrefix("ABC+Rasa")).toBe("ABC+Rasa"); // not a six-letter tag
});

test("reads text, geometry and page count off a Unicode PDF", () => {
	const inspection = facts(unicodeTextPdf(GUJARATI_PAGES));
	expect(inspection.pageCount).toBe(4);
	expect(inspection.pages).toHaveLength(4);
	expect(inspection.pages[0]?.text).toContain("ભૂર્ભુવઃ");
	expect(inspection.pages[0]?.widthPt).toBe(595);
	expect(inspection.pages[0]?.heightPt).toBe(842);
	expect(inspection.repaired).toBe(false);
});

test("reports a Type0 font's ToUnicode map and notices it is in use", () => {
	const [font] = facts(unicodeTextPdf(GUJARATI_PAGES)).fonts;
	expect(font).toMatchObject({
		name: "Rasa-Regular",
		subtype: "Type0",
		encoding: "Identity-H",
		hasToUnicode: true,
		used: true,
	});
});

test("tells an embedded font programme from a missing one", () => {
	expect(facts(unicodeTextPdf(GUJARATI_PAGES)).fonts[0]?.embedded).toBe(false);
	expect(facts(unicodeTextPdf(GUJARATI_PAGES, { embedded: true })).fonts[0]?.embedded).toBe(true);
});

test("reports a legacy font as declaring no ToUnicode map", () => {
	const [font] = facts(legacyTextPdf(LEGACY_PAGES)).fonts;
	expect(font).toMatchObject({
		name: "ShreeGuj-0768",
		subtype: "TrueType",
		encoding: "WinAnsiEncoding",
		hasToUnicode: false,
		used: true,
	});
});

test("finds fonts inside a Form XObject", () => {
	// A book whose body text sits inside a form would otherwise look like it had no fonts.
	const inspection = facts(nestedFormPdf(LEGACY_PAGES));
	expect(inspection.fonts.map((font) => font.name)).toEqual(["ShreeGuj-0768"]);
	expect(inspection.fonts[0]?.used).toBe(true);
	expect(inspection.pages[0]?.text).toContain("NA[T>");
});

test("measures the share of a page covered by images", () => {
	expect(facts(scannedPdf(3)).pages[0]).toMatchObject({ imageCount: 1, imageCoverage: 1 });

	const partial = facts(scannedPdf(3, { coverage: 0.5 })).pages[0];
	expect(partial?.imageCoverage).toBeCloseTo(0.25, 2); // half the width by half the height
});

test("sees no text and no images on a blank page", () => {
	const page = facts(blankPdf(2)).pages[0];
	expect(page?.text).toBe("");
	expect(page?.imageCount).toBe(0);
});

test("reports an unreadable file rather than throwing", () => {
	const inspection = inspectPdfBytes(new TextEncoder().encode("this is not a PDF"));
	expect(inspection.ok).toBe(false);
	if (!inspection.ok) {
		expect(inspection.reason).toBe("unreadable");
		expect(inspection.detail).not.toBe("");
	}
});

test("honours the page-sample limit on a long book", () => {
	const inspection = facts(unicodeTextPdf(Array(40).fill(GUJARATI_PAGES[0] as string)), 5);
	expect(inspection.pageCount).toBe(40);
	expect(inspection.pages).toHaveLength(5);
});
