/**
 * Finding a book's structure in a pile of OCR'd pages (P1.2).
 *
 * The pages themselves say where the structure is, and they say it in ink rather than in
 * metadata. Reading the first real book showed the whole grammar on four pages:
 *
 * - a passage ends at its printed number, wrapped in double dandas — `॥૬૨॥`, in Gujarati digits;
 * - a work ends at a printed line that says so — `॥ પુરુષોત્તમપણાની વાતો સમાપ્ત ॥`;
 * - a work begins at a block the OCR tagged `section-title`;
 * - a passage does not care where the page ends, and routinely runs across two of them;
 * - the printed page number is not the PDF page number, and the gap is a constant worth checking.
 *
 * So this module is a small state machine over blocks in reading order, and everything it
 * concludes is evidence a human can check on the page image — which is the point, because
 * P1.3 has to proof every one of these decisions anyway. It never guesses in silence: a
 * passage with no printed number, one assembled across a page break, one that is still
 * orthographically impossible after normalization, all come out flagged.
 *
 * Pure: no I/O, no `process`. `read.ts` brings the pages in and `package.ts` takes the result out.
 */
import {
	checkOrthography,
	DIGIT_CLASS,
	normalizeScriptureText,
	type OrthographyReport,
	type ParsedNumber,
	parseIndicNumber,
	profileScript,
	type Script,
	type TextRepair,
	type VerseForm,
} from "@granthalaya/core";
import type { Block } from "../ocr/sarvam.ts";
import { partitionBlocks } from "../ocr.ts";

/** One page as `ocr` wrote it, read back from its `page-NNNN.blocks.json`. */
export type PageBlocks = {
	/** The PDF's page number — what the rendered image is named after. */
	readonly number: number;
	readonly widthPx: number;
	readonly heightPx: number;
	readonly blocks: readonly Block[];
};

/**
 * Where a piece of text sits on a page image.
 *
 * Carried all the way into the assembly report because P1.3's side-by-side view has to map a
 * line of text back to a rectangle on the page a human is looking at.
 */
export type BlockRef = {
	readonly page: number;
	readonly printedPage: number | null;
	readonly blockId: string;
	readonly tag: string;
	readonly bbox: readonly [number, number, number, number];
};

export type VerseFlag =
	/** No printed number, so this passage has no identity of its own in the edition. */
	| "no-number"
	/** Its number repeats one already seen. */
	| "duplicate-number"
	/** Its number does not follow the previous one. */
	| "out-of-sequence"
	/** Still contains sequences Gujarati cannot spell, after normalization. */
	| "orthography"
	/** Assembled across a page break — the one join the OCR could not see for itself. */
	| "spans-pages"
	/** A word was put back together across an end-of-line hyphen. */
	| "hyphen-join"
	/** Short enough to be a fragment rather than a passage. */
	| "very-short"
	/** Contains a run in another admitted script — a Sanskrit shloka inside a Gujarati discourse. */
	| "contains-quotation";

/**
 * How much each flag costs a passage's confidence.
 *
 * A table rather than a formula, so the score is legible: a reader of the assembly report can
 * see exactly why a passage scored what it did, and argue with the number. The score exists to
 * *order* the proofing queue — worst first — not to decide anything on its own.
 */
export const CONFIDENCE_PENALTY: Readonly<Record<VerseFlag, number>> = {
	orthography: 0.4,
	"no-number": 0.35,
	"duplicate-number": 0.3,
	"out-of-sequence": 0.3,
	"very-short": 0.15,
	"spans-pages": 0.1,
	"hyphen-join": 0.05,
	"contains-quotation": 0.05,
};

export type SegmentedVerse = {
	/** The number the edition printed, parsed. Null when the passage carried none. */
	readonly number: ParsedNumber | null;
	readonly text: string;
	readonly form: VerseForm;
	/** Every PDF page this passage drew text from, in order. */
	readonly pages: readonly number[];
	readonly blocks: readonly BlockRef[];
	/** What normalization changed, individually — see `normalizeScriptureText`. */
	readonly repairs: readonly TextRepair[];
	readonly footnoteMarkers: readonly number[];
	readonly orthography: OrthographyReport;
	readonly flags: readonly VerseFlag[];
	/** 0–1, derived from `flags` by `CONFIDENCE_PENALTY`. Orders the proofing queue. */
	readonly confidence: number;
};

export type SegmentedSection = {
	/** As printed. Null for text that appeared before the book's first heading. */
	readonly title: string | null;
	readonly titleBlock: BlockRef | null;
	/** The printed line that closed it, e.g. `॥ પુરુષોત્તમપણાની વાતો સમાપ્ત ॥`. */
	readonly endMarker: string | null;
	readonly verses: readonly SegmentedVerse[];
};

