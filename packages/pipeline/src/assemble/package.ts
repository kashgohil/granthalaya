/**
 * Turning a segmented book into the two artefacts P1.3 needs (P1.2).
 *
 * **`book.json`** is the P0.2 package — and nothing more than the P0.2 package. Everything the
 * pipeline knows *about* the extraction (which page a passage came off, what normalization
 * changed, how much to trust it) stays out of it, because a book package is a build artefact
 * that a reader installs, not a record of how it was built.
 *
 * **`assembly.json`** is that record. It is the sidecar the proofing studio reads: for every
 * passage, the pages and pixel boxes it came from so the side-by-side view can line up, the
 * repairs the machine made so a human can check exactly those places, and a confidence score so
 * proofing starts where the evidence is weakest rather than at page one.
 *
 * The two are joined by the verse ref, which is the only identifier either of them needs.
 *
 * What this deliberately does *not* do is attach footnotes to the words that pointed at them.
 * The evidence is all here — each passage records the markers it carried and each page records
 * the notes printed below its rule — but pairing them means deciding which gloss belongs to
 * which word, and a wrong pairing is a silent corruption of meaning rather than of text. That
 * is layer authoring, it is P1.4, and it happens with a human in the loop.
 */
import {
	type Book,
	type BookUnit,
	type BookVerse,
	DIGIT_CLASS,
	formatRef,
	hashVerse,
	type License,
	type LocalizedText,
	profileScript,
	type Script,
	type SourceEdition,
} from "@granthalaya/core";
import type { OcrManifest } from "../ocr.ts";
import type {
	BlockRef,
	PageNote,
	PageNumbering,
	SegmentedBook,
	SegmentedVerse,
	SequenceReport,
	SetAsideBlock,
	VerseFlag,
} from "./segment.ts";

/** What only a human can supply, plus the few things that have sensible defaults. */
export type BookMetadata = {
	readonly id: string;
	readonly title: LocalizedText;
	readonly subtitle?: LocalizedText;
	readonly language: string;
	readonly script: Script;
	readonly tradition?: string;
	readonly contentVersion: string;
	readonly source: SourceEdition;
	readonly license: License;
	/** Layer id for the scripture itself. Conventionally the language tag, as in the fixtures. */
	readonly layerId: string;
	readonly layerLabel: LocalizedText;
};

export type AssembledVerse = {
	/** The full ref, e.g. `gopalanand-swami-ni-vato/section-2#v63`. Joins the two artefacts. */
	readonly ref: string;
	readonly number: string | null;
	readonly confidence: number;
	readonly flags: readonly VerseFlag[];
	readonly chars: number;
	/** PDF pages, and what those pages printed on themselves. */
	readonly pages: readonly number[];
	readonly printedPages: readonly (number | null)[];
	/** Where on the page images this passage's text sits — P1.3's side-by-side view needs these. */
	readonly blocks: readonly BlockRef[];
	/** Every change normalization made, so a human can check exactly those places. */
	readonly repairs: readonly {
		readonly kind: string;
		readonly before: string;
		readonly after: string;
		readonly context: string;
	}[];
	/** Footnote markers this passage carried. Pairing them to notes is P1.4's job, with a human. */
	readonly footnoteMarkers: readonly number[];
	readonly orthography: {
		readonly ok: boolean;
		readonly violations: number;
		readonly rate: number;
	};
};

export type AssemblyReport = {
	readonly book: string;
	/** Chain of custody: *this PDF* → *these images* → *this text* → *this package*. */
	readonly source: {
		readonly file: string;
		readonly sha256: string;
		readonly engine: string;
		readonly bookPageCount: number;
		readonly pagesAssembled: readonly number[];
	};
	readonly numbering: PageNumbering;
	readonly sequence: SequenceReport;
	readonly counts: {
		readonly sections: number;
		readonly verses: number;
		readonly numbered: number;
		readonly notes: number;
		readonly setAside: number;
	};
	/**
	 * Fields carrying a placeholder because no machine can know them. The report says so
	 * plainly rather than letting `"unknown"` sit in a package looking like a decision.
	 */
	readonly needsHuman: readonly string[];
	/** Distinct running heads seen, as evidence for whoever fills in the title. */
	readonly runningHeads: readonly { readonly text: string; readonly pages: number }[];
	readonly verses: readonly AssembledVerse[];
	readonly notes: readonly PageNote[];
	readonly setAside: readonly SetAsideBlock[];
};

