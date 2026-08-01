import { RADIUS, SPACING, THEME_NAMES, theme as themeTokens } from "@granthalaya/core";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/text";
import { type ThemePreference, useThemeContext } from "@/theme/theme-provider";

const OPTIONS: readonly { preference: ThemePreference; label: string }[] = [
	{ preference: "system", label: "System" },
	...THEME_NAMES.map((name) => ({
		preference: name as ThemePreference,
		label: name[0]?.toUpperCase() + name.slice(1),
	})),
];

/**
 * The theme control: a swatch per theme, each one drawn in its own colours.
 *
 * A list of theme names would be a settings row; showing each theme's paper, its rule and
 * its accent makes the choice visible before it is made — and it means the control is
 * itself a specimen of the palette.
 *
 * `System` is offered first, and resolves to White by day and Dark at night. Sepia and
 * Black are not reachable that way: the OS has no way to express them.
 */
export function ThemePicker() {
	const { preference, setPreference, tokens } = useThemeContext();

	return (
		<View style={styles.row}>
			{OPTIONS.map((option) => {
				const selected = option.preference === preference;
				// `system` has no palette of its own; it is drawn in the theme it resolves to.
				const swatch = option.preference === "system" ? tokens : themeTokens(option.preference);

				return (
					<Pressable
						key={option.preference}
						accessibilityRole="radio"
						accessibilityState={{ selected }}
						accessibilityLabel={`${option.label} theme`}
						onPress={() => setPreference(option.preference)}
						style={styles.option}
					>
						<View
							style={[
								styles.swatch,
								{
									backgroundColor: swatch.paper,
									borderColor: selected ? tokens.accent : swatch.rule,
									borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
								},
							]}
						>
							<View style={[styles.swatchFoot, { backgroundColor: swatch.background }]}>
								<View style={[styles.swatchAccent, { backgroundColor: swatch.accent }]} />
							</View>
						</View>
						<AppText token="caption" color={selected ? "accent" : "inkFaint"} weight={600}>
							{option.label}
						</AppText>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		gap: SPACING.md,
		flexWrap: "wrap",
	},
	option: {
		alignItems: "center",
		gap: SPACING.xs,
	},
	swatch: {
		width: 46,
		height: 46,
		borderRadius: RADIUS.md,
		overflow: "hidden",
		justifyContent: "flex-end",
	},
	swatchFoot: {
		height: 16,
		justifyContent: "center",
		paddingLeft: 6,
	},
	swatchAccent: {
		width: 14,
		height: 3,
		borderRadius: 2,
	},
});
