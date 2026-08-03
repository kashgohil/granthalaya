/**
 * Icon sync — writes the identity mark (P0.4) into every asset the two apps ship.
 *
 * Run it with `bun run icons:sync` after changing anything in
 * `packages/core/src/design/mark.ts`. Everything it writes is committed, because a fresh
 * checkout has to be able to build the apps without running a generator first.
 *
 * The pixels come from `rasterise.ts`; this file is only the list of what each platform
 * needs and why. Imported by relative path rather than by package name: the repo root is
 * not a workspace, so `@granthalaya/core` is not linked into its `node_modules`.
 */
import {
	MARK_DARK,
	MARK_MONO,
	MARK_SAND,
	type MarkColourway,
	markScaleForSafeRadius,
	markSvg,
} from "../packages/core/src/design/mark.ts";
import { encodeIco, encodeRgbaPng, encodeRgbPng } from "./png.ts";
import { type RenderOptions, renderMark } from "./rasterise.ts";

const MOBILE = "apps/mobile/assets/images";
const WEB = "apps/web/public";
const BRAND = "assets/brand";

/**
 * Android guarantees the central 66 of a 108dp adaptive icon, so that one is a hard fit,
 * rounded down so a launcher masking slightly tighter than the spec still has room.
 *
 * The maskable spec is far more generous — a circle of 80% of the width — and filling it
 * exactly is legal but looks cramped, because the guarantee is about not clipping rather
 * than about looking composed. Targeting a smaller circle lands the PWA icon at roughly
 * the same visual weight as the Android one, which is what makes the two read as the same
 * icon rather than two crops of it.
 */
const ANDROID_SAFE_SCALE = floorTo(markScaleForSafeRadius(33 / 108), 0.01);
const MASKABLE_SAFE_SCALE = floorTo(markScaleForSafeRadius(0.33), 0.01);

/** The mark without its cloth, for layers the platform composites onto its own ground. */
const onTransparent = (colourway: MarkColourway): MarkColourway => ({
	...colourway,
	id: `${colourway.id}-transparent`,
	ground: null,
});

