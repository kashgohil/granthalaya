# content/ — the working area

Source PDFs and everything the pipeline derives from them. **Everything in here except this
file is gitignored**, for two reasons: these are third-party editions whose rights are
confirmed per book before anything is published, and they are large binaries the repository
has no use for. What gets committed is the *inventory about* them — `docs/pdf-inventory.md`.

## Layout

```
content/
  source/     # the PDFs you drop in, one folder per book or edition
  pages/      # rendered page images, one folder per book + a pages.json manifest
  ocr/        # what the OCR read back, per page, with its layout blocks
  books/      # draft packages: book.json + assembly.json, as `assemble` wrote them
    <book>/proofed/     # versioned packages the studio exported, once a human has read them
    <book>/published/   # what the catalog serves. Not scratch — see below
```

The studio (P1.3) only ever *reads* `books/<book>/book.json` — the editable copy of a book being
proofed lives in Postgres, so the draft on disk stays exactly as the machine wrote it and a
re-import always has something honest to diff against. `proofed/` is what export writes, and a
version there is written once: a correction is a new `contentVersion`, never an edit.

## `published/` is the one directory here that cannot be rebuilt

Everything else under `content/` is derived: lose it and you re-render, re-OCR, re-assemble.
A **published** package is not derived — it is a copy of bytes that have been handed out, pinned
by the SHA-256 in the `releases` table, and it is load-bearing twice over (`docs/distribution.md`):

- the catalog serves those exact bytes, and refuses to serve a file that no longer matches its
  recorded hash;
- the *next* version's export reads it to work out which refs it retires, and refuses to compile
  without it rather than shipping a package that silently orphans annotations.

So `published/` needs backing up, or the release bytes need somewhere durable to live. Postgres
holds the record and the hash; it does not hold the file.

## Putting a PDF in

Drop the file anywhere under `content/source/` — subfolders are walked, and `.pdf`/`.PDF`
are both picked up. Name folders after the book or the edition; the inventory reports paths
relative to the corpus root, so the layout is what makes the report readable.

```
content/source/
  vachanamrut/
    vachanamrut-sarvopari-2011.pdf
  swaminarayan-stotra/
    stotra-collected.pdf
```

## Then

```sh
bun run triage content/source --out docs/pdf-inventory.md --json content/inventory.json
```

That writes the P1.1 inventory: per file, whether its text layer can be trusted or the book
needs OCR, the evidence for that verdict, and a ranking of candidates for the first book.
Drop `--out`/`--json` to just print it.

Rights and source edition are the two things triage cannot determine — fill those in yourself
before anything here becomes a published book. See `docs/pdf-triage.md`.

## Then rendering it

Any book triage sends to OCR — which is most of them — gets its pages rendered to images:

```sh
bun run render "content/source/Some Book.pdf"              # → content/pages/some-book/
bun run render "content/source/Some Book.pdf" --pages 1-20 # a range, to try settings first
```

Runs resume, so a stopped render picks up where it left off, and a second page range adds to
the first. `--dpi`, `--format` and `--color` are there when a book needs something other than
the 300 DPI greyscale PNG default. See `docs/page-rendering.md`.
