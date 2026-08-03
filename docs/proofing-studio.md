# The proofing studio

> How a machine's draft becomes scripture a human has read. Implemented in
> `apps/api/src/modules/studio/`, `apps/web/src/routes/studio/` and `packages/db`; run with
> `bun run dev` and open `/studio`. Slice: P1.3.

`assemble` (P1.2) writes a package no human has read, and the format says so: every package it
produces is `contentStatus: "draft"`, and the catalog serves only `published`. That gate is
structural rather than procedural — nothing unverified can be mistaken for scripture just because
it validates — and the studio is the only thing that can open it.

## Three artefacts, three roles

| | What it is | Who writes it |
|---|---|---|
| `book.json` | The P0.2 package. A build artefact a reader installs. | `assemble`, then export |
| `assembly.json` | Where each passage came from, what was repaired, how much to trust it. | `assemble` |
| Postgres | The editable state: both sides of every correction, and its history. | The studio |

The package on disk is never edited in place. The studio imports it, a human corrects it row by
row, and export **re-derives** a package from the database. That is what makes a re-run of
`assemble` safe: the draft it overwrites was never the thing being corrected.

They are joined by the verse ref — `gopalanand-swami-ni-vato/section-2#v63` — which is the only
identifier any of them needs.

## The page images are found by hash, not by name

The package directory is `books/gopalanand-swami-ni-vato` and the pages directory is
`pages/gopalanand-swami-ni-vato-26-feb-2022`. Nothing links them by name — but `assembly.json`'s
`source.sha256` and `pages.json`'s `sourceSha256` are the same value, because the pipeline carries
that hash forward at every hop. Import matches on it.

This makes the chain of custody load-bearing rather than merely recorded: the studio cannot put a
page image beside text that did not come off that exact file. A re-downloaded or swapped PDF
hashes differently and simply has no images, which the import reports rather than papering over.

## Re-import is the point

Import is the easy half. These segmentation rules will be tuned against real pages for a long
time, and every tuning run rewrites `book.json` — so the studio has to take the new draft without
discarding the reading that produced the old one. One rule does that work:

> A row nobody has touched is replaced wholesale. A row somebody has touched keeps what they did,
> and goes back in the queue.

"Touched" is decided by evidence, not by a flag: a passage is untouched when its text is still
exactly what the machine produced *and* its status is still `raw`. So a re-run that improves a
passage nobody has read simply improves it, and a re-run that disagrees with a human is a
disagreement a human resolves — never a silent overwrite in either direction.

| Case | What happens |
|---|---|
| New ref | Inserted as `raw` |
| Untouched, OCR changed | Replaced whole — text, number, evidence |
| Touched, OCR unchanged | Evidence refreshed; the edit and its status stand |
| Touched, OCR changed | The edit stands, `ocrChanged` is set, status drops to `raw` |
| Ref no longer produced | Marked `orphaned` — **never deleted** |
| Created by hand (split, inserted) | Left alone; it was never in an assembly |

**The manifest and section titles are never refreshed.** The source edition, the licence and the
printed title are exactly what `assemble` writes `unknown` into and names as a human's job, and a
section title is provisional until P1.4 can transliterate it. Re-importing them would undo the one
part of a package a machine can never supply.

## The workbench

Three columns, in the order the work happens.

**The queue** has two orderings and they answer different questions. *Book order* is the one that
finishes a book — every passage must be read against its page, and reading a discourse in sequence
is how you notice that the one before it ended mid-sentence. *Worst first* is `assembly.json`'s own
ordering, and it is the right way in: it starts where the machine's evidence is weakest. Filters
come off the data (`flag` counts are computed from the rows), and it is server-paged rather than
virtualized — the sample is seven passages and the book is 442 pages, and paging is what makes that
difference invisible.

**The page image** carries the selected passage's pixel boxes, drawn from the `blocks` that
`assemble` threaded through `assembly.json` for exactly this. Boxes are positioned in percentages
of the image's own dimensions, so the overlay is correct at any width with nothing to measure. A
passage that spans a page break gets a selector for both.

