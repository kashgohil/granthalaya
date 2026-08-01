import {
	isThemeName,
	type ThemeName,
	type ThemeTokens,
	theme,
	themeForColorScheme,
} from "@granthalaya/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";
import { useColorScheme } from "react-native";

/**
 * What the reader chose. `system` is a real option rather than the absence of one: it means
 * "follow the phone", which resolves to White by day and Dark at night. Sepia and Black are
 * unreachable that way by design — the OS has no way to express them (P0.4).
 */
export type ThemePreference = ThemeName | "system";

export type ThemeContextValue = {
	/** The resolved token set. Every colour in the app comes from here. */
	readonly tokens: ThemeTokens;
	/** What the reader picked, which is what the settings screen shows as selected. */
	readonly preference: ThemePreference;
	readonly setPreference: (preference: ThemePreference) => void;
	/**
	 * False until the stored preference has been read back. The splash stays up until then,
	 * so nobody sees a white frame before their Dark theme loads.
	 */
	readonly isReady: boolean;
};

const STORAGE_KEY = "granthalaya.theme";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
	const systemScheme = useColorScheme();
	const [preference, setPreferenceState] = useState<ThemePreference>("system");
	const [isReady, setIsReady] = useState(false);

	useEffect(() => {
		let cancelled = false;
		AsyncStorage.getItem(STORAGE_KEY)
			.then((stored) => {
				// An unrecognised value is treated as no value: a theme removed in a later
				// release must not leave anyone stuck on a name nothing maps to.
				if (!cancelled && stored !== null && (stored === "system" || isThemeName(stored))) {
					setPreferenceState(stored);
				}
			})
			.catch(() => {
				// Storage being unavailable is not worth blocking the app for — the reader
				// gets the system theme this session and can set it again.
			})
			.finally(() => {
				if (!cancelled) {
					setIsReady(true);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const setPreference = useCallback((next: ThemePreference) => {
		// Applied first, persisted second: the tap must feel instant, and a failed write is
		// a lost preference rather than a stuck screen.
		setPreferenceState(next);
		AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
	}, []);

	const name = preference === "system" ? themeForColorScheme(systemScheme) : preference;

	return (
		<ThemeContext value={{ tokens: theme(name), preference, setPreference, isReady }}>
			{children}
		</ThemeContext>
	);
}

export function useThemeContext(): ThemeContextValue {
	const value = use(ThemeContext);
	if (value === undefined) {
		throw new Error("useThemeContext must be used inside <ThemeProvider>");
	}
	return value;
}

/** The tokens, which is what almost every component wants. */
export function useTheme(): ThemeTokens {
	return useThemeContext().tokens;
}
