/**
 * Turning a page of OCR into text a book package can hold.
 *
 * An OCR engine reads a *printed page*, and a printed page carries things that belong to the
 * typesetting rather than to the scripture: a line break every forty characters, a word split
 * across two of them by a hyphen, a superscript digit pointing at a footnote. None of that is
 * in the text — it is in the layout — and all of it would otherwise be published as scripture,
 * where it would corrupt search, hashing and akshara segmentation alike.
 *
 * The governing rule here is that **normalization must be a no-op on clean text**. Every
 * repair below fires only on something the writing system forbids or the typesetter demonstrably
 * inserted; none of them acts on a matter of taste. That is what makes it safe to run over 442
 * pages unattended, and it is checked directly against the real OCR of this project's first
 * book, which comes back byte-identical apart from the layout it should lose.
 *
 * The second rule is that **nothing is changed silently**. Every judgement the machine makes
 * about the text is reported, because a silent repair is indistinguishable from a misreading
 * that was already there, and P1.3's proofing pass has to be able to look at exactly the places
 * the machine touched.
 */
import type { Script } from "../book/schema.ts";
import { isConjoinableConsonant, isVirama } from "./akshara.ts";
import { digitScript, digitValue } from "./digits.ts";
import { isNukta } from "./orthography.ts";
import { scriptOf } from "./script.ts";

/**
 * The pre-base matras, `િ` and `ि` — written to the left of the consonant they follow.
 *
 * They are the only vowel signs whose *logical* order can disagree with their *visual* one, so
 * they are the only ones this module ever moves. See `orthography.ts`, which uses the same
 * asymmetry as its diagnostic for a broken PDF font mapping.
 */
const PRE_BASE_MATRA: Readonly<Partial<Record<Script, number>>> = {
	gujr: 0x0abf,
	deva: 0x093f,
};

/** Hyphens a typesetter breaks a word across a line with. */
const LINE_END_HYPHENS = new Set(["-", "­", "‐"]);

export type TextRepairKind =
	/** A word broken across two printed lines was put back together. */
	| "hyphen-join"
	/** A pre-base matra standing before its consonant was moved back after it. */
	| "pre-base-matra-order"
	/** A superscript digit pointing at a footnote was taken out of the word it sat on. */
	| "footnote-marker";

export type TextRepair = {
	readonly kind: TextRepairKind;
	/** Index into the *returned* text, so a caller can show a reader where this happened. */
	readonly at: number;
	/** What was there before. */
	readonly before: string;
	/** What it became — empty when the repair removed something. */
	readonly after: string;
	/** A few characters either side, for a report a human reads. */
	readonly context: string;
	/** For `footnote-marker`, the number the marker pointed at. */
	readonly marker?: number;
};

export type NormalizedText = {
	readonly text: string;
	/**
	 * Every judgement the machine made, individually. Line joins and whitespace are *not* here:
	 * they happen on nearly every line, so listing them would bury the three kinds of repair a
	 * human actually has to check.
	 */
	readonly repairs: readonly TextRepair[];
	/** Printed line breaks folded into flowing text. */
	readonly linesJoined: number;
	/** C0/C1 characters removed. The format rejects them, so the pipeline must strip them. */
	readonly controlsRemoved: number;
	/** Footnote markers found, in the order they appeared. */
	readonly footnoteMarkers: readonly number[];
	/** False when the text survived untouched — the expected outcome for clean, single-line text. */
	readonly changed: boolean;
};

export type NormalizeOptions = {
	/** The script the text is expected to be in. Decides which digits count as markers. */
	readonly script: Script;
	/**
	 * Fold the printed line breaks into flowing text. True for prose, whose line breaks are the
	 * typesetter's; false for verse, whose line breaks are the poet's.
	 */
	readonly joinLines?: boolean;
	/** Take inline superscript footnote digits out of the words they sit on. */
	readonly stripFootnoteMarkers?: boolean;
};

function isControl(point: number): boolean {
	return (point < 0x20 && point !== 0x0a) || (point >= 0x7f && point <= 0x9f);
}

