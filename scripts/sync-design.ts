/**
 * Design sync — writes the generated half of the design language (P0.4) into both apps.
 *
 * Run it with `bun run design:sync` after changing anything in
 * `packages/core/src/design/`. Two artefacts come out, and both are committed:
 *
 * - **the paper grain tile**, a 128px square of deterministic monochrome noise. It is the
 *   one texture in the product: at 4–7% opacity it stops a large flat fill from banding on
 *   an OLED panel and stops the reading surface from looking like a web view. Mid-grey noise
 *   is used rather than one dark and one light tile because the same tile does both jobs —
 *   over light paper it reads as fibre, over a dark ground as faint film grain.
 * - **`apps/web/src/styles/tokens.css`**, the themes as CSS variables. React Native reads
 *   the tokens directly; a browser cannot, and two hand-kept copies of a palette diverge.
 *
 * Imported by relative path rather than by package name: the repo root is not a workspace,
 * so `@granthalaya/core` is not linked into its `node_modules`.
 */
import { designTokensCss } from "../packages/core/src/design/css.ts";

const GRAIN_SIZE = 128;
/** Amplitude around mid-grey. Higher reads as dirt, lower disappears under the opacity. */
const GRAIN_AMPLITUDE = 46;
/** Any fixed value; it exists only so two runs produce byte-identical files. */
const GRAIN_SEED = 0x9e3779b9;

const GRAIN_TARGETS = [
	"apps/mobile/assets/textures/paper-grain.png",
	"apps/web/public/textures/paper-grain.png",
];
const TOKENS_STYLESHEET = "apps/web/src/styles/tokens.css";

/**
 * Per-pixel noise, which tiles seamlessly for free: with no structure larger than a pixel
 * there is no seam to line up. xorshift32 rather than `Math.random` so the committed file
 * only changes when this script does.
 */
function grainPixels(): Uint8Array {
	const pixels = new Uint8Array(GRAIN_SIZE * GRAIN_SIZE);
	let state = GRAIN_SEED;
	for (let index = 0; index < pixels.length; index += 1) {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		const offset = ((state % 2001) / 1000 - 1) * GRAIN_AMPLITUDE;
		pixels[index] = Math.max(0, Math.min(255, Math.round(128 + offset)));
	}
	return pixels;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const body = new Uint8Array(4 + data.length);
	body.set(new TextEncoder().encode(type), 0);
	body.set(data, 4);

	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	out.set(body, 4);
	view.setUint32(8 + data.length, Bun.hash.crc32(body));
	return out;
}

/**
 * PNG's IDAT is a *zlib stream*, and `Bun.deflateSync` returns raw deflate — so the two-byte
 * zlib header and the trailing Adler-32 of the uncompressed data are added here. Six lines
 * of arithmetic, against pulling in `node:zlib` for one call.
 */
function zlibWrap(raw: Uint8Array): Uint8Array {
	const deflated = Bun.deflateSync(raw);
	let a = 1;
	let b = 0;
	for (const byte of raw) {
		a = (a + byte) % 65521;
		b = (b + a) % 65521;
	}

	const out = new Uint8Array(2 + deflated.length + 4);
	out[0] = 0x78; // deflate, 32K window
	out[1] = 0x01; // no preset dictionary; (0x78 << 8 | 0x01) is divisible by 31
	out.set(deflated, 2);
	new DataView(out.buffer).setUint32(2 + deflated.length, ((b << 16) | a) >>> 0);
	return out;
}

/** 8-bit greyscale, no interlace, one filter byte per scanline — the simplest legal PNG. */
function encodePng(pixels: Uint8Array, size: number): Uint8Array {
	const header = new Uint8Array(13);
	const headerView = new DataView(header.buffer);
	headerView.setUint32(0, size);
	headerView.setUint32(4, size);
	header[8] = 8; // bit depth
	header[9] = 0; // colour type: greyscale
	header[10] = 0; // deflate
	header[11] = 0; // adaptive filtering
	header[12] = 0; // no interlace

	const raw = new Uint8Array((size + 1) * size);
	for (let row = 0; row < size; row += 1) {
		raw[row * (size + 1)] = 0; // filter type "None"
		raw.set(pixels.subarray(row * size, (row + 1) * size), row * (size + 1) + 1);
	}

	const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const parts = [
		signature,
		chunk("IHDR", header),
		chunk("IDAT", zlibWrap(raw)),
		chunk("IEND", new Uint8Array(0)),
	];

	const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		png.set(part, offset);
		offset += part.length;
	}
	return png;
}

const png = encodePng(grainPixels(), GRAIN_SIZE);
for (const target of GRAIN_TARGETS) {
	await Bun.write(target, png);
	console.log(`wrote ${target} (${GRAIN_SIZE}×${GRAIN_SIZE}, ${png.length} bytes)`);
}

await Bun.write(TOKENS_STYLESHEET, designTokensCss());
console.log(`wrote ${TOKENS_STYLESHEET}`);
