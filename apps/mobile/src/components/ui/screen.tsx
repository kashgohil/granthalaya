import { SPACING } from "@granthalaya/core";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PaperGrain } from "@/components/ui/paper-grain";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/theme/theme-provider";

/** Room for the native tab bar, which floats over the content on both platforms. */
const TAB_BAR_INSET = 64;
/** A phone-width column, so the shell already behaves on a tablet. */
const MAX_CONTENT_WIDTH = 560;

export type ScreenProps = {
	/** The screen's own title, set in the display face. Omitted for full-bleed screens. */
	title?: string;
	/** A small line above the title: a date, a count, a source. */
	eyebrow?: string;
	children: ReactNode;
	/** Off for screens that scroll their own list. */
	scroll?: boolean;
	/**
	 * Off when a native stack header already sits above the content — the header has
	 * consumed the notch, and insetting again leaves a band of empty paper.
	 */
	topEdge?: boolean;
};

/**
 * The frame every screen sits in: themed background, paper grain, safe areas, and a column
 * that stops growing at a comfortable measure.
 *
 * Having one of these is what makes the shell feel like one product rather than four screens
 * — padding, title placement and tab-bar clearance are decided once here instead of being
 * re-guessed per screen.
 */
export function Screen({ title, eyebrow, children, scroll = true, topEdge = true }: ScreenProps) {
	const tokens = useTheme();

	const content = (
		<View style={styles.column}>
			{title === undefined ? null : (
				<View style={styles.header}>
					{eyebrow === undefined ? null : (
						<AppText token="label" color="inkFaint" style={styles.eyebrow}>
							{eyebrow}
						</AppText>
					)}
					<AppText token="title">{title}</AppText>
				</View>
			)}
			{children}
		</View>
	);

	return (
		<View style={[styles.root, { backgroundColor: tokens.background }]}>
			<PaperGrain />
			<SafeAreaView
				style={styles.safeArea}
				edges={topEdge ? ["top", "left", "right"] : ["left", "right"]}
			>
				{scroll ? (
					<ScrollView
						contentContainerStyle={styles.scrollContent}
						showsVerticalScrollIndicator={false}
					>
						{content}
					</ScrollView>
				) : (
					<View style={styles.scrollContent}>{content}</View>
				)}
			</SafeAreaView>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
	},
	safeArea: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
		alignItems: "center",
		paddingHorizontal: SPACING.lg,
		paddingBottom: TAB_BAR_INSET + SPACING.xl,
	},
	column: {
		width: "100%",
		maxWidth: MAX_CONTENT_WIDTH,
		gap: SPACING.lg,
	},
	header: {
		paddingTop: SPACING.md,
		gap: SPACING.xxs,
	},
	eyebrow: {
		textTransform: "uppercase",
	},
});
