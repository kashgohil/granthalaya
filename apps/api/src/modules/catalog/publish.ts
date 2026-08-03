/**
 * Publishing (P1.5) — the last gate before scripture leaves this machine.
 *
 * Export (P1.3) compiles the proofed rows into a package and writes it as `proofed`. Publishing
 * takes *that file*, unedited, and puts it in the catalog as `published`. Two steps rather than
 * one, deliberately: a proofed book can sit and be re-read before anybody installs it, and the
 * bytes that get published are the exact bytes somebody cleared rather than a fresh
 * re-derivation from rows that may have moved since.
 *
 * Like export, it refuses far more readily than it writes, and the refusals are the feature:
 *
 * - **Only a `proofed` package.** A draft is machine output nobody has read; a `published` one
 *   has already been handed out. Neither is a candidate.
 * - **It must validate.** P0.2's `validateBook`, on the file as read — a package a client could
 *   not parse must not reach a catalog.
 * - **A version is published once.** Not the row, not the file. Immutability is what makes
 *   `vachanamrut@1.0.0` mean the same text on a phone that installed it a year ago.
 * - **The cross-version audit.** `auditRelease` against the last published version. This is the
 *   check with no symptom inside a single package: a verse ref that disappears without an alias
 *   orphans every highlight, flashcard and SRS item keyed to it, on devices that already have
 *   the older version, and the package that did it validates perfectly.
 *
 * `contentStatus` is flipped to `published` here, which is the only difference between the two
 * files. It is a real difference — the catalog serves only `published` — so it is worth the
 * changed byte and the second hash that implies.
 */
import type { Book, ReleaseDiff } from "@granthalaya/core";
import { auditRelease, countVerses, parseBook, validateBook } from "@granthalaya/core";
import type { Db } from "@granthalaya/db";
import { releases } from "@granthalaya/db";
import {
	ContentError,
	proofedPackagePath,
	publishedPackagePath,
	resolveInContent,
} from "../studio/content.ts";
import { getBookRow } from "../studio/service.ts";
import { serializePackage, sha256Hex } from "./integrity.ts";
import { findRelease, latestRelease, packageUrl, readPackageBytes } from "./service.ts";

export type PublishRefusal = {
	readonly ok: false;
	readonly reasons: readonly string[];
	/** Present whenever the candidate could be read and compared — what a preview shows. */
	readonly diff?: ReleaseDiff;
};

export type PublishSuccess = {
	readonly ok: true;
	readonly bookId: string;
	readonly contentVersion: string;
	/** Relative to the content root. `null` on a dry run — nothing was written. */
	readonly file: string | null;
	readonly sha256: string;
	readonly bytes: number;
	readonly verses: number;
	readonly url: string;
	readonly warnings: readonly string[];
	readonly diff?: ReleaseDiff;
};

export type PublishResult = PublishRefusal | PublishSuccess;

export type PublishOptions = {
	/** Which exported version to publish. Defaults to the manifest's current `contentVersion`. */
	readonly contentVersion?: string;
	/** Run every check and report, writing nothing. What the studio's preview calls. */
	readonly dryRun?: boolean;
};

/** Read a package another step wrote, saying which file and why when it cannot be read. */
async function readPackageFile(path: string, relative: string): Promise<Book> {
	const file = Bun.file(path);
	if (!(await file.exists())) {
		throw new ContentError(
			`${relative} does not exist. Export that version from the studio first — publishing hands out the bytes that were proofed, it does not compile new ones.`,
		);
	}

	let json: unknown;
	try {
		json = await file.json();
	} catch {
		throw new ContentError(`${relative} is not valid JSON.`);
	}

	const parsed = validateBook(json);
	if (!parsed.ok || parsed.book === undefined) {
		const errors = parsed.issues
			.filter((issue) => issue.severity === "error")
			.slice(0, 5)
			.map((issue) => `${issue.path} ${issue.message}`.trim());
		throw new ContentError(`${relative} is not a valid package: ${errors.join("; ")}`);
	}
	return parsed.book;
}

function describe(issuePath: string, message: string): string {
	return issuePath.length === 0 ? message : `${issuePath} — ${message}`;
}

/**
 * Publish one version of one book.
 *
 * `null` when the studio has no such book: publishing needs the working copy for its package
 * directory, and a book nobody imported has no exported package to publish either.
 */