**The text** is set through `resolveTextStyle`/`fontFamilyStack` — the same calls the reader
makes — so it is proofed at the metrics and in the face it will be read at, with no letter-spacing
and the leading the P0.3 band requires. Beside it:

- **`checkOrthography`, live.** Core is platform-pure, so the gate that scored the page at OCR time
  scores every keystroke. It cannot tell you the right word was read; it can tell you a word
  Gujarati cannot spell has just been typed.
- **The repairs list.** Normalization is a no-op on clean text and reports every change it did
  make, which turns "re-read this passage" into "re-read these six places".
- **The OCR text**, to diff an edit against — and the only thing that makes a `ocrChanged` conflict
  resolvable.

Keyboard-first, because a 442-page book is thousands of small decisions: `j`/`k` move, `Enter`
approves and advances, `e` returns to the text, `Esc` leaves it, `p` toggles the page panel. The
selected passage lives in the URL, so a link is a place to come back to.

## Structure, not just text

Assembly's verse-number sequence is the only checksum that stage has, and what it reports —
missing, duplicate, out-of-sequence numbers — are *segmentation* errors. A dropped `॥૬૨॥` welds two
passages into one; a spurious one splits a passage in half. No amount of text editing fixes either,
and the report would be pointless if the studio could not act on it.

| Operation | Rule |
|---|---|
| **Split** | The tail carries the same pages and boxes forward — it came off the same ink — and lands unnumbered, so the queue asks somebody to number it |
| **Merge** | The *earlier* passage survives with its number and id: in a printed book the number closes a passage, so text that follows belongs to the one already open. Evidence is unioned; `no-number` and `very-short` are recomputed rather than inherited |
| **Insert** | For a passage the OCR missed entirely. No boxes — the machine never saw it — and `ocrText` is empty, so it always reads as human-authored |
| **Renumber** | Re-derives the id (`v63`), because the number *is* the identity. A passage whose id said `v61` while its page said `૬૩` would be a lie in the one field a reader would cite |
| **Delete** | The one genuinely destructive operation, for the one case that needs it: a "passage" that is not text — a caption, a running head the tag filter missed |

Ids churn freely, and that is safe precisely because nothing is published: a verse ref is the atom
every annotation and SRS item will hang off, but none of those exist for a draft. Lineage is
recorded anyway so a re-import can still match, and P1.5's cross-version audit is what makes a
rename safe once a version has shipped.

Merging **across a section boundary is refused**. It would change which work a passage belongs to,
which is a different decision from joining two halves of one.

## The apparatus

**Footnotes** are real content, kept out of the discourse above them. They are proofread here — but
not attached to the words that pointed at them, because pairing a gloss to a word decides meaning
rather than text, and a wrong pairing is invisible to every check this pipeline has. That is P1.4.

**Held-back blocks** are the list that makes "nothing is dropped silently" true rather than
claimed, and it is the backstop for the one hazard the filters cannot catch. Asked to read a
decorative glyph, the OCR once answered with an English *description* of it, tagged `paragraph`;
the script filter caught that one, and the same sentence in Gujarati would have gone straight into
a verse. Each block gets a checkbox, and the book overview counts how many nobody has looked at.

## Export refuses more than it writes

`POST /admin/books/:id/export`, and the refusals are the feature:

- **Every passage must be `approved`** — not `proofed`. Read is not the same as cleared.
- **Nothing may still be `unknown`.** A package whose source edition is a placeholder cannot be
  cited, and fidelity that cannot be checked is not fidelity.
- **A version is written once.** Corrections ship as a new `contentVersion`, never as an edit to a
  file already handed out.

Each verse hash is recomputed over the *proofed* text, and the package is validated against P0.2
before it is written — a studio that can produce an invalid package is a bug in the studio, not
something to hand to the catalog and find out.

It comes out `contentStatus: "proofed"`, not `published`. Publishing is P1.5's catalog step, and
keeping them apart is what lets a proofed book sit and be re-read before anyone installs it.

## Auth

One account, because there is one admin. The password is stored only as an argon2id hash
(`bun run admin:password` mints one) and the session is a signed string in an httpOnly cookie
rather than a row — with a single account there is nothing to revoke that clearing the cookie does
not already achieve.

