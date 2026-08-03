# Catalog & distribution

> How a proofed package becomes something a phone can install, and what the phone owes it in
> return. Implemented in `apps/api/src/modules/catalog/`, `apps/api/src/modules/studio/aliases.ts`
> and `packages/core/src/book/` (`audit.ts`, `migrate.ts`, `version.ts`). Slice: P1.5.

The studio's export writes a package that says `contentStatus: "proofed"` — a human has read every
passage against its page. Publishing is the separate step that hands those exact bytes out, and
from that moment they are immutable: `gopalanand-swami-ni-vato@1.0.0` means the same text on a
phone that installed it today and one that installs it in three years.

Two steps rather than one, deliberately. A proofed book can sit and be re-read before anybody
installs it, and what gets published is the file somebody cleared rather than a fresh
re-derivation from rows that may have moved since.

## Three artefacts

| | Where | Who writes it | Status |
|---|---|---|---|
| The draft | `content/books/<id>/book.json` | `assemble` | `draft` |
| The proofed package | `content/books/<id>/proofed/<id>-<version>.json` | studio export | `proofed` |
| The published package | `content/books/<id>/published/<id>-<version>.json` | publish | `published` |

The `releases` table is the catalog's index — one row per published version, carrying the file's
SHA-256, its size, its verse count and the manifest fields a listing renders. It is the only table
in `packages/db` with **no foreign key to `books`**: every other table is a book's editable copy
and cascades away with a bad import, but a release describes bytes that have left this machine.
Deleting the working copy must not erase the fact that `v1.0.0` is on somebody's phone.

> **`content/books/<id>/published/` is the one part of `content/` that cannot be rebuilt.**
> Everything else there is derived — lose it and you re-render, re-OCR, re-assemble. A published
> package is a copy of what was handed out: the catalog serves those exact bytes, and the *next*
> version's export reads it to work out which refs it retires. Postgres holds the record and the
> hash; it does not hold the file. Back it up.

## The API

Everything under `/catalog` is public. A reader's phone has no session, and the gate is not
authentication — it is that the only way into the `releases` table is `publishBook`.

| Route | What it answers |
|---|---|
| `GET /catalog/books` | The shelf: every published book, with its manifest and every version |
| `GET /catalog/books/:bookId` | One book, or 404 if nothing of it is published |
| `GET /catalog/books/:bookId/:contentVersion` | The package itself |
| `GET /catalog/books/:bookId/latest` | 302 to the concrete newest version |
| `POST /admin/books/:bookId/publish` | Publish an exported version (session required) |

**A version is an address**, so the bytes are served with a year-long `immutable` cache and an
ETag that *is* the package's SHA-256 — a client that already holds those bytes gets a 304 for
free. `latest` is a redirect rather than a resource for the same reason: it answers "which version
should I install?" without creating a cacheable URL whose contents change.

**Integrity is stated before it is needed.** The listing carries each version's hash, so a client
verifies a download against something it fetched separately rather than against a header that
arrived alongside the bytes it is checking. The API re-hashes the file on every download too: a
published package that no longer matches its record is answered with a 500 and a reason, never
served. The whole point of pinning it is that nobody downstream could tell the difference.

## Two hashes, still

`verse.hash` is FNV-1a over one verse's layers — change detection, no crypto API, identical in
Bun, Hermes and the browser (`docs/book-format.md` §5). The package hash is SHA-256 over the whole
file, computed by the API with real platform crypto. Different jobs, different algorithms, and
neither substitutes for the other.

The package hash is over **the bytes as written**: tab-indented, one trailing newline. That
formatting is part of the artifact's identity, which is why `serializePackage` exists rather than
each caller reaching for `JSON.stringify`.

## What publishing refuses

- **Anything not exported.** Publishing hands out proofed bytes; it does not compile new ones.
- **Anything not `proofed`.** A draft is machine output nobody has read.
- **A version that already exists** — as a row or as a file. Both are checked.
- **A package that fails `validateBook`.** A package a client could not parse must not reach a
  catalog.
- **A package that fails the cross-version audit.** Below.

A refusal is a 409 carrying the list of things to go and fix — nothing about the request was
wrong. The studio's **Check** button is the same code path stopped one line short of writing, so a
preview cannot disagree with the thing it previews.

## The cross-version audit

`validateBook` sees one package in isolation, which is enough to prove it is well-formed and
nothing like enough to prove it is safe to hand out. The failure this exists to prevent has no
symptom inside a single package: a republish that drops a verse ref orphans every highlight,
flashcard, SRS item and audio timestamp keyed to it, on every device that already installed the
version before — and the package that did it validates perfectly.

