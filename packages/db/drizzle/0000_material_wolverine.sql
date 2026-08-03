CREATE TYPE "public"."revision_action" AS ENUM('import', 'edit', 'status', 'renumber', 'split', 'merge', 'insert', 'delete', 'reimport');--> statement-breakpoint
CREATE TYPE "public"."verse_origin" AS ENUM('imported', 'split', 'inserted');--> statement-breakpoint
CREATE TYPE "public"."verse_status" AS ENUM('raw', 'proofed', 'approved');--> statement-breakpoint
CREATE TABLE "books" (
	"id" text PRIMARY KEY NOT NULL,
	"package_dir" text NOT NULL,
	"pages_dir" text,
	"source_file" text NOT NULL,
	"source_sha256" text NOT NULL,
	"engine" text,
	"book_page_count" integer NOT NULL,
	"manifest" jsonb NOT NULL,
	"assembly" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"book_id" text NOT NULL,
	"id" text NOT NULL,
	"parent_id" text,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"number" text,
	"title" jsonb,
	"end_marker" text,
	CONSTRAINT "divisions_book_id_id_pk" PRIMARY KEY("book_id","id")
);
--> statement-breakpoint
CREATE TABLE "page_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" text NOT NULL,
	"page" integer NOT NULL,
	"printed_page" integer,
	"marker" integer,
	"text" text NOT NULL,
	"ocr_text" text NOT NULL,
	"block" jsonb NOT NULL,
	"status" "verse_status" DEFAULT 'raw' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"book_id" text NOT NULL,
	"number" integer NOT NULL,
	"printed_page" integer,
	"file" text NOT NULL,
	"width_px" integer NOT NULL,
	"height_px" integer NOT NULL,
	CONSTRAINT "pages_book_id_number_pk" PRIMARY KEY("book_id","number")
);
--> statement-breakpoint
CREATE TABLE "set_aside_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" text NOT NULL,
	"page" integer NOT NULL,
	"printed_page" integer,
	"block_id" text NOT NULL,
	"tag" text NOT NULL,
	"bbox" jsonb NOT NULL,
	"text" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "verse_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verse_key" uuid NOT NULL,
	"book_id" text NOT NULL,
	"action" "revision_action" NOT NULL,
	"text" text NOT NULL,
	"status" "verse_status" NOT NULL,
	"number" text,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verses" (
	"key" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" text NOT NULL,
	"division_id" text NOT NULL,
	"id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"number" text,
	"form" text NOT NULL,
	"text" text NOT NULL,
	"ocr_text" text NOT NULL,
	"status" "verse_status" DEFAULT 'raw' NOT NULL,
	"ocr_changed" boolean DEFAULT false NOT NULL,
	"orphaned" boolean DEFAULT false NOT NULL,
	"origin" "verse_origin" DEFAULT 'imported' NOT NULL,
	"lineage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" real,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"printed_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repairs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"footnote_markers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"orthography" jsonb,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verses_ref" UNIQUE("book_id","division_id","id")
);
--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_notes" ADD CONSTRAINT "page_notes_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_aside_blocks" ADD CONSTRAINT "set_aside_blocks_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_revisions" ADD CONSTRAINT "verse_revisions_verse_key_verses_key_fk" FOREIGN KEY ("verse_key") REFERENCES "public"."verses"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_revisions" ADD CONSTRAINT "verse_revisions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verses" ADD CONSTRAINT "verses_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_notes_book_page" ON "page_notes" USING btree ("book_id","page");--> statement-breakpoint
CREATE INDEX "set_aside_book_page" ON "set_aside_blocks" USING btree ("book_id","page");--> statement-breakpoint
CREATE INDEX "verse_revisions_verse" ON "verse_revisions" USING btree ("verse_key","at");--> statement-breakpoint
CREATE INDEX "verses_book_order" ON "verses" USING btree ("book_id","division_id","ordinal");--> statement-breakpoint
CREATE INDEX "verses_book_status" ON "verses" USING btree ("book_id","status");--> statement-breakpoint
CREATE INDEX "verses_book_confidence" ON "verses" USING btree ("book_id","confidence");