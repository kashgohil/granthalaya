import { expect, test } from "bun:test";
import { sampleProse } from "../fixtures.ts";
import { auditRelease, diffReleases } from "./audit.ts";
import { hashVerse } from "./hash.ts";
import type { Book, BookDivision, BookUnit, BookVerse } from "./schema.ts";
import { validateBook } from "./validate.ts";

const CHAPTER = "sample-prose/khand-1/3";

function mutable(book: Book): Book {
	return structuredClone(book);
}

/** The chapter holding the prose fixture's leaves, as something a test can splice. */
function chapterOf(book: Book): BookDivision {
	const section = book.structure[0] as BookDivision;
	return section.children[0] as BookDivision;
}

function verseOf(book: Book, id: string): BookVerse {
	const found = chapterOf(book).children.find((unit) => unit.id === id);
	if (found === undefined || found.kind !== "verse") throw new Error(`no verse ${id}`);
	return found;
}

function codes(previous: Book, candidate: Book): string[] {
	return auditRelease(previous, candidate).issues.map((issue) => issue.code);
}

/** A published package and the candidate that would replace it, at a chosen version. */
function candidate(version: string): Book {
	const book = mutable(sampleProse);
	return { ...book, contentVersion: version };
}

test("a text correction shipped as a patch passes clean", () => {
	const next = candidate("1.1.1");
	const verse = verseOf(next, "p3");
	verse.layers.gu = "તેથી લખાણ સુધારવામાં આવે તોપણ વાચકનું કામ ટકી રહે છે ॥";
	verse.hash = hashVerse(verse.layers);

	const audit = auditRelease(sampleProse, next);
	expect(audit.ok).toBe(true);
	expect(audit.issues).toEqual([]);
	expect(audit.diff.versesChanged).toEqual([`${CHAPTER}#p3`]);
	expect(audit.diff.requiredBump).toBe("patch");
	expect(audit.diff.bump).toBe("patch");
});

test("a verse ref that disappears without an alias is refused", () => {
	const next = candidate("2.0.0");
	const chapter = chapterOf(next);
	chapter.children = chapter.children.filter((unit) => unit.id !== "p3");

	const audit = auditRelease(sampleProse, next);
	expect(audit.ok).toBe(false);
	expect(audit.issues.map((issue) => issue.code)).toContain("release-ref-dropped");
	expect(audit.issues.find((issue) => issue.code === "release-ref-dropped")?.path).toBe(
		`${CHAPTER}#p3`,
	);
	expect(audit.diff.refsDropped).toEqual([`${CHAPTER}#p3`]);
});

test("the same deletion, aliased to where the text was, is allowed", () => {
	const next = candidate("2.0.0");
	const chapter = chapterOf(next);
	chapter.children = chapter.children.filter((unit) => unit.id !== "p3");
	next.aliases = { ...next.aliases, [`${CHAPTER}#p3`]: CHAPTER };

	const audit = auditRelease(sampleProse, next);
	expect(audit.ok).toBe(true);
	expect(audit.issues).toEqual([]);
	expect(audit.diff.refsAliased).toEqual([`${CHAPTER}#p3`]);
	// And the package it produced is still a valid package on its own terms.
	expect(validateBook(next).ok).toBe(true);
});

test("a retirement shipped as a patch is a warning, not a refusal", () => {
	const next = candidate("1.1.1");
	const chapter = chapterOf(next);
	chapter.children = chapter.children.filter((unit) => unit.id !== "p3");
	next.aliases = { ...next.aliases, [`${CHAPTER}#p3`]: CHAPTER };

	const audit = auditRelease(sampleProse, next);
	expect(audit.ok).toBe(true);
	const understated = audit.issues.find(
		(issue) => issue.code === "release-bump-understates-change",
	);
	expect(understated?.severity).toBe("warning");
	expect(understated?.message).toContain("major change");
	expect(audit.diff.requiredBump).toBe("major");
	expect(audit.diff.bump).toBe("patch");
});

