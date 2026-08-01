/**
 * Gujarati typography and text rules (P0.3) — spec in `docs/typography.md`.
 */

export type { AksharaSpan } from "./akshara.ts";
export {
	aksharaSpans,
	aksharas,
	countAksharas,
	firstAkshara,
	isAksharaBoundary,
	isCombiningMark,
	isConjoinableConsonant,
	isVirama,
	sliceAksharas,
	truncateAksharas,
} from "./akshara.ts";
export type {
	CheckableTextStyle,
	LineHeightBand,
	ResolvedTextStyle,
	TextStyleRequest,
	TypographyViolation,
} from "./typography.ts";
export {
	checkTextStyle,
	clampLineHeight,
	HIGHLIGHT_RENDERING,
	INDIC_LETTER_SPACING,
	isIndicScript,
	lineHeightBand,
	resolveTextStyle,
	scriptSizeScale,
} from "./typography.ts";
