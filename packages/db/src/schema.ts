/**
 * The admin studio's editable state (P1.3).
 *
 * A book package is a build artefact — one immutable `book.json` — and this is deliberately not
 * it. `assemble` writes a draft package that no human has read; the studio imports it here, a
 * human corrects it row by row, and export re-derives a package from these tables. Nothing ever
 * edits a package in place.
 *
 * Two things follow from that, and they shape almost every column below:
 *
 * - **Both sides of every correction are kept.** A verse carries the text the OCR produced
 *   (`ocrText`) alongside the text a human settled on (`text`), because the pair is what a
 *   re-import diffs against and what makes tuning `assemble` safe after proofing has started.
 * - **Nothing is dropped, only marked.** A passage the newest assembly no longer produces is
 *   `orphaned`, never deleted; a block the OCR set aside is `resolved`, never removed. A silent
 *   drop is indistinguishable from text nobody ever saw, which is the whole reason this slice
 *   exists.
 *
 * The evidence columns (`flags`, `blocks`, `repairs`, `orthography`, …) are `assembly.json`'s
 * per-passage record, carried in as-is. They are what the proofing view puts in front of a
 * human: the pixel boxes so the page image can line up, and the repairs so the six places
 * normalization touched are the six places that get re-read.
 */
import { sql } from "drizzle-orm";
import {
	boolean,
	customType,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

/**
 * `jsonb`, with the value handed to the driver untouched.
 *
 * Drizzle's own `jsonb` column pre-stringifies in `toDriver`, which is right for `pg` and
 * `postgres.js` — they want text — and **wrong for `Bun.SQL`, which serializes JS values
 * itself**. The two together encode twice, so `["hyphen-join"]` was stored as the jsonb *string*
 * `"[\"hyphen-join\"]"`. Reads still looked right, because it round-trips; what broke was
 * everything that asks Postgres to understand the value — `jsonb_array_elements_text` errored
 * with "cannot extract elements from a scalar", and every `@>` containment filter silently
 * matched nothing.
 *
 * Verified against both drivers: passing the value through gives a real jsonb array and working
 * containment on Bun.SQL *and* PGlite. `schema.test.ts` pins the identity mapping, because no
 * test running only on PGlite can catch the original fault — PGlite never double-encoded, which
 * is exactly why the suite was green while the live database was wrong.
 */
const jsonb = customType<{ data: unknown; driverData: unknown }>({
	dataType: () => "jsonb",
	toDriver: (value) => value,
});

/**
 * The proofing workflow, per passage.
 *
 * `raw` is where import leaves everything — the format's `contentStatus: "draft"` restated one
 * row at a time. Export refuses to compile a package until every row is `approved`.
 */
export const verseStatus = pgEnum("verse_status", ["raw", "proofed", "approved"]);

/** How a passage came to exist, so a split or an insertion is never mistaken for the edition's. */
export const verseOrigin = pgEnum("verse_origin", ["imported", "split", "inserted"]);

/** What a revision recorded, so the history reads as a sequence of decisions rather than diffs. */
export const revisionAction = pgEnum("revision_action", [
	"import",
	"edit",
	"status",
	"renumber",
	"split",
	"merge",
	"insert",
	"delete",
	"reimport",
]);

/** Every timestamp in here is the same one. A fresh builder per call — a name cannot be reused. */
const stamp = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull();

export const books = pgTable("books", {
	/** The book id, e.g. `gopalanand-swami-ni-vato`. Same value the package uses. */
	id: text("id").primaryKey(),
	/** Where the draft package was read from, relative to the content root. */
	packageDir: text("package_dir").notNull(),
	/**
	 * Where the page images live, relative to the content root. Found by matching
	 * `pages.json`'s `sourceSha256`, not by name — the two directories are named differently and
	 * the hash is the only thing that ties this text to the edition it was read off.
	 */
	pagesDir: text("pages_dir"),
	sourceFile: text("source_file").notNull(),
	sourceSha256: text("source_sha256").notNull(),
	engine: text("engine"),
	bookPageCount: integer("book_page_count").notNull(),
	/**
	 * The P0.2 manifest minus `structure`: title, language, script, source, licence, layers.
	 * Editable — the source edition, the licence and the printed title are exactly what
	 * `assemble` writes `unknown` into and names as a human's job.
	 */
	manifest: jsonb("manifest").notNull(),
	/**
	 * `assembly.json`'s book-level findings **as imported**: the folio offset, the verse-number
	 * checksum, the running-head tally. A snapshot on purpose — it describes what the machine
	 * concluded, and goes stale the moment a human restructures. The live sequence check is
	 * recomputed from `verses`.
	 */
	assembly: jsonb("assembly").notNull(),
	importedAt: stamp("imported_at"),
	updatedAt: stamp("updated_at"),
});

export const divisions = pgTable(
	"divisions",
	{
		bookId: text("book_id")
			.notNull()
			.references(() => books.id, { onDelete: "cascade" }),
		/** Unique among siblings; the ref is what is globally unique. Positional until P1.4. */
		id: text("id").notNull(),
		parentId: text("parent_id"),
		ordinal: integer("ordinal").notNull(),
		kind: text("kind").notNull(),
		number: text("number"),
		title: jsonb("title"),
		/** The printed line that closed it, e.g. `॥ પુરુષોત્તમપણાની વાતો સમાપ્ત ॥`. Evidence. */
		endMarker: text("end_marker"),
	},
	(table) => [primaryKey({ columns: [table.bookId, table.id] })],
);

export const verses = pgTable(
	"verses",
	{
		/**
		 * A surrogate key, because the natural one moves: renumbering a passage re-derives its id
		 * from the printed number, and revisions have to survive that.
		 */
		key: uuid("key").default(sql`gen_random_uuid()`).primaryKey(),
		bookId: text("book_id")
			.notNull()
			.references(() => books.id, { onDelete: "cascade" }),
		divisionId: text("division_id").notNull(),
		/** The leaf segment: `v61` from the printed number, or `p86-6` when none was printed. */
		id: text("id").notNull(),
		/** Reading order within the division. Verse ids do not sort: `v61` sits beside `p86-6`. */
		ordinal: integer("ordinal").notNull(),
		/** As printed. Display only — never identity, and never inside the verse hash. */
		number: text("number"),
		form: text("form").notNull(),
		/** What a human has settled on. Starts equal to `ocrText`. */
		text: text("text").notNull(),
		/** What the machine produced. The other side of every diff; never edited. */
		ocrText: text("ocr_text").notNull(),
		status: verseStatus("status").notNull().default("raw"),
		/**
		 * Set when a re-import brought different OCR text for a passage a human had already
		 * edited. The edit is kept and the status drops to `raw`, so the disagreement is proofed
		 * rather than resolved by whichever side happened to be written last.
		 */
		ocrChanged: boolean("ocr_changed").notNull().default(false),
		/** The newest assembly no longer produces this passage. Marked, never deleted. */
		orphaned: boolean("orphaned").notNull().default(false),
		origin: verseOrigin("origin").notNull().default("imported"),
		/** Refs this passage was split from or merged out of, so a re-import can still match. */
		lineage: jsonb("lineage").notNull().default(sql`'[]'::jsonb`),
		confidence: real("confidence"),
		flags: jsonb("flags").notNull().default(sql`'[]'::jsonb`),
		/** PDF pages this text came off, and what those pages printed on themselves. */
		pages: jsonb("pages").notNull().default(sql`'[]'::jsonb`),
		printedPages: jsonb("printed_pages").notNull().default(sql`'[]'::jsonb`),
		/** Pixel boxes on the page images — what lets the side-by-side view line up. */
		blocks: jsonb("blocks").notNull().default(sql`'[]'::jsonb`),
		/** Every change normalization made, so a human checks exactly those places. */
		repairs: jsonb("repairs").notNull().default(sql`'[]'::jsonb`),
		footnoteMarkers: jsonb("footnote_markers").notNull().default(sql`'[]'::jsonb`),
		orthography: jsonb("orthography"),
		/** A proofreader's own note — a question, a doubt, something for P1.4. */
		note: text("note"),
		updatedAt: stamp("updated_at"),
	},
	(table) => [
		unique("verses_ref").on(table.bookId, table.divisionId, table.id),
		index("verses_book_order").on(table.bookId, table.divisionId, table.ordinal),
		index("verses_book_status").on(table.bookId, table.status),
		index("verses_book_confidence").on(table.bookId, table.confidence),
	],
);

/**
 * Every state a passage has been in, in order.
 *
 * Cheap insurance in a project whose first principle is fidelity: a proofreader who overwrites
 * the right reading at 1am can get it back, and a package that turns out wrong can be traced to
 * the edit that made it wrong.
 */
export const verseRevisions = pgTable(
	"verse_revisions",
	{
		id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
		verseKey: uuid("verse_key")
			.notNull()
			.references(() => verses.key, { onDelete: "cascade" }),
		bookId: text("book_id")
			.notNull()
			.references(() => books.id, { onDelete: "cascade" }),
		action: revisionAction("action").notNull(),
		/** The text *after* the action. The row before it holds what it replaced. */
		text: text("text").notNull(),
		status: verseStatus("status").notNull(),
		number: text("number"),
		note: text("note"),
		at: stamp("at"),
	},
	(table) => [index("verse_revisions_verse").on(table.verseKey, table.at)],
);

/** The rendered page images, from `pages.json`. Read-only: they are pinned by the source hash. */
export const pages = pgTable(
	"pages",
	{
		bookId: text("book_id")
			.notNull()
			.references(() => books.id, { onDelete: "cascade" }),
		/** The PDF's page number — what the image file is named after. */
		number: integer("number").notNull(),
		/** What the page printed on itself. Runs a constant offset behind the PDF's. */
		printedPage: integer("printed_page"),
		file: text("file").notNull(),
		widthPx: integer("width_px").notNull(),
		heightPx: integer("height_px").notNull(),
	},
	(table) => [primaryKey({ columns: [table.bookId, table.number] })],
);

/**
 * Footnotes, per page.
 *
 * Real content, kept out of the discourse it sits under. They are proofread here but **not**
 * attached to the words that pointed at them: pairing a gloss to a word decides meaning rather
 * than text, and a wrong pairing is invisible to every check this pipeline has. That is P1.4.
 */
export const pageNotes = pgTable(
	"page_notes",
	{
		id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
		bookId: text("book_id")
			.notNull()
			.references(() => books.id, { onDelete: "cascade" }),
		page: integer("page").notNull(),
		printedPage: integer("printed_page"),
		/** The marker the note is numbered with, when it opens with one. */
		marker: integer("marker"),
		text: text("text").notNull(),
		ocrText: text("ocr_text").notNull(),
		block: jsonb("block").notNull(),
		status: verseStatus("status").notNull().default("raw"),
		updatedAt: stamp("updated_at"),
	},
	(table) => [index("page_notes_book_page").on(table.bookId, table.page)],
);

/**
 * Blocks the pipeline held back — page furniture, non-text tags, and anything in a script the
 * book does not admit.
 *
 * This table is the reason the studio can claim nothing was lost. The known residual risk is a
 * block that *should* have been set aside and wasn't: asked to read a decorative glyph the OCR
 * once answered with an English description tagged `paragraph`, and a Gujarati description of an
 * illustration would pass both filters. A human resolving these page by page is the backstop.
 */
export const setAsideBlocks = pgTable(
	"set_aside_blocks",
	{
		id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
		bookId: text("book_id")
			.notNull()
			.references(() => books.id, { onDelete: "cascade" }),
		page: integer("page").notNull(),
		printedPage: integer("printed_page"),
		blockId: text("block_id").notNull(),
		tag: text("tag").notNull(),
		bbox: jsonb("bbox").notNull(),
		text: text("text").notNull(),
		/** A human has looked at it and agrees it does not belong in the scripture. */
		resolved: boolean("resolved").notNull().default(false),
		note: text("note"),
	},
	(table) => [index("set_aside_book_page").on(table.bookId, table.page)],
);

/**
 * The catalog: every package version that has been handed out (P1.5).
 *
 * The row is a *record of a release*, not working state, and three things follow from that.
 *
 * **No foreign key to `books`.** Every other table here cascades from a book, because every
 * other table is that book's editable copy and deleting a bad import should take all of it.
 * A release is the opposite: it describes bytes that left this machine. Deleting the studio's
 * working copy must not erase the fact that `v1.0.0` exists on somebody's phone, and the
 * catalog must keep serving it.
 *
 * **The bytes live on disk; this row pins them.** `sha256` is over the exact file, so a
 * published package that no longer hashes to its record is a fault the API reports rather than
 * serves. That is the integrity boundary `docs/book-format.md` §5 names, and it is real crypto
 * in the API — never the FNV-1a verse hash, which answers a different question.
 *
 * **A row is written once.** The primary key is the pair, so republishing a version is a
 * constraint violation rather than an overwrite.
 */
export const releases = pgTable(
	"releases",
	{
		bookId: text("book_id").notNull(),
		/** Semver. Part of the package's identity, not metadata on it. */
		contentVersion: text("content_version").notNull(),
		/** The published package, relative to the content root. Written once, never edited. */
		file: text("file").notNull(),
		/** SHA-256 over exactly those bytes. What a client verifies after downloading. */
		sha256: text("sha256").notNull(),
		bytes: integer("bytes").notNull(),
		verses: integer("verses").notNull(),
		/**
		 * The package minus `structure` and `aliases` — title, language, source, licence, layers.
		 * Duplicated out of the file so the catalog can list a shelf of books without opening
		 * (and parsing) every megabyte-scale package to do it.
		 */
		manifest: jsonb("manifest").notNull(),
		publishedAt: stamp("published_at"),
	},
	(table) => [primaryKey({ columns: [table.bookId, table.contentVersion] })],
);

export type BookRow = typeof books.$inferSelect;
export type DivisionRow = typeof divisions.$inferSelect;
export type VerseRow = typeof verses.$inferSelect;
export type VerseRevisionRow = typeof verseRevisions.$inferSelect;
export type PageRow = typeof pages.$inferSelect;
export type PageNoteRow = typeof pageNotes.$inferSelect;
export type SetAsideRow = typeof setAsideBlocks.$inferSelect;
export type ReleaseRow = typeof releases.$inferSelect;

export type VerseStatus = (typeof verseStatus.enumValues)[number];
export type VerseOrigin = (typeof verseOrigin.enumValues)[number];
export type RevisionAction = (typeof revisionAction.enumValues)[number];
