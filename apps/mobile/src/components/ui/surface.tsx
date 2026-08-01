import { RADIUS, SPACING } from "@granthalaya/core";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewProps } from "react-native";
import { PaperGrain } from "@/components/ui/paper-grain";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/theme/theme-provider";

/**
 * A raised surface: cards, sheets, grouped rows.
 *
 * Elevation here is a hairline and a very soft shadow, not a drop shadow — the design
 * language is printed matter, and paper does not float. The grain runs over the card as it
 * runs over the page, so a card reads as a piece of the same stock rather than as a panel.
 */
export function Card({
	children,
	style,
	padded = true,
	grain = true,
	...rest
}: ViewProps & { padded?: boolean; grain?: boolean }) {
	const tokens = useTheme();

	return (
		<View
			style={[
				styles.card,
				{
					backgroundColor: tokens.surface,
					borderColor: tokens.rule,
					// The darkest surface in the theme, so the shadow stays warm on paper and
					// disappears into the ground at night. Never a literal black.
					shadowColor: tokens.isDark ? tokens.surfaceSunken : tokens.ink,
					shadowOpacity: tokens.isDark ? 0.4 : 0.06,
				},
				padded ? styles.padded : null,
				style,
			]}
			{...rest}
		>
			{grain ? <PaperGrain radius={RADIUS.lg} /> : null}
			{children}
		</View>
	);
}

/** A grouped list: rows separated by hairlines, the whole group on one surface. */
export function List({ children, style, ...rest }: ViewProps) {
	const tokens = useTheme();
	return (
		<View
			style={[styles.list, { backgroundColor: tokens.surface, borderColor: tokens.rule }, style]}
			{...rest}
		>
			{children}
		</View>
	);
}

export type ListRowProps = {
	title: string;
	subtitle?: string;
	/** Gujarati titles take the script's metrics; English chrome does not. */
	titleScript?: "gujr" | "latn";
	/** Rendered on the right: a value, a pill, a chevron. */
	accessory?: ReactNode;
	leading?: ReactNode;
	onPress?: () => void;
	last?: boolean;
};

/**
 * One row of a `List`. Pressable rows dim on touch rather than scaling — a row is part of a
 * surface, and a surface that shrinks under a finger reads as a button.
 */
export function ListRow({
	title,
	subtitle,
	titleScript = "latn",
	accessory,
	leading,
	onPress,
	last = false,
}: ListRowProps) {
	const tokens = useTheme();

	const content = (
		<View style={styles.rowInner}>
			{leading}
			<View style={styles.rowText}>
				<AppText token="body" script={titleScript}>
					{title}
				</AppText>
				{subtitle === undefined ? null : (
					<AppText token="caption" color="inkFaint">
						{subtitle}
					</AppText>
				)}
			</View>
			{accessory}
		</View>
	);

	return (
		<View
			style={
				last
					? null
					: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.rule }
			}
		>
			{onPress === undefined ? (
				content
			) : (
				<Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : null)}>
					{content}
				</Pressable>
			)}
		</View>
	);
}

/** A labelled break between groups of content. */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
	return (
		<View style={styles.sectionHeader}>
			<AppText token="label" color="inkFaint" style={styles.uppercase}>
				{title}
			</AppText>
			{action}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: RADIUS.lg,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
		shadowOffset: { width: 0, height: 2 },
		shadowRadius: 10,
		elevation: 1,
	},
	padded: {
		padding: SPACING.lg,
		gap: SPACING.sm,
	},
	list: {
		borderRadius: RADIUS.lg,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	rowInner: {
		flexDirection: "row",
		alignItems: "center",
		gap: SPACING.md,
		paddingHorizontal: SPACING.lg,
		paddingVertical: SPACING.md,
		minHeight: 52,
	},
	rowText: {
		flex: 1,
		gap: SPACING.xxs,
	},
	pressed: {
		opacity: 0.6,
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingBottom: SPACING.xs,
	},
	uppercase: {
		textTransform: "uppercase",
	},
});
