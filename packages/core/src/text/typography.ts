/**
 * The Gujarati typography rules, in one place.
 *
 * These are stated in `CLAUDE.md` as non-negotiables and repeated in `docs/typography.md`
 * with the reasoning. Here they are values a renderer can use and a checker can enforce, so
 * a screen that violates one fails a test instead of shipping a subtly ugly page.
 *
 * Everything is platform-neutral data. React Native wants absolute pixels for `lineHeight`
 * and CSS accepts them, so that is what `resolveTextStyle` returns; the Android-only props
 * that go with it (`includeFontPadding`, hyphenation) belong to the mobile adapter, not
 * here.
 */
import type { Script, VerseForm } from "../book/schema.ts";

/**
 * Scripts whose letters stack marks above and below the baseline, and whose conjuncts are
 * single indivisible shapes. Every rule in this module exists because of that stacking.
 */
export function isIndicScript(script: Script): boolean {
	return script === "gujr" || script === "deva";
}

/** Line height as a multiple of font size. */
export type LineHeightBand = {
	readonly min: number;
	readonly preferred: number;
	readonly max: number;
};

/**
 * Gujarati sets marks two levels above the baseline (matra plus anusvara or a Vedic tone)
 * and hangs conjunct tails below it. At the 1.4–1.5 that suits Latin those two zones meet
 * between consecutive lines and the page reads as noise. 1.7 is where they clear; past 2.0
 * the lines stop reading as a paragraph.
 *
 * Latin's band is wider at the bottom only because nothing collides there — a Latin block
 * inside a Gujarati page still takes the Gujarati leading, so the two scripts share a
 * baseline grid.
 */
const LINE_HEIGHT_BANDS: Readonly<Record<Script, LineHeightBand>> = {
	gujr: { min: 1.7, preferred: 1.8, max: 2.0 },
	deva: { min: 1.7, preferred: 1.8, max: 2.0 },
	latn: { min: 1.35, preferred: 1.5, max: 2.0 },
};

/**
 * How much larger a script must be set than Latin to read as the same size. Gujarati's
 * glyphs carry their weight in a shorter x-height and spend vertical room on marks, so at a
 * nominal 16px it reads smaller than 16px Latin does. 12% is the middle of the 10–15% band
 * the design language calls for.
 */
const SIZE_SCALE: Readonly<Record<Script, number>> = {
	gujr: 1.12,
	deva: 1.12,
	latn: 1,
};

/**
 * Letter-spacing is not a knob on Indic text at any value. The shaper has already positioned
 * the parts of a conjunct relative to each other; inserting tracking between them pushes a
 * rakar or a reph off its base, which reads as a misspelling rather than as loose type.
 */
export const INDIC_LETTER_SPACING = 0;

/**
 * Highlights are a background wash. An underline is drawn exactly where Gujarati's
 * below-base matras and conjunct tails live, so it strikes through the letters it means to
 * mark; a background sits behind them and touches nothing.
 */
export const HIGHLIGHT_RENDERING = "background";

export function lineHeightBand(script: Script): LineHeightBand {
	return LINE_HEIGHT_BANDS[script];
}

export function scriptSizeScale(script: Script): number {
	return SIZE_SCALE[script];
}

/** Hold a line-height ratio inside its script's band — for the P2.3 reading settings sheet. */
export function clampLineHeight(ratio: number, script: Script): number {
	const band = LINE_HEIGHT_BANDS[script];
	return Math.min(Math.max(ratio, band.min), band.max);
}

export type TextStyleRequest = {
	readonly script: Script;
	/** Latin-equivalent size in px: what a design token or the reader's setting names. */
	readonly baseFontSize: number;
	/** Multiple of font size. Defaults to the script's preferred value; always clamped. */
	readonly lineHeight?: number;
	/** Typographic form of the unit being rendered. Defaults to `prose`. */
	readonly form?: VerseForm;
};

export type ResolvedTextStyle = {
	readonly fontSize: number;
	/** Absolute pixels: React Native requires them and CSS accepts them. */
	readonly lineHeight: number;
	readonly letterSpacing: number;
	/** Ragged-right. Justification opens rivers that Gujarati's long words cannot absorb. */
	readonly textAlign: "left";
	/** `verse` keeps the line breaks the edition set; `prose` reflows to the column. */
	readonly preserveLineBreaks: boolean;
};

/** Two decimals: enough to keep the ratio honest, few enough to avoid sub-pixel jitter. */
function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * Turn a nominal size and a script into the metrics to render with. Every surface goes
 * through this rather than hardcoding sizes, so the size scale and the leading band are
 * applied identically on mobile, in the studio preview and on the promo site.
 */
export function resolveTextStyle(request: TextStyleRequest): ResolvedTextStyle {
	const { script, baseFontSize, form = "prose" } = request;
	const band = LINE_HEIGHT_BANDS[script];
	const ratio = clampLineHeight(request.lineHeight ?? band.preferred, script);
	const fontSize = round(baseFontSize * SIZE_SCALE[script]);

	return {
		fontSize,
		lineHeight: round(fontSize * ratio),
		letterSpacing: INDIC_LETTER_SPACING,
		textAlign: "left",
		preserveLineBreaks: form === "verse",
	};
}

export type TypographyViolation = {
	/** Stable kebab-case identifier, matching the rule names in `docs/typography.md`. */
	readonly code: string;
	readonly message: string;
};

/**
 * The subset of a platform style object these rules have an opinion about. Loose on purpose:
 * a React Native `TextStyle` and a CSS declaration both satisfy it structurally, so a caller
 * can hand over whatever it is about to render.
 */
export type CheckableTextStyle = {
	readonly fontSize?: number;
	/** Absolute pixels, as both platforms take it. */
	readonly lineHeight?: number;
	readonly letterSpacing?: number;
	readonly textDecorationLine?: string;
	readonly textAlign?: string;
};

/**
 * Check a style against the rules. Used in tests around every surface that renders
 * scripture, and by the reading-settings sheet (P2.3) before it accepts a custom preset.
 *
 * Tolerance on the line-height band absorbs `resolveTextStyle`'s own rounding — a resolved
 * style must never be reported as illegal.
 */
export function checkTextStyle(
	style: CheckableTextStyle,
	script: Script,
): readonly TypographyViolation[] {
	const violations: TypographyViolation[] = [];
	const indic = isIndicScript(script);

	if (indic && style.letterSpacing !== undefined && style.letterSpacing !== 0) {
		violations.push({
			code: "letter-spacing-on-indic",
			message: `letterSpacing must be 0 on ${script} text; any other value pulls conjuncts apart`,
		});
	}

	if (style.fontSize !== undefined && style.lineHeight !== undefined && style.fontSize > 0) {
		const band = LINE_HEIGHT_BANDS[script];
		const ratio = style.lineHeight / style.fontSize;
		const tolerance = 0.01;
		if (ratio < band.min - tolerance || ratio > band.max + tolerance) {
			violations.push({
				code: "line-height-out-of-band",
				message: `line height is ${ratio.toFixed(2)}× font size; ${script} needs ${band.min}–${band.max}×`,
			});
		}
	}

	if (indic && style.textDecorationLine !== undefined && style.textDecorationLine !== "none") {
		violations.push({
			code: "decoration-on-indic",
			message: `textDecorationLine "${style.textDecorationLine}" crosses below-base matras; mark text with a ${HIGHLIGHT_RENDERING} instead`,
		});
	}

	if (style.textAlign === "justify") {
		violations.push({
			code: "justified-text",
			message: "scripture is set ragged-right; justification opens rivers between long words",
		});
	}

	return violations;
}
