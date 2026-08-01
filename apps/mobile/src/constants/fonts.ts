import { fontFaceId } from "@granthalaya/core";

/**
 * The bundled font faces, keyed by the name they are registered under.
 *
 * Metro needs a literal path in every `require`, so the map cannot be generated from
 * `FONT_FACES` — but the *keys* can be, which is the half that matters: a face referenced
 * as `fontFaceId("body", 700)` in a component and registered under a hand-typed string
 * would fall back to the system font silently.
 *
 * Loaded at runtime rather than embedded by the `expo-font` config plugin. The plugin is
 * more efficient but registers faces under their internal family names, which differ per
 * platform and cannot express a weight on iOS; these keys are identical on iOS, Android and
 * web, and they work in Expo Go, which has no native build. Revisit at P0.4, when EAS builds
 * arrive and prebuild is part of the flow.
 */
export const FONT_ASSETS = {
	[fontFaceId("body", 400)]: require("@/assets/fonts/Rasa_400Regular.ttf"),
	[fontFaceId("body", 500)]: require("@/assets/fonts/Rasa_500Medium.ttf"),
	[fontFaceId("body", 700)]: require("@/assets/fonts/Rasa_700Bold.ttf"),
	[fontFaceId("bodyAlternate", 400)]: require("@/assets/fonts/NotoSerifGujarati_400Regular.ttf"),
	[fontFaceId("bodyAlternate", 700)]: require("@/assets/fonts/NotoSerifGujarati_700Bold.ttf"),
	[fontFaceId("ui", 400)]: require("@/assets/fonts/NotoSansGujarati_400Regular.ttf"),
	[fontFaceId("ui", 600)]: require("@/assets/fonts/NotoSansGujarati_600SemiBold.ttf"),
};
