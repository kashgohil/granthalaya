# Page rendering

> Turning a PDF into the images it will be OCR'd and proofed from. Implemented in
> `packages/pipeline/src/pdf/rasterize.ts`; run with `bun run render <pdf>`. Slice: P1.2.

## Why the images are the source of truth

Triage decides *that* a book has to be OCR'd (`docs/pdf-triage.md`). This is the step that
produces the only input the OCR engine will ever see, which makes it the point where the
project's central rule — never trust a Gujarati PDF's embedded text — stops being a decision
and becomes a file on disk.

The same images are what a human proofreads against in P1.3, so they have to stay faithful to
the page **as published**. That is a stronger requirement than "legible": anything the
renderer adds or drops is something a proofreader will silently accept as scripture.

## The settings, and why they are what they are

| Setting | Default | Why |
|---|---|---|
| Resolution | 300 DPI | The floor every OCR engine's documentation asks for on printed text. Verified legible on a 4.7×7 in trim size, where the type is physically small |
| Colour | Greyscale | OCR engines binarize anyway, and it is a third of the bytes. `--color` exists for editions that print headings or Sanskrit quotations in red |
| Format | PNG | Lossless. JPEG rings around thin strokes, and a Gujarati conjunct is mostly thin strokes |
| Alpha | Off | An OCR engine wants ink on white; a transparent background flattens to black |
| Annotations | Not rendered | A previous reader's highlight is an annotation, and it would end up in the scripture |

`--dpi`, `--format`, `--quality` and `--color` all exist because the right answer is per book,
and the report prints what was used so a directory of images is never ambiguous about it.

## The manifest is the contract

Every run writes `pages.json` beside the images. P1.2's OCR step reads it rather than globbing
the directory, and it carries one field the rest of the pipeline depends on:

```json
{
  "source": "Gopalanand Swami Ni Vato 26 Feb 2022.pdf",
  "sourceSha256": "4b1936a7c2e55820…",
  "sourceBytes": 3170297,
  "pageCount": 442,
  "dpi": 300, "format": "png", "color": "gray",
  "pages": [{ "number": 1, "file": "page-0001.png", "widthPx": 1424, "heightPx": 2133, "bytes": 190112 }]
}
```

`sourceSha256` pins these images — and every verse eventually OCR'd out of them — to one exact
file. A re-downloaded or swapped PDF produces a different hash, so it can never be silently
OCR'd as though it were the edition that was proofed.

Pages are named `page-0001.png`, zero-padded to at least four digits. Unpadded numbering is
the thing that goes wrong first: page 10 sorts before page 2 in a listing, a glob and a shell
expansion, and every one of them is somewhere the order is assumed rather than checked.

## Resuming

A render is resumable, because settings get tried more than once and a book is hundreds of
pages. Pages already on disk are kept; `--force` re-renders them.

Resuming is allowed **only** when the manifest agrees with the current run on source hash,
DPI, format and colour. Half a book at 150 DPI mixed with half at 300 is worse than neither,
and it would not be visible in a directory listing. When they disagree the run starts over.

Rendering a range adds to what is there rather than replacing it: `--pages 1-40` today and
`--pages 41-` tomorrow add up to a book.

```sh
bun run render content/source/book.pdf                     # whole book, content/pages/<slug>/
bun run render content/source/book.pdf --pages 1-40        # a range, to try settings on
bun run render content/source/book.pdf --dpi 600 --force   # re-render everything higher
```

Nothing here throws. A page that fails to render is a row in the report and the rest of the
book still gets done — losing 441 good pages to one malformed one is not a trade worth making.
The command exits non-zero if any page failed.

## What the first real book showed

*Gopalanand Swami ni Vato*, 442 pages: **10 seconds, 77 MB**, greyscale PNG at 300 DPI, median
page 166 KB. A legacy-font PDF with no page images, so the render is pristine — no scan noise,
no skew, no bleed-through, and any DPI is available for free.

Five things on those pages that P1.2's OCR and structure detection have to handle, none of
which were visible from the text layer:

- **Numbers are in Gujarati digits.** Page numbers, *vato* numbers and footnote markers are
  all `૦-૯`. `॥૬૧॥` closes a *vato*; `૫૬` is a page number.
- **Printed page numbers are not PDF page numbers.** They run 27 behind throughout — PDF page
  83 is printed `૫૬`. That offset *is* the front matter, and it is a constant worth measuring
  rather than assuming.
- **Sections announce their own ends.** `॥ પુરુષોત્તમપણાની વાતો સમાપ્ત ॥` — "the vato on
  Purushottam-hood are complete" — is exactly the work-boundary marker P1.2 needs, printed in
  the text rather than hidden in a bookmark.
- **Footnotes sit below a rule at the foot of the page**, keyed by a superscript Gujarati
  digit. They are not body text and must not be spliced into a verse.
- **Devanagari appears inside Gujarati pages.** Sanskrit shlokas are set in Devanagari with a
  Gujarati translation beneath, so OCR needs both scripts and the layer format needs to record
  which is which.

## Implementation

| File | Role |
|---|---|
| `pdf/rasterize.ts` | Page → pixmap → PNG/JPEG, the manifest, and resuming |
| `render.ts` | Argument parsing (pure) and the report the CLI prints |

The page-range grammar (`12`, `1-40`, `300-`, or a comma-separated mix) is parsed without a
page count and resolved against the real one only once the book is open — an open-ended range
has no length until then, and inventing one is how `--pages 300-` becomes ten million
integers.
