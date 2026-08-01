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
export type { FontFace, FontFamilySpec, FontRole, FontWeight } from "./fonts.ts";
export { FONT_FACES, fontFaceId, fontFamily, fontFamilyStack } from "./fonts.ts";
export { DANDA, DOUBLE_DANDA, isDanda, protectDanda } from "./punctuation.ts";
export type { ForeignScript, ScriptProfile, ScriptTally } from "./script.ts";
export { profileScript, scriptOf, scriptShare } from "./script.ts";
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
