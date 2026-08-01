import {
	aksharaSpans,
	fontFaceId,
	lineHeightBand,
	MARK_COLORS,
	resolveTypeStyle,
	SPACING,
	TYPE_SCALE,
} from "@granthalaya/core";
import { gayatriMantra, TYPE_SPECIMENS } from "@granthalaya/core/fixtures";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ScriptureText } from "@/components/scripture-text";
import { Button, Meter, Pill } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { Card } from "@/components/ui/surface";
import { AppText } from "@/components/ui/text";

/**
 * Latin's leading, in absolute pixels, so it survives the clamp `resolveTypeStyle` applies.
 * Bypassing the rule is the point: the screen has to show what the rule is buying.
 */
const LATIN_LEADING = {
	lineHeight: Math.round(resolveTypeStyle("verse", "gujr").fontSize * 1.4),
};

/**
 * The Gujarati rendering test screen (P0.3).
 *
 * Its whole job is to be looked at on a real iOS and a real Android device: no unit test can
 * tell you that a matra collides with the line above, that a conjunct has fallen apart into
 * a consonant and a visible halant, or that a danda has been orphaned onto its own line.
 * Each section states what a correct rendering looks like, so the check is the same every
 * time and on every device.
 *
 * The specimens come from `@granthalaya/core/fixtures`, which the web page renders too — a
 * difference between the two platforms is then a difference in rendering, not in content.
 *
 * It lives outside the tabs and is opened from Settings: it is QA, not product, but it still
 * has to be reachable on a device, where there is no dev menu to route from.
 */
export default function TypographyScreen() {
	const [cramped, setCramped] = useState(false);
	const [pressed, setPressed] = useState(0);
	const band = lineHeightBand("gujr");

	return (
		<Screen topEdge={false}>
			<AppText token="body" color="inkMuted">
				Check this screen on a real iOS and a real Android device. Simulators use the host's text
				engine and will hide platform shaping bugs.
			</AppText>

			<Section
				title="Leading"
				check={`Tap the verse to force Latin's 1.4× leading. The marks above one line should meet the conjuncts hanging below the one before it — that collision is what the ${band.min}–${band.max}× band exists to prevent.`}
			>
				<Pressable onPress={() => setCramped((value) => !value)}>
					<ScriptureText form="verse" style={cramped ? LATIN_LEADING : null}>
						{"કૃષ્ણ હૃદય મુદ્રા દૃષ્ટિ\nશ્રી ઊંચે કૈંક ઔષધિ ઈંટ"}
					</ScriptureText>
				</Pressable>
				<AppText token="caption" color="inkFaint">
					{cramped
						? "1.4× — Latin leading, forced past the rule"
						: `${TYPE_SCALE.verse.lineHeight}× — the Gujarati default`}
				</AppText>
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
				title="Highlights"
				check="Background washes, never underlines: an underline is drawn exactly where the below-base matras live. All four must keep the text readable."
			>
				{MARK_COLORS.map((mark) => (
					<ScriptureText key={mark} highlight={mark} form="verse">
						ધિયો યો નઃ પ્રચોદયાત્ ॥
					</ScriptureText>
				))}
			</Section>

			<Section
				title="Akshara segmentation"
				check="Each box below is one akshara. No box may hold a bare consonant with a visible halant that belongs to the next one — that is what a wrongly placed cut looks like."
			>
				{["પ્રચોદયાત્", "ભૂર્ભુવઃ", "દૃષ્ટિ"].map((word) => (
					<View key={word} style={styles.aksharaRow}>
						{/* Keyed by offset, not by text: an akshara repeats within a word. */}
						{aksharaSpans(word).map((span) => (
							<Card key={span.start} grain={false} padded={false} style={styles.aksharaChip}>
								<ScriptureText size={16}>{span.text}</ScriptureText>
							</Card>
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
						<AppText token="caption" color="inkFaint">
							{fontFaceId(role, weight)}
						</AppText>
						<ScriptureText face={role} weight={weight} size={16}>
							ગ્રંથાલય · Granthalaya
						</ScriptureText>
					</View>
				))}
			</Section>

			{/*
			 * The base kit, on the device, in whichever theme is selected. It is here rather
			 * than on a product screen because the shell has nothing yet for a button to do
			 * — and a component that has never been drawn on a phone is a component nobody
			 * has checked.
			 */}
			<Section
				title="Base kit"
				check="Buttons, pills and a meter in the current theme. Switch themes in Settings and come back: the press state, the wash behind a pill and the meter track all have to hold in all four."
			>
				<View style={styles.kitRow}>
					<Button label="Install book" onPress={() => setPressed((count) => count + 1)} />
					<Button label="Preview" variant="secondary" onPress={() => setPressed((c) => c + 1)} />
					<Button label="Not now" variant="quiet" onPress={() => setPressed((c) => c + 1)} />
				</View>
				<View style={styles.kitRow}>
					<Pill label={`${pressed} presses`} />
					<Pill label="draft" tone="plain" />
					<Pill label="ગાયત્રી મંત્ર" script="gujr" />
				</View>
				<Meter value={0.62} />
			</Section>

			<Section
				title="Metrics"
				check="What core resolved for the reading size, for comparison against the web page."
			>
				<AppText token="caption" color="inkMuted">
					{JSON.stringify(resolveTypeStyle("verse", "gujr"))}
				</AppText>
			</Section>
		</Screen>
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
		<Card>
			<AppText token="heading">{title}</AppText>
			<AppText token="caption" color="inkFaint">
				{check}
			</AppText>
			<View style={styles.samples}>{children}</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	samples: {
		gap: SPACING.sm,
		marginTop: SPACING.xs,
	},
	aksharaRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: SPACING.xs,
	},
	aksharaChip: {
		paddingHorizontal: SPACING.sm,
		paddingVertical: SPACING.xxs,
	},
	kitRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		gap: SPACING.sm,
	},
	faceRow: {
		gap: SPACING.xxs,
	},
});
