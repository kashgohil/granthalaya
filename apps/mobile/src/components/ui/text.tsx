import {
	type FontWeight,
	fontFaceId,
	protectDanda,
	resolveTypeStyle,
	type Script,
	type ThemeTokens,
	type TypeToken,
} from "@granthalaya/core";
import {
	Platform,
	Text as RNText,
	type StyleProp,
	type TextProps,
	type TextStyle,
} from "react-native";

import { useTheme } from "@/theme/theme-provider";

/** The token roles that are legal for text. Backgrounds are not colours text may take. */
export type TextColor = "ink" | "inkMuted" | "inkFaint" | "accent" | "accentInk";

export type AppTextProps = Omit<TextProps, "style"> & {
	/** A step of the type scale. Sizes are never passed as numbers. */
	token?: TypeToken;
	color?: TextColor;
	/**
	 * Defaults to Latin, because chrome is English until a localization slice exists. Pass
	 * `gujr` for anything in the book's own script — a title in a list row, a label — so it
	 * gets the size scale and the leading band rather than Latin's metrics.
	 */
	script?: Script;
	weight?: FontWeight;
	style?: StyleProp<TextStyle>;
};

/**
 * Text in the design language.
 *
 * Nothing in the app sets `fontSize`, `fontFamily` or `lineHeight` directly: this asks
 * `packages/core` for a token's metrics in the script being rendered, which is what keeps
 * the Gujarati rules (P0.3) true on every screen for free.
 *
 * Scripture goes through `ScriptureText` instead — same core call, but it also handles the
 * verse/prose line-break distinction and the highlight wash.
 */
export function AppText({
	token = "body",
	color = "ink",
	script = "latn",
	weight,
	style,
	children,
	...rest
}: AppTextProps) {
	const tokens: ThemeTokens = useTheme();
	const resolved = resolveTypeStyle(token, script);
	const face = weight ?? resolved.weight;

	return (
		<RNText
			style={[
				{
					color: tokens[color],
					fontFamily: fontFaceId(resolved.face, face),
					fontSize: resolved.fontSize,
					lineHeight: resolved.lineHeight,
					letterSpacing: resolved.letterSpacing,
					// `includeFontPadding` reserves the room a tall matra stack needs. Switching
					// it off is the standard trick for tightening Latin, and it clips Gujarati.
					...Platform.select({ android: { includeFontPadding: true }, default: {} }),
				},
				style,
			]}
			{...rest}
		>
			{typeof children === "string" ? protectDanda(children) : children}
		</RNText>
	);
}