/** Strip C0/C1 controls and normalize every run of horizontal whitespace to one space. */
function cleanCharacters(text: string): { text: string; controlsRemoved: number } {
	let out = "";
	let controlsRemoved = 0;
	let pendingSpace = false;

	for (const character of text) {
		const point = character.codePointAt(0) as number;
		if (isControl(point)) {
			controlsRemoved += 1;
			continue;
		}
		if (character === "\n") {
			pendingSpace = false;
			out += "\n";
			continue;
		}
		// Every space separator, including the no-break and zero-width ones a PDF may carry.
		if (/\s/u.test(character)) {
			pendingSpace = out !== "" && !out.endsWith("\n");
			continue;
		}
		if (pendingSpace) {
			out += " ";
			pendingSpace = false;
		}
		out += character;
	}

	return { text: out, controlsRemoved };
}

type JoinResult = {
	text: string;
	linesJoined: number;
	/** Code-point indices into `text` where a word was put back together. */
	hyphenJoins: { at: number; before: string }[];
};

/**
 * Fold printed lines into paragraphs.
 *
 * A blank line is a real break and survives as a newline; a single line break is the
 * typesetter's and becomes a space. A line ending in a hyphen is a word cut in half, so the
 * hyphen goes and the halves close up — the one join that can be wrong (a genuine compound may
 * also break at its hyphen), which is why each one is reported individually.
 */
function joinPrintedLines(text: string, join: boolean): JoinResult {
	const hyphenJoins: { at: number; before: string }[] = [];
	let linesJoined = 0;
	// Built as code points throughout, so the indices recorded here mean the same thing as the
	// ones the repair pass reports. Empty paragraphs are dropped rather than emitted as a
	// leading newline that the final trim would silently shift every index past.
	const out: string[] = [];

	const paragraphs = text
		.split(/\n\s*\n/)
		.map((paragraph) =>
			paragraph
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line !== ""),
		)
		.filter((lines) => lines.length > 0);

	for (const [index, lines] of paragraphs.entries()) {
		if (index > 0) {
			out.push("\n");
		}
		for (const [lineIndex, line] of lines.entries()) {
			if (lineIndex === 0) {
				out.push(...line);
				continue;
			}
			const hyphen = out.at(-1) ?? "";
			if (join && LINE_END_HYPHENS.has(hyphen)) {
				out.pop();
				hyphenJoins.push({ at: out.length, before: hyphen });
			} else {
				out.push(join ? " " : "\n");
			}
			out.push(...line);
			linesJoined += 1;
		}
	}

	return { text: out.join(""), linesJoined, hyphenJoins };
}

/** A few characters either side of `index`, counted in code points like every index here. */
function contextAround(points: readonly number[], index: number): string {
	return String.fromCodePoint(
		...points.slice(Math.max(0, index - 8), Math.min(points.length, index + 8)),
	);
}

/**
 * The length of the akshara starting at `index`: a consonant, any nukta, and every
 * virama-joined consonant after it. A pre-base matra belongs after the whole cluster, not
 * after its first consonant — `િ` + `સ્થ` is `સ્થિ`, never `સિ્થ`.
 */
function aksharaLengthAt(points: readonly number[], index: number): number {
	if (!isConjoinableConsonant(points[index] as number)) {
		return 0;
	}
	let at = index + 1;
	if (at < points.length && isNukta(points[at] as number)) {
		at += 1;
	}
	while (
		at + 1 < points.length &&
		isVirama(points[at] as number) &&
		isConjoinableConsonant(points[at + 1] as number)
	) {
		at += 2;
		if (at < points.length && isNukta(points[at] as number)) {
			at += 1;
		}
	}
	return at - index;
}

/**
 * Normalize a run of OCR'd text into something a book package can hold.
 *
 * Runs NFC first — the roadmap's requirement and the format's assumption — then strips what the
 * schema forbids, folds the printed layout away, and repairs the two things a printed page
 * leaves behind that no reader would ever type: a matra on the wrong side of its consonant, and
 * a footnote's superscript welded onto a word.
 */
