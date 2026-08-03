/**
 * The design language (P0.4) — spec in `docs/design-language.md`.
 *
 * Colour, spacing, type scale and generated covers, as platform-neutral data. The Expo app
 * consumes it directly; the web takes the same values as CSS variables through
 * `designTokensCss` and `bun run design:sync`.
 */

export type { CoverColourway, CoverSpec, CoverSubject } from "./cover.ts";
export {
	COVER_ASPECT_RATIO,
	COVER_COLOURWAYS,
	COVER_SHADING,
	coverColourway,
	coverFor,
} from "./cover.ts";
export { designTokensCss, metricCssVariables, themeCssVariables } from "./css.ts";
export type { MarkColourway, MarkSvgOptions } from "./mark.ts";
export {
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
export type { GrainSpec, MarkColor, MarkColors, ThemeName, ThemeTokens } from "./themes.ts";
export {
	isThemeName,
	MARK_COLORS,
	THEME_NAMES,
	theme,
	themeForColorScheme,
} from "./themes.ts";
export type {
	RadiusToken,
	ResolvedTypeStyle,
	SpacingToken,
	TypeStyleSpec,
	TypeToken,
} from "./tokens.ts";
export { MOTION, RADIUS, resolveTypeStyle, SPACING, TYPE_SCALE } from "./tokens.ts";
