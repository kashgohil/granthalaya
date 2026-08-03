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
export type { ParsedNumber } from "./digits.ts";
export {
	convertDigits,
	DIGIT_CLASS,
	digitScript,
	digitValue,
	formatIndicNumber,
	isDigit,
	parseIndicNumber,
} from "./digits.ts";
export type { FontFace, FontFamilySpec, FontRole, FontWeight } from "./fonts.ts";
export { FONT_FACES, fontFaceId, fontFamily, fontFamilyStack } from "./fonts.ts";
export type {
	NormalizedText,
	NormalizeOptions,
	TextRepair,
	TextRepairKind,
} from "./normalize.ts";
export { normalizeScriptureText } from "./normalize.ts";
export type {
	OrthographyReport,
	OrthographyViolation,
	OrthographyViolationKind,
} from "./orthography.ts";
export { checkOrthography, describeViolation, isNukta, isVowelSign } from "./orthography.ts";
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
