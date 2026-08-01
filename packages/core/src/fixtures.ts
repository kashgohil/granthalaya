/**
 * Reference book packages, on a separate export path (`@granthalaya/core/fixtures`) so
 * they never reach a consumer bundle that doesn't ask for them.
 *
 * They pin the format, not the canon: both are `contentStatus: "draft"` and neither is
 * proofed against a printed edition. See `docs/book-format.md` §8.
 *
 * Parsed at import rather than cast, so a fixture that drifts out of spec fails loudly
 * here instead of quietly lying to whatever is testing against it.
 */
import gayatriMantraPackage from "./book/fixtures/gayatri-mantra.json";
import sampleProsePackage from "./book/fixtures/sample-prose.json";
import { type Book, BookSchema } from "./book/schema.ts";

/** Four padas, no divisions, four layers: the minimal verse-structured shape. */
export const gayatriMantra: Book = BookSchema.parse(gayatriMantraPackage);

/** Nested divisions, prose leaves, a verse quotation mid-discourse, and an alias map. */
export const sampleProse: Book = BookSchema.parse(sampleProsePackage);

export const FIXTURE_BOOKS: readonly Book[] = [gayatriMantra, sampleProse];

/** Typographic render fixtures (P0.3) — the text every surface must draw correctly. */
export type { TypeSpecimen } from "./text/specimen.ts";
export { findSpecimen, TYPE_SPECIMENS } from "./text/specimen.ts";
