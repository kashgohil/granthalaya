import { aksharaSpans, fontFaceId, lineHeightBand, resolveTextStyle } from "@granthalaya/core";
import { gayatriMantra, TYPE_SPECIMENS } from "@granthalaya/core/fixtures";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScriptureText } from "@/components/scripture-text";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** The size the reading surface will start from. Every sample on this screen uses it. */
const BODY_SIZE = 18;

/**
 * Latin's leading, in absolute pixels, so it survives the clamp `resolveTextStyle` applies.
 * Bypassing the rule is the point: the screen has to show what the rule is buying.
 */
const LATIN_LEADING = {
	lineHeight: Math.round(
		resolveTextStyle({ script: "gujr", baseFontSize: BODY_SIZE }).fontSize * 1.4,
	),
};

/**
 * The Gujarati rendering test screen (P0.3).
 *
 * Its whole job is to be looked at on a real iOS and a real Android device: no unit test can
 * tell you that a matra collides with the line above, that a conjunct has fallen apart into a
 * consonant and a visible halant, or that a danda has been orphaned onto its own line. Each
 * section states what a correct rendering looks like, so the check is the same every time and
 * on every device.
 *
 * The specimens come from `@granthalaya/core/fixtures`, which the web page renders too — a
 * difference between the two platforms is then a difference in rendering, not in content.
 */
export default function TypographyScreen() {
	const [cramped, setCramped] = useState(false);
	const theme = useTheme();

	return (
		<ThemedView style={styles.container}>
			<SafeAreaView style={styles.safeArea} edges={["top"]}>
				<ScrollView contentContainerStyle={styles.content}>
					<ThemedText type="subtitle">Gujarati rendering</ThemedText>
					<ThemedText type="small" themeColor="textSecondary">
						Check this screen on a real iOS and a real Android device. Simulators use the host's
						text engine and will hide platform shaping bugs.
					</ThemedText>

					<Section
						title="Leading"
						check={`Tap the verse to force Latin's 1.4× leading. The marks above one line should meet the conjuncts hanging below the one before it — that collision is what the ${lineHeightBand("gujr").min}–${lineHeightBand("gujr").max}× band exists to prevent.`}
					>
						<Pressable onPress={() => setCramped((value) => !value)}>
							<ScriptureText form="verse" size={BODY_SIZE} style={cramped ? LATIN_LEADING : null}>
								{"કૃષ્ણ હૃદય મુદ્રા દૃષ્ટિ\nશ્રી ઊંચે કૈંક ઔષધિ ઈંટ"}
							</ScriptureText>
						</Pressable>
						<ThemedText type="small" themeColor="textSecondary">
							{cramped
								? "1.4× — Latin leading, forced past the rule"
								: "1.8× — the Gujarati default"}
						</ThemedText>
					</Section>

					{TYPE_SPECIMENS.map((specimen) => (
						<Section key={specimen.id} title={specimen.title} check={specimen.check}>
							{specimen.samples.map((sample) => (
								<ScriptureText key={sample} script={specimen.script} form="verse">
									{sample}
								</ScriptureText>
							))}
						</Section>
					))}

					<Section
						title="Highlight"
						check="A background wash, never an underline: an underline is drawn exactly where the below-base matras live."
					>
						<ScriptureText highlight={theme.backgroundSelected} form="verse">
							ધિયો યો નઃ પ્રચોદયાત્ ॥
						</ScriptureText>
					</Section>

					<Section
						title="Akshara segmentation"
						check="Each box below is one akshara. No box may hold a bare consonant with a visible halant that belongs to the next one — that is what a wrongly placed cut looks like."
					>
						{["પ્રચોદયાત્", "ભૂર્ભુવઃ", "દૃષ્ટિ"].map((word) => (
							<View key={word} style={styles.aksharaRow}>
								{/* Keyed by offset, not by text: an akshara repeats within a word. */}
								{aksharaSpans(word).map((span) => (
									<ThemedView key={span.start} type="backgroundElement" style={styles.aksharaChip}>
										<ScriptureText size={16}>{span.text}</ScriptureText>
									</ThemedView>
								))}
							</View>
						))}
					</Section>

					<Section
						title="A real book"
						check={`The ${gayatriMantra.id} fixture, rendered through the same rules the reader will use.`}
					>
						{gayatriMantra.structure.map((unit) =>
							unit.kind === "verse" && typeof unit.layers.gu === "string" ? (
								<ScriptureText key={unit.id} form={unit.form}>
									{unit.layers.gu}
								</ScriptureText>
							) : null,
						)}
					</Section>

					<Section
						title="Faces"
						check="Three families, seven weights. A face that failed to load falls back to the system font — it will look obviously different from its neighbours."
					>
						{(
							[
								["body", 400],
								["body", 500],
								["body", 700],
								["bodyAlternate", 400],
								["bodyAlternate", 700],
								["ui", 400],
								["ui", 600],
							] as const
						).map(([role, weight]) => (
							<View key={`${role}-${weight}`} style={styles.faceRow}>
								<ThemedText type="small" themeColor="textSecondary" style={styles.faceLabel}>
									{fontFaceId(role, weight)}
								</ThemedText>
								<ScriptureText face={role} weight={weight} size={16}>
									ગ્રંથાલય · Granthalaya
								</ScriptureText>
							</View>
						))}
					</Section>

					<Section
						title="Metrics"
						check="What core resolved for this screen's body size, for comparison against the web page."
					>
						<ThemedText type="code">
							{JSON.stringify(resolveTextStyle({ script: "gujr", baseFontSize: BODY_SIZE }))}
						</ThemedText>
					</Section>
				</ScrollView>
			</SafeAreaView>
		</ThemedView>
	);
}

function Section({
	title,
	check,
	children,
}: {
	title: string;
	check: string;
	children: React.ReactNode;
}) {
	return (
		<ThemedView type="backgroundElement" style={styles.section}>
			<ThemedText type="smallBold">{title}</ThemedText>
			<ThemedText type="small" themeColor="textSecondary">
				{check}
			</ThemedText>
			<View style={styles.samples}>{children}</View>
		</ThemedView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		flexDirection: "row",
		justifyContent: "center",
	},
	safeArea: {
		flex: 1,
		maxWidth: MaxContentWidth,
	},
	content: {
		padding: Spacing.three,
		gap: Spacing.three,
		paddingBottom: BottomTabInset + Spacing.five,
	},
	section: {
		gap: Spacing.two,
		padding: Spacing.three,
		borderRadius: Spacing.three,
	},
	samples: {
		gap: Spacing.two,
		marginTop: Spacing.one,
	},
	aksharaRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: Spacing.one,
	},
	aksharaChip: {
		paddingHorizontal: Spacing.two,
		paddingVertical: Spacing.half,
		borderRadius: Spacing.two,
	},
	faceRow: {
		gap: Spacing.half,
	},
	faceLabel: {
		opacity: 0.7,
	},
});
