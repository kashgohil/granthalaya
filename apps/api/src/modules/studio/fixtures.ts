/**
 * A draft package on disk, for tests.
 *
 * Written out as real files rather than mocked, because the thing worth testing is the seam:
 * `assemble` and the studio are different programs that agree only through `content/`, and a
 * fixture that skipped the filesystem would prove the studio agrees with itself.
 *
 * The shape mirrors the first real book — two sections, a passage that runs across a page break,
 * one that printed no number, a footnote, and a set-aside English description of a decorative
 * glyph — because those are the cases the pipeline actually produced.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Book } from "@granthalaya/core";
import { hashVerse } from "@granthalaya/core";

const LAYER = "gu";

function verse(id: string, number: string | undefined, text: string) {
	const layers = { [LAYER]: text };
	return {
		kind: "verse" as const,
		id,
		...(number === undefined ? {} : { number }),
		form: "prose" as const,
		layers,
		hash: hashVerse(layers),
	};
}

export const FIXTURE_BOOK_ID = "test-vato";

export function draftBook(overrides: { texts?: Record<string, string> } = {}): Book {
	const text = (id: string, fallback: string) => overrides.texts?.[id] ?? fallback;
	return {
		formatVersion: 1,
		id: FIXTURE_BOOK_ID,
		title: { en: "test vato" },
		language: "gu",
		script: "gujr",
		contentVersion: "0.1.0",
		contentStatus: "draft",
		source: { edition: "unknown" },
		license: { id: "unknown" },
		layers: [
			{ id: LAYER, kind: "original", language: "gu", script: "gujr", label: { en: "Original" } },
		],
		primaryLayer: LAYER,
		structure: [
			{
				kind: "section",
				id: "section-1",
				title: { gu: "પુરુષોત્તમપણાની વાતો" },
				children: [
					verse("v61", "૬૧", text("v61", "એક વાર ગોપાળાનંદ સ્વામી બોલ્યા જે")),
					verse("v62", "૬૨", text("v62", "પછી સ્વામીએ કહ્યું જે ભગવાનનું સ્વરૂપ")),
				],
			},
			{
				kind: "section",
				id: "section-2",
				title: { gu: "મુક્તના ભેદની વાતો" },
				children: [
					verse("v63", "૬૩", text("v63", "મુક્તના ભેદ કહ્યા છે")),
					verse("p86-6", undefined, text("p86-6", "અને વિખ્યાતિ કરવી તે")),
				],
			},
		],
	};
}

export function draftReport(book: Book) {
	const block = (page: number, printedPage: number, blockId: string, tag = "paragraph") => ({
		page,
		printedPage,
		blockId,
		tag,
		bbox: [130, 400, 1284, 900] as [number, number, number, number],
	});

	const assembled = (
		ref: string,
		number: string | null,
		confidence: number,
		flags: string[],
		blocks: ReturnType<typeof block>[],
	) => ({
		ref,
		number,
		confidence,
		flags,
		chars: 40,
		pages: [...new Set(blocks.map((b) => b.page))],
		printedPages: [...new Set(blocks.map((b) => b.printedPage))],
		blocks,
		repairs: ref.endsWith("#p86-6")
			? [{ kind: "footnote-marker", before: "૪", after: "", context: "વિખ્યાતિ૪ કરવી ત" }]
			: [],
		footnoteMarkers: ref.endsWith("#p86-6") ? [4] : [],
		orthography: { ok: true, violations: 0, rate: 0 },
	});

	return {
		book: book.id,
		source: {
			file: "Test Vato.pdf",
			sha256: "f".repeat(64),
			engine: "sarvam-vision-v1",
			bookPageCount: 4,
			pagesAssembled: [1, 2, 3, 4],
		},
		numbering: { offset: 27, pagesWithPrintedNumber: 3, disagreements: [] },
		sequence: {
			first: 61,
			last: 63,
			numbered: 3,
			unnumbered: 1,
			missing: [],
			duplicates: [],
			outOfOrder: [],
		},
		counts: { sections: 2, verses: 4, numbered: 3, notes: 1, setAside: 2 },
		needsHuman: [
			"source.edition — which printed edition this is",
			"license.id — whether we have the rights to publish it",
			"title.gu — the book's title as it is printed",
		],
		runningHeads: [{ text: "ગોપાળાનંદસ્વામીની વાતો", pages: 4 }],
		verses: [
			assembled(`${book.id}/section-2#p86-6`, null, 0.65, ["no-number"], [block(4, 31, "p1-b3")]),
			// One passage that ran across a page break — the join the OCR could not see itself.
			assembled(
				`${book.id}/section-1#v62`,
				"૬૨",
				0.9,
				["spans-pages"],
				[block(1, 28, "p1-b2"), block(2, 29, "p1-b1")],
			),
			assembled(`${book.id}/section-1#v61`, "૬૧", 1, [], [block(1, 28, "p1-b1")]),
			assembled(`${book.id}/section-2#v63`, "૬૩", 1, [], [block(3, 30, "p1-b2")]),
		],
		notes: [
			{
				page: 4,
				printedPage: 31,
				text: "૪. મૂળમાયા",
				block: block(4, 31, "p1-b5", "footer"),
			},
		],
		setAside: [
			{ ...block(1, 28, "p1-b0", "header"), text: "INDEX\n\n૨૮ ગોપાળાનંદસ્વામીની વાતો" },
			{
				...block(2, 29, "p1-b4"),
				// The hazard that justifies the script filter: asked to read a decorative glyph,
				// the model wrote an English description of it and tagged it `paragraph`.
				text: "This image contains no text. It displays three identical black heart symbols.",
			},
		],
	};
}

/** A 1×1 greyscale PNG — enough for the page-image route to have real bytes to serve. */
const PIXEL_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP4DwABAQEAWk1v8QAAAABJRU5ErkJggg==",
	"base64",
);

