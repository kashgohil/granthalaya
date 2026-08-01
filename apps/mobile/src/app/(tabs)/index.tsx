import { bookVerses, pickLocalized, SPACING } from "@granthalaya/core";
import { gayatriMantra } from "@granthalaya/core/fixtures";
import { StyleSheet, View } from "react-native";

import { ScriptureText } from "@/components/scripture-text";
import { Pill } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { Card, SectionHeader } from "@/components/ui/surface";
import { AppText } from "@/components/ui/text";

/** Day of the year, so the verse below changes at midnight without any stored state. */
function dayOfYear(date: Date): number {
	const start = new Date(date.getFullYear(), 0, 0);
	return Math.floor((date.getTime() - start.getTime()) / 86_400_000);
}

/**
 * Today (P0.4 shell; P7.3 fills it in).
 *
 * One meaningful thing, in under five seconds — that is the whole brief for this screen.
 * Today that is a verse from the bundled sample book, rotating by date, because no real
 * book can be installed until the catalogue exists (P1.5). The curated daily selection, the
 * streak and the resurfaced highlights arrive with P7.
 */
export default function TodayScreen() {
	const now = new Date();
	const verses = bookVerses(gayatriMantra);
	const verse = verses[dayOfYear(now) % verses.length]?.unit;
	const layers = verse?.layers ?? {};
	const original = typeof layers.gu === "string" ? layers.gu : "";
	const transliteration = typeof layers.iso === "string" ? layers.iso : "";
	const translation = typeof layers.en === "string" ? layers.en : "";
	const bookTitle = pickLocalized(gayatriMantra.title, ["gu"]) ?? gayatriMantra.id;

	const today = now.toLocaleDateString(undefined, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});

	return (
		<Screen title="Today" eyebrow={today}>
			<Card>
				<SectionHeader title="Verse of the day" />
				<ScriptureText token="verseLarge" form="verse">
					{original}
				</ScriptureText>
				<AppText token="caption" color="inkFaint" style={styles.italic}>
					{transliteration}
				</AppText>
				<AppText token="body" color="inkMuted">
					{translation}
				</AppText>
				<View style={styles.footer}>
					<Pill label={bookTitle} script="gujr" />
					<AppText token="caption" color="inkFaint">
						Sample book · {gayatriMantra.source.edition}
					</AppText>
				</View>
			</Card>

			<Card>
				<SectionHeader title="Practice" />
				<AppText token="body" color="inkMuted">
					Nothing is due. Verses you mark for recital appear here each morning — the ones your
					memory is losing first.
				</AppText>
			</Card>
		</Screen>
	);
}

const styles = StyleSheet.create({
	italic: {
		fontStyle: "italic",
	},
	footer: {
		flexDirection: "row",
		alignItems: "center",
		gap: SPACING.sm,
		flexWrap: "wrap",
		marginTop: SPACING.xs,
	},
});
