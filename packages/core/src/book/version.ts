/**
 * Content versions — comparing them, and reading what a bump claims.
 *
 * `contentVersion` is semver, and in this format each field is a *promise to a client* rather
 * than a release-engineering habit (`docs/book-format.md` §5): **major** means IDs were retired
 * and local user data has to be migrated through `aliases`, **minor** means material was added,
 * **patch** means text inside existing verses was corrected. A version that understates what
 * changed is how a highlight quietly ends up on the wrong words, so P1.5's publish audit
 * compares the bump a package claims against the change it actually makes.
 *
 * Kept separate from the schema because ordering is the part that matters here: the catalog's
 * "latest" is the greatest version, and `1.10.0` is greater than `1.9.0` in exactly the way
 * string comparison says it isn't.
 */

export type Semver = {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
};

/** Which field a change is allowed to move. Ordered by how much it obliges a client to do. */
export type BumpKind = "major" | "minor" | "patch";

const BUMP_RANK: Record<BumpKind, number> = { patch: 1, minor: 2, major: 3 };

/** How much work a bump asks of a client. Only comparable within this scale. */
export function bumpRank(bump: BumpKind): number {
	return BUMP_RANK[bump];
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Parse a `MAJOR.MINOR.PATCH` string. `null` rather than a throw: versions arrive from a
 * database row and a JSON file, and "unreadable" is an answer a caller has to render.
 *
 * No pre-release or build metadata. A package is either published or it is not, and a
 * `1.0.0-rc.1` in the catalog would be a fourth content status hiding in a version string.
 */
export function parseSemver(text: string): Semver | null {
	const match = SEMVER_PATTERN.exec(text);
	if (match === null) {
		return null;
	}
	const [, major, minor, patch] = match;
	return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/** Numeric field-by-field comparison — the ordering `localeCompare` gets wrong at `1.10.0`. */
export function compareSemver(a: Semver, b: Semver): number {
	return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * Compare two version strings, for sorting releases.
 *
 * An unparseable version sorts below every parseable one and ties break on the raw string, so
 * a corrupt row cannot become "latest" and cannot make the sort unstable either.
 */
export function compareVersions(a: string, b: string): number {
	const left = parseSemver(a);
	const right = parseSemver(b);
	if (left === null || right === null) {
		if (left !== null) return 1;
		if (right !== null) return -1;
		return a < b ? -1 : a > b ? 1 : 0;
	}
	return compareSemver(left, right) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Which field a version moved, or `null` when `candidate` is not strictly greater than
 * `previous` — which includes republishing the same version, going backwards, and either side
 * being unparseable. All three are refusals at publish time rather than shades of "kind of".
 */
export function bumpBetween(previous: string, candidate: string): BumpKind | null {
	const from = parseSemver(previous);
	const to = parseSemver(candidate);
	if (from === null || to === null || compareSemver(to, from) <= 0) {
		return null;
	}
	if (to.major !== from.major) return "major";
	if (to.minor !== from.minor) return "minor";
	return "patch";
}
