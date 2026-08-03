/**
 * The cross-version audit (P1.5).
 *
 * `validateBook` sees one package in isolation, which is enough to prove it is well-formed and
 * nothing like enough to prove it is safe to hand out. The failure this file exists to prevent
 * has no symptom inside a single package: a republish that drops a verse ref orphans every
 * highlight, flashcard, SRS item and audio timestamp keyed to it, on every device that already
 * installed the version before — and the package that did it validates perfectly.
 *
 * So the audit is a *diff*, and it runs at publish time against the last published version:
 *
 * - **A verse ref that disappears without an alias is an error.** Rule 3 of the format's
 *   stability rules, enforced. `aliases` is how content that moved keeps pointing somewhere;
 *   a deletion aliases to the containing division — "the text you annotated is gone, here is
 *   where it was" — so there is always something to say, and silence is always a mistake.
 * - **An alias the previous version carried must still be carried.** Clients upgrade from
 *   whatever they have installed, not from the version before this one. Drop v1's map when
 *   publishing v3 and a device still on v1 has no path forward.
 * - **A bump that understates its change is a warning.** The version *is* the instruction to
 *   the client (`docs/book-format.md` §5), and a restructure shipped as a patch tells every
 *   reader there is nothing to migrate.
 *
 * Pure, and in `packages/core` rather than the API, because the same diff is what a client
 * needs to reason about an upgrade it is being offered.
 */
import { hashVerse } from "./hash.ts";
import { formatRef } from "./refs.ts";
import type { Book, BookVerse } from "./schema.ts";
import { isVerse } from "./schema.ts";
import { walkBook } from "./tree.ts";
import type { BookIssue } from "./validate.ts";
import { type BumpKind, bumpBetween, bumpRank } from "./version.ts";

/** What actually changed between two versions of a book, in refs. */
export type ReleaseDiff = {
	/** Verse refs the candidate has and the previous version did not. */
	readonly versesAdded: readonly string[];
	/** Verse refs the previous version had and the candidate does not — under any kind. */
	readonly versesRetired: readonly string[];
	/** Refs present in both whose text hash differs. A correction. */
	readonly versesChanged: readonly string[];
	readonly divisionsAdded: readonly string[];
	readonly divisionsRetired: readonly string[];
	readonly layersAdded: readonly string[];
	readonly layersRemoved: readonly string[];
	/** Retired refs the candidate maps somewhere through `aliases`. */
	readonly refsAliased: readonly string[];
	/** Retired refs it does not. The list that blocks a publish. */
	readonly refsDropped: readonly string[];
	/** The smallest bump this change is allowed to ship as; `null` when nothing changed. */
	readonly requiredBump: BumpKind | null;
	/** The bump the candidate actually claims; `null` when it is not an increase at all. */
	readonly bump: BumpKind | null;
};

export type ReleaseAudit = {
	/** True when there are no `error`-severity issues. Warnings do not block a publish. */
	readonly ok: boolean;
	readonly issues: readonly BookIssue[];
	readonly diff: ReleaseDiff;
};

function error(code: string, path: string, message: string): BookIssue {
	return { severity: "error", code, path, message };
}

function warning(code: string, path: string, message: string): BookIssue {
	return { severity: "warning", code, path, message };
}

type Units = {
	/** Every ref the book resolves, verse or division. What "still live" is measured against. */
	readonly live: Set<string>;
	readonly verses: Map<string, BookVerse>;
	readonly divisions: Set<string>;
};

function unitsOf(book: Book): Units {
	const live = new Set<string>();
	const verses = new Map<string, BookVerse>();
	const divisions = new Set<string>();

	for (const { unit, ref } of walkBook(book)) {
		const at = formatRef(ref);
		live.add(at);
		if (isVerse(unit)) {
			verses.set(at, unit);
		} else {
			divisions.add(at);
		}
	}
	return { live, verses, divisions };
}

/** A recorded hash is trusted only as far as `validateBook` already checked it. */
function contentHash(verse: BookVerse): string {
	return verse.hash ?? hashVerse(verse.layers);
}

/**
 * What changed, without judging it.
 *
 * Retirement is measured against *every* ref the candidate resolves rather than against its
 * verses alone, because a division ref is as linkable as a verse ref — a deep link into a
 * chapter is user data too, and a chapter that quietly stops resolving breaks it.
 */
export function diffReleases(previous: Book, candidate: Book): ReleaseDiff {
	const before = unitsOf(previous);
	const after = unitsOf(candidate);
	const aliases = candidate.aliases ?? {};

	const versesAdded = [...after.verses.keys()].filter((ref) => !before.live.has(ref));
	const versesRetired = [...before.verses.keys()].filter((ref) => !after.live.has(ref));
	const divisionsAdded = [...after.divisions].filter((ref) => !before.live.has(ref));
	const divisionsRetired = [...before.divisions].filter((ref) => !after.live.has(ref));

	const versesChanged: string[] = [];
	for (const [ref, verse] of before.verses) {
		const now = after.verses.get(ref);
		if (now !== undefined && contentHash(now) !== contentHash(verse)) {
			versesChanged.push(ref);
		}
	}

	const declaredBefore = new Set(previous.layers.map((layer) => layer.id));
	const declaredAfter = new Set(candidate.layers.map((layer) => layer.id));
	const layersAdded = [...declaredAfter].filter((id) => !declaredBefore.has(id));
	const layersRemoved = [...declaredBefore].filter((id) => !declaredAfter.has(id));

	const retired = [...versesRetired, ...divisionsRetired];
	const refsAliased = retired.filter((ref) => aliases[ref] !== undefined);
	const refsDropped = retired.filter((ref) => aliases[ref] === undefined);

	return {
		versesAdded,
		versesRetired,
		versesChanged,
		divisionsAdded,
		divisionsRetired,
		layersAdded,
		layersRemoved,
		refsAliased,
		refsDropped,
		requiredBump: requiredBumpFor({
			retired: retired.length,
			added: versesAdded.length + divisionsAdded.length + layersAdded.length,
			changed: versesChanged.length,
			layersRemoved: layersRemoved.length,
		}),
		bump: bumpBetween(previous.contentVersion, candidate.contentVersion),
	};
}

