import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import AppTabs from "@/components/app-tabs";
import { FONT_ASSETS } from "@/constants/fonts";

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
	const colorScheme = useColorScheme();
	const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

	// Nothing renders until the Gujarati faces are registered. The splash is still up — it is
	// the overlay below that hides it — so the first frame the reader sees is already set in
	// Rasa, rather than flashing through a system font that shapes conjuncts differently.
	// A load failure falls through deliberately: the app is more useful in a fallback font
	// than stuck behind a splash screen.
	if (!fontsLoaded && fontError === null) {
		return null;
	}

	return (
		<ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
			<AnimatedSplashOverlay />
			<AppTabs />
		</ThemeProvider>
	);
}