export type SequenceReport = {
	readonly first: number | null;
	readonly last: number | null;
	readonly numbered: number;
	readonly unnumbered: number;
	/** Numbers absent from the run between `first` and `last`. */
	readonly missing: readonly number[];
	readonly duplicates: readonly number[];
	/** Numbers that did not follow the one before them. */
	readonly outOfOrder: readonly number[];
};

export type PageNumbering = {
	/** `pdfPage - printedPage`, when every page that printed one agreed. */
	readonly offset: number | null;
	readonly pagesWithPrintedNumber: number;
	/** Pages whose printed number disagreed with the prevailing offset. */
	readonly disagreements: readonly { readonly page: number; readonly printed: number }[];
};

export type PageNote = {
	readonly page: number;
	readonly printedPage: number | null;
	readonly text: string;
	readonly block: BlockRef;
};

export type SetAsideBlock = BlockRef & { readonly text: string };

export type SegmentedBook = {
	readonly sections: readonly SegmentedSection[];
	readonly sequence: SequenceReport;
	readonly numbering: PageNumbering;
	/** Footnotes, kept as content but never spliced into a passage. P1.4 turns these into a layer. */
	readonly notes: readonly PageNote[];
	/** Everything kept out of the text, recorded so nothing disappears without a trace. */
	readonly setAside: readonly SetAsideBlock[];
};

export type SegmentOptions = {
	/** The book's own script. Decides digit handling and what counts as a quotation. */
	readonly script: Script;
	/** Scripts a block may legitimately be in — see `admittedScripts`. */
	readonly admitted: readonly Script[];
	/** How the reader should set these passages. Prose folds printed line breaks away. */
	readonly form?: VerseForm;
	/** Below this many characters a passage is flagged as a possible fragment. */
	readonly shortVerseChars?: number;
};

/** Layout tags that open a new division. */
const HEADING_TAGS = new Set([
	"section-title",
	"section-header",
	"chapter-title",
	"title",
	"heading",
	"subtitle",
]);

/** Tags that may carry the printed page number. `footer` is excluded — it holds the footnotes. */
const PAGE_NUMBER_TAGS = ["page-number", "folio", "header"] as const;

/**
 * A passage's printed number, in double dandas: `॥૬૨॥`, or `॥ ૨૧ ॥` in editions that space it.
 * The closing double danda is required — a single danda ends a *line* of verse, and matching it
 * here would cut a shloka into pieces at every line.
 */
const VERSE_TERMINATOR = new RegExp(`॥\\s*([${DIGIT_CLASS}]+)\\s*॥`, "gu");

/**
 * Words an edition ends a work with. Matched only inside a danda-wrapped line, which is how
 * they are always printed and what keeps a passage that merely *mentions* completion from
 * closing the section it sits in.
 */
const COMPLETION_WORDS = ["સમાપ્ત", "समाप्त", "સંપૂર્ણ", "संपूर्ण", "ઇતિ", "इति"];

/** Is this block the printed line that closes a work? */
export function isSectionEndMarker(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed.startsWith("॥") || !trimmed.endsWith("॥")) {
		return false;
	}
	return COMPLETION_WORDS.some((word) => trimmed.includes(word));
}

/** The printed page number, read off whichever block carries it. */
export function printedPageNumber(blocks: readonly Block[], script: Script): number | null {
	for (const tag of PAGE_NUMBER_TAGS) {
		for (const block of blocks) {
			if (block.tag !== tag) {
				continue;
			}
			// A standalone run of the book's own digits: `INDEX ૫૬ ગોપાળાનંદસ્વામીની વાતો` gives 56.
			// Bounded on both sides so a number inside a word is not mistaken for the folio.
			const match = block.text.match(new RegExp(`(?<![${DIGIT_CLASS}])[${DIGIT_CLASS}]+`, "u"));
			const parsed = match === null ? null : parseIndicNumber(match[0]);
			if (parsed !== null && parsed.script === script) {
				return parsed.value;
			}
		}
	}
	return null;
}

/** Agreement between the printed page numbers and the PDF's own. */
function readNumbering(pages: readonly { page: number; printed: number | null }[]): PageNumbering {
	const known = pages.filter(
		(entry): entry is { page: number; printed: number } => entry.printed !== null,
	);
	if (known.length === 0) {
		return { offset: null, pagesWithPrintedNumber: 0, disagreements: [] };
	}

	// The commonest offset wins: a stray misread folio must not move the whole book.
	const tally = new Map<number, number>();
	for (const entry of known) {
		const offset = entry.page - entry.printed;
		tally.set(offset, (tally.get(offset) ?? 0) + 1);
	}
	let offset = 0;
	let best = -1;
	for (const [candidate, count] of tally) {
		if (count > best) {
			offset = candidate;
			best = count;
		}
	}

	return {
		offset,
		pagesWithPrintedNumber: known.length,
		disagreements: known
			.filter((entry) => entry.page - entry.printed !== offset)
			.map((entry) => ({ page: entry.page, printed: entry.printed })),
	};
}

