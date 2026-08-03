CREATE TABLE "releases" (
	"book_id" text NOT NULL,
	"content_version" text NOT NULL,
	"file" text NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"verses" integer NOT NULL,
	"manifest" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releases_book_id_content_version_pk" PRIMARY KEY("book_id","content_version")
);