export type DraftFixture = {
	readonly contentDir: string;
	readonly bookDir: string;
	readonly cleanup: () => Promise<void>;
};

export type FixtureOptions = {
	readonly book?: Book;
	readonly report?: ReturnType<typeof draftReport>;
	/** Skip writing `pages/`, to exercise a book whose images were never rendered. */
	readonly withPages?: boolean;
};

export async function writeDraftFixture(options: FixtureOptions = {}): Promise<DraftFixture> {
	const contentDir = await mkdtemp(join(tmpdir(), "granthalaya-studio-"));
	const book = options.book ?? draftBook();
	const report = options.report ?? draftReport(book);
	const bookDir = join("books", book.id);

	await Bun.write(join(contentDir, bookDir, "book.json"), JSON.stringify(book, null, 2));
	await Bun.write(join(contentDir, bookDir, "assembly.json"), JSON.stringify(report, null, 2));

	if (options.withPages !== false) {
		const pagesDir = join(contentDir, "pages", `${book.id}-fixture`);
		await Bun.write(
			join(pagesDir, "pages.json"),
			JSON.stringify({
				source: report.source.file,
				sourceSha256: report.source.sha256,
				pageCount: 4,
				dpi: 300,
				format: "png",
				color: "gray",
				pages: [1, 2, 3, 4].map((number) => ({
					number,
					file: `page-${String(number).padStart(4, "0")}.png`,
					widthPx: 1424,
					heightPx: 2133,
					bytes: PIXEL_PNG.byteLength,
				})),
			}),
		);
		for (const number of [1, 2, 3, 4]) {
			await Bun.write(join(pagesDir, `page-${String(number).padStart(4, "0")}.png`), PIXEL_PNG);
		}
	}

	return {
		contentDir,
		bookDir,
		cleanup: () => rm(contentDir, { recursive: true, force: true }),
	};
}
