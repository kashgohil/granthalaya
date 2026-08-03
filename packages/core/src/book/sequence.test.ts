import { expect, test } from "bun:test";
import { checkVerseSequence } from "./sequence.ts";

const d = (id: string, numbers: (number | null)[]) => ({ id, numbers });

test("a clean sequence across divisions is one run and reports nothing", () => {
	// How the body of the first real book is numbered: the divisions are sections of one
	// continuous count, so a section boundary is not a sequence boundary.
	const report = checkVerseSequence([d("a", [1, 2, 3]), d("b", [4, 5]), d("c", [6])]);
	expect(report.runs).toHaveLength(1);
	expect(report).toMatchObject({
		numbered: 6,
		unnumbered: 0,
		missing: [],
		duplicates: [],
		outOfOrder: [],
		restarts: [],
	});
});

test("gaps, repeats and jumps are found inside a run", () => {
	const report = checkVerseSequence([d("a", [1, 2, 4, 4])]);
	expect(report.missing).toEqual([3]);
	expect(report.duplicates).toEqual([4]);
	expect(report.outOfOrder).toEqual([4]);
});

test("a division that starts counting again opens a new run", () => {
	// The appendix — `ધ્યાનના શ્લોકો` — restarts at 1. Read as one sequence it is a pile of
	// duplicates that say nothing about the book.
	const report = checkVerseSequence([d("a", [1, 2, 3]), d("b", [1, 2])]);
	expect(report.runs).toHaveLength(2);
	expect(report.duplicates).toEqual([]);
	expect(report.outOfOrder).toEqual([]);
	expect(report.restarts).toEqual([{ division: "b", at: 1 }]);
});

test("a restart is still reported, because a misread number looks the same", () => {
	const report = checkVerseSequence([d("a", [5, 6]), d("b", [1])]);
	expect(report.restarts).toEqual([{ division: "b", at: 1 }]);
	// And it must not manufacture a gap of 2–4 out of two unrelated runs.
	expect(report.missing).toEqual([]);
});

test("a number that jumps forward at a division boundary is a gap, not a restart", () => {
	// Starting again means counting back. A forward jump is passages missing between — quite
	// possibly dropped by the OCR — and swallowing that as a restart would hide the one signal
	// this checksum exists to give.
	const report = checkVerseSequence([d("a", [61, 62, 63]), d("b", [65, 66])]);
	expect(report.runs).toHaveLength(1);
	expect(report.restarts).toEqual([]);
	expect(report.missing).toEqual([64]);
});

test("each run keeps its own range, so a gap in one is not hidden by the other", () => {
	const report = checkVerseSequence([d("a", [1, 2, 4]), d("b", [1, 3])]);
	expect(report.runs.map((run) => [run.first, run.last])).toEqual([
		[1, 4],
		[1, 3],
	]);
	expect(report.missing).toEqual([3, 2]);
});

test("only a division boundary may start a run", () => {
	// A single misread digit mid-division must stay a fault in that run. Letting it open a new
	// sequence would hide every gap after it — the opposite of what the checksum is for.
	const report = checkVerseSequence([d("a", [1, 2, 3, 1, 5])]);
	expect(report.runs).toHaveLength(1);
	expect(report.restarts).toEqual([]);
	expect(report.duplicates).toEqual([1]);
	expect(report.outOfOrder).toEqual([1, 5]);
	expect(report.missing).toEqual([4]);
});

test("unnumbered passages are counted, not treated as gaps", () => {
	const report = checkVerseSequence([d("a", [1, null, 2, null])]);
	expect(report).toMatchObject({ numbered: 2, unnumbered: 2, missing: [] });
});

test("a book with no printed numbers at all reports no runs", () => {
	const report = checkVerseSequence([d("a", [null]), d("b", [null])]);
	expect(report).toMatchObject({ runs: [], numbered: 0, unnumbered: 2 });
	expect(report.missing).toEqual([]);
});

test("no divisions at all is not an error", () => {
	expect(checkVerseSequence([])).toMatchObject({ runs: [], numbered: 0, unnumbered: 0 });
});