export type Assembled = {
	readonly book: Book;
	readonly report: AssemblyReport;
};

/** Placeholder used where only a human can supply the truth. Listed in `needsHuman`. */
export const UNKNOWN = "unknown";

/**
 * Default metadata for a directory of OCR output.
 *
 * The title is derived from the directory name and the source edition and licence are left
 * unknown, because inventing either would be a small fiction in a project whose first principle
 * is fidelity. The report names all three.
 */
export function defaultMetadata(bookId: string, language = "gu"): BookMetadata {
	const script: Script = language.startsWith("gu") ? "gujr" : "deva";
	return {
		id: bookId,
		title: { en: bookId.replace(/-/g, " ") },
		language,
		script,
		contentVersion: "0.1.0",
		source: { edition: UNKNOWN },
		license: { id: UNKNOWN },
		layerId: language.split("-")[0] ?? "gu",
		layerLabel: { gu: "મૂળ", en: "Original" },
	};
}

/** Verse id from the printed number — the edition's own identity for the passage. */
function verseId(verse: SegmentedVerse, sectionIndex: number, ordinal: number): string {
	if (verse.number !== null) {
		return `v${verse.number.value}`;
	}
	// Nothing printed to key on, so fall back to where it was found. Flagged `no-number`, so
	// this id is visible in the proofing queue as something for a human to settle.
	const page = verse.pages[0] ?? sectionIndex;
	return `p${page}-${ordinal + 1}`;
}

/**
 * Running heads, tallied — evidence for whoever has to supply the book's real title.
 *
 * Only heads in the book's own script count. The first real book's headers each carry the word
 * `INDEX`, which is a navigation button the PDF's own viewer draws rather than anything the
 * edition prints, and it appears on every page — so without this filter it wins the tally and
 * the report offers it as the book's title.
 */
function runningHeads(
	setAside: readonly SetAsideBlock[],
	script: Script,
): { text: string; pages: number }[] {
	const tally = new Map<string, number>();
	for (const block of setAside) {
		if (block.tag !== "header") {
			continue;
		}
		for (const line of block.text.split("\n")) {
			// The folio sits in the same block as the head and changes on every page, so it is
			// dropped: `૫૬ ગોપાળાનંદસ્વામીની વાતો` and `મુક્તના ભેદની વાતો ૫૯` are two sightings
			// of two heads, not 442 sightings of 442 different ones.
			const text = line
				.replace(
					new RegExp(`(?<![${DIGIT_CLASS}])[${DIGIT_CLASS}]+(?![${DIGIT_CLASS}])`, "gu"),
					" ",
				)
				.replace(/\s+/g, " ")
				.trim();
			if (text !== "" && profileScript(text).dominant === script) {
				tally.set(text, (tally.get(text) ?? 0) + 1);
			}
		}
	}
	return [...tally].map(([text, pages]) => ({ text, pages })).sort((a, b) => b.pages - a.pages);
}

function listPlaceholders(metadata: BookMetadata): string[] {
	const needs: string[] = [];
	if (metadata.source.edition === UNKNOWN) {
		needs.push("source.edition — which printed edition this is");
	}
	if (metadata.license.id === UNKNOWN) {
		needs.push("license.id — whether we have the rights to publish it");
	}
	if (metadata.title.gu === undefined && metadata.script === "gujr") {
		needs.push("title.gu — the book's title as it is printed");
	}
	return needs;
}

/**
 * Build the draft package and its assembly report.
 *
 * `contentStatus` is `draft` and stays `draft`: the catalog serves only `published` packages,
 * which makes the proofing gate structural rather than procedural. Nothing that comes out of
 * this function has been read by a human yet, and the format says so.
 */
