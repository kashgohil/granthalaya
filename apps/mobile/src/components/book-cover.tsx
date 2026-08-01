import {
	COVER_ASPECT_RATIO,
	COVER_SHADING,
	type CoverSubject,
	coverFor,
	fontFaceId,
	RADIUS,
	resolveTypeStyle,
	SPACING,
} from "@granthalaya/core";
import { Image, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/theme-provider";

export type BookCoverProps = {
	book: CoverSubject;
	/** Width in px; the height follows the 2:3 ratio. */
	width?: number;
	/** Hide the title and the foot line — for a thumbnail small enough that they'd be noise. */
	minimal?: boolean;
	/** A line under the title: the edition, a verse count. */
	footer?: string;
};

/**
 * A generated book cover (P0.4).
 *
 * There is no cover art for these editions and inventing some would be a small fiction in a
 * project whose first principle is fidelity — so the cover is derived: `packages/core` picks
 * a cloth colourway from the book's id, and the book's own title, set in Rasa, is the
 * artwork.
 *
 * The physical cues are the spine shading down the left edge, the double rule inset from the
 * trim, and the grain over the cloth. Together they are what stop a coloured rectangle from
 * reading as a coloured rectangle.
 */
export function BookCover({ book, width = 132, minimal = false, footer }: BookCoverProps) {
	const spec = coverFor(book);
	const { grain } = useTheme();
	const height = width / COVER_ASPECT_RATIO;

	// The title is set relative to the cover's width, so a shelf thumbnail and a book-detail
	// header are the same design at two sizes rather than two designs.
	const titleStyle = resolveTypeStyle("display", "gujr", { size: Math.round(width * 0.155) });
	const initialStyle = resolveTypeStyle("caption", "gujr", { size: Math.round(width * 0.1) });
	// Latin, because the foot line is an edition or a count rather than scripture.
	const footerStyle = resolveTypeStyle("caption", "latn", {
		size: Math.max(9, Math.round(width * 0.068)),
	});

	return (
		<View style={[styles.cover, { width, height, backgroundColor: spec.colourway.base }]}>
			{grain.opacity === 0 ? null : (
				<View style={[StyleSheet.absoluteFill, styles.overlay]}>
					<Image
						source={require("@/assets/textures/paper-grain.png")}
						resizeMode="repeat"
						// The cloth carries more grain than a screen surface does: it is standing
						// in for a woven binding, not for paper.
						style={styles.grain}
					/>
				</View>
			)}
			<View style={[styles.spine, { backgroundColor: shade(spec.colourway.base) }]} />
			<View style={[styles.frame, { borderColor: spec.colourway.ink }]} />

			<View style={styles.face}>
				{minimal || spec.initial === undefined ? null : (
					<Text
						style={{
							color: spec.colourway.ink,
							fontFamily: fontFaceId("body", 700),
							fontSize: initialStyle.fontSize,
							lineHeight: initialStyle.lineHeight,
							opacity: 0.72,
						}}
					>
						{spec.initial}
					</Text>
				)}
				<View style={styles.titleBlock}>
					<Text
						numberOfLines={minimal ? 2 : 3}
						style={{
							color: spec.colourway.ink,
							fontFamily: fontFaceId("body", 700),
							fontSize: titleStyle.fontSize,
							lineHeight: titleStyle.lineHeight,
						}}
					>
						{spec.title}
					</Text>
					{minimal || footer === undefined ? null : (
						<Text
							numberOfLines={1}
							style={{
								color: spec.colourway.ink,
								fontFamily: fontFaceId("ui", footerStyle.weight),
								fontSize: footerStyle.fontSize,
								lineHeight: footerStyle.lineHeight,
								opacity: 0.66,
							}}
						>
							{footer}
						</Text>
					)}
				</View>
			</View>
		</View>
	);
}

/**
 * The spine's shadow: the same cloth, darkened by the shared amount. React Native has no
 * gradients without a native dependency, so the cover's lighting here is the spine strip and
 * nothing else — the flat base is the cloth, which is why `cover.test.ts` checks the ink
 * against the lightest value the gradient can reach on the web.
 */
function shade(hex: string): string {
	const value = Number.parseInt(hex.slice(1), 16);
	const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((byte) =>
		Math.round(byte * COVER_SHADING.spine),
	);
	return `#${channels.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

const styles = StyleSheet.create({
	cover: {
		// Square at the spine, rounded at the fore-edge: how a closed book actually looks.
		borderTopLeftRadius: 3,
		borderBottomLeftRadius: 3,
		borderTopRightRadius: RADIUS.sm,
		borderBottomRightRadius: RADIUS.sm,
		overflow: "hidden",
		justifyContent: "flex-end",
	},
	overlay: {
		pointerEvents: "none",
	},
	grain: {
		width: "100%",
		height: "100%",
		opacity: 0.12,
	},
	spine: {
		pointerEvents: "none",
		position: "absolute",
		top: 0,
		bottom: 0,
		left: 0,
		width: 6,
		opacity: 0.85,
	},
	frame: {
		pointerEvents: "none",
		position: "absolute",
		top: SPACING.sm,
		right: SPACING.sm,
		bottom: SPACING.sm,
		left: SPACING.md,
		borderWidth: StyleSheet.hairlineWidth,
		opacity: 0.42,
		borderRadius: 2,
	},
	face: {
		flex: 1,
		justifyContent: "space-between",
		paddingTop: SPACING.lg,
		paddingBottom: SPACING.md,
		paddingLeft: SPACING.lg,
		paddingRight: SPACING.md,
	},
	titleBlock: {
		gap: SPACING.xxs,
	},
});
