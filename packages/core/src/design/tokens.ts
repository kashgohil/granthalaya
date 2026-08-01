/**
 * The measurable half of the design language (P0.4): spacing, radii, motion and the type
 * scale. Colour lives next door in `themes.ts`.
 *
 * Everything here is platform-neutral numbers in density-independent pixels, which is what
 * React Native's `StyleSheet` takes and what CSS takes with a `px` suffix. The two surfaces
 * therefore share one set of values rather than two that drift.
 *
 * The type scale's rule is the important one: **a token stores the Latin-equivalent size**,
 * the number a designer means when they say "17". What Gujarati is actually set at is
 * derived from it by `resolveTextStyle` — +12% and the 1.7–2.0 leading band — so a screen
 * cannot pick a Gujarati size at all, and the P0.3 rules hold everywhere by construction.
 */
import type { Script, VerseForm } from "../book/schema.ts";
import type { FontRole, FontWeight } from "../text/fonts.ts";
import { isIndicScript, type ResolvedTextStyle, resolveTextStyle } from "../text/typography.ts";

/**
 * The spacing ramp. Roughly geometric, so two steps read as a clear difference — a 4px scale
 * with every multiple available is not a scale, it is a licence.
 */
export const SPACING = {
	/** Hairline gaps: between a number and its unit, inside a chip. */
	xxs: 2,
	xs: 4,
	sm: 8,
	md: 12,
	/** The default gap between related elements, and a card's inner padding on a phone. */
	lg: 16,
	xl: 24,
	xxl: 32,
	xxxl: 48,
	huge: 64,
} as const;

export type SpacingToken = keyof typeof SPACING;

/** Corner radii. Larger surfaces take larger radii, so curvature reads as consistent. */
export const RADIUS = {
	/** Marks, chips, meters. */
	sm: 6,
	/** Buttons, inputs, list thumbnails. */
	md: 10,
	/** Cards, sheets, the reading surface. */
	lg: 16,
	/** Covers and modals. */
	xl: 24,
	pill: 999,
} as const;

export type RadiusToken = keyof typeof RADIUS;

/**
 * Motion. Three durations and one curve — a devotional reading app earns nothing from a
 * motion vocabulary, and every extra easing is one more thing that can feel wrong.
 *
 * The curve is a decelerating ease-out: things arrive quickly and settle. Consumers must
 * still honour the platform's reduce-motion setting; these are durations, not permission.
 */
export const MOTION = {
	/** Press feedback: the scale-down under a finger. */
	tap: 120,
	/** Colour, opacity and small position changes. */
	transition: 200,
	/** Sheets, modals, anything crossing the screen. */
	sheet: 320,
	/** Cubic-bezier control points, in the order both platforms take them. */
	easing: [0.2, 0.8, 0.2, 1] as const,
} as const;

/** A single step of the type scale. */
export type TypeStyleSpec = {
	/** Latin-equivalent size in px. Gujarati's is derived, never stored. */
	readonly size: number;
	/**
	 * Line height as a multiple of font size, for Latin. Indic scripts clamp it up into
	 * their 1.7–2.0 band, so this is a floor for them rather than a value.
	 */
	readonly lineHeight: number;
	readonly face: FontRole;
	readonly weight: FontWeight;
	/**
	 * Tracking in px — **Latin only**, and only on the uppercase label token. It is dropped
	 * for Indic scripts, where any tracking splits conjuncts (P0.3).
	 */
	readonly tracking?: number;
};

/**
 * The scale. Two families of role, which is the font system in one table: `ui` faces set the
 * app, `body` faces set the scripture. A reader should be able to tell the text from the
 * chrome without reading either.
 */
export const TYPE_SCALE = {
	/** Book titles, screen heroes. */
	display: { size: 30, lineHeight: 1.35, face: "ui", weight: 600 },
	/** Screen titles. */
	title: { size: 22, lineHeight: 1.4, face: "ui", weight: 600 },
	/** Section headings inside a screen. */
	heading: { size: 17, lineHeight: 1.45, face: "ui", weight: 600 },
	/** Chrome copy: rows, descriptions, buttons. */
	body: { size: 15, lineHeight: 1.5, face: "ui", weight: 400 },
	/** Tags, meta lines, eyebrows. Uppercase and tracked in Latin. */
	label: { size: 13, lineHeight: 1.4, face: "ui", weight: 600, tracking: 0.6 },
	/** Footnotes, attributions, licence lines. */
	caption: { size: 12, lineHeight: 1.4, face: "ui", weight: 400 },
	/** Scripture — the default reading size, and the anchor of the P2.3 settings sheet. */
	verse: { size: 18, lineHeight: 1.8, face: "body", weight: 400 },
	/** Scripture at the top of its range: a pull quote, a verse of the day. */
	verseLarge: { size: 22, lineHeight: 1.8, face: "body", weight: 400 },
} as const satisfies Record<string, TypeStyleSpec>;

export type TypeToken = keyof typeof TYPE_SCALE;

export type ResolvedTypeStyle = ResolvedTextStyle & {
	readonly face: FontRole;
	readonly weight: FontWeight;
};

/**
 * Turn a type token into the metrics to render with, for a given script.
 *
 * This is the only supported way to get a font size out of the design language. It composes
 * with `resolveTextStyle`, so Gujarati automatically gets the size scale and the clamped
 * leading band, and Latin keeps the tighter leading the token asked for.
 *
 * `size` overrides the token's own size — for the reading settings sheet (P2.3), which moves
 * the verse size while keeping every other property of the token intact. `form` is passed
 * through to decide whether authored line breaks survive.
 */
export function resolveTypeStyle(
	token: TypeToken,
	script: Script,
	overrides: {
		readonly size?: number;
		readonly lineHeight?: number;
		readonly form?: VerseForm;
	} = {},
): ResolvedTypeStyle {
	const spec: TypeStyleSpec = TYPE_SCALE[token];
	const resolved = resolveTextStyle({
		script,
		baseFontSize: overrides.size ?? spec.size,
		lineHeight: overrides.lineHeight ?? spec.lineHeight,
		form: overrides.form,
	});

	return {
		...resolved,
		// Tracking is a Latin-chrome affordance. On Indic text `resolveTextStyle` has already
		// returned 0 and it must stay there.
		letterSpacing: isIndicScript(script) ? resolved.letterSpacing : (spec.tracking ?? 0),
		face: spec.face,
		weight: spec.weight,
	};
}
