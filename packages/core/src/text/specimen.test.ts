import { expect, test } from "bun:test";
import { ScriptureTextSchema } from "../book/schema.ts";
import { aksharas, countAksharas } from "./akshara.ts";
import { protectDanda } from "./punctuation.ts";
import { findSpecimen, TYPE_SPECIMENS } from "./specimen.ts";

test("specimen ids are unique — screens address them by id", () => {
	const ids = TYPE_SPECIMENS.map((specimen) => specimen.id);
	expect(new Set(ids).size).toBe(ids.length);
	expect(findSpecimen(ids[0] ?? "")).toBeDefined();
	expect(findSpecimen("no-such-specimen")).toBeUndefined();
});

test("every specimen carries samples and says what to look for", () => {
	for (const specimen of TYPE_SPECIMENS) {
		expect(specimen.samples.length).toBeGreaterThan(0);
		expect(specimen.check.length).toBeGreaterThan(0);
		for (const sample of specimen.samples) {
			expect(sample.trim()).not.toBe("");
		}
	}
});

test("samples hold no control-character debris", () => {
	// The same rule the book format enforces on real scripture: an editor or a paste can
	// smuggle in a carriage return, and it would render as an invisible layout bug.
	for (const specimen of TYPE_SPECIMENS) {
		for (const sample of specimen.samples) {
			expect(ScriptureTextSchema.safeParse(sample).success).toBe(true);
		}
	}
});

/** Blocks a sample may legitimately draw from, beyond ASCII. */
const ALLOWED = [
	[0x00a0, 0x00ff], // Latin-1 supplement
	[0x0100, 0x024f], // Latin extended A/B — transliteration
	[0x0300, 0x036f], // combining diacritics — transliteration
	[0x0900, 0x097f], // Devanagari, which is also where the danda lives
	[0x0a80, 0x0aff], // Gujarati
	[0x1e00, 0x1eff], // Latin extended additional — ḥ, ṁ, ṛ
	[0x2000, 0x206f], // general punctuation — the middle dot, em dash, joiners
] as const;

test("samples contain only characters the three surfaces are expected to shape", () => {
	// Mojibake from a bad paste survives every other check in this file: it is valid text,
	// it just renders as the wrong script. Pinning the blocks catches it at commit time.
	for (const specimen of TYPE_SPECIMENS) {
		for (const sample of specimen.samples) {
			for (const character of sample) {
				const point = character.codePointAt(0) ?? 0;
				if (point < 0x80) {
					continue;
				}
				const allowed = ALLOWED.some(([low, high]) => point >= low && point <= high);
				expect(
					allowed,
					`U+${point.toString(16).toUpperCase()} in ${specimen.id}: ${JSON.stringify(sample)}`,
				).toBe(true);
			}
		}
	}
});

test("the Indic samples segment into aksharas without losing a character", () => {
	for (const specimen of TYPE_SPECIMENS) {
		for (const sample of specimen.samples) {
			expect(aksharas(sample).join("")).toBe(sample);
			expect(countAksharas(sample)).toBeGreaterThan(0);
		}
	}
});

test("the danda specimen is the one that changes under danda protection", () => {
	// If this ever stops holding, the specimen no longer tests what it claims to.
	const danda = findSpecimen("danda");
	expect(danda).toBeDefined();
	for (const sample of danda?.samples ?? []) {
		expect(protectDanda(sample)).not.toBe(sample);
	}
});
