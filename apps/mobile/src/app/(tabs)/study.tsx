import { SPACING } from "@granthalaya/core";
import { StyleSheet, View } from "react-native";
import { EmptyState } from "@/components/ui/empty-state";
import { Screen } from "@/components/ui/screen";
import { Card, SectionHeader } from "@/components/ui/surface";
import { AppText } from "@/components/ui/text";

/** The ladder from P5.2, listed here so the shell states what this tab is going to be. */
const PRACTICE_MODES = [
	["Follow along", "Read or listen with the audio, the whole verse visible."],
	["Progressive hiding", "Each tap hides more words; recite and reveal to check."],
	["First letters", "The verse as its first aksharas — never a split conjunct."],
	["Fill the blanks", "Words removed at random, a fresh variant each time."],
	["Word bank", "Scrambled word chips, put back in order."],
	["Full recall", "Nothing shown. Graded against your own recording."],
] as const;

/**
 * Study (P0.4 shell; P4–P6 fill it in).
 *
 * Empty on purpose and empty honestly: there is nothing to review until verses can be
 * marked for recital (P3.2) and the scheduler exists (P5.1). What the screen can do today
 * is say what will be here.
 */
export default function StudyScreen() {
	return (
		<Screen title="Study">
			<Card>
				<EmptyState
					title="Nothing due"
					body="Mark a verse for recital and it will appear here — the ones your memory is losing first."
				/>
			</Card>

			<View style={styles.section}>
				<SectionHeader title="Practice modes" />
				<Card>
					{PRACTICE_MODES.map(([name, description]) => (
						<View key={name} style={styles.mode}>
							<AppText token="body" weight={600}>
								{name}
							</AppText>
							<AppText token="caption" color="inkFaint">
								{description}
							</AppText>
						</View>
					))}
				</Card>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	section: {
		gap: SPACING.sm,
	},
	mode: {
		gap: SPACING.xxs,
		paddingVertical: SPACING.xs,
	},
});