So `auditRelease` (in `packages/core`, because a client needs the same diff to reason about an
upgrade it is offered) compares the candidate against the last published version:

| Finding | Severity | Why |
|---|---|---|
| A verse ref disappeared with no entry in `aliases` | **error** | Stability rule 3, enforced. There is always something to say — a deletion aliases to the division that held it — so silence is always a mistake |
| A division ref disappeared with no alias | warning | A deep link into a chapter is user data too |
| An alias the published version carried is missing | **error** | Clients upgrade from whatever they installed, not from the version before this one. The map has to accumulate |
| The bump understates the change | warning | The version *is* the instruction to the client; a restructure shipped as a patch says "nothing to migrate" |
| Nothing changed at all | warning | Asking every client to download a copy of what it has |
| The candidate is not a newer version | **error** | A version is written once |

`bumpBetween` reads what a version claims; the format's own table (§5) says what it owes:
retirements are **major**, additions **minor**, corrections **patch**. Removing a declared layer
counts as a retirement — a translation that disappears takes every reader setting and quiz built
on it with it.

## Retiring refs is export's job

Ids churn freely while a book is a draft, and that is safe precisely because nothing is published.
From the first publish onwards, every ref the published version resolved has to point *somewhere*
in the next one, and export computes that map (`studio/aliases.ts`) from two things the studio
already has:

- **The last published package** — the only honest record of which refs a reader might hold. The
  draft's own history is not it: a ref that existed for an hour between two re-imports was never
  given to anybody.
- **`verses.lineage`**, which every restructuring operation writes. A split records the ref its
  tail was cut from, a merge the ref it absorbed, a renumber the id it used to have.

Where lineage says nothing, the ref is a genuine deletion and the format prescribes the answer:
alias it to the division that held it — *the text you annotated is gone, here is where it was.*

The map accumulates and re-points. v1's retirements stay in v3's map, aimed at wherever their
target has since moved. Publishing then audits the result independently — a check on this step,
not a repeat of it.

## The client install contract

What a client must do, in order. `packages/core` implements the parts that are pure logic, so the
mobile installer and the studio's preview cannot disagree about them.

**Install**

1. `GET /catalog/books` (or one book) and keep the version's `sha256`, `bytes` and `contentVersion`.
2. `GET` the version's `url`.
3. **Verify** the downloaded bytes against the `sha256` from step 1. A mismatch is a failed
   install, never a warning — the package is scripture and this is the only check that it arrived
   intact.
4. `parseBook` / `validateBook` it, then ingest into SQLite. Everything after install is offline:
   the API is for sync and distribution, never for rendering the reading path.
5. Store the `contentVersion` beside the book. It is what the next upgrade diffs against.

**Upgrade**

1. Install the new version exactly as above. Both versions are byte-stable, so a partial download
   can be retried rather than reconciled.
2. Take every ref the local user data is keyed to — highlights, flashcards, SRS items, audio
   marks, reading position — and run `migrateRefs(newBook, refs)`.
3. Apply what it says:
   - `live` — nothing to do.
   - `rewritten` — rewrite the key to `to`. Aliases chain, so an install two versions behind
     upgrades as correctly as one that is a single version behind.
   - `orphaned` — **keep the annotation, detach it, and show it.** Dropping an unresolvable ref is
     a silent deletion of something a person made, and is indistinguishable from their never
     having made it. `summarizeMigration` gives the line to show after an upgrade.
4. Only then swap the reader over to the new version.

A `major` bump is the signal that step 2 will actually do something; `minor` and `patch` still run
it, because it is cheap and being wrong about that is expensive.

## Implementation

| File | Role |
|---|---|
| `core/book/version.ts` | Semver ordering, and what a bump claims |
| `core/book/audit.ts` | The cross-version diff and its findings |
| `core/book/migrate.ts` | Rewriting refs through `aliases`; orphans surfaced, never dropped |
| `db/src/schema.ts` (`releases`) | The catalog index, and why it does not cascade |
| `api/modules/catalog/integrity.ts` | SHA-256, and the exact serialization it is over |
| `api/modules/catalog/publish.ts` | The refusals, the audit, the immutable write |
| `api/modules/catalog/service.ts` | Listing, semver ordering, verified reads |
| `api/modules/catalog/index.ts` | The public routes |
| `api/modules/studio/aliases.ts` | Deriving the retirement map at export time |
| `web/components/studio/publish-button.tsx` | Check and publish, and what a refusal looks like |