export function normalizeScriptureText(input: string, options: NormalizeOptions): NormalizedText {
	const { script, joinLines = true, stripFootnoteMarkers = true } = options;

	const cleaned = cleanCharacters(input.normalize("NFC"));
	const joined = joinPrintedLines(cleaned.text, joinLines);

	const points = [...joined.text].map((character) => character.codePointAt(0) as number);
	const preBase = PRE_BASE_MATRA[script];
	const repairs: TextRepair[] = [];
	const footnoteMarkers: number[] = [];
	const pendingHyphens = [...joined.hyphenJoins].sort((a, b) => a.at - b.at);
	let nextHyphen = 0;

	// One pass builds the final text, so every index reported below is an index into *it*. The
	// hyphen joins found earlier are remapped here for the same reason.
	const out: string[] = [];
	let length = 0;
	const emit = (text: string): void => {
		out.push(text);
		length += [...text].length;
	};

	for (let index = 0; index < points.length; ) {
		while (
			nextHyphen < pendingHyphens.length &&
			(pendingHyphens[nextHyphen] as { at: number }).at <= index
		) {
			const hyphen = pendingHyphens[nextHyphen] as { at: number; before: string };
			repairs.push({
				kind: "hyphen-join",
				at: length,
				before: hyphen.before,
				after: "",
				context: "",
			});
			nextHyphen += 1;
		}

		const point = points[index] as number;

		// A pre-base matra with no consonant behind it, and one in front: visual order leaked
		// through. Move it after the whole akshara. Anything else is left exactly as it is.
		if (preBase !== undefined && point === preBase) {
			const previous = index > 0 ? (points[index - 1] as number) : null;
			const hasBase =
				previous !== null &&
				(isConjoinableConsonant(previous) ||
					(isNukta(previous) && index > 1 && isConjoinableConsonant(points[index - 2] as number)));
			const clusterLength = aksharaLengthAt(points, index + 1);
			if (!hasBase && clusterLength > 0) {
				const cluster = String.fromCodePoint(...points.slice(index + 1, index + 1 + clusterLength));
				const matra = String.fromCodePoint(point);
				repairs.push({
					kind: "pre-base-matra-order",
					at: length,
					before: matra + cluster,
					after: cluster + matra,
					context: contextAround(points, index),
				});
				emit(cluster + matra);
				index += 1 + clusterLength;
				continue;
			}
		}

		// A footnote's superscript, welded onto the word it annotates: `આવરણ૧`, `છે.૧`. Gujarati
		// words do not contain digits, so a digit with a letter tight against it and no space is
		// the typesetter's, not the text's.
		const digit = digitValue(point);
		if (stripFootnoteMarkers && digit !== null && digitScript(point) === script) {
			const previous = index > 0 ? (points[index - 1] as number) : null;
			// Indic digits live inside their script's own Unicode block, so `scriptOf` calls them
			// Gujarati too. Without this the second digit of `॥૬૧॥` looks like a marker welded
			// onto the first, and every verse number in the book loses a digit.
			const attached =
				previous !== null &&
				digitValue(previous) === null &&
				(scriptOf(previous) === script ||
					// A marker after a sentence's full stop: the stop's own base must be the script.
					(previous === 0x2e && index > 1 && scriptOf(points[index - 2] as number) === script));

			let end = index;
			while (end < points.length && digitValue(points[end] as number) !== null) {
				end += 1;
			}
			const width = end - index;
			// One or two digits. A longer run is a year or a quantity, not a marker.
			if (attached && width <= 2) {
				const text = String.fromCodePoint(...points.slice(index, end));
				const value = Number.parseInt(
					[...text].map((c) => digitValue(c.codePointAt(0) as number)).join(""),
					10,
				);
				repairs.push({
					kind: "footnote-marker",
					at: length,
					before: text,
					after: "",
					context: contextAround(points, index),
					marker: value,
				});
				footnoteMarkers.push(value);
				index = end;
				continue;
			}
		}

		emit(String.fromCodePoint(point));
		index += 1;
	}

	// `cleanCharacters` collapses leading whitespace and `joinPrintedLines` drops empty
	// paragraphs, so there is nothing left at the front for a trim to remove — every index
	// recorded above still points where it did. The trim is here for the trailing case only.
	const text = out.join("").trimEnd();
	const finalPoints = [...text].map((character) => character.codePointAt(0) as number);

	return {
		text,
		// A hyphen join is the one repair whose context only exists once the word is whole again.
		repairs: repairs.map((repair) =>
			repair.kind === "hyphen-join"
				? { ...repair, context: contextAround(finalPoints, repair.at) }
				: repair,
		),
		linesJoined: joined.linesJoined,
		controlsRemoved: cleaned.controlsRemoved,
		footnoteMarkers,
		changed: text !== input,
	};
}