/**
 * The smallest bump a change may ship as, straight off the format's own table.
 *
 * Removing a *layer* is a retirement too — a translation that disappears takes every reader
 * setting and every quiz built on it with it — so it counts as major rather than as content
 * merely not being added.
 */
function requiredBumpFor(counts: {
	retired: number;
	added: number;
	changed: number;
	layersRemoved: number;
}): BumpKind | null {
	if (counts.retired > 0 || counts.layersRemoved > 0) return "major";
	if (counts.added > 0) return "minor";
	if (counts.changed > 0) return "patch";
	return null;
}

function list(refs: readonly string[], limit = 5): string {
	const shown = refs.slice(0, limit).join(", ");
	return refs.length > limit ? `${shown} (+${refs.length - limit} more)` : shown;
}

/**
 * Audit a candidate package against the last published one.
 *
 * Assumes both sides already pass `validateBook` — this checks what a second package makes
 * visible, and repeating the single-package checks here would give them a second definition to
 * drift from. In particular an alias whose *target* does not resolve is `validateBook`'s
 * `alias-target-missing`, not a finding of this file.
 */
export function auditRelease(previous: Book, candidate: Book): ReleaseAudit {
	const diff = diffReleases(previous, candidate);
	const issues: BookIssue[] = [];

	if (previous.id !== candidate.id) {
		return {
			ok: false,
			issues: [
				error(
					"release-book-mismatch",
					"/id",
					`this package is "${candidate.id}" but the published version it would replace is "${previous.id}" — refs from one book do not address the other`,
				),
			],
			diff,
		};
	}

	if (diff.bump === null) {
		issues.push(
			error(
				"release-version-not-newer",
				"/contentVersion",
				`${candidate.contentVersion} is not greater than the published ${previous.contentVersion}. A version is written once; a correction is a new version, never an edit to one already handed out`,
			),
		);
	} else if (diff.requiredBump === null) {
		issues.push(
			warning(
				"release-content-unchanged",
				"/contentVersion",
				`nothing changed since ${previous.contentVersion} — same structure, same text. Publishing this asks every client to download a copy of what it has`,
			),
		);
	} else if (bumpRank(diff.bump) < bumpRank(diff.requiredBump)) {
		issues.push(
			warning(
				"release-bump-understates-change",
				"/contentVersion",
				`${previous.contentVersion} → ${candidate.contentVersion} is a ${diff.bump} bump, but this changes ${describeChange(diff)}, which is a ${diff.requiredBump} change. The version is what tells a client whether to migrate its annotations`,
			),
		);
	}

	for (const ref of diff.refsDropped) {
		issues.push(
			error(
				"release-ref-dropped",
				ref,
				"was published in the previous version and no longer resolves, with no entry in aliases. Every highlight, flashcard and SRS item keyed to it would be orphaned — alias it to whatever inherits the text, or to its containing division if the text is gone",
			),
		);
	}

	for (const [source] of Object.entries(previous.aliases ?? {})) {
		if (candidate.aliases?.[source] === undefined) {
			issues.push(
				error(
					"release-alias-forgotten",
					`/aliases/${source}`,
					`${previous.contentVersion} carried this alias and this package does not. A client upgrades from whatever it has installed, not from the version before this one, so the map has to accumulate`,
				),
			);
		}
	}

	return { ok: !issues.some((issue) => issue.severity === "error"), issues, diff };
}

function describeChange(diff: ReleaseDiff): string {
	const parts: string[] = [];
	if (diff.versesRetired.length > 0) {
		parts.push(`${diff.versesRetired.length} retired verse refs (${list(diff.versesRetired)})`);
	}
	if (diff.divisionsRetired.length > 0) {
		parts.push(`${diff.divisionsRetired.length} retired divisions`);
	}
	if (diff.layersRemoved.length > 0) {
		parts.push(`removes the ${list(diff.layersRemoved)} layer`);
	}
	if (diff.versesAdded.length > 0) {
		parts.push(`${diff.versesAdded.length} new verses`);
	}
	if (diff.divisionsAdded.length > 0) {
		parts.push(`${diff.divisionsAdded.length} new divisions`);
	}
	if (diff.layersAdded.length > 0) {
		parts.push(`adds the ${list(diff.layersAdded)} layer`);
	}
	if (diff.versesChanged.length > 0) {
		parts.push(`${diff.versesChanged.length} corrected verses`);
	}
	return parts.length === 0 ? "nothing" : parts.join(", ");
}
