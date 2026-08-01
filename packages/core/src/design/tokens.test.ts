import { describe, expect, test } from "bun:test";

import type { Script } from "../book/schema.ts";
import { checkTextStyle, lineHeightBand, scriptSizeScale } from "../text/typography.ts";
import { MOTION, RADIUS, resolveTypeStyle, SPACING, TYPE_SCALE, type TypeToken } from "./tokens.ts";

const TOKENS = Object.keys(TYPE_SCALE) as TypeToken[];
const SCRIPTS: Script[] = ["gujr", "deva", "latn"];

describe("type scale", () => {
	// The point of routing every size through `resolveTypeStyle` is that no screen can
	// produce an illegal page. If a token could, the checker would catch it here rather
	// than a reader catching it on a phone.
	test.each(SCRIPTS)("every token resolves to a legal style in %s", (script) => {
		for (const token of TOKENS) {
			const resolved = resolveTypeStyle(token, script);
			expect(checkTextStyle(resolved, script), token).toEqual([]);
		}
	});

	test("Gujarati is set larger than the Latin the token names", () => {
		for (const token of TOKENS) {
			const latin = resolveTypeStyle(token, "latn");
			const gujarati = resolveTypeStyle(token, "gujr");
			expect(gujarati.fontSize, token).toBeGreaterThan(latin.fontSize);
			expect(gujarati.fontSize / latin.fontSize).toBeCloseTo(scriptSizeScale("gujr"), 2);
		}
	});

	test("Gujarati leading is lifted into its band even when the token is tighter", () => {
		const band = lineHeightBand("gujr");
		// `caption` asks for 1.4 — fine for Latin chrome, a collision in Gujarati.
		const caption = resolveTypeStyle("caption", "gujr");
		expect(caption.lineHeight / caption.fontSize).toBeGreaterThanOrEqual(band.min - 0.01);

		const latin = resolveTypeStyle("caption", "latn");
		expect(latin.lineHeight / latin.fontSize).toBeCloseTo(TYPE_SCALE.caption.lineHeight, 2);
	});

	test("tracking is Latin-only", () => {
		// `label` is the one tracked token. Tracking Indic text splits conjuncts (P0.3).
		expect(resolveTypeStyle("label", "latn").letterSpacing).toBe(TYPE_SCALE.label.tracking);
		expect(resolveTypeStyle("label", "gujr").letterSpacing).toBe(0);
		expect(resolveTypeStyle("label", "deva").letterSpacing).toBe(0);
	});

	test("scripture tokens use the reading face, chrome tokens the UI face", () => {
		expect(resolveTypeStyle("verse", "gujr").face).toBe("body");
		expect(resolveTypeStyle("verseLarge", "gujr").face).toBe("body");
		for (const token of TOKENS.filter((name) => !name.startsWith("verse"))) {
			expect(resolveTypeStyle(token, "gujr").face, token).toBe("ui");
		}
	});

	test("a size override moves the size and nothing else", () => {
		const base = resolveTypeStyle("verse", "gujr");
		const larger = resolveTypeStyle("verse", "gujr", { size: 24 });
		expect(larger.fontSize).toBeGreaterThan(base.fontSize);
		expect(larger.face).toBe(base.face);
		expect(larger.weight).toBe(base.weight);
		expect(checkTextStyle(larger, "gujr")).toEqual([]);
	});

	test("form decides whether the edition's line breaks survive", () => {
		expect(resolveTypeStyle("verse", "gujr", { form: "verse" }).preserveLineBreaks).toBe(true);
		expect(resolveTypeStyle("verse", "gujr", { form: "prose" }).preserveLineBreaks).toBe(false);
	});
});

describe("metrics", () => {
	test("the spacing ramp is strictly increasing", () => {
		const values = Object.values(SPACING);
		for (let index = 1; index < values.length; index += 1) {
			expect(values[index]).toBeGreaterThan(values[index - 1] as number);
		}
	});

	test("radii are strictly increasing up to the pill", () => {
		expect(RADIUS.sm).toBeLessThan(RADIUS.md);
		expect(RADIUS.md).toBeLessThan(RADIUS.lg);
		expect(RADIUS.lg).toBeLessThan(RADIUS.xl);
		expect(RADIUS.xl).toBeLessThan(RADIUS.pill);
	});

	test("motion stays inside what feels immediate", () => {
		expect(MOTION.tap).toBeLessThan(MOTION.transition);
		expect(MOTION.transition).toBeLessThan(MOTION.sheet);
		expect(MOTION.sheet).toBeLessThanOrEqual(400);
		expect(MOTION.easing).toHaveLength(4);
	});
});
