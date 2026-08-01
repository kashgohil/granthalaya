import { fontFaceId } from "@granthalaya/core";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { FONT_ASSETS } from "@/constants/fonts";
import { ThemeProvider, useTheme, useThemeContext } from "@/theme/theme-provider";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
	const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

	// Nothing renders until the Gujarati faces are registered. The splash is still up, so
	// the first frame the reader sees is already set in Rasa, rather than flashing through a
	// system font that shapes conjuncts differently. A load failure falls through
	// deliberately: the app is more useful in a fallback font than stuck behind a splash.
	if (!fontsLoaded && fontError === null) {
		return null;
	}

	return (
		<ThemeProvider>
			<ThemedShell />
		</ThemeProvider>
	);
}

/**
 * The navigation skeleton (P0.4): a stack whose first screen is the tab bar.
 *
 * The stack exists so that screens which are not tabs — the rendering test today, the
 * reader and the book detail in P2 — can be pushed over the tabs instead of becoming tabs
 * themselves.
 */
function ThemedShell() {
	const tokens = useTheme();
	const { isReady } = useThemeContext();

	useEffect(() => {
		// Held until the stored theme has been read back, so nobody sees a white frame
		// before their Dark theme arrives.
		if (isReady) {
			SplashScreen.hideAsync();
		}
	}, [isReady]);

	if (!isReady) {
		return null;
	}

	return (
		<>
			{/* The status bar is chrome over the page: it follows the theme, not the system. */}
			<StatusBar style={tokens.isDark ? "light" : "dark"} />
			<Stack
				screenOptions={{
					headerShown: false,
					contentStyle: { backgroundColor: tokens.background },
					headerStyle: { backgroundColor: tokens.background },
					headerTintColor: tokens.accent,
					headerTitleStyle: { color: tokens.ink, fontFamily: fontFaceId("ui", 600) },
					headerShadowVisible: false,
				}}
			>
				<Stack.Screen name="(tabs)" />
				<Stack.Screen
					name="typography"
					options={{
						headerShown: true,
						title: "Rendering test",
						// A chevron alone: the group's route name would otherwise show as the
						// back title, and "(tabs)" is not a place a reader has ever been.
						headerBackButtonDisplayMode: "minimal",
					}}
				/>
			</Stack>
		</>
	);
}
