/**
 * The four themes (P0.4): White, Sepia, Dark and Black.
 *
 * They are not four skins over one palette. Each one sets its own ink, hairline and
 * highlight values, because a wash that reads as a gentle mark on paper reads as a smear on
 * a black screen, and a hairline that separates two light surfaces disappears between two
 * dark ones. Four themes for four kinds of light: daylight, a lamp, night, and an OLED phone
 * at 3am.
 *
 * Roles are semantic — `paper`, `ink`, `rule` — never literal, so a screen asks for what a
 * colour *is for* and gets the right value in all four. Nothing in the apps may hardcode a
 * hex; `theme(name)` is the only source.
 *
 * The neutrals are warm on purpose. A pure grey next to Rasa's warm serif reads as a
 * default; every neutral here is pulled a few degrees toward the paper it sits on.
 */

export type ThemeName = "white" | "sepia" | "dark" | "black";

/** The four highlight washes (P3.1). Backgrounds only — never an underline (P0.3). */
export type MarkColors = {
	readonly saffron: string;
	readonly leaf: string;
	readonly sky: string;
	readonly rose: string;
};

export type MarkColor = keyof MarkColors;

/**
 * How the paper grain is composited. The tile itself is one shared texture; what changes per
 * theme is how much of it shows and which way it pushes the pixels underneath.
 */
export type GrainSpec = {
	/** 0–1. Zero disables the overlay entirely. */
	readonly opacity: number;
	/**
	 * `multiply` darkens — grain as fibre in light paper. `screen` lightens — grain as the
	 * faint sensor noise of a photograph, which is what keeps a large flat dark fill from
	 * banding on an OLED panel.
	 */
	readonly blend: "multiply" | "screen";
};

export type ThemeTokens = {
	readonly name: ThemeName;
	/** Drives status-bar style, keyboard appearance and image tinting. */
	readonly isDark: boolean;
	/** The canvas behind everything. */
	readonly background: string;
	/** Cards, sheets, the tab bar: anything raised off the canvas. */
	readonly surface: string;
	/** Wells: meter tracks, inputs, inactive segments. Recedes rather than rises. */
	readonly surfaceSunken: string;
	/** The reading page. Distinct from `surface` so the reader can be quieter than the app. */
	readonly paper: string;
	readonly ink: string;
	readonly inkMuted: string;
	/**
	 * Labels, captions, quiet chrome. Still clears WCAG AA (4.5:1) on `background`,
	 * `surface` and `paper` — `themes.test.ts` fails if a repaint breaks that.
	 */
	readonly inkFaint: string;
	/** Hairlines and dividers. */
	readonly rule: string;
	/** The one chromatic voice: actions, active tabs, links, progress. */
	readonly accent: string;
	/** Text and icons drawn on top of `accent`. */
	readonly accentInk: string;
	/** A wash of the accent: selected rows, tags, the tint behind a primary icon. */
	readonly accentMuted: string;
	readonly marks: MarkColors;
	readonly grain: GrainSpec;
	/** Scrim behind a modal or sheet. Includes its own alpha. */
	readonly overlay: string;
};

/**
 * Sindoor terracotta is the accent in all four themes: the colour of kumkum and of an old
 * cloth binding. It shifts, though — the light themes take a deep, saturated version that
 * holds 4.5:1 against paper, the dark ones a lighter amber that would look washed out on
 * white but reads as warm lamplight on black.
 */
const THEMES: Readonly<Record<ThemeName, ThemeTokens>> = {
	white: {
		name: "white",
		isDark: false,
		background: "#FBFAF8",
		surface: "#FFFFFF",
		surfaceSunken: "#F1EEE8",
		paper: "#FFFFFF",
		ink: "#1C1917",
		inkMuted: "#57534E",
		inkFaint: "#706A65",
		rule: "#E4DFD6",
		accent: "#A65328",
		accentInk: "#FFFFFF",
		accentMuted: "#F6EAE1",
		marks: { saffron: "#F7E3B0", leaf: "#D6E7C8", sky: "#CFDDF0", rose: "#F3D2D6" },
		grain: { opacity: 0.055, blend: "multiply" },
		overlay: "rgba(28, 25, 23, 0.38)",
	},
	sepia: {
		name: "sepia",
		isDark: false,
		background: "#F3E9D8",
		surface: "#FBF3E5",
		surfaceSunken: "#EADFC9",
		paper: "#F8EFDD",
		ink: "#3B2F22",
		inkMuted: "#6B5A45",
		inkFaint: "#6F614D",
		rule: "#E0D1B6",
		accent: "#91461C",
		accentInk: "#FCF6EA",
		accentMuted: "#EBDAC0",
		marks: { saffron: "#EFD79E", leaf: "#CFE0B8", sky: "#C7D6E6", rose: "#EBC7C8" },
		grain: { opacity: 0.075, blend: "multiply" },
		overlay: "rgba(59, 47, 34, 0.4)",
	},
	dark: {
		name: "dark",
		isDark: true,
		background: "#16130F",
		surface: "#201C17",
		surfaceSunken: "#100E0B",
		paper: "#1A1713",
		ink: "#EDE6DA",
		inkMuted: "#B3A897",
		inkFaint: "#8D8477",
		rule: "#2E2922",
		accent: "#DE9A55",
		accentInk: "#1A1713",
		accentMuted: "#2E241A",
		marks: { saffron: "#4A3A18", leaf: "#27391F", sky: "#1F3145", rose: "#43242A" },
		grain: { opacity: 0.04, blend: "screen" },
		overlay: "rgba(0, 0, 0, 0.6)",
	},
	black: {
		name: "black",
		isDark: true,
		background: "#000000",
		surface: "#0C0B0A",
		surfaceSunken: "#000000",
		paper: "#000000",
		ink: "#E7E1D6",
		inkMuted: "#A39A8B",
		inkFaint: "#81796D",
		rule: "#23201A",
		accent: "#DE9A55",
		accentInk: "#000000",
		accentMuted: "#1B160F",
		marks: { saffron: "#3E3114", leaf: "#1F2E19", sky: "#19283A", rose: "#381D23" },
		// Grain on a true black OLED panel is noise on pixels that would otherwise be off:
		// it costs power and shows as sparkle in a dark room. The one theme without it.
		grain: { opacity: 0, blend: "screen" },
		overlay: "rgba(0, 0, 0, 0.72)",
	},
};

/** Every theme in the order the settings screen offers them: lightest to darkest. */
export const THEME_NAMES: readonly ThemeName[] = ["white", "sepia", "dark", "black"];

export function theme(name: ThemeName): ThemeTokens {
	return THEMES[name];
}

export function isThemeName(value: string): value is ThemeName {
	return (THEME_NAMES as readonly string[]).includes(value);
}

/**
 * What "follow the system" resolves to. The system reports only light or dark, so the two
 * middle themes are unreachable that way — Sepia and Black are deliberate choices a reader
 * makes, not states an OS can put them in.
 *
 * Typed loosely because platforms disagree about what "no preference" is: React Native
 * reports `"unspecified"`, the web `null`. Anything that isn't `"dark"` is daylight.
 */
export function themeForColorScheme(scheme: string | null | undefined): ThemeName {
	return scheme === "dark" ? "dark" : "white";
}

/** The mark colours in the order the highlight picker shows them. */
export const MARK_COLORS: readonly MarkColor[] = ["saffron", "leaf", "sky", "rose"];
