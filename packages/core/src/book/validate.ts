/**
 * Book package validation.
 *
 * Two layers. `parseBook` runs the Zod schemas — shapes, enums, patterns. `validateBook`
 * additionally checks the cross-references a schema can't see: a verse using a layer the
 * manifest never declared, an alias pointing at nothing, a recorded hash that no longer
 * matches its text.
 *
 * Both return the same flat issue list so the CLI and the studio render one thing. Errors
 * block publishing; warnings don't.
 */
import { hashVerse } from "./hash.ts";
import { formatRef, parseRef } from "./refs.ts";
import type { Book, BookUnit, LayerDeclaration } from "./schema.ts";
import { BookSchema, isVerse, layersById } from "./schema.ts";
import { walkBook } from "./tree.ts";

export type IssueSeverity = "error" | "warning";

export type BookIssue = {
	readonly severity: IssueSeverity;
	/** Stable kebab-case identifier, so the studio can group and suppress by cause. */
	readonly code: string;
	/**
	 * Where the issue is: a book ref when it belongs to a unit (`sample-prose/khand-1/3#p1`),
	 * otherwise a path into the document (`/primaryLayer`, `/layers/2`, `/aliases/<ref>`).
	 * For display and for jump-to-source, not for machine resolution.
	 */
	readonly path: string;
	readonly message: string;
};

export type BookValidation = {
	/** True when there are no `error`-severity issues. Warnings do not block. */
	readonly ok: boolean;
	readonly issues: readonly BookIssue[];
	/** Present whenever the schema parsed, even if integrity checks failed. */
	readonly book?: Book;
};

function error(code: string, path: string, message: string): BookIssue {
	return { severity: "error", code, path, message };
}

function warning(code: string, path: string, message: string): BookIssue {
	return { severity: "warning", code, path, message };
}

function jsonPointer(path: readonly PropertyKey[]): string {
	return path.length === 0 ? "/" : `/${path.map(String).join("/")}`;
}

/** Run the schemas only. Use `validateBook` unless you specifically want shape-checking alone. */
export function parseBook(input: unknown): BookValidation {
	const result = BookSchema.safeParse(input);
	if (result.success) {
		return { ok: true, issues: [], book: result.data };
	}
	const issues = result.error.issues.map((issue) =>
		error("schema", jsonPointer(issue.path), issue.message),
	);
	return { ok: false, issues };
}

/** Full validation: schema, then referential integrity. */
export function validateBook(input: unknown): BookValidation {
	const parsed = parseBook(input);
	if (parsed.book === undefined) {
		return parsed;
	}

	const book = parsed.book;
	const declared = layersById(book);
	const issues: BookIssue[] = [
		...parsed.issues,
		...checkLayerDeclarations(book, declared),
		// A primary layer that doesn't exist would otherwise report "missing" against every
		// verse in the book, burying the one-line cause under thousands of consequences.
		...checkUnits(book, declared, declared.has(book.primaryLayer)),
		...checkAliases(book),
	];

	return { ok: !issues.some((issue) => issue.severity === "error"), issues, book };
}

function checkLayerDeclarations(
	book: Book,
	declared: ReadonlyMap<string, LayerDeclaration>,
): BookIssue[] {
	const issues: BookIssue[] = [];

	// `layers` is an array, so nothing structural stops the same id being declared twice.
	if (declared.size !== book.layers.length) {
		const seen = new Set<string>();
		for (const [index, layer] of book.layers.entries()) {
			if (seen.has(layer.id)) {
				issues.push(
					error("duplicate-layer-id", `/layers/${index}`, `layer "${layer.id}" is declared twice`),
				);
			}
			seen.add(layer.id);
		}
	}

	const primary = declared.get(book.primaryLayer);
	if (primary === undefined) {
		issues.push(
			error(
				"primary-layer-undeclared",
				"/primaryLayer",
				`primaryLayer "${book.primaryLayer}" is not declared in layers`,
			),
		);
	} else if (primary.kind !== "original") {
		// The primary layer *is* the scripture — it's what search, audio alignment and
		// memorization work against. Pointing it at a translation would quietly make an
		// apparatus layer canonical, which is the exact failure this format exists to prevent.
		issues.push(
			error(
				"primary-layer-not-original",
				"/primaryLayer",
				`primaryLayer "${book.primaryLayer}" is declared as ${primary.kind}; it must be an original layer`,
			),
		);
	}

	for (const [index, layer] of book.layers.entries()) {
		if (layer.kind === "transliteration" && layer.scheme === undefined) {
			issues.push(
				warning(
					"transliteration-scheme-missing",
					`/layers/${index}`,
					`layer "${layer.id}" should declare its transliteration scheme, e.g. iso-15919`,
				),
			);
		}
	}

	return issues;
}

