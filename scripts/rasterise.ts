/**
 * The identity mark as pixels.
 *
 * Kept apart from `sync-icons.ts` so it can be tested without that script's writes firing
 * on import — the arithmetic here is exactly the kind that looks right and is not.
 *
 * The mark is drawn analytically rather than by rasterising the SVG: it is two capsules,
 * two quadratic curves and a circle, and a signed-distance field over those gives exact
 * antialiasing at any size with no headless browser, no native binary, and no install step
 * between `git clone` and a build. It also makes the output byte-deterministic, so a
 * regenerated asset shows up in a diff only when the geometry actually moved.
 */
import {
	MARK_GEOMETRY,
	MARK_PAINTED_CENTRE,
	type MarkColourway,
} from "../packages/core/src/design/mark.ts";

/**
 * Linear RGB in 0…1, *not* 0…255.
 *
 * The buffer this composites into is normalised, so colours have to be too. Mixing the two
 * scales is silent: every blend saturates to white and the result still looks like a
 * plausible icon until you notice the shading has become a hard diagonal.
 */
type Rgb = readonly [number, number, number];

const WHITE: Rgb = [1, 1, 1];
const BLACK: Rgb = [0, 0, 0];

export function parseHex(hex: string): Rgb {
	const value = Number.parseInt(hex.slice(1), 16);
	return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

/**
 * The tilak flattened to a polyline, in artboard units.
 *
 * Distance-to-polyline gives round caps and round joins for free — the minimum distance to
 * a set of segments, thresholded at half the stroke width, *is* a round-capped stroke — so
 * the flattening is the whole of the stroke geometry. 48 samples per curve puts the chord
 * error below a thousandth of a unit, which is invisible at 1024px.
 */
export function flattenTilak(): Array<readonly [number, number]> {
	const { arm, top, cradle } = MARK_GEOMETRY;
	const turn = (top + cradle) / 2 + 6;
	const points: Array<readonly [number, number]> = [[arm.left, top]];

	points.push([arm.left, turn]);
	const quad = (
		p0: readonly [number, number],
		p1: readonly [number, number],
		p2: readonly [number, number],
	) => {
		for (let step = 1; step <= 48; step += 1) {
			const t = step / 48;
			const inv = 1 - t;
			points.push([
				inv * inv * p0[0] + 2 * inv * t * p1[0] + t * t * p2[0],
				inv * inv * p0[1] + 2 * inv * t * p1[1] + t * t * p2[1],
			]);
		}
	};
	quad([arm.left, turn], [arm.left, cradle], [50, cradle]);
	quad([50, cradle], [arm.right, cradle], [arm.right, turn]);
	points.push([arm.right, top]);

	return points;
}

const TILAK_POLYLINE = flattenTilak();

function distanceToSegment(
	x: number,
	y: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lengthSquared = dx * dx + dy * dy;
	const t =
		lengthSquared === 0
			? 0
			: Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
	const px = x - (ax + t * dx);
	const py = y - (ay + t * dy);
	return Math.sqrt(px * px + py * py);
}

export type RenderOptions = {
	readonly size: number;
	readonly colourway: MarkColourway;
	/** Matches `markSvg`: below 1 the mark is also recentred on the canvas. */
	readonly scale?: number;
	readonly shading?: boolean;
	/** Off for Android's background layer, which is the cloth with nothing on it. */
	readonly showMark?: boolean;
};

/**
 * The mark as straight-alpha RGBA, one byte per channel.
 *
 * Coverage is `halfWidth - distance + 0.5` clamped to 0…1 — a one-pixel linear ramp
 * centred on the true edge. That is a box filter over the pixel, which for shapes this
 * smooth is indistinguishable from supersampling and roughly two orders of magnitude
 * cheaper.
 */
export function renderMark(options: RenderOptions): Uint8Array {
	const { size, colourway, scale = 1, shading = true, showMark = true } = options;
	const { artboard, chandlo, stroke } = MARK_GEOMETRY;

	const unit = size / artboard;
	const centre = artboard / 2;
	/** Artboard point to device pixels, applying the same recentring `markSvg` does. */
	const place = (x: number, y: number): readonly [number, number] =>
		scale === 1
			? [x * unit, y * unit]
			: [
					(centre + (x - MARK_PAINTED_CENTRE.x) * scale) * unit,
					(centre + (y - MARK_PAINTED_CENTRE.y) * scale) * unit,
				];

	const polyline = TILAK_POLYLINE.map(([x, y]) => place(x, y));
	const [chandloX, chandloY] = place(chandlo.cx, chandlo.cy);
	const chandloRadius = chandlo.r * scale * unit;
	const halfStroke = (stroke / 2) * scale * unit;

	// Straight alpha, 0…1, so compositing onto a transparent ground stays correct.
	const buffer = new Float32Array(size * size * 4);
	const ground = colourway.ground === null ? null : parseHex(colourway.ground);
	if (ground) {
		for (let index = 0; index < size * size; index += 1) {
			buffer[index * 4] = ground[0];
			buffer[index * 4 + 1] = ground[1];
			buffer[index * 4 + 2] = ground[2];
			buffer[index * 4 + 3] = 1;
		}
	}

	const composite = (index: number, source: Rgb, alpha: number) => {
		if (alpha <= 0) return;
		const base = index * 4;
		const dstAlpha = buffer[base + 3] ?? 0;
		const outAlpha = alpha + dstAlpha * (1 - alpha);
		if (outAlpha <= 0) return;
		const carried = dstAlpha * (1 - alpha);
		for (let channel = 0; channel < 3; channel += 1) {
			const src = source[channel] as number;
			const dst = buffer[base + channel] ?? 0;
			buffer[base + channel] = (src * alpha + dst * carried) / outAlpha;
		}
		buffer[base + 3] = outAlpha;
	};

	if (showMark) {
		const tilak = parseHex(colourway.tilak);
		const dot = parseHex(colourway.chandlo);

		// Only the mark's own bounding box can be inked, so the rest of the canvas is skipped.
		const pad = halfStroke + 2;
		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		for (const [x, y] of polyline) {
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
		minX = Math.max(0, Math.floor(Math.min(minX, chandloX - chandloRadius) - pad));
		minY = Math.max(0, Math.floor(Math.min(minY, chandloY - chandloRadius) - pad));
		maxX = Math.min(size - 1, Math.ceil(Math.max(maxX, chandloX + chandloRadius) + pad));
		maxY = Math.min(size - 1, Math.ceil(Math.max(maxY, chandloY + chandloRadius) + pad));

		for (let row = minY; row <= maxY; row += 1) {
			const y = row + 0.5;
			for (let column = minX; column <= maxX; column += 1) {
				const x = column + 0.5;
				const index = row * size + column;

				let nearest = Number.POSITIVE_INFINITY;
				for (let segment = 0; segment < polyline.length - 1; segment += 1) {
					const a = polyline[segment] as readonly [number, number];
					const b = polyline[segment + 1] as readonly [number, number];
					const distance = distanceToSegment(x, y, a[0], a[1], b[0], b[1]);
					if (distance < nearest) nearest = distance;
				}
				composite(index, tilak, clamp01(halfStroke - nearest + 0.5));

				const dx = x - chandloX;
				const dy = y - chandloY;
				composite(index, dot, clamp01(chandloRadius - Math.sqrt(dx * dx + dy * dy) + 0.5));
			}
		}
	}

	// The lit board from COVER_SHADING: a highlight toward the top-left corner and a shadow
	// toward the bottom-right, so the cloth reads as a bound board rather than a flat fill.
	// Over a transparent ground it would only tint the mark's own antialiased edges.
	if (shading && ground) {
		for (let row = 0; row < size; row += 1) {
			for (let column = 0; column < size; column += 1) {
				const t = ((column + 0.5) / size + (row + 0.5) / size) / 2;
				const index = row * size + column;
				if (t <= 0.55) {
					composite(index, WHITE, 0.12 * (1 - t / 0.55));
				} else {
					composite(index, BLACK, 0.14 * ((t - 0.55) / 0.45));
				}
			}
		}
	}

	const pixels = new Uint8Array(size * size * 4);
	for (let index = 0; index < pixels.length; index += 1) {
		pixels[index] = Math.max(0, Math.min(255, Math.round((buffer[index] ?? 0) * 255)));
	}
	return pixels;
}

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}
