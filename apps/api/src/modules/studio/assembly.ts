/**
 * `assembly.json`, parsed at the API's front door.
 *
 * The pipeline defines this shape in TypeScript, but `packages/pipeline` is admin tooling that
 * the API does not depend on — and even if it did, a type is not a guarantee about a file read
 * off disk. It was written by a different program, possibly a different version of it, and it is
 * the only record of where each passage came from. Parsing it is what turns "the studio crashed
 * on page 300" into "this file is from an older `assemble`".
 *
 * Deliberately permissive where the pipeline is still moving: `flags`, `tag` and `kind` are plain
 * strings rather than enums, so adding a repair kind or a layout tag to `assemble` does not make
 * every existing sidecar unreadable. Everything the studio actually *navigates* by — refs, pages,
 * boxes — is strict.
 */
import { z } from "zod";

const BboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const BlockRefSchema = z.object({
	page: z.number().int().positive(),
	printedPage: z.number().int().nullable(),
	blockId: z.string(),
	tag: z.string(),
	bbox: BboxSchema,
});

export const AssembledVerseSchema = z.object({
	ref: z.string().min(1),
	number: z.string().nullable(),
	confidence: z.number(),
	flags: z.array(z.string()),
	chars: z.number().int().nonnegative(),
	pages: z.array(z.number().int().positive()),
	printedPages: z.array(z.number().int().nullable()),
	blocks: z.array(BlockRefSchema),
	repairs: z.array(
		z.object({
			kind: z.string(),
			before: z.string(),
			after: z.string(),
			context: z.string(),
		}),
	),
	footnoteMarkers: z.array(z.number().int()),
	orthography: z.object({
		ok: z.boolean(),
		violations: z.number().int().nonnegative(),
		rate: z.number(),
	}),
});

export const PageNoteSchema = z.object({
	page: z.number().int().positive(),
	printedPage: z.number().int().nullable(),
	text: z.string(),
	block: BlockRefSchema,
});

export const SetAsideSchema = BlockRefSchema.extend({ text: z.string() });

export const SequenceRunSchema = z.object({
	division: z.string().min(1),
	first: z.number().int(),
	last: z.number().int(),
	numbered: z.number().int().nonnegative(),
	missing: z.array(z.number().int()),
	duplicates: z.array(z.number().int()),
	outOfOrder: z.array(z.number().int()),
});

export const SequenceReportSchema = z.object({
	runs: z.array(SequenceRunSchema),
	numbered: z.number().int().nonnegative(),
	unnumbered: z.number().int().nonnegative(),
	missing: z.array(z.number().int()),
	duplicates: z.array(z.number().int()),
	outOfOrder: z.array(z.number().int()),
	restarts: z.array(z.object({ division: z.string().min(1), at: z.number().int() })),
});

export const PageNumberingSchema = z.object({
	offset: z.number().int().nullable(),
	pagesWithPrintedNumber: z.number().int().nonnegative(),
	disagreements: z.array(
		z.object({ page: z.number().int().positive(), printed: z.number().int() }),
	),
});

export const AssemblyReportSchema = z.object({
	book: z.string().min(1),
	source: z.object({
		file: z.string(),
		sha256: z.string(),
		engine: z.string(),
		bookPageCount: z.number().int().positive(),
		pagesAssembled: z.array(z.number().int().positive()),
	}),
	numbering: PageNumberingSchema,
	sequence: SequenceReportSchema,
	counts: z.object({
		sections: z.number().int().nonnegative(),
		verses: z.number().int().nonnegative(),
		numbered: z.number().int().nonnegative(),
		notes: z.number().int().nonnegative(),
		setAside: z.number().int().nonnegative(),
	}),
	needsHuman: z.array(z.string()),
	runningHeads: z.array(z.object({ text: z.string(), pages: z.number().int().nonnegative() })),
	verses: z.array(AssembledVerseSchema),
	notes: z.array(PageNoteSchema),
	setAside: z.array(SetAsideSchema),
});

/** `pages.json`, from `render`. Only the parts the studio needs to show a page image. */
export const PageManifestSchema = z.object({
	source: z.string(),
	sourceSha256: z.string(),
	pageCount: z.number().int().positive(),
	dpi: z.number().int().positive(),
	format: z.string(),
	pages: z.array(
		z.object({
			number: z.number().int().positive(),
			file: z.string(),
			widthPx: z.number().int().positive(),
			heightPx: z.number().int().positive(),
		}),
	),
});

export type AssemblyReport = z.infer<typeof AssemblyReportSchema>;
export type AssembledVerse = z.infer<typeof AssembledVerseSchema>;
export type BlockRef = z.infer<typeof BlockRefSchema>;
export type PageManifest = z.infer<typeof PageManifestSchema>;