function refOf(block: Block, page: number, printedPage: number | null): BlockRef {
	return {
		page,
		printedPage,
		blockId: block.id,
		tag: block.tag,
		bbox: block.bbox,
	};
}

/** Text contributed to the passage being assembled, with where it came from. */
type Fragment = {
	readonly text: string;
	readonly ref: BlockRef;
	/** True when this fragment is in a different script from the book — a quotation. */
	readonly quotation: boolean;
};

/**
 * Walk a book's OCR'd pages and find its divisions and passages.
 *
 * Blocks arrive in reading order within a page, and pages in page order, so one pass is enough.
 * The only state carried across a page boundary is the passage currently being assembled —
 * which is exactly the state a printed book carries across a page boundary too.
 */
export function segmentBook(pages: readonly PageBlocks[], options: SegmentOptions): SegmentedBook {
	const { script, admitted, form = "prose", shortVerseChars = 40 } = options;

	const sections: SegmentedSection[] = [];
	const notes: PageNote[] = [];
	const setAside: SetAsideBlock[] = [];
	const folios: { page: number; printed: number | null }[] = [];

	let currentTitle: string | null = null;
	let currentTitleBlock: BlockRef | null = null;
	let currentVerses: SegmentedVerse[] = [];
	let pending: Fragment[] = [];

	const seenNumbers = new Set<number>();
	const orderedNumbers: number[] = [];
	let previousNumber: number | null = null;

	/** Turn the accumulated fragments into a passage. Returns null when there is nothing to close. */
	const closeVerse = (number: ParsedNumber | null): SegmentedVerse | null => {
		if (pending.length === 0) {
			return null;
		}
		const fragments = pending;
		pending = [];

		// A single newline is a printed line break, which normalization folds away; a blank line
		// is a real paragraph break, which it keeps. So a quotation in another script is set apart
		// with a blank line rather than run into the prose around it.
		let raw = "";
		for (const [index, fragment] of fragments.entries()) {
			if (index > 0) {
				const previous = fragments[index - 1] as Fragment;
				raw += fragment.quotation || previous.quotation ? "\n\n" : "\n";
			}
			raw += fragment.text;
		}

		const normalized = normalizeScriptureText(raw, {
			script,
			joinLines: form === "prose",
			stripFootnoteMarkers: true,
		});
		const orthography = checkOrthography(normalized.text, script);

		const pageNumbers: number[] = [];
		for (const fragment of fragments) {
			if (!pageNumbers.includes(fragment.ref.page)) {
				pageNumbers.push(fragment.ref.page);
			}
		}

		const flags: VerseFlag[] = [];
		if (number === null) {
			flags.push("no-number");
		} else {
			if (seenNumbers.has(number.value)) {
				flags.push("duplicate-number");
			}
			if (previousNumber !== null && number.value !== previousNumber + 1) {
				flags.push("out-of-sequence");
			}
			seenNumbers.add(number.value);
			orderedNumbers.push(number.value);
			previousNumber = number.value;
		}
		if (!orthography.ok) {
			flags.push("orthography");
		}
		if (pageNumbers.length > 1) {
			flags.push("spans-pages");
		}
		if (normalized.repairs.some((repair) => repair.kind === "hyphen-join")) {
			flags.push("hyphen-join");
		}
		if ([...normalized.text].length < shortVerseChars) {
			flags.push("very-short");
		}
		if (fragments.some((fragment) => fragment.quotation)) {
			flags.push("contains-quotation");
		}

		const penalty = flags.reduce((total, flag) => total + (CONFIDENCE_PENALTY[flag] ?? 0), 0);

		return {
			number,
			text: normalized.text,
			form,
			pages: pageNumbers,
			blocks: fragments.map((fragment) => fragment.ref),
			repairs: normalized.repairs,
			footnoteMarkers: normalized.footnoteMarkers,
			orthography,
			flags,
			confidence: Math.max(0, Math.round((1 - penalty) * 100) / 100),
		};
	};

	const pushVerse = (number: ParsedNumber | null): void => {
		const verse = closeVerse(number);
		if (verse !== null) {
			currentVerses.push(verse);
		}
	};

	const closeSection = (endMarker: string | null): void => {
		// Anything still pending belongs to the section that is ending, numbered or not.
		pushVerse(null);
		if (currentVerses.length === 0 && currentTitle === null && endMarker === null) {
			return;
		}
		sections.push({
			title: currentTitle,
			titleBlock: currentTitleBlock,
			endMarker,
			verses: currentVerses,
		});
		currentTitle = null;
		currentTitleBlock = null;
		currentVerses = [];
	};

	for (const page of pages) {
		const printed = printedPageNumber(page.blocks, script);
		folios.push({ page: page.number, printed });

		const { body, notes: pageNotes, setAside: aside } = partitionBlocks(page.blocks, admitted);

		for (const block of pageNotes) {
			notes.push({
				page: page.number,
				printedPage: printed,
				text: normalizeScriptureText(block.text, {
					script,
					joinLines: true,
					// A note's own number is its label, not a marker welded into a word.
					stripFootnoteMarkers: false,
				}).text,
				block: refOf(block, page.number, printed),
			});
		}
		for (const block of aside) {
			setAside.push({ ...refOf(block, page.number, printed), text: block.text });
		}

		for (const block of body) {
			const ref = refOf(block, page.number, printed);

			if (HEADING_TAGS.has(block.tag)) {
				// A heading closes whatever came before it, even mid-passage: the passage was
				// unterminated, which is exactly the kind of thing proofing needs to see.
				closeSection(null);
				currentTitle = normalizeScriptureText(block.text, { script, joinLines: true }).text;
				currentTitleBlock = ref;
				continue;
			}

			if (isSectionEndMarker(block.text)) {
				closeSection(block.text.trim());
				continue;
			}

			const profile = profileScript(block.text);
			const quotation = profile.dominant !== null && profile.dominant !== script;

			// One block can hold more than one passage, so split on every printed number rather
			// than assuming a block ends at most one.
			VERSE_TERMINATOR.lastIndex = 0;
			let cursor = 0;
			for (;;) {
				const match = VERSE_TERMINATOR.exec(block.text);
				if (match === null) {
					break;
				}
				// The danda stays with the text and the number does not, which is how P0.2's own
				// fixtures are written: `ધિયો યો નઃ પ્રચોદયાત્ ॥` with `number: "૪"` beside it.
				// Keeping the number in both places would render it twice and, worse, fold it
				// into the verse hash — so correcting a misread number would silently invalidate
				// every annotation keyed to the passage.
				const before = block.text.slice(cursor, match.index);
				const opening = [...(match[0] as string)][0] as string;
				if (before.trim() !== "" || pending.length > 0) {
					pending.push({ text: `${before}${opening}`.trim(), ref, quotation });
				}
				pushVerse(parseIndicNumber(match[1] as string));
				cursor = match.index + match[0].length;
			}

			const rest = block.text.slice(cursor).trim();
			if (rest !== "") {
				pending.push({ text: rest, ref, quotation });
			}
		}
	}

	closeSection(null);

	return {
		sections,
		sequence: readSequence(orderedNumbers, sections),
		numbering: readNumbering(folios),
		notes,
		setAside,
	};
}

