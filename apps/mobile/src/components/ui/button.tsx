import { MOTION, RADIUS, type Script, SPACING } from "@granthalaya/core";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/text";
import { useTheme } from "@/theme/theme-provider";

export type ButtonVariant =
	/** The one action a screen is asking for. Filled with the accent. */
	| "primary"
	/** Everything else that is still a button: outlined, ink-coloured. */
	| "secondary"
	/** A dismissal or a shortcut. No border, no fill. */
	| "quiet";

export type ButtonProps = {
	label: string;
	onPress?: () => void;
	variant?: ButtonVariant;
	disabled?: boolean;
	/** Fill the row it sits in. */
	block?: boolean;
};

/**
 * A button.
 *
 * The press feedback is a small scale-down rather than a colour flash: it is the gesture
 * every native control uses, it survives all four themes without a second set of colours,
 * and at `MOTION.tap` it is felt more than seen.
 */
export function Button({
	label,
	onPress,
	variant = "primary",
	disabled = false,
	block = false,
}: ButtonProps) {
	const tokens = useTheme();

	const surface = {
		primary: { backgroundColor: tokens.accent, borderColor: tokens.accent },
		secondary: { backgroundColor: "transparent", borderColor: tokens.rule },
		quiet: { backgroundColor: "transparent", borderColor: "transparent" },
	}[variant];

	const textColor = variant === "primary" ? "accentInk" : variant === "quiet" ? "accent" : "ink";

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ disabled }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.button,
				surface,
				variant === "quiet" ? styles.quiet : null,
				block ? styles.block : null,
				disabled ? styles.disabled : null,
				pressed ? styles.pressed : null,
			]}
		>
			<AppText token="body" color={textColor} weight={600}>
				{label}
			</AppText>
		</Pressable>
	);
}

/** A small status token: a count, a state, a mode. Never interactive on its own. */
export function Pill({
	label,
	tone = "accent",
	script = "latn",
}: {
	label: string;
	tone?: "accent" | "plain";
	/** Gujarati labels — a book title, a chapter name — need the script's own metrics. */
	script?: Script;
}) {
	const tokens = useTheme();
	return (
		<View
			style={[
				styles.pill,
				{ backgroundColor: tone === "accent" ? tokens.accentMuted : tokens.surfaceSunken },
			]}
		>
			<AppText
				token="caption"
				script={script}
				color={tone === "accent" ? "accent" : "inkMuted"}
				weight={600}
			>
				{label}
			</AppText>
		</View>
	);
}

/**
 * A progress meter. Used for reading progress and, from P5, for memory health — which is
 * why it is a filled bar and not a percentage: the number is the mechanism, the bar is the
 * feeling.
 */
export function Meter({ value }: { value: number }) {
	const tokens = useTheme();
	const clamped = Math.max(0, Math.min(1, value));
	return (
		<View style={[styles.meter, { backgroundColor: tokens.surfaceSunken }]}>
			<View
				style={[styles.meterFill, { backgroundColor: tokens.accent, width: `${clamped * 100}%` }]}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	button: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: SPACING.sm,
		paddingHorizontal: SPACING.xl,
		paddingVertical: SPACING.md,
		borderRadius: RADIUS.md,
		borderWidth: StyleSheet.hairlineWidth,
		// `transitionDuration` is honoured by the New Architecture's style transitions and
		// ignored elsewhere, so the scale below degrades to an instant change rather than
		// to nothing.
		transitionDuration: MOTION.tap,
	},
	quiet: {
		paddingHorizontal: SPACING.sm,
	},
	block: {
		alignSelf: "stretch",
	},
	pressed: {
		transform: [{ scale: 0.97 }],
	},
	disabled: {
		opacity: 0.45,
	},
	pill: {
		paddingHorizontal: SPACING.md,
		paddingVertical: SPACING.xs,
		borderRadius: RADIUS.pill,
		alignSelf: "flex-start",
	},
	meter: {
		height: 5,
		borderRadius: RADIUS.pill,
		overflow: "hidden",
	},
	meterFill: {
		height: "100%",
		borderRadius: RADIUS.pill,
	},
});