test("added material wants a minor bump", () => {
	const added = (version: string): Book => {
		const next = candidate(version);
		const layers = { gu: "એક નવો ફકરો.", en: "A new paragraph." };
		chapterOf(next).children.push({
			kind: "verse",
			id: "p4",
			form: "prose",
			layers,
			hash: hashVerse(layers),
		} satisfies BookVerse);
		return next;
	};

	expect(diffReleases(sampleProse, added("1.2.0")).versesAdded).toEqual([`${CHAPTER}#p4`]);
	expect(codes(sampleProse, added("1.2.0"))).toEqual([]);
	expect(codes(sampleProse, added("1.1.1"))).toEqual(["release-bump-understates-change"]);
});

test("an alias the published version carried must still be carried", () => {
	const next = candidate("1.1.1");
	// A client is not upgrading from 1.1.0 — it is upgrading from whatever it installed.
	next.aliases = { [`${CHAPTER}#p9`]: CHAPTER };

	const audit = auditRelease(sampleProse, next);
	expect(audit.ok).toBe(false);
	const forgotten = audit.issues.find((issue) => issue.code === "release-alias-forgotten");
	expect(forgotten?.path).toBe(`/aliases/${CHAPTER}#p0`);
});

test("republishing a version, or going backwards, is refused", () => {
	expect(codes(sampleProse, candidate("1.1.0"))).toEqual(["release-version-not-newer"]);
	expect(codes(sampleProse, candidate("1.0.9"))).toEqual(["release-version-not-newer"]);
});

test("a bump that changes nothing at all is worth saying out loud", () => {
	const audit = auditRelease(sampleProse, candidate("1.1.1"));
	expect(audit.ok).toBe(true);
	expect(audit.issues.map((issue) => issue.code)).toEqual(["release-content-unchanged"]);
	expect(audit.diff.requiredBump).toBeNull();
});

test("a package for a different book is not a new version of this one", () => {
	const next = { ...candidate("2.0.0"), id: "other-book" };
	expect(codes(sampleProse, next)).toEqual(["release-book-mismatch"]);
});

test("a verse that becomes a division keeps its ref, so nothing was retired", () => {
	const next = candidate("2.0.0");
	const chapter = chapterOf(next);
	const p3 = verseOf(next, "p3");
	const halves: BookUnit[] = ["a", "b"].map((suffix) => {
		const layers = { gu: `${p3.layers.gu as string} ${suffix}`, en: `${p3.layers.en} ${suffix}` };
		return { kind: "verse", id: `p3${suffix}`, form: "prose", layers, hash: hashVerse(layers) };
	});
	chapter.children = chapter.children.map((unit) =>
		unit.id === "p3"
			? ({ kind: "passage", id: "p3", children: halves } satisfies BookDivision)
			: unit,
	);
	// The old ref now names the container, which is exactly what the format's example alias does.
	next.aliases = { ...next.aliases, [`${CHAPTER}#p3`]: `${CHAPTER}/p3` };

	const audit = auditRelease(sampleProse, next);
	expect(audit.ok).toBe(true);
	expect(audit.diff.versesRetired).toEqual([`${CHAPTER}#p3`]);
	expect(audit.diff.divisionsAdded).toEqual([`${CHAPTER}/p3`]);
});

test("removing a declared layer is a retirement, whatever happens to the verses", () => {
	const next = candidate("1.1.1");
	next.layers = next.layers.filter((layer) => layer.id !== "en");
	for (const unit of chapterOf(next).children) {
		if (unit.kind === "verse") {
			delete unit.layers.en;
			unit.hash = hashVerse(unit.layers);
		}
	}

	const audit = auditRelease(sampleProse, next);
	expect(audit.diff.layersRemoved).toEqual(["en"]);
	expect(audit.diff.requiredBump).toBe("major");
	expect(audit.issues.map((issue) => issue.code)).toContain("release-bump-understates-change");
});
