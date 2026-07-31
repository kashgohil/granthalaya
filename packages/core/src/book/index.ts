/**
 * Book format and verse addressing (P0.2) — spec in `docs/book-format.md`.
 */

export {
	canonicalizeVerse,
	fnv1a64,
	HASH_PREFIX,
	hashVerse,
} from "./hash.ts";
export type { BookRef, RefParseResult } from "./refs.ts";
export {
	bookRef,
	formatRef,
	isSegment,
	isVerseRef,
	parentRef,
	parseRef,
	refContains,
	refsEqual,
	SEGMENT_PATTERN,
} from "./refs.ts";
export type {
	Book,
	BookDivision,
	BookUnit,
	BookVerse,
	DivisionKind,
	LayerDeclaration,
	LayerKind,
	LayerValue,
	License,
	LocalizedText,
	SourceEdition,
	VerseForm,
	WordGloss,
} from "./schema.ts";
export {
	BookSchema,
	DivisionKindSchema,
	DivisionSchema,
	findLayer,
	isVerse,
	LayerDeclarationSchema,
	LayerKindSchema,
	LayerValueSchema,
	LocalizedTextSchema,
	layersById,
	pickLocalized,
	ScriptureTextSchema,
	SegmentSchema,
	SingleLineTextSchema,
	UnitSchema,
	VerseFormSchema,
	VerseSchema,
	WordGlossSchema,
} from "./schema.ts";
export type { UnitVisit, VerseVisit } from "./tree.ts";
export { bookVerses, countVerses, findUnit, findVerse, walkBook } from "./tree.ts";
export type { BookIssue, BookValidation, IssueSeverity } from "./validate.ts";
export { formatIssue, parseBook, validateBook } from "./validate.ts";
