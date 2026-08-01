import { describe, expect, test } from "bun:test";

import { isThemeName, MARK_COLORS, THEME_NAMES, theme, themeForColorScheme } from "./themes.ts";

/** Relative luminance, WCAG 2.1 §relative-luminance. */
function luminance(hex: string): number {
	const value = Number.parseInt(hex.slice(1), 16);
	const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((byte) => {
		const channel = byte / 255;
		return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
	const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
		(a, b) => b - a,
	) as [number, number];
	return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for body text. Nothing in the design language sets text below this. */
const AA = 4.5;

describe("themes", () => {
	test("every theme is a complete token set", () => {
		for (const name of THEME_NAMES) {
			const tokens = theme(name);
			expect(tokens.name).toBe(name);
			for (const [role, value] of Object.entries(tokens)) {
				expect(value, `${name}.${role}`).toBeDefined();
			}
			for (const mark of MARK_COLORS) {
				expect(tokens.marks[mark], `${name}.marks.${mark}`).toMatch(/^#[0-9A-F]{6}$/i);
			}
		}
	});

	// This is the test the palette is designed against, not a check bolted on afterwards:
	// every pairing the components actually produce has to clear AA in all four themes. A
	// repaint that looks nicer and reads worse fails here.
	test.each([...THEME_NAMES])("%s: text clears AA on every surface it is drawn on", (name) => {
		const tokens = theme(name);
		const grounds = [tokens.background, tokens.surface, tokens.paper, tokens.surfaceSunken];

		for (const ground of grounds) {
			for (const [role, colour] of [
				["ink", tokens.ink],
				["inkMuted", tokens.inkMuted],
				["inkFaint", tokens.inkFaint],
			] as const) {
				expect(contrast(colour, ground), `${role} on ${ground}`).toBeGreaterThanOrEqual(AA);
			}
			expect(contrast(tokens.accent, ground), `accent on ${ground}`).toBeGreaterThanOrEqual(AA);
		}

		expect(contrast(tokens.accentInk, tokens.accent), "accentInk on accent").toBeGreaterThanOrEqual(
			AA,
		);
		expect(
			contrast(tokens.accent, tokens.accentMuted),
			"accent on its own wash",
		).toBeGreaterThanOrEqual(AA);
	});

	// A highlight is a background wash under running text (P0.3). If the wash drops the text
	// below AA, highlighting a verse would make it harder to read than not highlighting it.
	test.each([...THEME_NAMES])("%s: highlighted text stays readable", (name) => {
		const tokens = theme(name);
		for (const mark of MARK_COLORS) {
			expect(contrast(tokens.ink, tokens.marks[mark]), `ink on ${mark}`).toBeGreaterThanOrEqual(AA);
		}
	});

	// Hairlines are the whole visual grammar of the chrome: if a rule is invisible against
	// the surface it divides, cards lose their edges.
	test.each([...THEME_NAMES])("%s: hairlines are visible against what they divide", (name) => {
		const tokens = theme(name);
		for (const ground of [tokens.background, tokens.surface]) {
			expect(contrast(tokens.rule, ground)).toBeGreaterThan(1.12);
		}
	});

	test("black is the only theme without grain", () => {
		for (const name of THEME_NAMES) {
			const { grain } = theme(name);
			expect(grain.opacity === 0).toBe(name === "black");
			expect(grain.blend).toBe(theme(name).isDark ? "screen" : "multiply");
		}
	});

	test("the system can only reach white and dark", () => {
		expect(themeForColorScheme("light")).toBe("white");
		expect(themeForColorScheme("dark")).toBe("dark");
		expect(themeForColorScheme(null)).toBe("white");
		expect(themeForColorScheme(undefined)).toBe("white");
	});

	test("theme names round-trip through the persisted-preference guard", () => {
		for (const name of THEME_NAMES) {
			expect(isThemeName(name)).toBe(true);
		}
		expect(isThemeName("sepia ")).toBe(false);
		expect(isThemeName("")).toBe(false);
		expect(isThemeName("solarized")).toBe(false);
	});
});
