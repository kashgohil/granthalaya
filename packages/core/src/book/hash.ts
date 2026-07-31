/**
 * Per-verse content hashing — change detection, not integrity.
 *
 * Answers one question: did this verse's text change between two versions of a book? The
 * studio uses it to diff a re-run of OCR against approved text; a client uses it to skip
 * re-indexing verses that didn't move.
 *
 * It is **not** a security boundary, which is exactly why it isn't SHA-256: FNV-1a 64 is a
 * few lines of pure arithmetic that behave identically in Bun, Hermes and the browser, with
 * no crypto API and no async. Package integrity is a separate SHA-256 over the whole
 * serialized package, computed by the pipeline and the API with real platform crypto (P1.5).
 */
import type { LayerValue } from "./schema.ts";

// The separators below are C0 control characters, which the schema forbids in every text
// field — so no value can smuggle one in and shift what the canonical string means.

/** Separates a layer id from its value. */
const FIELD_SEPARATOR = "\u001f";
/** Separates one layer from the next. */
const RECORD_SEPARATOR = "\u001e";
/** Separates the parts of a single word gloss. */
const GLOSS_SEPARATOR = "\u001d";

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const U64_MASK = 0xffffffffffffffffn;

/**
 * UTF-8 bytes of a string, without `TextEncoder` — `packages/core` stays free of platform
 * globals, and the byte sequence is what makes the hash reproducible outside JavaScript.
 * Lone surrogates encode as three bytes (WTF-8); they can't occur in valid book text.
 */
function* utf8Bytes(text: string): Generator<number> {
	for (const character of text) {
		const point = character.codePointAt(0) ?? 0;
		if (point < 0x80) {
			yield point;
		} else if (point < 0x800) {
			yield 0xc0 | (point >> 6);
			yield 0x80 | (point & 0x3f);
		} else if (point < 0x10000) {
			yield 0xe0 | (point >> 12);
			yield 0x80 | ((point >> 6) & 0x3f);
			yield 0x80 | (point & 0x3f);
		} else {
			yield 0xf0 | (point >> 18);
			yield 0x80 | ((point >> 12) & 0x3f);
			yield 0x80 | ((point >> 6) & 0x3f);
			yield 0x80 | (point & 0x3f);
		}
	}
}

/** FNV-1a over the UTF-8 bytes of `text`, as an unsigned 64-bit value. */
export function fnv1a64(text: string): bigint {
	let hash = FNV_OFFSET_BASIS;
	for (const byte of utf8Bytes(text)) {
		hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & U64_MASK;
	}
	return hash;
}

function serializeLayerValue(value: LayerValue): string {
	if (typeof value === "string") {
		return value.normalize("NFC");
	}
	return value
		.map((gloss) =>
			[gloss.word, gloss.meaning, gloss.note ?? ""]
				.map((part) => part.normalize("NFC"))
				.join(GLOSS_SEPARATOR),
		)
		.join(GLOSS_SEPARATOR);
}

/**
 * The exact string a verse hashes over: its layers, sorted by layer id and NFC-normalized.
 *
 * IDs, numbering and `form` are deliberately excluded — they are identity and presentation.
 * Renumbering a chapter or switching a leaf to prose rendering is not a text change, and
 * shouldn't light up every verse as modified in the studio's diff view.
 */
export function canonicalizeVerse(layers: Readonly<Record<string, LayerValue>>): string {
	return Object.keys(layers)
		.sort()
		.map((layerId) => {
			const value = layers[layerId];
			const serialized = value === undefined ? "" : serializeLayerValue(value);
			return `${layerId}${FIELD_SEPARATOR}${serialized}`;
		})
		.join(RECORD_SEPARATOR);
}

/** Algorithm prefix on every hash, so the scheme can be changed without ambiguity. */
export const HASH_PREFIX = "f1a64";

/** Content hash of a verse's layers, e.g. `f1a64:9a3f1c0b7d5e2a48`. */
export function hashVerse(layers: Readonly<Record<string, LayerValue>>): string {
	const digest = fnv1a64(canonicalizeVerse(layers)).toString(16).padStart(16, "0");
	return `${HASH_PREFIX}:${digest}`;
}
