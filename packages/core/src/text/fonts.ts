/**
 * The font stack, named once.
 *
 * Three surfaces have to agree on these strings: the sync script that downloads the files,
 * the Expo app that registers them with `expo-font`, and the CSS that declares them for the
 * studio and the promo site. A typo in any one of them is silent — the platform falls back
 * to a system font and Gujarati still renders, just not in the typeface the book was
 * designed around. Declaring the stack here turns that class of bug into an import error.
 *
 * All three families are SIL OFL 1.1, so they can be embedded and redistributed.
 */

/** What a face is for, which is what a component asks for. */
export type FontRole =
	/** Continuous reading: the verse stack, and everything inside the page. */
	| "body"
	/** The alternate reading face, offered in the P2.3 font picker and used as the web fallback. */
	| "bodyAlternate"
	/** Chrome: navigation, labels, settings, anything that is not the text itself. */
	| "ui";

export type FontWeight = 400 | 500 | 600 | 700;

export type FontFamilySpec = {
	/** The family name as the foundry ships it, and as CSS must spell it. */
	readonly family: string;
	readonly weights: readonly FontWeight[];
	readonly license: "OFL-1.1";
};

/**
 * Rasa is drawn for continuous Gujarati reading — the reason it is the body face rather
 * than Noto Serif Gujarati, which is drawn for coverage. Noto Serif Gujarati stays as the
 * alternate: it is the web fallback while Rasa loads, and the second option in the reading
 * settings for anyone who finds Rasa's contrast too high.
 *
 * Noto Sans Gujarati carries the chrome. Mukta Vaani is its documented substitute — a
 * legitimate second choice for UI, left unbundled because shipping two UI faces costs
 * ~350 KB on device to serve a preference nobody has expressed yet.
 */
const FONT_STACK: Readonly<Record<FontRole, FontFamilySpec>> = {
	body: { family: "Rasa", weights: [400, 500, 700], license: "OFL-1.1" },
	bodyAlternate: { family: "Noto Serif Gujarati", weights: [400, 700], license: "OFL-1.1" },
	ui: { family: "Noto Sans Gujarati", weights: [400, 600], license: "OFL-1.1" },
};

const WEIGHT_NAMES: Readonly<Record<FontWeight, string>> = {
	400: "Regular",
	500: "Medium",
	600: "SemiBold",
	700: "Bold",
};

/** One face: one family at one weight. */
export type FontFace = {
	readonly role: FontRole;
	readonly family: string;
	readonly weight: FontWeight;
	/**
	 * The name this face is registered and referenced by on React Native, and the stem of
	 * the file it is downloaded into. React Native cannot synthesise a weight from a family,
	 * so every weight is its own family name there — the convention `@expo-google-fonts`
	 * uses, kept identical here.
	 */
	readonly id: string;
};

function face(role: FontRole, family: string, weight: FontWeight): FontFace {
	return {
		role,
		family,
		weight,
		id: `${family.replaceAll(" ", "")}_${weight}${WEIGHT_NAMES[weight]}`,
	};
}

export function fontFamily(role: FontRole): FontFamilySpec {
	return FONT_STACK[role];
}

/** Every face the apps bundle, in a stable order. The sync script downloads exactly these. */
export const FONT_FACES: readonly FontFace[] = Object.entries(FONT_STACK).flatMap(([role, spec]) =>
	spec.weights.map((weight) => face(role as FontRole, spec.family, weight)),
);

/** The React Native family name for a role and weight, e.g. `Rasa_400Regular`. */
export function fontFaceId(role: FontRole, weight: FontWeight = 400): string {
	const spec = FONT_STACK[role];
	const match = spec.weights.includes(weight) ? weight : 400;
	return face(role, spec.family, match).id;
}

/**
 * The CSS `font-family` list for a role, most-preferred first, ending in a generic. Returned
 * as an array so it stays platform-neutral: the web joins it, and anything else reads the
 * first entry.
 */
export function fontFamilyStack(role: FontRole): readonly string[] {
	switch (role) {
		case "body":
			return [FONT_STACK.body.family, FONT_STACK.bodyAlternate.family, "Georgia", "serif"];
		case "bodyAlternate":
			return [FONT_STACK.bodyAlternate.family, FONT_STACK.body.family, "Georgia", "serif"];
		case "ui":
			return [FONT_STACK.ui.family, "Mukta Vaani", "system-ui", "sans-serif"];
	}
}
