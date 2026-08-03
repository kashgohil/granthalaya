-- Repair jsonb values that were written twice-encoded.
--
-- Drizzle's own `jsonb` column pre-stringifies in `toDriver`, and `Bun.SQL` serializes JS values
-- itself, so every value written through the pair landed as a jsonb *string* holding JSON text:
-- `["hyphen-join"]` was stored as `"[\"hyphen-join\"]"`. Reads round-tripped and looked correct;
-- what broke was everything that asks Postgres to understand the value — `jsonb_array_elements`
-- errored with "cannot extract elements from a scalar", and every `@>` containment filter matched
-- nothing at all, silently.
--
-- `schema.ts` now hands the value to the driver untouched, so new writes are correct. This repairs
-- what the old ones left. `#>> '{}'` extracts a jsonb string's text, which is the JSON we want back.
--
-- Guarded per row by `jsonb_typeof(...) = 'string'`, so it is a no-op on correctly-stored values
-- and safe to re-run. A value that is *legitimately* a JSON string would be caught by this too —
-- none of these columns holds one: every last one is an object or an array.

UPDATE "verses" SET
  "flags"            = CASE WHEN jsonb_typeof("flags")            = 'string' THEN ("flags"            #>> '{}')::jsonb ELSE "flags"            END,
  "pages"            = CASE WHEN jsonb_typeof("pages")            = 'string' THEN ("pages"            #>> '{}')::jsonb ELSE "pages"            END,
  "printed_pages"    = CASE WHEN jsonb_typeof("printed_pages")    = 'string' THEN ("printed_pages"    #>> '{}')::jsonb ELSE "printed_pages"    END,
  "blocks"           = CASE WHEN jsonb_typeof("blocks")           = 'string' THEN ("blocks"           #>> '{}')::jsonb ELSE "blocks"           END,
  "repairs"          = CASE WHEN jsonb_typeof("repairs")          = 'string' THEN ("repairs"          #>> '{}')::jsonb ELSE "repairs"          END,
  "footnote_markers" = CASE WHEN jsonb_typeof("footnote_markers") = 'string' THEN ("footnote_markers" #>> '{}')::jsonb ELSE "footnote_markers" END,
  "lineage"          = CASE WHEN jsonb_typeof("lineage")          = 'string' THEN ("lineage"          #>> '{}')::jsonb ELSE "lineage"          END,
  "orthography"      = CASE WHEN jsonb_typeof("orthography")      = 'string' THEN ("orthography"      #>> '{}')::jsonb ELSE "orthography"      END;
--> statement-breakpoint
UPDATE "books" SET
  "manifest" = CASE WHEN jsonb_typeof("manifest") = 'string' THEN ("manifest" #>> '{}')::jsonb ELSE "manifest" END,
  "assembly" = CASE WHEN jsonb_typeof("assembly") = 'string' THEN ("assembly" #>> '{}')::jsonb ELSE "assembly" END;
--> statement-breakpoint
UPDATE "divisions" SET
  "title" = CASE WHEN jsonb_typeof("title") = 'string' THEN ("title" #>> '{}')::jsonb ELSE "title" END
WHERE "title" IS NOT NULL;
--> statement-breakpoint
UPDATE "page_notes" SET
  "block" = CASE WHEN jsonb_typeof("block") = 'string' THEN ("block" #>> '{}')::jsonb ELSE "block" END;
--> statement-breakpoint
UPDATE "set_aside_blocks" SET
  "bbox" = CASE WHEN jsonb_typeof("bbox") = 'string' THEN ("bbox" #>> '{}')::jsonb ELSE "bbox" END;
