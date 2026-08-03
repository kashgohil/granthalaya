/**
 * The verse-number checksum (P1.2/P1.3).
 *
 * A passage the OCR dropped leaves no other trace: the text reads on, the page count is
 * unchanged, orthography is clean. Only the numbering knows. So the printed numbers are the
 * one checksum this stage of the pipeline has, and every gap, repeat and jump is reported.
 *
 * It lives here rather than in the pipeline because two surfaces have to agree on it. The
 * pipeline computes it at assembly — what the machine found — and the studio recomputes it from
 * the current rows — what is true now — and shows the two side by side. Two implementations of
 * one rule would eventually disagree, and a disagreement the studio cannot explain is worse than
 * no checksum at all.
 *
 * ## Runs, and why the checksum is not one sequence
 *
 * A book need not number itself continuously from cover to cover. The first real book numbers
 * its વાતો 1–569 straight through thirty-one divisions, and then an appendix — the works
 * gathered under `ધ્યાનના શ્લોકો` — starts again at 1. Read as one sequence that appendix is a
 * pile of duplicate and out-of-order numbers, which is a report about the checksum rather than
 * about the book.
 *
 * So numbers are grouped into **runs**, and the rule is the divisions themselves: a division
 * whose first number continues the previous run extends it, and one that does not begins a new
 * one. No threshold, no guess about how far back a number has to jump to count as a restart —
 * just whether the edition kept counting. Faults are then found *within* a run, where they mean
 * something, and each restart is reported as its own line of evidence so a human can confirm the
 * edition really does start over there rather than the number having been misread.
 */

/** One division's printed numbers, in reading order. `null` for a passage that printed none. */
export type DivisionNumbers = {
	/** The division's own id — what both callers key on, so their reports can be compared. */
	readonly id: string;
	readonly numbers: readonly (number | null)[];
};

/** One stretch over which the edition counted continuously. */
export type SequenceRun = {
	/** Id of the division this run starts in. */
	readonly division: string;
	readonly first: number;
	readonly last: number;
	/** How many numbered passages fell in it. */
	readonly numbered: number;
	/** Numbers absent from `first`–`last`. Each one is a passage that may have been dropped. */
	readonly missing: readonly number[];
	/** Numbers that appeared more than once inside this run. */
	readonly duplicates: readonly number[];
	/** Numbers that did not follow the one before them. */
	readonly outOfOrder: readonly number[];
};

export type SequenceReport = {
	readonly runs: readonly SequenceRun[];
	readonly numbered: number;
	/** Passages that printed no number — counted, never treated as a gap. */
	readonly unnumbered: number;
	/** Every run's `missing`, in order. The union a report or a progress meter wants. */
	readonly missing: readonly number[];
	readonly duplicates: readonly number[];
	readonly outOfOrder: readonly number[];
	/**
	 * Where the edition started counting again — the first number of each run after the first.
	 * Evidence, not a fault: in this edition they are real, and a misread number looks the same.
	 */
	readonly restarts: readonly { readonly division: string; readonly at: number }[];
};

/**
 * Check the printed numbers of a book, division by division.
 *
 * Takes numbers already parsed — `null` for a passage that printed none. Parsing belongs to the
 * caller because the two callers hold different things: the pipeline has `ParsedNumber`s from
 * the page, the studio has whatever a human last typed.
 *
 * A run names its division by **id**, never by position. The two callers do not agree on
 * position — the pipeline counts sections it later drops for being empty, the studio only ever
 * sees the ones that survived — so an index would make the same book's two reports disagree in
 * the one field a reader would use to go and look.
 */
export function checkVerseSequence(divisions: readonly DivisionNumbers[]): SequenceReport {
	let unnumbered = 0;
	const runs: MutableRun[] = [];

	for (const division of divisions) {
		for (const value of division.numbers) {
			if (value === null) {
				unnumbered += 1;
				continue;
			}
			// A run continues while the edition keeps counting. The test is against the last
			// number seen rather than the run's maximum, so a division that picks up exactly where
			// the previous one stopped extends it — which is how the body of a book is numbered —
			// while one that starts over opens a new run.
			const current = runs[runs.length - 1];
			if (current === undefined || value !== current.previous + 1) {
				// Two conditions, and both are needed.
				//
				// *At a division boundary*, because inside a division a number that does not follow
				// its predecessor is a fault in that run rather than a new sequence — otherwise one
				// misread digit would silently split the book and hide every gap after it.
				//
				// *Counting backwards*, because that is what starting again means. A number that
				// jumps forward at a boundary is a gap — the passages between are missing, quite
				// possibly dropped by the OCR — and treating that as a restart would swallow the
				// one signal this checksum exists to give. A book whose appendix is numbered
				// higher than its body would be over-reported here, which is the safe direction.
				const boundary = current === undefined || current.division !== division.id;
				if (boundary && (current === undefined || value <= current.previous)) {
					runs.push({
						division: division.id,
						values: [value],
						seen: new Set([value]),
						duplicates: [],
						outOfOrder: [],
						previous: value,
					});
					continue;
				}
				(current as MutableRun).outOfOrder.push(value);
			}

			const run = runs[runs.length - 1] as MutableRun;
			if (run.seen.has(value)) {
				run.duplicates.push(value);
			}
			run.seen.add(value);
			run.values.push(value);
			run.previous = value;
		}
	}

	const finished = runs.map((run) => finish(run));
	return {
		runs: finished,
		numbered: finished.reduce((total, run) => total + run.numbered, 0),
		unnumbered,
		missing: finished.flatMap((run) => [...run.missing]),
		duplicates: finished.flatMap((run) => [...run.duplicates]),
		outOfOrder: finished.flatMap((run) => [...run.outOfOrder]),
		restarts: finished.slice(1).map((run) => ({ division: run.division, at: run.first })),
	};
}

type MutableRun = {
	division: string;
	values: number[];
	seen: Set<number>;
	duplicates: number[];
	outOfOrder: number[];
	previous: number;
};

function finish(run: MutableRun): SequenceRun {
	const first = Math.min(...run.values);
	const last = Math.max(...run.values);
	const missing: number[] = [];
	for (let value = first; value <= last; value += 1) {
		if (!run.seen.has(value)) {
			missing.push(value);
		}
	}
	return {
		division: run.division,
		first,
		last,
		numbered: run.values.length,
		missing,
		// Deduplicated: a number that repeats is reported once here and again under `duplicates`,
		// and listing it twice in one line reads as two separate faults.
		duplicates: [...new Set(run.duplicates)],
		outOfOrder: [...new Set(run.outOfOrder)],
	};
}
