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
  draft/      # P1.2: draft book packages, before proofing
```

`draft/` arrives with the rest of P1.2.

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