export async function publishBook(
	db: Db,
	contentDir: string,
	bookId: string,
	options: PublishOptions = {},
): Promise<PublishResult | null> {
	const book = await getBookRow(db, bookId);
	if (book === undefined) return null;

	const manifest = book.manifest as Omit<Book, "structure">;
	const contentVersion = options.contentVersion ?? manifest.contentVersion;
	const relative = publishedPackagePath(book.packageDir, bookId, contentVersion);
	const proofedRelative = proofedPackagePath(book.packageDir, bookId, contentVersion);

	let candidate: Book;
	try {
		candidate = await readPackageFile(
			resolveInContent(contentDir, proofedRelative),
			proofedRelative,
		);
	} catch (cause) {
		if (cause instanceof ContentError) {
			return { ok: false, reasons: [cause.message] };
		}
		throw cause;
	}

	const reasons: string[] = [];
	const warnings: string[] = [];

	if (candidate.id !== bookId) {
		reasons.push(`${proofedRelative} is a package for "${candidate.id}", not for "${bookId}".`);
	}
	if (candidate.contentVersion !== contentVersion) {
		reasons.push(
			`${proofedRelative} declares contentVersion ${candidate.contentVersion} but would be published as ${contentVersion}. The version is part of the package's identity, not a name it can be filed under.`,
		);
	}
	if (candidate.contentStatus !== "proofed") {
		reasons.push(
			`${proofedRelative} is "${candidate.contentStatus}". Only a proofed package can be published — a draft is machine output nobody has read.`,
		);
	}

	// Immutability, checked on both sides: the catalog's record, and the file on disk. Either one
	// existing means this version has already left the building.
	if ((await findRelease(db, bookId, contentVersion)) !== undefined) {
		reasons.push(
			`${bookId}@${contentVersion} is already published. A version is written once — a correction ships as a new contentVersion, never as an edit to one that has been handed out.`,
		);
	}
	const target = resolveInContent(contentDir, relative);
	if (await Bun.file(target).exists()) {
		reasons.push(`${relative} already exists, so this version has been published before.`);
	}

	let diff: ReleaseDiff | undefined;
	const previousRow = await latestRelease(db, bookId);
	if (previousRow !== undefined) {
		const previousBytes = await readPackageBytes(contentDir, previousRow);
		const previous = previousBytes.ok
			? parseBook(JSON.parse(new TextDecoder().decode(previousBytes.data))).book
			: undefined;

		if (previous === undefined) {
			reasons.push(
				`This package cannot be audited against the published ${previousRow.contentVersion}: ${
					previousBytes.ok ? "that package no longer parses." : previousBytes.reason
				} Publishing without the audit would risk orphaning annotations on every device that installed it.`,
			);
		} else {
			const audit = auditRelease(previous, candidate);
			diff = audit.diff;
			for (const issue of audit.issues) {
				const line = describe(issue.path, issue.message);
				if (issue.severity === "error") {
					reasons.push(line);
				} else {
					warnings.push(line);
				}
			}
		}
	}

	if (reasons.length > 0) {
		return { ok: false, reasons, ...(diff === undefined ? {} : { diff }) };
	}

	// The published package differs from the proofed one in exactly one field, and the hash is
	// over the bytes that are actually written — never over a re-encode of the parsed object.
	const published: Book = { ...candidate, contentStatus: "published" };
	const serialized = serializePackage(published);
	const bytes = new TextEncoder().encode(serialized);
	const sha256 = sha256Hex(bytes);
	const verses = countVerses(published);

	const result = {
		ok: true as const,
		bookId,
		contentVersion,
		sha256,
		bytes: bytes.byteLength,
		verses,
		url: packageUrl(bookId, contentVersion),
		...(diff === undefined ? {} : { diff }),
	};

	if (options.dryRun === true) {
		return {
			...result,
			file: null,
			warnings: [...warnings, "Dry run — nothing was written and nothing was published."],
		};
	}

	await Bun.write(target, serialized);
	await db.insert(releases).values({
		bookId,
		contentVersion,
		file: relative,
		sha256,
		bytes: bytes.byteLength,
		verses,
		manifest: catalogManifest(published),
	});

	return { ...result, file: relative, warnings };
}

/**
 * The catalog's copy of the manifest: everything except the parts only a reader needs.
 *
 * `structure` is the book itself and `aliases` matter only to a client migrating its own data —
 * neither belongs in a row whose job is to render a shelf.
 */
function catalogManifest(book: Book): Record<string, unknown> {
	const { structure: _structure, aliases: _aliases, ...manifest } = book;
	return manifest;
}
