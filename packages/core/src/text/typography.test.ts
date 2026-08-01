import { expect, test } from "bun:test";
import {
	checkTextStyle,
	clampLineHeight,
	lineHeightBand,
	resolveTextStyle,
	scriptSizeScale,
} from "./typography.ts";

test("Gujarati is set 10–15% larger than Latin at the same nominal size", () => {
	const scale = scriptSizeScale("gujr");
	expect(scale).toBeGreaterThanOrEqual(1.1);
	expect(scale).toBeLessThanOrEqual(1.15);
	expect(scriptSizeScale("latn")).toBe(1);

	const gujarati = resolveTextStyle({ script: "gujr", baseFontSize: 16 });
	const latin = resolveTextStyle({ script: "latn", baseFontSize: 16 });
	expect(gujarati.fontSize).toBeGreaterThan(latin.fontSize);
});

test("resolved leading lands inside the script's band", () => {
	const band = lineHeightBand("gujr");
	const style = resolveTextStyle({ script: "gujr", baseFontSize: 17 });
	const ratio = style.lineHeight / style.fontSize;
	expect(ratio).toBeGreaterThanOrEqual(band.min);
	expect(ratio).toBeLessThanOrEqual(band.max);
});

test("Gujarati and Devanagari share the 1.7–2.0 band", () => {
	expect(lineHeightBand("gujr")).toEqual(lineHeightBand("deva"));
	expect(lineHeightBand("gujr").min).toBe(1.7);
	expect(lineHeightBand("gujr").max).toBe(2.0);
});

test("a requested leading is clamped rather than refused", () => {
	// The reading-settings sheet (P2.3) hands over whatever the slider says.
	expect(clampLineHeight(1.2, "gujr")).toBe(1.7);
	expect(clampLineHeight(3, "gujr")).toBe(2.0);
	expect(clampLineHeight(1.85, "gujr")).toBe(1.85);

	const cramped = resolveTextStyle({ script: "gujr", baseFontSize: 16, lineHeight: 1.2 });
	expect(cramped.lineHeight / cramped.fontSize).toBeCloseTo(1.7, 2);
});

test("letter spacing is zero on every resolved style", () => {
	for (const script of ["gujr", "deva", "latn"] as const) {
		expect(resolveTextStyle({ script, baseFontSize: 16 }).letterSpacing).toBe(0);
	}
});

test("verse form keeps its authored line breaks; prose reflows", () => {
	expect(
		resolveTextStyle({ script: "gujr", baseFontSize: 16, form: "verse" }).preserveLineBreaks,
	).toBe(true);
	expect(
		resolveTextStyle({ script: "gujr", baseFontSize: 16, form: "prose" }).preserveLineBreaks,
	).toBe(false);
	// A unit that doesn't say defaults to reflowing — the safe direction, since a wrongly
	// preserved break is visible on every narrow screen.
	expect(resolveTextStyle({ script: "gujr", baseFontSize: 16 }).preserveLineBreaks).toBe(false);
});

test("resolved styles pass their own checker at every size the reader can pick", () => {
	for (let base = 12; base <= 40; base += 1) {
		const style = resolveTextStyle({ script: "gujr", baseFontSize: base });
		expect(checkTextStyle(style, "gujr")).toEqual([]);
	}
});

function codes(violations: readonly { code: string }[]): string[] {
	return violations.map((violation) => violation.code);
}

test("letter spacing on Indic text is a violation at any value", () => {
	expect(codes(checkTextStyle({ letterSpacing: 0.5 }, "gujr"))).toEqual([
		"letter-spacing-on-indic",
	]);
	expect(codes(checkTextStyle({ letterSpacing: -0.2 }, "deva"))).toEqual([
		"letter-spacing-on-indic",
	]);
	expect(checkTextStyle({ letterSpacing: 0 }, "gujr")).toEqual([]);
	// Latin chrome may track — the rule is about splitting conjuncts, not about taste.
	expect(checkTextStyle({ letterSpacing: 0.5 }, "latn")).toEqual([]);
});

test("Latin leading applied to Gujarati is caught", () => {
	expect(codes(checkTextStyle({ fontSize: 16, lineHeight: 24 }, "gujr"))).toEqual([
		"line-height-out-of-band",
	]);
	expect(checkTextStyle({ fontSize: 16, lineHeight: 24 }, "latn")).toEqual([]);
});

test("underlines and justification are refused on scripture", () => {
	expect(codes(checkTextStyle({ textDecorationLine: "underline" }, "gujr"))).toEqual([
		"decoration-on-indic",
	]);
	expect(checkTextStyle({ textDecorationLine: "none" }, "gujr")).toEqual([]);
	expect(codes(checkTextStyle({ textAlign: "justify" }, "gujr"))).toEqual(["justified-text"]);
	expect(codes(checkTextStyle({ textAlign: "justify" }, "latn"))).toEqual(["justified-text"]);
});

test("a style that breaks several rules reports all of them", () => {
	const violations = checkTextStyle(
		{ fontSize: 16, lineHeight: 20, letterSpacing: 1, textDecorationLine: "underline" },
		"gujr",
	);
	expect(codes(violations).sort()).toEqual([
		"decoration-on-indic",
		"letter-spacing-on-indic",
		"line-height-out-of-band",
	]);
});
