/**
 * Carrying user data across a version upgrade (P1.5).
 *
 * A highlight, a flashcard, an SRS item and an audio bookmark are all just a ref plus something
 * the reader made. When a book is upgraded, every one of those refs has to be re-pointed at the
 * new package — and the format's whole stability apparatus exists so that this is a lookup
 * rather than a guess: a ref that still resolves is untouched, a ref that moved is found in
 * `aliases`, and a ref that is neither is **orphaned and said so**.
 *
 * That last one is the point. Dropping an unresolvable ref is a silent deletion of something a
 * person made, and it is indistinguishable from having never made it. The client's contract is
 * to keep the annotation, detach it, and show it — see `docs/distribution.md`.
 *
 * Pure and platform-free: the mobile installer runs this against SQLite rows, the studio runs
 * it to preview an upgrade, and both get the same answers.
 */
import { formatRef } from "./refs.ts";
import type { Book } from "./schema.ts";
import { walkBook } from "./tree.ts";

export type RefMigrationStatus =
	/** The ref resolves in the new version, unchanged. Nothing to do. */
	| "live"
	/** The ref was retired and `aliases` says where it went. Rewrite the key. */
	| "rewritten"
	/** Nothing resolves and nothing claims it. Keep the annotation, detach it, surface it. */
	| "orphaned";

export type RefMigration = {
	readonly from: string;
	/** Where it lives now, or `null` when nothing does. */
	readonly to: string | null;
	readonly status: RefMigrationStatus;
};

/** Every ref a book resolves — verses and divisions both, since either can be linked to. */
export function bookRefs(book: Book): Set<string> {
	const refs = new Set<string>([book.id]);
	for (const { ref } of walkBook(book)) {
		refs.add(formatRef(ref));
	}
	return refs;
}

/**
 * Aliases chain across versions: v2 retires `#p1` into `#p2`, v3 retires `#p2` into `#p3`, and a
 * client still on v1 arrives holding `#p1`. Following the map to a fixed point is what makes a
 * two-version-old install upgrade as correctly as a one-version-old one.
 *
 * Bounded and cycle-guarded rather than trusting the data: an alias loop in a published package
 * would otherwise hang the installer, which is a worse failure than an orphan.
 */
const MAX_ALIAS_HOPS = 16;

function resolveThroughAliases(
	live: ReadonlySet<string>,
	aliases: ReadonlyMap<string, string>,
	from: string,
): string | null {
	const seen = new Set<string>([from]);
	let current = from;

	for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) {
		const next = aliases.get(current);
		if (next === undefined) {
			return null;
		}
		if (live.has(next)) {
			return next;
		}
		if (seen.has(next)) {
			return null;
		}
		seen.add(next);
		current = next;
	}
	return null;
}

/**
 * Re-point a set of refs at a newly installed version.
 *
 * Takes the refs a client holds rather than the annotations themselves: the ref is the only part
 * of a highlight this layer knows about, and keeping the payload out means one function serves
 * highlights, SRS items and audio marks alike.
 */
export function migrateRefs(book: Book, refs: readonly string[]): RefMigration[] {
	const live = bookRefs(book);
	// A Map rather than the parsed object: the keys looked up here are refs a *client* is holding,
	// and a plain object answers `constructor` with something that is not an alias.
	const aliases = new Map(Object.entries(book.aliases ?? {}));

	return refs.map((from) => {
		if (live.has(from)) {
			return { from, to: from, status: "live" as const };
		}
		const to = resolveThroughAliases(live, aliases, from);
		return to === null
			? { from, to: null, status: "orphaned" as const }
			: { from, to, status: "rewritten" as const };
	});
}

/** One ref. Prefer `migrateRefs` when migrating an install — it indexes the book once. */
export function migrateRef(book: Book, ref: string): RefMigration {
	return migrateRefs(book, [ref])[0] as RefMigration;
}

/** What an upgrade did, for the line a client shows after installing a new version. */
export type MigrationSummary = {
	readonly live: number;
	readonly rewritten: number;
	readonly orphaned: readonly string[];
};

export function summarizeMigration(migrations: readonly RefMigration[]): MigrationSummary {
	return {
		live: migrations.filter((migration) => migration.status === "live").length,
		rewritten: migrations.filter((migration) => migration.status === "rewritten").length,
		orphaned: migrations
			.filter((migration) => migration.status === "orphaned")
			.map((migration) => migration.from),
	};
}
