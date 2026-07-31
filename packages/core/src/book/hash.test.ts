import { expect, test } from "bun:test";
import { canonicalizeVerse, fnv1a64, hashVerse } from "./hash.ts";
import type { LayerValue } from "./schema.ts";

const layers: Record<string, LayerValue> = {
	gu: "ધિયો યો નઃ પ્રચોદયાત્ ॥",
	iso: "dhiyo yo naḥ pracodayāt",
	words: [{ word: "નઃ", meaning: "our" }],
};

test("FNV-1a matches the published test vectors", () => {
	// From the FNV reference implementation — pins the UTF-8 encoding and the arithmetic.
	expect(fnv1a64("")).toBe(0xcbf29ce484222325n);
	expect(fnv1a64("a")).toBe(0xaf63dc4c8601ec8cn);
	expect(fnv1a64("foobar")).toBe(0x85944171f73967e8n);
});

test("a hash is the algorithm prefix plus 16 hex digits", () => {
	expect(hashVerse(layers)).toMatch(/^f1a64:[0-9a-f]{16}$/);
});

test("hashing is stable across runs and independent of key order", () => {
	const reordered: Record<string, LayerValue> = {
		words: layers.words as LayerValue,
		gu: layers.gu as LayerValue,
		iso: layers.iso as LayerValue,
	};
	expect(hashVerse(reordered)).toBe(hashVerse(layers));
});

test("any change to any layer changes the hash", () => {
	const original = hashVerse(layers);
	expect(hashVerse({ ...layers, gu: "ધિયો યો નઃ પ્રચોદયાત્ ।" })).not.toBe(original);
	expect(hashVerse({ ...layers, en: "may it impel our thoughts." })).not.toBe(original);
	expect(hashVerse({ ...layers, words: [{ word: "નઃ", meaning: "ours" }] })).not.toBe(original);
});

test("adding a note to a gloss changes the hash", () => {
	const bare = hashVerse({ words: [{ word: "નઃ", meaning: "our" }] });
	const annotated = hashVerse({
		words: [{ word: "નઃ", meaning: "our", note: "genitive plural" }],
	});
	expect(annotated).not.toBe(bare);
});

test("separators keep adjacent fields from bleeding into each other", () => {
	// Without a separator both of these serialize to the same characters.
	expect(hashVerse({ a: "xy", b: "z" })).not.toBe(hashVerse({ a: "x", b: "yz" }));
});

test("text is normalized before hashing, so encoding differences do not read as edits", () => {
	// Two encodings of one grapheme: precomposed U+0958, versus ka followed by a nukta.
	const precomposed = "\u0958";
	const decomposed = "\u0915\u093c";
	expect(precomposed).not.toBe(decomposed);
	expect(hashVerse({ gu: precomposed })).toBe(hashVerse({ gu: decomposed }));
});

test("canonicalization sorts layers by id", () => {
	const canonical = canonicalizeVerse({ zz: "last", aa: "first" });
	expect(canonical.indexOf("aa")).toBeLessThan(canonical.indexOf("zz"));
	expect(canonical).toBe("aa\u001ffirst\u001ezz\u001flast");
});
