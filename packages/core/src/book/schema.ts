/**
 * Zod schemas for the book package format — the single source of truth for its shape.
 * TypeScript types are inferred from these, never declared alongside them, so the two
 * cannot drift.
 *
 * These cover shape only. Cross-references a schema can't express (a verse using an
 * undeclared layer, an alias pointing nowhere) live in `validate.ts`.
 *
 * Prose spec: `docs/book-format.md`.
 */
import { z } from "zod";
import { SEGMENT_PATTERN } from "./refs.ts";

/** Path segment: book id, division id, verse id, layer id. See `refs.ts`. */
export const SegmentSchema = z
	.string()
	.regex(SEGMENT_PATTERN, "must be lowercase kebab-case (a-z, 0-9, single hyphens)");

/** BCP 47 language tag, loosely checked: `gu`, `sa`, `en`, `gu-IN`. */
export const LanguageTagSchema = z
	.string()
	.regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/, "must be a BCP 47 language tag, e.g. gu or en-US");

/**
 * ISO 15924 script code, lowercased. Constrained rather than free-form: the reader picks
 * fonts and shaping rules from this, so a typo must fail loudly at publish time.
 */
export const ScriptSchema = z.enum(["gujr", "deva", "latn"]);

export const SemverSchema = z
	.string()
	.regex(/^\d+\.\d+\.\d+$/, "must be a MAJOR.MINOR.PATCH version");

/**
 * Whether `text` contains a C0 or C1 control character.
 *
 * OCR and PDF extraction routinely emit form feeds, carriage returns and stray separators.
 * Left alone they enter published scripture invisibly, break shaping and line-breaking, and
 * are the one input class that could smuggle a separator into the verse hash's canonical
 * form (`hash.ts`). Nothing in scripture legitimately needs them, so the format rejects them
 * at the door rather than hoping the pipeline strips them.
 */
function hasControlCharacter(text: string, allowNewline: boolean): boolean {
	for (const character of text) {
		const point = character.codePointAt(0) ?? 0;
		if (point === 0x0a) {
			if (!allowNewline) {
				return true;
			}
			continue;
		}
		if (point < 0x20 || (point >= 0x7f && point <= 0x9f)) {
			return true;
		}
	}
	return false;
}

/** Body text: newlines allowed, because a verse may be laid out over several lines. */
export const ScriptureTextSchema = z
	.string()
	.min(1)
	.refine(
		(value) => !hasControlCharacter(value, true),
		"must not contain control characters (newline is the only one allowed)",
	);

/** Titles, labels and other chrome: no control characters at all, newline included. */
export const SingleLineTextSchema = z
	.string()
	.min(1)
	.refine(
		(value) => !hasControlCharacter(value, false),
		"must be a single line with no control characters",
	);

/** Text in one or more languages, keyed by language tag. At least one entry required. */
export const LocalizedTextSchema = z
	.record(LanguageTagSchema, SingleLineTextSchema)
	.refine((value) => Object.keys(value).length > 0, "must have at least one language");

/**
 * How the reader renders a verse. Purely typographic — it never affects addressing,
 * hashing or any study feature.
 */
export const VerseFormSchema = z.enum(["verse", "prose"]);

/** Container kinds. Anything that is not one of these is a verse, and verses are leaves. */
export const DivisionKindSchema = z.enum(["volume", "section", "chapter", "passage"]);

/** What a layer *is*, which tells the reader how to render and order it. */
export const LayerKindSchema = z.enum([
	"original",
	"transliteration",
	"translation",
	"wordMeanings",
	"commentary",
]);

export const LicenseSchema = z.strictObject({
	/** SPDX identifier, or `public-domain` / `proprietary`. */
	id: z.string().min(1),
	holder: z.string().min(1).optional(),
	notes: z.string().min(1).optional(),
});

/** Where the text came from. Required on every book — fidelity is a feature. */
export const SourceEditionSchema = z.strictObject({
	edition: z.string().min(1),
	publisher: z.string().min(1).optional(),
	year: z.number().int().min(1).max(2200).optional(),
	isbn: z.string().min(1).optional(),
	url: z.url().optional(),
	notes: z.string().min(1).optional(),
});

/**
 * A layer declared by the manifest. Language and script live here rather than on the book
 * because they genuinely differ per layer: a Sanskrit stotra printed in Gujarati script
 * has its transliteration in the same language but Latin script.
 */
export const LayerDeclarationSchema = z.strictObject({
	/** Referenced by `primaryLayer` and by each verse's `layers` map. */
	id: SegmentSchema,
	kind: LayerKindSchema,
	language: LanguageTagSchema,
	script: ScriptSchema,
	/** What the reader's layer toggle is called. */
	label: LocalizedTextSchema,
	/** Transliteration scheme, e.g. `iso-15919`. Meaningful only for `transliteration`. */
	scheme: z.string().min(1).optional(),
	/** Translator, commentator or editor — layers often have different provenance than the original. */
	attribution: z.string().min(1).optional(),
	/** Overrides the book licence; translations are frequently under different rights. */
	license: LicenseSchema.optional(),
});

/** One entry of a `wordMeanings` layer, in the order the words appear in the verse. */
export const WordGlossSchema = z.strictObject({
	word: SingleLineTextSchema,
	meaning: SingleLineTextSchema,
	note: SingleLineTextSchema.optional(),
});

/**
 * A verse's value for one layer. Every kind carries a string except `wordMeanings`, which
 * carries glosses; matching the value against its declared kind is `validate.ts`'s job.
 */
export const LayerValueSchema = z.union([ScriptureTextSchema, z.array(WordGlossSchema).min(1)]);