The HMAC is computed in `modules/admin/service.ts` rather than by Elysia's cookie `sign` option.
That option, configured at the instance level, silently did nothing on Elysia 1.4.29: the cookie
went out as a bare `granthalaya_admin=admin.1786357083`, so anything that could be read could be
written. A gate that fails open without saying so is worse than no gate.

An API with no `ADMIN_PASSWORD_HASH` still serves every admin route and refuses all of them with
503. Mounting them conditionally would make `App` — and therefore the typed client the studio is
written against — depend on whether a machine happens to have a password in its environment.

> **Bun expands `$NAME` in `.env` even inside single quotes.** An argon2 hash is nothing but
> `$`-delimited fields, so pasted raw it silently becomes `=19=65536,…` and the right password
> stops working. Write it with double quotes and escaped dollars —
> `ADMIN_PASSWORD_HASH="\$argon2id\$v=19\$…"` — which is what `bun run admin:password` prints. The
> API refuses to start on a mangled one rather than let it look like a forgotten password.

## Implementation

| File | Role |
|---|---|
| `packages/db/src/schema.ts` | The tables, and why each column exists |
| `packages/db/src/testing.ts` | PGlite — real Postgres, no server, so `bun test` passes on a clean checkout |
| `api/modules/admin/` | The session, its HMAC, and the guard every `/admin` route sits behind |
| `api/modules/studio/content.ts` | Reads `content/`; finds page images by source hash. The only file that touches the filesystem |
| `api/modules/studio/assembly.ts` | Zod for `assembly.json` — a file written by another program, parsed rather than asserted |
| `api/modules/studio/import.ts` | Import and re-import, and the touched/untouched rule |
| `api/modules/studio/verses.ts` | The queue, one passage, and its revisions |
| `api/modules/studio/restructure.ts` | Split, merge, insert, delete, renumber. Pure of HTTP |
| `api/modules/studio/apparatus.ts` | Footnotes and held-back blocks |
| `api/modules/studio/export.ts` | The refusals, and compiling the package |
| `web/routes/studio/` | The shell and its gate, the book list, the overview, the workbench |
| `web/components/studio/` | The queue, the page image and its boxes, the editor, the apparatus |

## Database

Postgres via Drizzle (`packages/db`), migrations generated as committed SQL and applied at API
startup. Not `db:push`: these tables hold hours of human proofing that exists nowhere else — the
package it came from is a machine's draft and the corrections are not in it — so a schema change
that silently rewrites a column is the one failure this project cannot absorb.

### `jsonb` is never handed to the driver as a string

Drizzle's built-in `jsonb` column pre-stringifies in `toDriver`, which is right for `pg` and
`postgres.js` — they want text — and **wrong for `Bun.SQL`, which serializes JS values itself**.
Together they encoded twice: `["hyphen-join"]` was stored as the jsonb *string*
`"[\"hyphen-join\"]"`. The same trap applies to a query parameter cast to `jsonb`.

Reads round-tripped, so nothing looked broken. What broke was everything that asks Postgres to
understand the value: `jsonb_array_elements_text` errored with *cannot extract elements from a
scalar*, and every `@>` containment filter matched nothing at all — silently, which is the worst
way for a filter to fail.

Two rules follow, and both are load-bearing:

- **Columns** use the passthrough `jsonb` type defined at the top of `schema.ts`. Never
  `drizzle-orm/pg-core`'s `jsonb` directly.
- **Predicates** never send JSON through a bound parameter. `jsonb_exists(flags, $1)` takes plain
  text; `pages @> to_jsonb($1::int)` builds the scalar server-side.

**No test running on PGlite can catch either fault.** PGlite's driver does not double-encode, so
the suite stayed green while the live database was wrong — that is the blind spot in choosing an
in-process Postgres for tests, and it is worth knowing rather than forgetting. What is testable is
pinned instead: `schema.test.ts` asserts the mapper is the identity, and both predicates were
verified by hand against real Postgres.

```sh
bun run db:generate   # after editing packages/db/src/schema.ts
bun run db:migrate    # also runs automatically when the API starts
bun run db:studio     # drizzle-kit's browser
```
