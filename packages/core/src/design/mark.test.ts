import { expect, test } from "bun:test";
import { COVER_COLOURWAYS } from "./cover.ts";
import {
	MARK_COLOURWAYS,
	MARK_DARK,
	MARK_GEOMETRY,
	MARK_MONO,
	MARK_PAINTED_BOUNDS,
	MARK_PAINTED_CENTRE,
	MARK_PAINTED_RADIUS,
	MARK_SAND,
	markScaleForSafeRadius,
	markSvg,
	tilakPathData,
} from "./mark.ts";
import { theme } from "./themes.ts";

test("the mark costs no new colour", () => {
	// The whole argument for this mark is that the palette was already there: the chandan
	// is the `ink` cloth's ink and the kumkum is the accent. If either drifts, the claim in
	// docs/design-language.md stops being true.
	const inkCloth = COVER_COLOURWAYS.find((colourway) => colourway.id === "ink");
	expect(MARK_DARK.tilak).toBe(inkCloth?.ink ?? "");
	expect(MARK_DARK.ground).toBe(inkCloth?.base ?? "");
	expect(MARK_SAND.chandlo).toBe(theme("white").accent);
});

test("the chandlo never touches the tilak", () => {
	// What makes the monochrome and tinted variants legible: with the colour taken away the
	// dot has to stay a separate shape, which it only does while these gaps are positive.
	const cap = MARK_GEOMETRY.stroke / 2;
	const { chandlo, arm, cradle } = MARK_GEOMETRY;

	const toArm = arm.right - cap - (chandlo.cx + chandlo.r);
	const toCradle = cradle - cap - (chandlo.cy + chandlo.r);

	expect(toArm).toBeGreaterThan(2);
	expect(toCradle).toBeGreaterThan(2);
});

test("the chandlo sits above the optical centre", () => {
	// Settled by eye over three rounds, each one moving it up. Recorded as a test so the
	// next person to "fix" the centring finds out it was a decision.
	expect(MARK_GEOMETRY.chandlo.cy).toBeLessThan(MARK_PAINTED_CENTRE.y);
});

test("painted bounds grow the geometry by the cap radius", () => {
	const cap = MARK_GEOMETRY.stroke / 2;
	expect(MARK_PAINTED_BOUNDS.minX).toBe(MARK_GEOMETRY.arm.left - cap);
	expect(MARK_PAINTED_BOUNDS.maxY).toBe(MARK_GEOMETRY.cradle + cap);
	expect(MARK_PAINTED_CENTRE.x).toBe(MARK_GEOMETRY.artboard / 2);
});

test("the painted radius covers every inked point", () => {
	// Sample the path densely and check nothing pokes outside the radius the safe-zone
	// maths trusts. The arm caps are the extreme, but this does not assume that.
	const { arm, top, cradle, stroke } = MARK_GEOMETRY;
	const cap = stroke / 2;
	const turn = (top + cradle) / 2 + 6;

	const points: Array<[number, number]> = [];
	for (let step = 0; step <= 40; step += 1) {
		const t = step / 40;
		points.push([arm.left, top + (turn - top) * t]);
		points.push([arm.right, top + (turn - top) * t]);
		// Both cradle curves, as quadratic beziers.
		const inv = 1 - t;
		points.push([
			inv * inv * arm.left + 2 * inv * t * arm.left + t * t * 50,
			inv * inv * turn + 2 * inv * t * cradle + t * t * cradle,
		]);
		points.push([
			inv * inv * 50 + 2 * inv * t * arm.right + t * t * arm.right,
			inv * inv * cradle + 2 * inv * t * cradle + t * t * turn,
		]);
	}

	for (const [x, y] of points) {
		const dx = x - MARK_PAINTED_CENTRE.x;
		const dy = y - MARK_PAINTED_CENTRE.y;
		expect(Math.sqrt(dx * dx + dy * dy) + cap).toBeLessThanOrEqual(MARK_PAINTED_RADIUS + 1e-9);
	}
});

test("safe-zone scaling fits the platform masks", () => {
	// Android guarantees the central 66 of 108dp; the web maskable spec guarantees a circle
	// of 80% of the width. At the scale each returns, the mark's radius lands exactly on
	// the mask's radius — so anything the sync script rounds down from is safe.
	for (const safeRadius of [33 / 108, 0.4]) {
		const scale = markScaleForSafeRadius(safeRadius);
		const radiusAsFraction = (MARK_PAINTED_RADIUS * scale) / MARK_GEOMETRY.artboard;
		expect(radiusAsFraction).toBeCloseTo(safeRadius, 10);
	}
	expect(markScaleForSafeRadius(33 / 108)).toBeLessThan(1);
});

test("the path is a stroke, closing nothing", () => {
	const d = tilakPathData();
	expect(d).toStartWith("M30 18");
	expect(d).toEndWith("L70 18");
	expect(d).not.toInclude("Z");
	expect(markSvg({ colourway: MARK_DARK })).toInclude('fill="none"');
});

test("svg carries the ground, both inks and the shading", () => {
	const svg = markSvg({ colourway: MARK_DARK, size: 512, title: "Granthalaya" });
	expect(svg).toStartWith("<svg xmlns=");
	expect(svg).toInclude('width="512" height="512"');
	expect(svg).toInclude('viewBox="0 0 100 100"');
	expect(svg).toInclude("<title>Granthalaya</title>");
	expect(svg).toInclude(MARK_DARK.ground ?? "");
	expect(svg).toInclude(MARK_DARK.tilak);
	expect(svg).toInclude(MARK_DARK.chandlo);
	expect(svg).toInclude("linearGradient");
});

test("a transparent ground drops the ground rect and the shading with it", () => {
	// Shading over transparency would darken nothing and tint the mark's own edges.
	const svg = markSvg({ colourway: MARK_MONO });
	expect(svg).not.toInclude("linearGradient");
	expect(svg).not.toInclude("<rect");
	expect(svg).toInclude('aria-hidden="true"');
});

test("scaling below 1 recentres onto the canvas, and scale 1 does not", () => {
	// The full-bleed artboard is the composition that was approved, so it is emitted
	// untouched; only the inset variants move, because a mask centres on the canvas.
	expect(markSvg({ colourway: MARK_DARK })).not.toInclude("transform=");

	const inset = markSvg({ colourway: MARK_MONO, scale: 0.72 });
	expect(inset).toInclude("translate(50 50) scale(0.72)");
	expect(inset).toInclude(`translate(-${MARK_PAINTED_CENTRE.x} -${MARK_PAINTED_CENTRE.y})`);
});

test("a style block lets the colours come from CSS", () => {
	// How the theme-aware favicon.svg is built: variables in, media query does the rest.
	const svg = markSvg({
		colourway: { id: "css", ground: "var(--g)", tilak: "var(--t)", chandlo: "var(--c)" },
		style: ":root{--g:#000}",
	});
	expect(svg).toInclude("<style>:root{--g:#000}</style>");
	expect(svg).toInclude('fill="var(--g)"');
});

test("every colourway is distinct and complete", () => {
	const ids = MARK_COLOURWAYS.map((colourway) => colourway.id);
	expect(new Set(ids).size).toBe(ids.length);
	for (const colourway of MARK_COLOURWAYS) {
		expect(colourway.tilak).toMatch(/^#[0-9A-F]{6}$/);
		expect(colourway.chandlo).toMatch(/^#[0-9A-F]{6}$/);
		if (colourway.ground !== null) expect(colourway.ground).toMatch(/^#[0-9A-F]{6}$/);
	}
});