const unitBase = {
	/** Unique among siblings only; the full ref is what's globally unique. */
	id: SegmentSchema,
	/** What the printed edition calls this unit, e.g. `૨૧`. Display only — never identity. */
	number: SingleLineTextSchema.optional(),
	title: LocalizedTextSchema.optional(),
};

export type BookDivision = {
	kind: z.infer<typeof DivisionKindSchema>;
	id: string;
	number?: string;
	title?: LocalizedText;
	children: BookUnit[];
};

export type BookVerse = {
	kind: "verse";
	id: string;
	number?: string;
	title?: LocalizedText;
	form: z.infer<typeof VerseFormSchema>;
	layers: Record<string, LayerValue>;
	/** Content hash of `layers`, e.g. `f1a64:9a3f1c0b7d5e2a48`. See `hash.ts`. */
	hash?: string;
};

export type BookUnit = BookDivision | BookVerse;

/**
 * The recursion point. Annotating *this* rather than `DivisionSchema` breaks the type cycle
 * without erasing the literal `kind` that `z.discriminatedUnion` needs to pick a branch —
 * which is what keeps validation errors pointing at one shape instead of listing both.
 */
const RecursiveUnitSchema: z.ZodType<BookUnit> = z.lazy(() => UnitSchema);

export const DivisionSchema = z.strictObject({
	...unitBase,
	kind: DivisionKindSchema,
	children: z.array(RecursiveUnitSchema).min(1, "a division must contain something"),
});

export const VerseSchema = z.strictObject({
	...unitBase,
	kind: z.literal("verse"),
	form: VerseFormSchema,
	layers: z.record(SegmentSchema, LayerValueSchema),
	hash: z.string().min(1).optional(),
});

export const UnitSchema = z.discriminatedUnion("kind", [DivisionSchema, VerseSchema]);

/**
 * A complete book package: `book.json`. Immutable once published — corrections ship as a
 * new `contentVersion`, never as an edit to a released one.
 */
export const BookSchema = z.strictObject({
	/** Bumped only for breaking changes to *this format*, not to a book's content. */
	formatVersion: z.literal(1),
	id: SegmentSchema,
	title: LocalizedTextSchema,
	subtitle: LocalizedTextSchema.optional(),
	/** Primary language of the work; individual layers may differ. */
	language: LanguageTagSchema,
	script: ScriptSchema,
	/** Free-form grouping for the catalog, e.g. `swaminarayan`, `jain`. */
	tradition: z.string().min(1).optional(),
	contentVersion: SemverSchema,
	/** The proofing gate, made structural: the catalog serves only `published` packages. */
	contentStatus: z.enum(["draft", "proofed", "published"]),
	source: SourceEditionSchema,
	license: LicenseSchema,
	/**
	 * Declared layers, **in the order a reader should see them**. An array rather than a
	 * map because JSON objects are unordered by specification: relying on key order would
	 * bind the format to JavaScript's insertion-order semantics, and even there a numeric
	 * layer id (`1`, which the segment grammar permits) is hoisted ahead of string keys.
	 * An array is order-preserving in every language that will touch a package.
	 */
	layers: z.array(LayerDeclarationSchema).min(1, "a book must declare at least one layer"),
	/** Id of the layer that *is* the scripture: required on every verse, never hidden. */
	primaryLayer: SegmentSchema,
	structure: z.array(UnitSchema).min(1, "a book must contain something"),
	/** Retired ref → its successor, so user data survives a restructure. */
	aliases: z.record(z.string().min(1), z.string().min(1)).optional(),
});

export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
export type LayerValue = z.infer<typeof LayerValueSchema>;
export type WordGloss = z.infer<typeof WordGlossSchema>;
export type LayerKind = z.infer<typeof LayerKindSchema>;
export type LayerDeclaration = z.infer<typeof LayerDeclarationSchema>;
export type DivisionKind = z.infer<typeof DivisionKindSchema>;
export type VerseForm = z.infer<typeof VerseFormSchema>;
export type License = z.infer<typeof LicenseSchema>;
export type SourceEdition = z.infer<typeof SourceEditionSchema>;
export type Book = z.infer<typeof BookSchema>;

/** Narrowing helper — `kind` is the only thing separating a container from an atom. */
export function isVerse(unit: BookUnit): unit is BookVerse {
	return unit.kind === "verse";
}

/** Look up a declared layer by id. Undefined for a layer the manifest never declared. */
export function findLayer(book: Book, layerId: string): LayerDeclaration | undefined {
	return book.layers.find((layer) => layer.id === layerId);
}

/**
 * Declared layers keyed by id, for callers that resolve many of them — a reader rendering
 * a screenful of verses, or validation walking every verse in a book.
 */
export function layersById(book: Book): Map<string, LayerDeclaration> {
	return new Map(book.layers.map((layer) => [layer.id, layer]));
}

/**
 * Pick the best available language from a `LocalizedText`, falling back through the
 * caller's preferences and then to whatever the text does have — a title must always
 * render, even in a language the reader didn't ask for.
 */
export function pickLocalized(
	text: LocalizedText,
	preferred: readonly string[],
): string | undefined {
	for (const language of preferred) {
		const exact = text[language];
		if (exact !== undefined) {
			return exact;
		}
		// `gu` should satisfy a request for `gu-IN`, and vice versa.
		const base = language.split("-")[0];
		const entry = Object.entries(text).find(([tag]) => tag.split("-")[0] === base);
		if (entry !== undefined) {
			return entry[1];
		}
	}
	return Object.values(text)[0];
}
