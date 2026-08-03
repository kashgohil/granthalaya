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
import { encodeGreyscalePng } from "./png.ts";

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

const png = encodeGreyscalePng(grainPixels(), GRAIN_SIZE);
for (const target of GRAIN_TARGETS) {
	await Bun.write(target, png);
	console.log(`wrote ${target} (${GRAIN_SIZE}×${GRAIN_SIZE}, ${png.length} bytes)`);
}

await Bun.write(TOKENS_STYLESHEET, designTokensCss());
console.log(`wrote ${TOKENS_STYLESHEET}`);
