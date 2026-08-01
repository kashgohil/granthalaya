import { SPACING } from "@granthalaya/core";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/text";

/**
 * The state most of this shell is in, and one the finished app will still show often — a
 * library before the first install, a review queue that is genuinely clear.
 *
 * It is a first-class component rather than an afterthought because an empty screen is
 * where a reading app either explains itself or feels broken. The rule here: say what will
 * appear, not that something is missing.
 */
export function EmptyState({ title, body }: { title: string; body: string }) {
	return (
		<View style={styles.empty}>
			<AppText token="heading" color="inkMuted" style={styles.centered}>
				{title}
			</AppText>
			<AppText token="body" color="inkFaint" style={styles.centered}>
				{body}
			</AppText>
		</View>
	);
}

const styles = StyleSheet.create({
	empty: {
		alignItems: "center",
		gap: SPACING.xs,
		paddingVertical: SPACING.xxl,
		paddingHorizontal: SPACING.lg,
	},
	centered: {
		textAlign: "center",
	},
});
