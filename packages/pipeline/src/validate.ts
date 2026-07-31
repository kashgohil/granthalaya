/**
 * `granthalaya validate <path>` — check a book package against the P0.2 format.
 *
 * The gate every package passes before it reaches the studio's publish action or the
 * catalog. All the actual rules live in `@granthalaya/core`; this file only reads a file
 * off disk and renders the result.
 */
import { join } from "node:path";
import type { BookValidation } from "@granthalaya/core";
import { countVerses, formatIssue, validateBook } from "@granthalaya/core";

/** Conventional filename inside a package directory. */
export const PACKAGE_FILENAME = "book.json";

export type ValidationReport = {
	/** False if the package failed to load, failed the schema, or has error-severity issues. */
	readonly ok: boolean;
	readonly text: string;
};

/**
 * Render a validation result for a terminal. Kept separate from the I/O so the wording is
 * unit-testable, and so the studio can reuse the same summary line.
 */
export function formatValidationReport(target: string, validation: BookValidation): string {
	const lines: string[] = [];
	const errors = validation.issues.filter((issue) => issue.severity === "error").length;
	const warnings = validation.issues.length - errors;

	const book = validation.book;
	lines.push(
		book === undefined
			? target
			: `${book.id}@${book.contentVersion} (${book.contentStatus}) — ${countVerses(book)} verses`,
	);

	for (const issue of validation.issues) {
		lines.push(`  ${formatIssue(issue)}`);
	}

	if (validation.issues.length === 0) {
		lines.push("  no issues");
	} else {
		lines.push(`  ${plural(errors, "error")}, ${plural(warnings, "warning")}`);
	}

	return lines.join("\n");
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Resolve `path` to a package file: either the file itself, or `book.json` inside a
 * package directory, so both `validate ./sample-prose` and `validate ./sample-prose/book.json`
 * do the obvious thing.
 */
export async function resolvePackagePath(path: string): Promise<string | null> {
	const candidates = path.endsWith(".json") ? [path] : [join(path, PACKAGE_FILENAME), path];
	for (const candidate of candidates) {
		if (await Bun.file(candidate).exists()) {
			return candidate;
		}
	}
	return null;
}

/** Load and validate one package. Never throws — a malformed file is a report, not a crash. */
export async function validatePackageAt(path: string): Promise<ValidationReport> {
	const resolved = await resolvePackagePath(path);
	if (resolved === null) {
		return { ok: false, text: `${path}\n  error  cannot read a book package here` };
	}

	let parsed: unknown;
	try {
		parsed = await Bun.file(resolved).json();
	} catch (cause) {
		const detail = cause instanceof Error ? cause.message : String(cause);
		return { ok: false, text: `${resolved}\n  error  not valid JSON: ${detail}` };
	}

	const validation = validateBook(parsed);
	return { ok: validation.ok, text: formatValidationReport(resolved, validation) };
}

/** Validate every path given on the command line. Exit code is the caller's job. */
export async function runValidate(paths: readonly string[]): Promise<ValidationReport> {
	if (paths.length === 0) {
		return { ok: false, text: "error  validate needs a path to a book package" };
	}

	const reports = await Promise.all(paths.map((path) => validatePackageAt(path)));
	return {
		ok: reports.every((report) => report.ok),
		text: reports.map((report) => report.text).join("\n\n"),
	};
}
