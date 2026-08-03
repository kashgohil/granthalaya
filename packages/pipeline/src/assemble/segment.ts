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
	checkVerseSequence,
	DIGIT_CLASS,
	formatIndicNumber,
	normalizeScriptureText,
	type OrthographyReport,
	type ParsedNumber,
	parseIndicNumber,
	profileScript,
	type Script,
	type SequenceReport,
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
	| "contains-quotation"
	/** Its number was printed in the quotation's script and recovered from the run — see below. */
	| "recovered-number";

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
	"recovered-number": 0.2,
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
	/**
	 * Where the title came from. `heading` is a block the edition set as one; `running-head` is
	 * recovered from the head printed across the section's own pages, which is weaker evidence
	 * and is marked so the studio can say so.
	 */
	readonly titleSource: "heading" | "running-head" | null;
	/** The printed line that closed it, e.g. `॥ પુરુષોત્તમપણાની વાતો સમાપ્ત ॥`. */
	readonly endMarker: string | null;
	readonly verses: readonly SegmentedVerse[];
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

/**
 * Layout tags that open a new division.
 *
 * `headline` is here because the OCR uses it for exactly the openings this book sets most
 * grandly — an illustration, a circled chapter number, the title in display type. Leaving it out
 * cost eleven divisions, welded each of those titles onto the first passage beneath it, and left
 * four chapters of the back matter running together as one, each counting its passages from ૧ so
 * their ids collided. Which of `section-title` and `headline` the OCR picks is not something a
 * page can be read to predict, so both open a division and the script guard below decides.
 */
const HEADING_TAGS = new Set([
	"section-title",
	"section-header",
	"chapter-title",
	"title",
	"headline",
	"heading",
	"subtitle",
]);

/** Tags that may carry the printed page number. `footer` is excluded — it holds the footnotes. */
const PAGE_NUMBER_TAGS = ["page-number", "folio", "header"] as const;

/**
 * A double danda, in both the forms the OCR writes it.
 *
 * `॥` (U+0965) is the character, and six blocks of the first real book instead carry two single
 * dandas `।।` (U+0964 twice) — the same mark, read as its parts. Admitting both here is a matter
 * of *finding* structure, not of repairing text: what the block says is left exactly as it is.
 */
const DOUBLE_DANDA = "(?:॥|।।)";

/**
 * A passage's printed number, in double dandas: `॥૬૨॥`, or `॥ ૨૧ ॥` in editions that space it.
 * The closing double danda is required — a single danda ends a *line* of verse, and matching it
 * here would cut a shloka into pieces at every line.
 */
const VERSE_TERMINATOR = new RegExp(
	`(${DOUBLE_DANDA})\\s*([${DIGIT_CLASS}]+)\\s*${DOUBLE_DANDA}`,
	"gu",
);

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

/**
 * The running heads a header block carries, as heads rather than as lines.
 *
 * The folio sits in the same block and changes on every page, so it is dropped: `૫૬
 * ગોપાળાનંદસ્વામીની વાતો` and `મુક્તના ભેદની વાતો ૫૯` are two sightings of two heads, not two
 * sightings of two hundred. Only heads in the book's own script count — the first real book's
 * headers each carry the word `INDEX`, which is a button the PDF viewer draws rather than
 * anything the edition printed.
 */
