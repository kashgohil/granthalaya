import { CORE_VERSION, fontFamily, SPACING, TYPE_SCALE } from "@granthalaya/core";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { ScriptureText } from "@/components/scripture-text";
import { Pill } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { Card, List, ListRow, SectionHeader } from "@/components/ui/surface";
import { AppText } from "@/components/ui/text";
import { ThemePicker } from "@/components/ui/theme-picker";

/**
 * Settings (P0.4 shell).
 *
 * The theme control is real and persists; the reading controls it will sit beside are P2.3.
 * The rendering test is reachable from here rather than from a tab, because it is a QA
 * surface that still has to be openable on a real device where there is no dev menu.
 */
export default function SettingsScreen() {
	const router = useRouter();
	const appVersion = Constants.expoConfig?.version ?? "dev";

	return (
		<Screen title="Settings">
			<View style={styles.section}>
				<SectionHeader title="Appearance" />
				<Card>
					<ThemePicker />
					<AppText token="caption" color="inkFaint">
						System follows your phone: White by day, Dark at night. Sepia and Black are choices the
						phone cannot make for you.
					</AppText>
				</Card>
			</View>

			<View style={styles.section}>
				<SectionHeader title="Reading" />
				<Card>
					<ScriptureText token="verse" form="verse">
						ધિયો યો નઃ પ્રચોદયાત્ ॥
					</ScriptureText>
					<View style={styles.metaRow}>
						<Pill label={`${TYPE_SCALE.verse.size} pt`} tone="plain" />
						<Pill label={fontFamily("body").family} tone="plain" />
					</View>
					<AppText token="caption" color="inkFaint">
						Size, spacing and font choice become adjustable with the reading settings sheet.
					</AppText>
				</Card>
			</View>

			<View style={styles.section}>
				<SectionHeader title="About" />
				<List>
					<ListRow
						title="Rendering test"
						subtitle="Gujarati specimens: conjuncts, matras, danda"
						accessory={<Pill label="dev" tone="plain" />}
						onPress={() => router.push("/typography")}
					/>
					<ListRow title="Version" subtitle={`app ${appVersion} · core ${CORE_VERSION}`} last />
				</List>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	section: {
		gap: SPACING.sm,
	},
	metaRow: {
		flexDirection: "row",
		gap: SPACING.sm,
		flexWrap: "wrap",
	},
});
