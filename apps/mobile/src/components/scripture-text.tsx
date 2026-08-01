import {
	type FontRole,
	type FontWeight,
	fontFaceId,
	type MarkColor,
	protectDanda,
	resolveTypeStyle,
	type Script,
	type TypeToken,
	type VerseForm,
} from "@granthalaya/core";
import { Platform, type StyleProp, Text, type TextProps, type TextStyle } from "react-native";

import { useTheme } from "@/theme/theme-provider";

export type ScriptureTextProps = Omit<TextProps, "children" | "style"> & {
	/** The text itself. A string, not nodes: the danda pass and shaping need the whole run. */
	children: string;
	/** Defaults to Gujarati — the language the reader is here for. */
	script?: Script;
	/** `verse` keeps the line breaks the edition set; `prose` reflows. */
	form?: VerseForm;
	/** Which step of the reading scale. Sizes are chosen from the scale, not typed in. */
	token?: Extract<TypeToken, "verse" | "verseLarge">;
	/** The reader's own size (P2.3), as a Latin-equivalent px value. Overrides the token. */
	size?: number;
	/** Multiple of font size. Clamped into the script's band by core. */
	lineHeight?: number;
	/** Which font role to set in. Named `face` because `role` is taken by accessibility. */
	face?: FontRole;
	weight?: FontWeight;
	/** Highlight as one of the theme's washes — never an underline (P0.3). */
	highlight?: MarkColor;
	style?: StyleProp<TextStyle>;
};

/**
 * Scripture, rendered under the P0.3 rules and the P0.4 type scale.
 *
 * Nothing in the app sets `fontSize` and `lineHeight` on Gujarati by hand: this component
 * asks `packages/core` for both, so the size scale and the 1.7–2.0 leading band hold on
 * every screen, and changing them is one edit in one place.
 *
 * The Android-only props are the reason this adapter exists at all. Core stays
 * platform-pure and returns neutral metrics; the platform quirks live here.
 */
export function ScriptureText({
	children,
	script = "gujr",
	form,
	token = "verse",
	size,
	lineHeight,
	face,
	weight,
	highlight,
	style,
	...rest
}: ScriptureTextProps) {
	const tokens = useTheme();
	const resolved = resolveTypeStyle(token, script, { size, lineHeight, form });
	const content = resolved.preserveLineBreaks ? children : children.replaceAll("\n", " ");

	return (
		<Text
			// Gujarati is not hyphenated, and Android's engine will otherwise invent break
			// points inside words that have none.
			android_hyphenationFrequency="none"
			style={[
				{
					color: tokens.ink,
					fontFamily: fontFaceId(face ?? resolved.face, weight ?? resolved.weight),
					fontSize: resolved.fontSize,
					lineHeight: resolved.lineHeight,
					letterSpacing: resolved.letterSpacing,
					textAlign: resolved.textAlign,
					// The Android default, restated so nobody "optimises" it away:
					// `includeFontPadding` reserves the room a tall matra stack or a below-base
					// conjunct needs. Switching it off is the standard trick for tightening
					// Latin, and it clips Gujarati.
					...Platform.select({ android: { includeFontPadding: true }, default: {} }),
					// A wash behind the glyphs. An underline would be drawn straight through
					// the below-base matras it is meant to mark.
					...(highlight === undefined ? {} : { backgroundColor: tokens.marks[highlight] }),
				},
				style,
			]}
			{...rest}
		>
			{protectDanda(content)}
		</Text>
	);
}
