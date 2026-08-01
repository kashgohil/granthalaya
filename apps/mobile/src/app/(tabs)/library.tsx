import { countVerses, pickLocalized, SPACING } from "@granthalaya/core";
import { FIXTURE_BOOKS } from "@granthalaya/core/fixtures";
import { StyleSheet, View } from "react-native";

import { BookCover } from "@/components/book-cover";
import { Screen } from "@/components/ui/screen";
import { Card } from "@/components/ui/surface";
import { AppText } from "@/components/ui/text";

/**
 * Library (P0.4 shell; P2.1 fills it in).
 *
 * The shelf is the product's front door, so it is the one screen worth building in the
 * shell rather than stubbing: it is where the generated covers have to prove they look like
 * books. The two shown are the format fixtures that ship inside `packages/core` — they are
 * really here, and they are honestly labelled as samples. Installing real books needs the
 * catalogue (P1.5).
 */
export default function LibraryScreen() {
	return (
		<Screen title="Library" eyebrow={`${FIXTURE_BOOKS.length} sample books`}>
			<View style={styles.shelf}>
				{FIXTURE_BOOKS.map((book) => {
					const verses = countVerses(book);
					return (
						<View key={book.id} style={styles.slot}>
							<BookCover
								book={book}
								width={COVER_WIDTH}
								footer={`${verses} ${verses === 1 ? "verse" : "verses"}`}
							/>
							<View style={styles.caption}>
								<AppText token="caption" script="gujr" numberOfLines={2}>
									{pickLocalized(book.title, ["gu"]) ?? book.id}
								</AppText>
								<AppText token="caption" color="inkFaint" numberOfLines={1}>
									{book.contentStatus}
								</AppText>
							</View>
						</View>
					);
				})}
			</View>

			<Card>
				<AppText token="body" color="inkMuted">
					These two ship inside the app as format samples — neither has been proofed against a
					printed edition. Real books arrive over the catalogue, and stay on the phone once
					installed.
				</AppText>
			</Card>
		</Screen>
	);
}

/** Two to a row on a phone, with the gutter the spacing ramp calls for. */
const COVER_WIDTH = 148;

const styles = StyleSheet.create({
	shelf: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: SPACING.xl,
	},
	slot: {
		gap: SPACING.sm,
		width: COVER_WIDTH,
	},
	caption: {
		gap: SPACING.xxs,
	},
});
