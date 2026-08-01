import { describe, expect, test } from "bun:test";

import { aksharaSpans } from "../text/akshara.ts";
import { COVER_COLOURWAYS, COVER_SHADING, coverColourway, coverFor } from "./cover.ts";

function channels(hex: string): [number, number, number] {
	const value = Number.parseInt(hex.slice(1), 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The same shading the renderers apply, in the same direction. */
function mixToward(hex: string, target: number, amount: number): string {
	return `#${channels(hex)
		.map((byte) => Math.round(byte + (target - byte) * amount))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("")}`;
}

function contrast(foreground: string, background: string): number {
	const luminance = (hex: string) => {
		const linear = channels(hex).map((byte) => {
			const channel = byte / 255;
			return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
		}) as [number, number, number];
		return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
	};
	const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
		(a, b) => b - a,
	) as [number, number];
	return (lighter + 0.05) / (darker + 0.05);
}

describe("generated covers", () => {
	test("a book's colourway never changes", () => {
		// The guarantee the shelf depends on: re-proofing a book, bumping its content
		// version, or reinstalling it must not repaint its cover.
		const first = coverColourway("vachanamrut");
		expect(coverColourway("vachanamrut")).toEqual(first);
		expect(coverColourway("shikshapatri")).not.toEqual(first);
	});

	test("colourways spread across the palette rather than clustering", () => {
		const ids = [
			"gayatri-mantra",
			"vachanamrut",
			"shikshapatri",
			"swamini-vato",
			"aarti-sangrah",
			"nishkulanand-kavya",
			"bhaktachintamani",
			"haricharitramrut-sagar",
		];
		const used = new Set(ids.map((id) => coverColourway(id).id));
		expect(used.size).toBeGreaterThanOrEqual(4);
	});

	// The title is set on a gradient, not on the flat base, so the value that matters is the
	// lit corner — the lightest cloth the ink is ever drawn on.
	test("every colourway's ink survives the lit corner of the cloth", () => {
		for (const colourway of COVER_COLOURWAYS) {
			const lit = mixToward(colourway.base, 255, COVER_SHADING.highlight);
			expect(
				contrast(colourway.ink, lit),
				`${colourway.id} ink on lit cloth`,
			).toBeGreaterThanOrEqual(4.5);
		}
	});

	test("every colourway is a real entry", () => {
		for (let index = 0; index < 200; index += 1) {
			expect(COVER_COLOURWAYS).toContain(coverColourway(`book-${index}`));
		}
	});

	test("the cover initial is one whole akshara", () => {
		const cover = coverFor({ id: "shikshapatri", title: { gu: "શિક્ષાપત્રી" } });
		expect(cover.title).toBe("શિક્ષાપત્રી");
		// શિ — a consonant plus its pre-base matra, which is one shape and must never be cut.
		expect(cover.initial).toBe(aksharaSpans("શિક્ષાપત્રી")[0]?.text);
		expect(cover.initial).toBe("શિ");
	});

	test("a conjunct initial survives whole", () => {
		const cover = coverFor({ id: "swamini-vato", title: { gu: "સ્વામીની વાતો" } });
		expect(cover.initial).toBe("સ્વા");
	});

	test("the title falls back rather than rendering an empty cover", () => {
		const englishOnly = coverFor({ id: "sample", title: { en: "Sample Prose" } });
		expect(englishOnly.title).toBe("Sample Prose");
		expect(coverFor({ id: "x", title: { gu: "ગ્રંથ", en: "Book" } }, ["en"]).title).toBe("Book");
	});
});