/** Check the printed numbering for the gaps and repeats that mean a passage was lost. */
function readSequence(
	ordered: readonly number[],
	sections: readonly SegmentedSection[],
): SequenceReport {
	const unnumbered = sections.reduce(
		(total, section) => total + section.verses.filter((verse) => verse.number === null).length,
		0,
	);
	if (ordered.length === 0) {
		return {
			first: null,
			last: null,
			numbered: 0,
			unnumbered,
			missing: [],
			duplicates: [],
			outOfOrder: [],
		};
	}

	const seen = new Set<number>();
	const duplicates = new Set<number>();
	for (const value of ordered) {
		if (seen.has(value)) {
			duplicates.add(value);
		}
		seen.add(value);
	}

	// Deduplicated: a number that repeats is reported once here and again under `duplicates`,
	// and listing it twice in the same line reads as two separate faults.
	const outOfOrder = new Set<number>();
	for (let index = 1; index < ordered.length; index += 1) {
		if ((ordered[index] as number) !== (ordered[index - 1] as number) + 1) {
			outOfOrder.add(ordered[index] as number);
		}
	}

	const first = Math.min(...ordered);
	const last = Math.max(...ordered);
	const missing: number[] = [];
	for (let value = first; value <= last; value += 1) {
		if (!seen.has(value)) {
			missing.push(value);
		}
	}

	return {
		first,
		last,
		numbered: ordered.length,
		unnumbered,
		missing,
		duplicates: [...duplicates],
		outOfOrder: [...outOfOrder],
	};
}
