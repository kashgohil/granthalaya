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