/**
 * Walk the tree once, checking sibling uniqueness on the way down and every verse's layers
 * and hash on the way past.
 *
 * There's no "book has no verses" check: the schema requires every division to hold at
 * least one child, so a finite tree always bottoms out in verses.
 *
 * `checkPrimaryLayer` is false when the primary layer isn't declared at all — the caller
 * has already reported that once, and repeating it per verse only buries it.
 */
function checkUnits(
	book: Book,
	declared: ReadonlyMap<string, LayerDeclaration>,
	checkPrimaryLayer: boolean,
): BookIssue[] {
	const issues: BookIssue[] = [];

	checkSiblingIds(book.id, book.structure, issues);

	for (const { unit, ref } of walkBook(book)) {
		if (!isVerse(unit)) {
			continue;
		}
		const at = formatRef(ref);

		for (const [layerId, value] of Object.entries(unit.layers)) {
			const declaration = declared.get(layerId);
			if (declaration === undefined) {
				issues.push(
					error(
						"undeclared-layer",
						at,
						`uses layer "${layerId}", which the manifest does not declare`,
					),
				);
				continue;
			}
			const wantsGlosses = declaration.kind === "wordMeanings";
			const hasGlosses = typeof value !== "string";
			if (wantsGlosses !== hasGlosses) {
				issues.push(
					error(
						"layer-kind-mismatch",
						at,
						`layer "${layerId}" is declared as ${declaration.kind}, so its value must be ${
							wantsGlosses ? "an array of word glosses" : "a string"
						}`,
					),
				);
			}
		}

		if (checkPrimaryLayer && unit.layers[book.primaryLayer] === undefined) {
			issues.push(
				error(
					"primary-layer-missing",
					at,
					`has no "${book.primaryLayer}" layer, the book's primary`,
				),
			);
		}

		if (unit.hash !== undefined) {
			const recomputed = hashVerse(unit.layers);
			if (unit.hash !== recomputed) {
				issues.push(
					error(
						"hash-mismatch",
						at,
						`recorded hash ${unit.hash} does not match content (${recomputed})`,
					),
				);
			}
		}
	}

	return issues;
}

function checkSiblingIds(at: string, units: readonly BookUnit[], issues: BookIssue[]): void {
	const seen = new Set<string>();
	for (const unit of units) {
		if (seen.has(unit.id)) {
			issues.push(
				error("duplicate-sibling-id", at, `contains more than one child with id "${unit.id}"`),
			);
		}
		seen.add(unit.id);
		if (!isVerse(unit)) {
			checkSiblingIds(`${at}/${unit.id}`, unit.children, issues);
		}
	}
}

/**
 * Aliases are what let a highlight made against v1.0.0 survive a restructure, so a broken
 * one is silent data loss — every source and target is checked.
 */
function checkAliases(book: Book): BookIssue[] {
	if (book.aliases === undefined) {
		return [];
	}

	const issues: BookIssue[] = [];
	const live = new Set<string>();
	for (const { ref } of walkBook(book)) {
		live.add(formatRef(ref));
	}
	live.add(book.id);

	for (const [source, target] of Object.entries(book.aliases)) {
		const at = `/aliases/${source}`;

		const parsedSource = parseRef(source);
		if (!parsedSource.ok) {
			issues.push(
				error("alias-unparseable", at, `alias source is not a valid ref: ${parsedSource.error}`),
			);
		} else if (parsedSource.ref.bookId !== book.id) {
			issues.push(error("alias-foreign-book", at, "alias source points into a different book"));
		} else if (live.has(source)) {
			issues.push(error("alias-source-live", at, "a retired ref cannot also exist as a live unit"));
		}

		const parsedTarget = parseRef(target);
		if (!parsedTarget.ok) {
			issues.push(
				error("alias-unparseable", at, `alias target is not a valid ref: ${parsedTarget.error}`),
			);
		} else if (parsedTarget.ref.bookId !== book.id) {
			issues.push(error("alias-foreign-book", at, "alias target points into a different book"));
		} else if (!live.has(target)) {
			issues.push(error("alias-target-missing", at, `alias target "${target}" does not resolve`));
		}
	}

	return issues;
}

/** Human-readable one-liner for a CLI or a studio list row. */
export function formatIssue(issue: BookIssue): string {
	return `${issue.severity === "error" ? "error" : "warn "}  ${issue.path}  ${issue.message} [${issue.code}]`;
}
