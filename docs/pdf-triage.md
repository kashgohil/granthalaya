# PDF triage

> How the pipeline decides whether a PDF's text layer can be trusted, or whether the book has
> to be rendered to images and OCR'd. Implemented in `packages/pipeline/src/pdf/`; run with
> `bun run triage <path>`. Slice: P1.1.

## The problem this solves

Gujarati religious PDFs are typeset three different ways, and they look identical on screen:

1. **A true Unicode text layer.** The bytes behind the glyphs are Gujarati code points. The
   text can be extracted directly.
2. **A legacy-font text layer.** The file uses a pre-Unicode font — Shree Gujarati, LMG,
   Terafont, Gopika — which paints Gujarati glyphs onto *Latin* code points. The page reads
   perfectly, copy-paste yields `Ap[ NA[T> lJvg`, and a naive extraction would publish that
   as scripture.
3. **A broken Unicode text layer.** The file declares a `ToUnicode` map — its own promise
   that its glyphs extract to real Unicode — and that map is *wrong*. Every character comes
   out a legitimate Gujarati code point and the words are impossible.
4. **Scanned page images**, with or without somebody else's OCR layer over the top.

Only the first can be trusted. The roadmap's rule is absolute: **never trust embedded text
from a Gujarati PDF's fonts — render pages to images and OCR instead** — and triage is where
that rule stops being a note and becomes a function.

Case 3 was not hypothetical. The first real Gujarati PDF this project met was produced by
Foxit PDF Creator from a document set in Shruti, and its `ToUnicode` map never produced the
pre-base matra `િ` at all. `નિરાંતે` extracted as `નનરાુંતે` — the matra replaced by a copy of
its own consonant — and a spurious `ુ` was inserted before every anusvara. The script tally
read 100% Gujarati. The first version of this tool passed it as `unicode-text, no OCR needed`.

## The decisive signal

Not the font's name, and not its flags: **what script the text actually extracts as.**

A legacy font's whole nature is that its bytes are Latin. So any PDF that ought to be
Gujarati and extracts as Latin is lying about its text layer, whatever its metadata claims.
`profileScript` in `packages/core` tallies extracted characters by script, ignoring spaces,
digits, punctuation and the danda — all of which are shared, and any of which would otherwise
drag a genuine Gujarati page toward Latin.

Everything else is corroboration:

| Signal | What it adds |
|---|---|
| **Orthographic well-formedness** | Catches a text layer that is Gujarati *code points* but not Gujarati *words* — the only signal that sees a wrong `ToUnicode` map |
| Known legacy font family | Confirms a Latin-extracting page; the list is never complete, so it can never be required |
| Unmappable font | No `ToUnicode` map **and** no standard encoding to fall back on, so any extraction is a guess |
| Common-English-word rate | Separates a *genuine English* PDF from legacy soup — both extract as Latin, only one is language |
| Image coverage | A page that is mostly a picture is a scan, whatever text sits over it |

### Orthography: what "impossible" means

`checkOrthography` in `packages/core` encodes sequences the writing system does not permit,
so a correctly encoded book scores exactly **zero** and the check can be trusted in both
directions:

- two dependent vowel signs in a row (`ચાુંચ` — no syllable has two vowels)
- a vowel sign with no consonant to attach to
- a virama followed by a vowel instead of a consonant (`કહ્ુું` — the `ય` was dropped)
- a virama with no consonant before it
- a long text containing **not one pre-base matra** — mechanically impossible in prose

Anusvara, candrabindu, visarga and nukta are deliberately *not* treated as vowel signs: `ુ` +
`ં` is the everyday `ું`, and folding them in would make the commonest spelling in the
language look like a violation.

The pre-base matras (`િ`, `ि`) are the diagnostic, and not by accident. A PDF stores glyphs
in *visual* order, so a pre-base matra's glyph sits before the consonant it follows;
producing correct Unicode means reordering it back, and a mapping that gets anything wrong
tends to get that wrong first.

Measured separation: the corrupt file scores **50 impossible sequences per 1000 letters**,
clean Gujarati scores **0**. The threshold is 1 per 1000 — forty-five times of headroom,
with room for a stray editorial artefact.

## Rules

Each sampled page gets a verdict, and the document's verdict is the consensus of its pages.

**Per page**, in order:

1. Image coverage ≥ 50% → `scanned`. Even a clean Unicode text layer over a page image is
   somebody else's OCR of unknown provenance; we re-run our own and diff against it later.
2. Fewer than 32 script-bearing characters → `blank`. Says nothing; not counted as evidence.
3. Gujarati or Devanagari ≥ 50% of script-bearing characters → check its orthography:
   - more than 1 impossible sequence per 1000 letters → `broken-encoding`
   - otherwise → `unicode-text`
4. Latin-dominant **and** ≥ 12% common English words → `unicode-text`. It is a real text
   layer that happens not to be Indic.
5. Otherwise → `legacy-text`.

**Per document:** the leading page verdict wins if it holds ≥ 80% of the non-blank pages;
below that the book is `mixed` and needs a per-section decision. A file that is encrypted,
corrupt or entirely blank is `unknown`.

Pages are sampled evenly across the book rather than from the front — front matter is
routinely typeset unlike the body (an English title page, a scanned frontispiece), so a
prefix would misread a book more often than a spread does. The sample is deterministic, so
two runs over the same corpus are comparable.

## Ambiguity resolves toward OCR

`needsOcr` is true for every verdict except `unicode-text`. The two mistakes do not cost the
same: re-OCRing a book that had a good text layer wastes machine time, while trusting a
legacy layer corrupts scripture — silently, and in a way no later step would catch.

The known consequence is that a book set entirely in romanised Sanskrit would be sent to OCR,
because it fails both the Indic test and the English test. That is the safe direction, and
the report states its reasoning so a human can overrule it.

## What triage cannot tell you

The report says so itself, and it matters for P1.1's inventory:

- **Rights and source edition.** Never inferable from a file. Confirm both before publishing.
- **Whether a book is verse-structured.** The first-book ranking orders candidates by how far
  the text layer can be trusted and then by length; which of them is the right *book* to start
  with is a human judgement.
- **OCR quality.** Triage picks the extraction route; P1.2 measures how well it worked.

## Using it

```sh
bun run triage ./books                                  # report to stdout
bun run triage ./books --out docs/pdf-inventory.md      # write the inventory
bun run triage ./books --json build/inventory.json      # machine-readable, drives P1.2
bun run triage ./books --sample 24                      # inspect more pages per file
```

Exits non-zero if any file came back `unknown`, so a corpus with an unreadable file cannot
pass silently. The JSON carries per-file strategy, confidence, reasons, fonts and per-page
verdicts — P1.2 reads it to decide, per book, whether to pull the text layer or render pages.

## Implementation

| File | Role |
|---|---|
| `pdf/inspect.ts` | The only file that touches MuPDF. Reports text, fonts, images and geometry; draws no conclusions |
| `pdf/classify.ts` | Pure. Facts in, verdict out — the rules above |
| `pdf/report.ts` | Pure. Renders the markdown inventory and the JSON |
| `pdf/synthetic.ts` | Hand-built PDFs carrying one signal each, so the classifier is testable without a corpus |
| `triage.ts` | Finds the files, drives the three, writes the outputs |
| `core/src/text/script.ts` | `profileScript` — the script tally the decision starts from |
| `core/src/text/orthography.ts` | `checkOrthography` — the rules that catch a wrong `ToUnicode` map |

The inspect/classify split is deliberate: the part that decides whether a book gets OCR'd is
pure, so it is argued with in a test rather than in a code review.
