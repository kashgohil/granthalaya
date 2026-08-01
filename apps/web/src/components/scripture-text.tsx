import {
	type FontRole,
	type FontWeight,
	fontFamilyStack,
	protectDanda,
	resolveTextStyle,
	type Script,
	type VerseForm,
} from "@granthalaya/core";
import type { CSSProperties, ReactNode } from "react";

/**
 * `fontFamilyStack` stays platform-neutral and returns bare names. CSS accepts an unquoted
 * multi-word family, but only while every word happens to be a valid identifier — quoting is
 * what makes that not a coincidence. Generic keywords (`serif`) must stay unquoted, and none
 * of them contain a space, so the test doubles as the exception.
 */
function cssFontFamily(role: FontRole): string {
	return fontFamilyStack(role)
		.map((name) => (name.includes(" ") ? `"${name}"` : name))
		.join(", ");
}

export type ScriptureTextProps = {
	children: string;
	script?: Script;
	form?: VerseForm;
	/** Latin-equivalent size in px; the script's scale is applied on top. */
	size?: number;
	/** Multiple of font size. Clamped into the script's band by core. */
	lineHeight?: number;
	face?: FontRole;
	weight?: FontWeight;
	/** Highlight colour. A background wash — never an underline. */
	highlight?: string;
	className?: string;
	style?: CSSProperties;
	as?: "p" | "div" | "span";
};

/**
 * The web half of the P0.3 rendering rules — the studio's preview and the promo site's
 * verse pages both go through this, so a page there is set exactly as the reader sets it.
 *
 * The metrics come from `packages/core`, the same call the Expo component makes. Where the
 * two differ is only where the platforms genuinely differ: the web can name a family and a
 * weight and let the cascade pick a face, while React Native needs one family name per
 * weight.
 */
export function ScriptureText({
	children,
	script = "gujr",
	form,
	size = 18,
	lineHeight,
	face = "body",
	weight = 400,
	highlight,
	className,
	style,
	as: Component = "p",
}: ScriptureTextProps): ReactNode {
	const resolved = resolveTextStyle({ script, baseFontSize: size, lineHeight, form });

	return (
		<Component
			className={className}
			style={{
				fontFamily: cssFontFamily(face),
				fontWeight: weight,
				fontSize: `${resolved.fontSize}px`,
				lineHeight: `${resolved.lineHeight}px`,
				letterSpacing: `${resolved.letterSpacing}px`,
				textAlign: resolved.textAlign,
				// `pre-line` keeps the authored breaks of a verse while still wrapping long
				// lines; `normal` lets prose reflow entirely.
				whiteSpace: resolved.preserveLineBreaks ? "pre-line" : "normal",
				// Nothing is hyphenated: Gujarati has no hyphenation rules, and a browser that
				// invents them breaks words mid-akshara.
				hyphens: "none",
				...(highlight === undefined ? {} : { backgroundColor: highlight, textDecoration: "none" }),
				...style,
			}}
		>
			{protectDanda(children)}
		</Component>
	);
}
