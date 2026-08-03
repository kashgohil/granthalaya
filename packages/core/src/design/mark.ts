/**
 * The identity mark (P0.4): the tilak-chandlo.
 *
 * The sampradaya has had a mark for two centuries — the U of chandan with the kumkum
 * chandlo inside it — and it is worn across every denomination, so it identifies the
 * library without taking a side between them. It also costs no new colour: `themes.ts`
 * already calls the accent "the colour of kumkum", and the chandan is the ink of the
 * `ink` colourway in `cover.ts`. The mark is those two values on that cloth.
 *
 * Like `cover.ts` this module is geometry and colour, not pixels — but unlike a cover,
 * the mark is *one* fixed drawing rather than a per-book derivation, so it also emits the
 * SVG directly. `bun run icons:sync` rasterises that into every asset the two apps need.
 *
 * Everything is expressed on a 100 × 100 artboard so a single set of numbers survives
 * every output size. The numbers themselves were settled by eye against renders at 24px
 * through 200px; the one that took the longest was `chandlo.cy`.
 */

/** The ground and the two inks. A `null` ground means transparent. */
export type MarkColourway = {
	readonly id: string;
	/** The cloth behind the mark, or `null` for a transparent ground. */
	readonly ground: string | null;
	/** The tilak — chandan. */
	readonly tilak: string;
	/** The chandlo — kumkum. */
	readonly chandlo: string;
};

/**
 * The mark on the `ink` cloth from `COVER_COLOURWAYS`. The kumkum is lifted from the
 * accent's `#A65328` to `#C4622F` because the true accent goes muddy on a near-black
 * ground — the same move `themes.ts` already makes between its light and dark accents.
 */
export const MARK_DARK: MarkColourway = {
	id: "dark",
	ground: "#23201C",
	tilak: "#E4DACA",
	chandlo: "#C4622F",
};

/**
 * The mark on sandalwood. Warmer, and closer to chandan on skin; the tilak has to darken
 * to an ochre to hold against the ground, which is why this is not simply the dark
 * colourway inverted.
 */
export const MARK_SAND: MarkColourway = {
	id: "sand",
	ground: "#EFE1C6",
	tilak: "#C08A3E",
	chandlo: "#A65328",
};

/**
 * One colour on a transparent ground, for the two platform slots that tint the artwork
 * themselves: Android's themed-icon monochrome layer and iOS's tinted variant. It works
 * because the chandlo never touches the tilak — there is 4 units of clearance to the arms
 * and 16 to the cradle — so the dot still reads as a dot with the colour taken away.
 */
export const MARK_MONO: MarkColourway = {
	id: "mono",
	ground: null,
	tilak: "#FFFFFF",
	chandlo: "#FFFFFF",
};

export const MARK_COLOURWAYS: readonly MarkColourway[] = [MARK_DARK, MARK_SAND, MARK_MONO];

/**
 * The drawing, in artboard units.
 *
 * `chandlo.cy` sits *above* the optical centre rather than on or below it. The usual
 * reason to drop a dot below centre is that a closed lower form outweighs open upper
 * strokes — but the round caps topping these arms carry enough weight to cancel that, and
 * raising the dot into the open channel between the arms leaves a clear band of cloth
 * beneath it, so the cradle reads as a stroke that turns rather than a bowl holding
 * something. Lower than this and the mark sags.
 */
export const MARK_GEOMETRY = {
	/** Both artboard axes. Every other number here is in these units. */
	artboard: 100,
	/** Stroke centres of the two arms. */
	arm: { left: 30, right: 70 },
	/** Round cap and round join; half of this is the cap radius. */
	stroke: 11,
	/** Where the arms start, before the cap is added. */
	top: 18,
	/** The lowest point of the cradle, before the cap is added. */
	cradle: 77,
	chandlo: { cx: 50, cy: 45, r: 10.5 },
} as const;

/**
 * Where the arms stop running straight and start turning into the cradle. Offset below
 * the midpoint so the straight part of each arm is longer than the curve — a curve that
 * starts at the halfway point reads as a bowl rather than as a tilak.
 */
const TURN = (MARK_GEOMETRY.top + MARK_GEOMETRY.cradle) / 2 + 6;

const CAP = MARK_GEOMETRY.stroke / 2;

/**
 * The bounding box of the *painted* mark — the geometry above grown by the cap radius,
 * which is what actually gets inked. Safe-zone maths has to use this rather than the
 * stroke centres, or the caps hang outside the mask.
 */
export const MARK_PAINTED_BOUNDS = {
	minX: MARK_GEOMETRY.arm.left - CAP,
	maxX: MARK_GEOMETRY.arm.right + CAP,
	minY: MARK_GEOMETRY.top - CAP,
	maxY: MARK_GEOMETRY.cradle + CAP,
} as const;

/** The centre of that box. Sits above the artboard centre, which is deliberate. */
export const MARK_PAINTED_CENTRE = {
	x: (MARK_PAINTED_BOUNDS.minX + MARK_PAINTED_BOUNDS.maxX) / 2,
	y: (MARK_PAINTED_BOUNDS.minY + MARK_PAINTED_BOUNDS.maxY) / 2,
} as const;

