import { expect, test } from "bun:test";
import {
	MARK_DARK,
	MARK_GEOMETRY,
	MARK_MONO,
	MARK_SAND,
} from "../packages/core/src/design/mark.ts";
import { flattenTilak, parseHex, renderMark } from "./rasterise.ts";

/** Straight-alpha RGBA at an artboard coordinate, for a canvas of `size`. */
function sample(pixels: Uint8Array, size: number, x: number, y: number) {
	const column = Math.floor((x / MARK_GEOMETRY.artboard) * size);
	const row = Math.floor((y / MARK_GEOMETRY.artboard) * size);
	const base = (row * size + column) * 4;
	return {
		r: pixels[base] as number,
		g: pixels[base + 1] as number,
		b: pixels[base + 2] as number,
		a: pixels[base + 3] as number,
	};
}

test("parseHex normalises to 0…1", () => {
	// The bug this file exists for: 0…255 channels composited into a 0…1 buffer saturate
	// every blend to white, and the result still looks like a plausible icon.
	expect(parseHex("#FFFFFF")).toEqual([1, 1, 1]);
	expect(parseHex("#000000")).toEqual([0, 0, 0]);
	const [r, g, b] = parseHex("#C4622F");
	for (const channel of [r, g, b]) {
		expect(channel).toBeGreaterThanOrEqual(0);
		expect(channel).toBeLessThanOrEqual(1);
	}
});

test("the chandlo renders in kumkum, not blown out", () => {
	const size = 256;
	const pixels = renderMark({ size, colourway: MARK_DARK, shading: false });
	const { chandlo } = MARK_GEOMETRY;
	const centre = sample(pixels, size, chandlo.cx, chandlo.cy);
	const [r, g, b] = parseHex(MARK_DARK.chandlo);

	expect(centre.a).toBe(255);
	expect(centre.r).toBe(Math.round(r * 255));
	expect(centre.g).toBe(Math.round(g * 255));
	expect(centre.b).toBe(Math.round(b * 255));
});

test("the tilak renders in chandan and the ground stays cloth", () => {
	const size = 256;
	const pixels = renderMark({ size, colourway: MARK_DARK, shading: false });
	const armCentre = sample(pixels, size, MARK_GEOMETRY.arm.left, 30);
	const [tr] = parseHex(MARK_DARK.tilak);
	expect(armCentre.r).toBe(Math.round(tr * 255));

	// A corner is far from every stroke, so it must be exactly the ground.
	const corner = sample(pixels, size, 2, 2);
	const [gr, gg, gb] = parseHex(MARK_DARK.ground ?? "#000000");
	expect(corner.r).toBe(Math.round(gr * 255));
	expect(corner.g).toBe(Math.round(gg * 255));
	expect(corner.b).toBe(Math.round(gb * 255));
	expect(corner.a).toBe(255);
});

test("shading is a gentle gradient, never a hard edge", () => {
	// The failure mode that produced a half-white icon: a discontinuity at the 0.55 stop.
	const size = 128;
	const pixels = renderMark({ size, colourway: MARK_DARK });

	// Straddling the 0.55 stop, where t = (x + y) / 200. Both samples sit beyond the mark's
	// widest inked point (x 75.5) so this measures the gradient and nothing else.
	const before = sample(pixels, size, 88, 20);
	const after = sample(pixels, size, 94, 22);
	expect(Math.abs(before.r - after.r)).toBeLessThan(12);

	// Top-left is lifted, bottom-right is dropped, and neither reaches an extreme.
	const topLeft = sample(pixels, size, 3, 3);
	const bottomRight = sample(pixels, size, 97, 97);
	expect(topLeft.r).toBeGreaterThan(bottomRight.r);
	expect(topLeft.r).toBeLessThan(255);
	expect(bottomRight.r).toBeGreaterThan(0);
});

test("a transparent ground stays transparent away from the mark", () => {
	const size = 128;
	const pixels = renderMark({ size, colourway: MARK_MONO, shading: false });
	expect(sample(pixels, size, 2, 2).a).toBe(0);
	expect(sample(pixels, size, MARK_GEOMETRY.chandlo.cx, MARK_GEOMETRY.chandlo.cy).a).toBe(255);
});

test("shading is skipped over a transparent ground", () => {
	// Requested, but it has nothing to sit on and would only tint the mark's own edges.
	const size = 64;
	const shaded = renderMark({ size, colourway: MARK_MONO, shading: true });
	const flat = renderMark({ size, colourway: MARK_MONO, shading: false });
	expect(shaded).toEqual(flat);
});

test("hiding the mark leaves only the cloth", () => {
	const size = 64;
	const pixels = renderMark({ size, colourway: MARK_DARK, showMark: false, shading: false });
	const { chandlo } = MARK_GEOMETRY;
	const [gr] = parseHex(MARK_DARK.ground ?? "#000000");
	expect(sample(pixels, size, chandlo.cx, chandlo.cy).r).toBe(Math.round(gr * 255));
});

test("insetting keeps the whole mark inside the canvas", () => {
	// The Android layer. Nothing may be inked in the outer band, or the launcher clips it.
	const size = 128;
	const pixels = renderMark({
		size,
		colourway: MARK_MONO,
		scale: 0.74,
		shading: false,
	});

	const margin = Math.floor(size * 0.1);
	for (let row = 0; row < size; row += 1) {
		for (let column = 0; column < size; column += 1) {
			const edge =
				row < margin || column < margin || row >= size - margin || column >= size - margin;
			if (edge) expect(pixels[(row * size + column) * 4 + 3]).toBe(0);
		}
	}
});

test("output is deterministic", () => {
	// What lets these files be committed and reviewed as a diff.
	const a = renderMark({ size: 64, colourway: MARK_SAND });
	const b = renderMark({ size: 64, colourway: MARK_SAND });
	expect(a).toEqual(b);
});

test("the flattened tilak spans both arms and stays on the artboard", () => {
	const points = flattenTilak();
	expect(points.length).toBeGreaterThan(90);
	expect(points[0]).toEqual([MARK_GEOMETRY.arm.left, MARK_GEOMETRY.top]);
	expect(points.at(-1)).toEqual([MARK_GEOMETRY.arm.right, MARK_GEOMETRY.top]);
	for (const [x, y] of points) {
		expect(x).toBeGreaterThanOrEqual(MARK_GEOMETRY.arm.left);
		expect(x).toBeLessThanOrEqual(MARK_GEOMETRY.arm.right);
		expect(y).toBeLessThanOrEqual(MARK_GEOMETRY.cradle);
	}
});
