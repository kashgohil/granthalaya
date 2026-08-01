import { describe, expect, test } from "bun:test";

import { COVER_COLOURWAYS } from "./cover.ts";
import { designTokensCss, metricCssVariables, themeCssVariables } from "./css.ts";
import { THEME_NAMES } from "./themes.ts";

describe("css emitter", () => {
	test("every theme emits the same variable names", () => {
		const reference = Object.keys(themeCssVariables("white")).sort();
		for (const name of THEME_NAMES) {
			expect(Object.keys(themeCssVariables(name)).sort(), name).toEqual(reference);
		}
	});

	test("metrics carry units the browser can use", () => {
		const metrics = metricCssVariables();
		expect(metrics["--gr-space-lg"]).toBe("16px");
		expect(metrics["--gr-radius-pill"]).toBe("999px");
		expect(metrics["--gr-duration-sheet"]).toBe("320ms");
		expect(metrics["--gr-easing"]).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)");
		expect(metrics["--gr-text-verse-large"]).toBe("22px");
	});

	test("the stylesheet covers all four themes and the system default", () => {
		const css = designTokensCss();
		for (const name of THEME_NAMES) {
			expect(css).toContain(`:root[data-theme="${name}"]`);
		}
		expect(css).toContain("prefers-color-scheme: dark");
		// A theme chosen explicitly must win over the system preference.
		expect(css).toContain(":root:not([data-theme])");
		for (const colourway of COVER_COLOURWAYS) {
			expect(css).toContain(`--gr-cover-${colourway.id}`);
		}
	});
});