export function runningHeadLines(text: string, script: Script): string[] {
	const heads: string[] = [];
	for (const line of text.split("\n")) {
		const head = line
			.replace(new RegExp(`(?<![${DIGIT_CLASS}])[${DIGIT_CLASS}]+(?![${DIGIT_CLASS}])`, "gu"), " ")
			.replace(/\s+/g, " ")
			.trim();
		if (head !== "" && profileScript(head).dominant === script) {
			heads.push(head);
		}
	}
	return heads;
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
	const headsByPage = new Map<number, string[]>();

	let currentTitle: string | null = null;
	let currentTitleBlock: BlockRef | null = null;
	let currentVerses: SegmentedVerse[] = [];
	let pending: Fragment[] = [];

	const seenNumbers = new Set<number>();
	let previousNumber: number | null = null;
	/** True until the division that just opened has produced its first numbered passage. */
	let sectionStart = true;

	/** Turn the accumulated fragments into a passage. Returns null when there is nothing to close. */
	const closeVerse = (number: ParsedNumber | null, recovered = false): SegmentedVerse | null => {
		if (pending.length === 0) {
			return null;
		}
		const fragments = pending;
		pending = [];

		// A single newline is a printed line break, which normalization folds away; a blank line
		// is a real paragraph break, which it keeps. So a quotation in another script is set apart
		// with a blank line rather than run into the prose around it.
		//
		// Two fragments of one passage are always two different blocks — a printed number closes
		// the passage, so a block can never contribute twice to the same one. That makes the page
		// the deciding evidence. Within a page, the OCR split those blocks because the typesetter
		// did: the second one begins with a first-line indent, mid-passage, and it is a paragraph
		// break. Across a page it is the opposite — a paragraph carrying on is the ordinary way a
		// passage spans two pages, and the only printed signal for a *new* paragraph at the top of
		// a page is that indent, which block-level boxes cannot see. So the join is folded, and
		// `spans-pages` already tells a human to look at it.
		let raw = "";
		for (const [index, fragment] of fragments.entries()) {
			if (index > 0) {
				const previous = fragments[index - 1] as Fragment;
				const paragraphBreak =
					fragment.quotation || previous.quotation || fragment.ref.page === previous.ref.page;
				raw += paragraphBreak ? "\n\n" : "\n";
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
			// A division may start the numbering over — an appendix that counts from 1 again is
			// the edition's doing, not a fault — so the run resets instead of the passage being
			// flagged. Without this the first passage of every restart carried `duplicate-number`
			// and `out-of-sequence`, lost 0.6 of its confidence, and sat at the top of the
			// proofing queue ahead of passages with something actually wrong with them. Inside a
			// division the same jump *is* a fault; `checkVerseSequence` draws the line identically.
			if (sectionStart && previousNumber !== null && number.value <= previousNumber) {
				seenNumbers.clear();
				previousNumber = null;
			}
			if (seenNumbers.has(number.value)) {
				flags.push("duplicate-number");
			}
			if (previousNumber !== null && number.value !== previousNumber + 1) {
				flags.push("out-of-sequence");
			}
			seenNumbers.add(number.value);
			previousNumber = number.value;
			sectionStart = false;
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
		if (recovered) {
			flags.push("recovered-number");
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

	const pushVerse = (number: ParsedNumber | null, recovered = false): void => {
		const verse = closeVerse(number, recovered);
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
			titleSource: currentTitle === null ? null : "heading",
			endMarker,
			verses: currentVerses,
		});
		currentTitle = null;
		currentTitleBlock = null;
		currentVerses = [];
		sectionStart = true;
	};

	for (const page of pages) {
		const printed = printedPageNumber(page.blocks, script);
		folios.push({ page: page.number, printed });
		headsByPage.set(
			page.number,
			page.blocks
				.filter((block) => block.tag === "header")
				.flatMap((block) => runningHeadLines(block.text, script)),
		);

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
			const profile = profileScript(block.text);
			const quotation = profile.dominant !== null && profile.dominant !== script;

			// A heading must be in the book's own script. The OCR tags a bold, centred line
			// `section-title` on layout alone, and in a bilingual commentary that line is the
			// quoted Devanagari shloka rather than a heading. Nine of this book's forty
			// `section-title` blocks are Devanagari, and obeying the tag broke one division —
			// `ધ્યાનના શ્લોકો` — into a section per shloka, each titled with the shloka it opened
			// on. Admitting Devanagari for body text, which scripture requires, must not admit it
			// for structure. Nothing is lost by refusing: the block falls through and stays in the
			// passage as the quotation it is.
			if (HEADING_TAGS.has(block.tag) && !quotation) {
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

			// One block can hold more than one passage, so split on every printed number rather
			// than assuming a block ends at most one.
			VERSE_TERMINATOR.lastIndex = 0;
			let cursor = 0;
			/** Where the last refused match ended, for the adjacency test below. */
			let refusedEnd: number | null = null;
			for (;;) {
				const match = VERSE_TERMINATOR.exec(block.text);
				if (match === null) {
					break;
				}
				// The closing number has to be in the book's own script. A Sanskrit shloka quoted
				// mid-discourse prints its own `॥१॥` in Devanagari, and the terminator pattern
				// admits every Indic digit — so the quotation was closing the passage that carried
				// it, cutting the discourse in two and handing the second half the shloka's number
				// as its identity. Four passages of the first real book were built that way.
				// Skipping leaves the number where it belongs: inside the quotation's text.
				const parsed = parseIndicNumber(match[2] as string);
				let number = parsed;
				let recovered = false;
				if (parsed !== null && parsed.script !== script) {
					// One exception, and only one: a passage number the OCR read in the *quotation's*
					// script because the quotation ran right up against it. Page 153 prints `॥૧૫૮॥`
					// immediately after the shloka's own `॥૨॥`, and Sarvam, reading a Devanagari
					// line, returns the pair flattened into `॥२॥१५८॥` — both numbers in Devanagari,
					// the passage's own among them.
					//
					// Two conditions together, because either alone is too weak. **Adjacency**: the
					// number directly abuts another danda group, sharing its danda or separated only
					// by spaces — the flattening this is about, and what a lone marker never has.
					// **Continuation**: it is exactly one past the last passage closed, which a
					// quotation's own ordinal is not, those being small numbers that restart inside
					// every shloka.
					//
					// The pair is the whole of the evidence. Across the first real book's 442 pages
					// this shape occurs six times and all six are this fault; its 22 lone Devanagari
					// markers are all genuine shloka markers and stay refused, exactly as before.
					const abuts =
						refusedEnd !== null && block.text.slice(refusedEnd, match.index).trim() === "";
					if (abuts && previousNumber !== null && parsed.value === previousNumber + 1) {
						// Written back in the book's own digits, because that is what the page prints
						// and what the reader must render. Flagged, because it is a repair a human
						// should confirm against the page rather than a reading to be trusted.
						number = {
							value: parsed.value,
							script,
							text: formatIndicNumber(parsed.value, script),
						};
						recovered = true;
					}
				}
				if (number === null || number.script !== script) {
					// Resume one character in rather than past the whole match, because two of these
					// groups can share a danda — so consuming the whole rejected match would take the
					// danda the real number needs.
					refusedEnd = match.index + (match[0] as string).length;
					VERSE_TERMINATOR.lastIndex = match.index + 1;
					continue;
				}
				refusedEnd = null;
				// The danda stays with the text and the number does not, which is how P0.2's own
				// fixtures are written: `ધિયો યો નઃ પ્રચોદયાત્ ॥` with `number: "૪"` beside it.
				// Keeping the number in both places would render it twice and, worse, fold it
				// into the verse hash — so correcting a misread number would silently invalidate
				// every annotation keyed to the passage.
				const before = block.text.slice(cursor, match.index);
				const opening = match[1] as string;
				if (before.trim() !== "" || pending.length > 0) {
					pending.push({ text: `${before}${opening}`.trim(), ref, quotation });
				}
				pushVerse(number, recovered);
				cursor = match.index + match[0].length;
			}

			const rest = block.text.slice(cursor).trim();
			if (rest !== "") {
				pending.push({ text: rest, ref, quotation });
			}
		}
	}

	closeSection(null);

	const titled = titleFromRunningHeads(sections, headsByPage);

	return {
		sections: titled,
		// Keyed by the id `package.ts` will give the division, so the studio's live recomputation
		// and this snapshot name the same things.
		sequence: checkVerseSequence(
			titled.map((section, index) => ({
				id: `section-${index + 1}`,
				numbers: section.verses.map((verse) => verse.number?.value ?? null),
			})),
		),
		numbering: readNumbering(folios),
		notes,
		setAside,
	};
}

/**
 * Give an untitled division the title printed across its own pages.
 *
 * A division only reaches here untitled when the edition gave the OCR nothing to tag — text
 * before the first heading, or a heading refused for being a quotation. The head is still
 * printed on every page of it, so the title is on the page rather than inferred: this book sets
 * the book's name on one side of the spread and the division's on the other, which is ordinary
 * for a printed book and is why the book's own name has to be excluded before tallying.
 *
 * A tie leaves the division untitled. Two heads appearing equally often over one division is
 * evidence that it is really two, and answering that with a coin toss would put a title on a
 * division a human has not yet agreed exists.
 */
function titleFromRunningHeads(
	sections: readonly SegmentedSection[],
	headsByPage: ReadonlyMap<number, readonly string[]>,
): SegmentedSection[] {
	const bookWide = new Map<string, number>();
	for (const heads of headsByPage.values()) {
		for (const head of heads) {
			bookWide.set(head, (bookWide.get(head) ?? 0) + 1);
		}
	}
	let bookTitle: string | null = null;
	let most = 0;
	for (const [head, count] of bookWide) {
		if (count > most) {
			bookTitle = head;
			most = count;
		}
	}

	return sections.map((section) => {
		if (section.title !== null) {
			return section;
		}
		const tally = new Map<string, number>();
		for (const verse of section.verses) {
			for (const page of verse.pages) {
				for (const head of headsByPage.get(page) ?? []) {
					if (head !== bookTitle) {
						tally.set(head, (tally.get(head) ?? 0) + 1);
					}
				}
			}
		}
		const ranked = [...tally].sort((a, b) => b[1] - a[1]);
		const winner = ranked[0];
		const runnerUp = ranked[1];
		if (winner === undefined || (runnerUp !== undefined && runnerUp[1] === winner[1])) {
			return section;
		}
		return { ...section, title: winner[0], titleSource: "running-head" };
	});
}