/**
 * Distance from the painted centre to the furthest inked point — the outer edge of an arm
 * cap. Not the corner of the bounding box: the box corners are empty, and using them
 * would shrink the mark further than any mask requires.
 */
export const MARK_PAINTED_RADIUS = (() => {
	const dx = MARK_GEOMETRY.arm.right - MARK_PAINTED_CENTRE.x;
	const dy = MARK_GEOMETRY.top - MARK_PAINTED_CENTRE.y;
	return Math.sqrt(dx * dx + dy * dy) + CAP;
})();

/**
 * The largest scale at which the mark still fits inside a circular safe zone, given that
 * zone's radius as a fraction of the canvas.
 *
 * Android's adaptive icon guarantees the central 66 of 108dp, so `0.3056`; the web
 * maskable spec guarantees a circle of 80% of the width, so `0.4`. Callers should round
 * down from what this returns rather than sitting exactly on the limit.
 */
export function markScaleForSafeRadius(safeRadiusFraction: number): number {
	return (safeRadiusFraction * MARK_GEOMETRY.artboard) / MARK_PAINTED_RADIUS;
}

/** The tilak as an SVG path `d`. Stroked, never filled — the cradle is a turn, not a bowl. */
export function tilakPathData(): string {
	const { arm, top, cradle } = MARK_GEOMETRY;
	return [
		`M${arm.left} ${top}`,
		`L${arm.left} ${TURN}`,
		`Q${arm.left} ${cradle} 50 ${cradle}`,
		`Q${arm.right} ${cradle} ${arm.right} ${TURN}`,
		`L${arm.right} ${top}`,
	].join(" ");
}

export type MarkSvgOptions = {
	readonly colourway: MarkColourway;
	/** `width`/`height` in px. Omitted for a viewBox-only SVG that scales to its box. */
	readonly size?: number;
	/**
	 * Shrinks the mark to clear a platform safe zone. At `1` the artboard is used exactly
	 * as drawn; below `1` the mark is also recentred on the canvas, because a mask is
	 * centred on the canvas and an off-centre mark would clip unevenly.
	 */
	readonly scale?: number;
	/**
	 * The lit-board gradient from `COVER_SHADING` — a highlight at the top-left and a
	 * shadow at the bottom-right, so the ground reads as cloth rather than as a fill.
	 * Meaningless over a transparent ground, and ignored there.
	 */
	readonly shading?: boolean;
	/** Emitted as `<title>`; omit for a purely decorative mark. */
	readonly title?: string;
	/** Injected as a `<style>` block, so a caller can drive the colours with CSS variables. */
	readonly style?: string;
};

const SHADING_ID = "granthalaya-mark-shading";

/** The whole mark as a standalone SVG document. */
export function markSvg(options: MarkSvgOptions): string {
	const { colourway, size, scale = 1, shading = true, title, style } = options;
	const { artboard, chandlo, stroke } = MARK_GEOMETRY;

	const dimensions = size === undefined ? "" : ` width="${size}" height="${size}"`;
	const withShading = shading && colourway.ground !== null;

	const centre = artboard / 2;
	const transform =
		scale === 1
			? ""
			: ` transform="translate(${centre} ${centre}) scale(${round(scale)}) translate(${-MARK_PAINTED_CENTRE.x} ${-MARK_PAINTED_CENTRE.y})"`;

	const parts: string[] = [
		`<svg xmlns="http://www.w3.org/2000/svg"${dimensions} viewBox="0 0 ${artboard} ${artboard}" role="${title ? "img" : "presentation"}"${title ? "" : ' aria-hidden="true"'}>`,
	];
	if (title) parts.push(`\t<title>${title}</title>`);
	if (style) parts.push(`\t<style>${style}</style>`);
	if (withShading) {
		parts.push(
			`\t<defs>`,
			`\t\t<linearGradient id="${SHADING_ID}" x1="0" y1="0" x2="1" y2="1">`,
			`\t\t\t<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.12"/>`,
			`\t\t\t<stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/>`,
			`\t\t\t<stop offset="1" stop-color="#000000" stop-opacity="0.14"/>`,
			`\t\t</linearGradient>`,
			`\t</defs>`,
		);
	}
	if (colourway.ground !== null) {
		parts.push(`\t<rect width="${artboard}" height="${artboard}" fill="${colourway.ground}"/>`);
	}
	parts.push(
		`\t<g${transform}>`,
		`\t\t<path d="${tilakPathData()}" fill="none" stroke="${colourway.tilak}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`,
		`\t\t<circle cx="${chandlo.cx}" cy="${chandlo.cy}" r="${chandlo.r}" fill="${colourway.chandlo}"/>`,
		`\t</g>`,
	);
	if (withShading) {
		parts.push(`\t<rect width="${artboard}" height="${artboard}" fill="url(#${SHADING_ID})"/>`);
	}
	parts.push(`</svg>`, "");
	return parts.join("\n");
}

/** Keeps generated path/transform numbers short and stable across runs. */
function round(value: number): number {
	return Math.round(value * 1e4) / 1e4;
}