function floorTo(value: number, step: number): number {
	return Math.round(Math.floor(value / step) * step * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

const written: string[] = [];

/**
 * A mark with a ground is written without an alpha channel, one without a ground keeps it.
 * That split is not cosmetic — see `encodeRgbPng` for what Apple does with a spurious
 * channel — and deriving it from the colourway means a new output cannot get it wrong.
 */
async function writePng(path: string, options: RenderOptions): Promise<void> {
	const pixels = renderMark(options);
	const opaque = options.colourway.ground !== null;
	const png = opaque
		? encodeRgbPng(pixels, options.size, options.size)
		: encodeRgbaPng(pixels, options.size, options.size);
	await Bun.write(path, png);
	written.push(
		`${path}  ${options.size}×${options.size}  ${opaque ? "RGB " : "RGBA"}  ${(png.length / 1024).toFixed(1)}kb`,
	);
}

async function writeText(path: string, contents: string): Promise<void> {
	await Bun.write(path, contents);
	written.push(`${path}  ${(contents.length / 1024).toFixed(1)}kb`);
}

// --- brand masters: the SVGs a human opens, and full-size PNG references -----------------

await writeText(`${BRAND}/mark-dark.svg`, markSvg({ colourway: MARK_DARK, title: "Granthalaya" }));
await writeText(`${BRAND}/mark-sand.svg`, markSvg({ colourway: MARK_SAND, title: "Granthalaya" }));
await writeText(`${BRAND}/mark-mono.svg`, markSvg({ colourway: MARK_MONO, title: "Granthalaya" }));
await writePng(`${BRAND}/mark-dark.png`, { size: 1024, colourway: MARK_DARK });
await writePng(`${BRAND}/mark-sand.png`, { size: 1024, colourway: MARK_SAND });

// --- iOS, through Expo --------------------------------------------------------------------
// `light` and `dark` are opaque squares; iOS applies the superellipse mask itself and
// rejects an alpha channel on the App Store icon. `tinted` is greyscale on transparency,
// because the system supplies both the ground and the tint for that variant.

await writePng(`${MOBILE}/icon.png`, { size: 1024, colourway: MARK_DARK });
await writePng(`${MOBILE}/icon-ios-light.png`, { size: 1024, colourway: MARK_SAND });
await writePng(`${MOBILE}/icon-ios-dark.png`, { size: 1024, colourway: MARK_DARK });
await writePng(`${MOBILE}/icon-ios-tinted.png`, {
	size: 1024,
	colourway: MARK_MONO,
	shading: false,
});

// --- Android adaptive icon -----------------------------------------------------------------
// Three layers on a 108dp canvas, of which only the central 66dp is guaranteed visible —
// hence the inset. The background is the cloth with nothing on it; the launcher parallaxes
// the two layers against each other, which only works if they are genuinely separate.

await writePng(`${MOBILE}/android-icon-background.png`, {
	size: 1024,
	colourway: MARK_DARK,
	showMark: false,
});
await writePng(`${MOBILE}/android-icon-foreground.png`, {
	size: 1024,
	colourway: onTransparent(MARK_DARK),
	scale: ANDROID_SAFE_SCALE,
	shading: false,
});
await writePng(`${MOBILE}/android-icon-monochrome.png`, {
	size: 1024,
	colourway: MARK_MONO,
	scale: ANDROID_SAFE_SCALE,
	shading: false,
});

// --- Expo web + splash ---------------------------------------------------------------------
// The splash image is transparent and the plugin paints the ground, so each variant needs
// inks that hold against *its* background: ochre on the near-white, chandan on the near-black.

await writePng(`${MOBILE}/favicon.png`, { size: 48, colourway: MARK_DARK });
await writePng(`${MOBILE}/splash-icon.png`, {
	size: 512,
	colourway: onTransparent(MARK_SAND),
	shading: false,
});
await writePng(`${MOBILE}/splash-icon-dark.png`, {
	size: 512,
	colourway: onTransparent(MARK_DARK),
	shading: false,
});

// --- apps/web ------------------------------------------------------------------------------

/**
 * One favicon that follows the tab bar. An SVG favicon may carry a stylesheet, and every
 * browser that supports SVG favicons at all supports the media query inside it — so the
 * mark shows sandalwood on light chrome and cloth on dark without shipping two files.
 */
const faviconStyle = [
	":root{",
	`--ground:${MARK_SAND.ground};--tilak:${MARK_SAND.tilak};--chandlo:${MARK_SAND.chandlo}`,
	"}",
	"@media(prefers-color-scheme:dark){:root{",
	`--ground:${MARK_DARK.ground};--tilak:${MARK_DARK.tilak};--chandlo:${MARK_DARK.chandlo}`,
	"}}",
].join("");

await writeText(
	`${WEB}/favicon.svg`,
	markSvg({
		colourway: {
			id: "themed",
			ground: "var(--ground)",
			tilak: "var(--tilak)",
			chandlo: "var(--chandlo)",
		},
		style: faviconStyle,
		title: "Granthalaya",
	}),
);

for (const size of [16, 32]) {
	await writePng(`${WEB}/favicon-${size}.png`, { size, colourway: MARK_DARK });
}
await writePng(`${WEB}/apple-touch-icon.png`, { size: 180, colourway: MARK_DARK });
await writePng(`${WEB}/icon-192.png`, { size: 192, colourway: MARK_DARK });
await writePng(`${WEB}/icon-512.png`, { size: 512, colourway: MARK_DARK });
await writePng(`${WEB}/icon-maskable-512.png`, {
	size: 512,
	colourway: MARK_DARK,
	scale: MASKABLE_SAFE_SCALE,
});

// `/favicon.ico` is still requested by default by browsers that ignore the link tags, and
// by bookmark and feed readers. A 32px PNG inside an ICO container satisfies all of them.
const icoPng = encodeRgbaPng(renderMark({ size: 32, colourway: MARK_DARK }), 32, 32);
const ico = encodeIco(icoPng, 32);
await Bun.write(`${WEB}/favicon.ico`, ico);
written.push(`${WEB}/favicon.ico  32×32  ${(ico.length / 1024).toFixed(1)}kb`);

await writeText(
	`${WEB}/site.webmanifest`,
	`${JSON.stringify(
		{
			name: "Granthalaya",
			short_name: "Granthalaya",
			description: "A digital library for Gujarati scripture.",
			start_url: "/",
			display: "standalone",
			background_color: MARK_DARK.ground,
			theme_color: MARK_DARK.ground,
			icons: [
				{ src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
				{ src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
				{
					src: "/icon-maskable-512.png",
					sizes: "512x512",
					type: "image/png",
					purpose: "maskable",
				},
			],
		},
		null,
		// Two spaces, not a tab: Biome formats JSON in this repo and `app.json` next door
		// already reads that way, so a tabbed manifest fails `bun run check`.
		2,
	)}\n`,
);

// --- the note that travels with the files ---------------------------------------------------

await writeText(
	`${BRAND}/README.md`,
	`# Brand assets

Everything in this folder is **generated**. Do not edit it by hand — change
\`packages/core/src/design/mark.ts\` and run \`bun run icons:sync\`.

## The mark

The tilak-chandlo: the U of chandan with the kumkum chandlo inside it, the mark the
Swaminarayan Sampradaya has carried for two centuries and the one thing every denomination
shares. It costs the design language no new colour — the chandan is the \`ink\` cloth's ink
from \`cover.ts\` and the kumkum is the accent, which \`themes.ts\` already describes as "the
colour of kumkum".

Geometry lives on a 100 × 100 artboard in \`MARK_GEOMETRY\`. The chandlo sits *above* the
optical centre; that was settled by eye and \`mark.test.ts\` guards it, so if the centring
looks wrong to you, read the test before moving it.

| File | What it is |
|---|---|
| \`mark-dark.svg\` | The mark on the \`ink\` cloth — the primary lockup |
| \`mark-sand.svg\` | The mark on sandalwood — the light-mode alternate |
| \`mark-mono.svg\` | One colour on transparency, for platform slots that tint it themselves |
| \`mark-dark.png\`, \`mark-sand.png\` | 1024px references for anywhere SVG is not accepted |

## Where the rest goes

\`bun run icons:sync\` also writes into \`apps/mobile/assets/images/\` (iOS light/dark/tinted,
the three Android adaptive layers, splash and favicon) and \`apps/web/public/\` (a
theme-aware \`favicon.svg\`, PNG fallbacks, \`apple-touch-icon\`, PWA and maskable icons,
\`favicon.ico\` and \`site.webmanifest\`).

## Not generated

The wordmark. \`ગ્રંથાલય\` is set in Rasa and a real wordmark needs the glyphs converted to
outlines, which needs a font toolchain this repo does not carry. Until then, set it live in
Rasa 400 with no tracking on the Gujarati line (P0.3).
`,
);

console.log(`Android safe scale ${ANDROID_SAFE_SCALE}, maskable ${MASKABLE_SAFE_SCALE}\n`);
for (const line of written) console.log(`wrote ${line}`);
console.log(`\n${written.length} files`);