export function assemblePackage(
	segmented: SegmentedBook,
	manifest: OcrManifest,
	metadata: BookMetadata,
	pagesAssembled: readonly number[],
): Assembled {
	const verses: AssembledVerse[] = [];
	const structure: BookUnit[] = [];

	for (const [sectionIndex, section] of segmented.sections.entries()) {
		const sectionId = `section-${sectionIndex + 1}`;
		const children: BookUnit[] = [];

		for (const [ordinal, verse] of section.verses.entries()) {
			const id = verseId(verse, sectionIndex, ordinal);
			const layers = { [metadata.layerId]: verse.text };
			const unit: BookVerse = {
				kind: "verse",
				id,
				...(verse.number === null ? {} : { number: verse.number.text }),
				form: verse.form,
				layers,
				hash: hashVerse(layers),
			};
			children.push(unit);

			verses.push({
				ref: formatRef({ bookId: metadata.id, path: [sectionId], leaf: id }),
				number: verse.number?.text ?? null,
				confidence: verse.confidence,
				flags: verse.flags,
				chars: [...verse.text].length,
				pages: verse.pages,
				printedPages: verse.pages.map(
					(page) => verse.blocks.find((block) => block.page === page)?.printedPage ?? null,
				),
				blocks: verse.blocks,
				repairs: verse.repairs.map((repair) => ({
					kind: repair.kind,
					before: repair.before,
					after: repair.after,
					context: repair.context,
				})),
				footnoteMarkers: verse.footnoteMarkers,
				orthography: {
					ok: verse.orthography.ok,
					violations: verse.orthography.count,
					rate: Math.round(verse.orthography.rate * 100) / 100,
				},
			});
		}

		// A division must contain something; a section that segmented to nothing is dropped here
		// and is visible in the report as a section count that does not match the titles seen.
		if (children.length === 0) {
			continue;
		}

		structure.push({
			kind: "section",
			id: sectionId,
			...(section.title === null ? {} : { title: { [metadata.language]: section.title } }),
			children,
		});
	}

	const book: Book = {
		formatVersion: 1,
		id: metadata.id,
		title: metadata.title,
		...(metadata.subtitle === undefined ? {} : { subtitle: metadata.subtitle }),
		language: metadata.language,
		script: metadata.script,
		...(metadata.tradition === undefined ? {} : { tradition: metadata.tradition }),
		contentVersion: metadata.contentVersion,
		contentStatus: "draft",
		source: {
			...metadata.source,
			notes:
				metadata.source.notes ??
				`Assembled from ${manifest.source} (SHA-256 ${manifest.sourceSha256}) via ${manifest.engine}. Not yet proofed.`,
		},
		license: metadata.license,
		layers: [
			{
				id: metadata.layerId,
				kind: "original",
				language: metadata.language,
				script: metadata.script,
				label: metadata.layerLabel,
			},
		],
		primaryLayer: metadata.layerId,
		structure,
	};

	const report: AssemblyReport = {
		book: metadata.id,
		source: {
			file: manifest.source,
			sha256: manifest.sourceSha256,
			engine: manifest.engine,
			bookPageCount: manifest.pageCount,
			pagesAssembled,
		},
		numbering: segmented.numbering,
		sequence: segmented.sequence,
		counts: {
			sections: structure.length,
			verses: verses.length,
			numbered: verses.filter((verse) => verse.number !== null).length,
			notes: segmented.notes.length,
			setAside: segmented.setAside.length,
		},
		needsHuman: listPlaceholders(metadata),
		runningHeads: runningHeads(segmented.setAside, metadata.script),
		// Worst first: the report is a proofing queue, and its order is its main affordance.
		verses: [...verses].sort((a, b) => a.confidence - b.confidence),
		notes: segmented.notes,
		setAside: segmented.setAside,
	};

	return { book, report };
}

export type { PageNote, SetAsideBlock };
