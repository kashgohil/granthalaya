# Assembly

> How a book's OCR'd pages become a draft package. Implemented in
> `packages/pipeline/src/assemble/` and `packages/core/src/text/normalize.ts`; run with
> `bun run assemble <ocr-dir>`. Slice: P1.2.

`assemble` is the last step of the extraction pipeline and the first input to the proofing
studio. It reads what `ocr` wrote, finds the book's structure in what the pages themselves
print, normalizes the text away from the typesetting, and emits two files.

It spends no money and calls nothing. Re-running it is free, which is the point: these
segmentation rules will be tuned against real pages for a long time, and tuning is only cheap
if the loop is.

## Two artefacts, joined by the ref

**`book.json`** is the P0.2 package and nothing more. Everything the pipeline knows *about* the
extraction stays out of it, because a package is a build artefact that a reader installs, not a
record of how it was built.

**`assembly.json`** is that record — the sidecar P1.3 reads. Per passage: the pages and pixel
boxes its text came from so a side-by-side view can line up, every repair the machine made so a
human can check exactly those places, and a confidence score so proofing starts where the
evidence is weakest rather than at page one. Its `verses` array is sorted worst-first; that
order is its main affordance.

The two are joined by the verse ref (`gopalanand-swami-ni-vato/section-2#v63`), which is the
only identifier either needs.

## The structure is printed on the page

The pages say where the structure is, and they say it in ink rather than in metadata. Four
pages of the first real book showed the whole grammar:

| Signal | What it means | Example |
|---|---|---|
| `॥<digits>॥` | A passage ends here, and this is its number | `॥૬૨॥` |
| A danda-wrapped completion line | A work ends here | `॥ પુરુષોત્તમપણાની વાતો સમાપ્ત ॥` |
| A block tagged `section-title` or `headline` | A work begins here | `મુક્તના ભેદની વાતો` |
| Nothing at all | The passage continues on the next page | |
| Digits in the running head | The printed page number | `૫૮` on PDF page 85 |

The numbers are in **Gujarati digits** throughout, parsed by `packages/core/src/text/digits.ts`.

Three consequences worth stating:

- **The number leaves the text.** A passage's text keeps its closing danda and loses its
  number, which moves to the schema's `number` field — exactly how P0.2's own fixtures are
  written (`ધિયો યો નઃ પ્રચોદયાત્ ॥` with `number: "૪"`). Keeping it in both places would
  render it twice and, worse, fold it into the verse hash, so correcting a misread number would
  silently invalidate every annotation keyed to the passage.
- **A passage does not care where the page ends.** The only state carried across a page
  boundary is the passage being assembled — which is exactly the state a printed book carries
  across a page boundary too. Any passage assembled from more than one page is flagged.
- **The completion word must be danda-wrapped.** `સમાપ્ત` inside a sentence is a passage
  talking about completion; `॥ … સમાપ્ત ॥` on its own line is a section ending. Requiring the
  wrapping is what keeps the first from closing the section it sits in.

Which of `section-title` and `headline` the OCR picks is not predictable from the page — this
book's grandest openings, with an illustration, a circled chapter number and the title in
display type, come back as `headline`, while plainer ones come back as `section-title`. Both
open a division and the script rule below decides. Reading only the first cost eleven divisions:
each title was welded onto the passage beneath it, inside the verse hash, and the four
back-matter chapters ran together as one division, each counting its passages from ૧ so their
ids collided into `v1`, `v1-2`, `v1-3`, `v1-4`.

### Script is what separates structure from quotation

A Gujarati book admits Devanagari, because a Sanskrit shloka quoted mid-discourse is scripture.
But admitting it for *text* must not admit it for *structure*, and two of the signals above are
read in the book's own script only:

| Signal | Rejected when | Because |
|---|---|---|
| A `section-title` block | It is not in the book's script | The OCR tags a bold, centred line `section-title` on layout alone. In bilingual commentary that line is the quoted shloka: nine of the first book's forty such blocks were Devanagari, and obeying the tag broke one work into a division per shloka, each titled with the shloka — and swallowed the shloka's first line into the title, losing it from the text |
| `॥<digits>॥` | The digits are not in the book's script | A shloka prints its own `॥१॥`. Closing the discourse on it cuts the passage in two and hands the second half the shloka's number as its identity — four passages of the first book were built that way, `v1` and `v2` deep in a book numbered past 200 |

Neither rejection discards anything: the block falls through and stays in the passage as the
quotation it is. A rejected number also resumes the scan **one character in** rather than past
the whole match, because two danda groups can share a danda — page 153 flattens a footnote
marker and a passage number into `॥२॥૧૫૮॥`, and consuming the first would take the danda the
second needs.

### An untitled division takes the head printed across its pages

A division reaches the end untitled when the edition gave the OCR nothing to tag — text before
the first heading, or a heading refused above. The running head is still printed on every page
of it, so the title is *on the page* rather than inferred. This book sets the book's own name on
one side of the spread and the division's on the other, so the book-wide commonest head is
excluded before tallying. A tie leaves the division untitled: two heads appearing equally often
over one division is evidence that it is really two. Titles recovered this way are marked
`titleSource: "running-head"`, because a printed heading is stronger evidence than a head.

## The verse-number sequence is the checksum

It is the only one this stage has. A passage the OCR missed entirely leaves no other trace —
the text simply reads on — so the report calls out every gap, repeat and jump in the printed
numbering. `MISSING numbers: 2` is the single most valuable line `assemble` prints.

The rule lives in `packages/core` (`checkVerseSequence`), not here, because two surfaces have to
agree on it: `assemble` computes it from the pages and the studio recomputes it from the live
rows, and the overview shows the two side by side. Two implementations would eventually
disagree, and a disagreement the studio cannot explain is worse than no checksum.

### Runs, because a book need not count from cover to cover

The first real book numbers its વાતો 1–569 straight through thirty-one divisions, then an
appendix starts again at 1. Read as one sequence that appendix is a pile of duplicate and
out-of-order numbers — a report about the checksum rather than about the book. So numbers are
grouped into **runs**, and a new run opens only when both of these hold:

- **at a division boundary** — inside a division a number that does not follow its predecessor
  is a fault in that run, or one misread digit would silently split the book and hide every gap
  after it;
- **counting backwards** — starting again means the number goes back. A number that jumps
  *forward* at a boundary is a gap, quite possibly a passage the OCR dropped, and calling that a
  restart would swallow the one signal this checksum exists to give.

Each restart is reported as its own line of evidence, because a misread number looks exactly
like one. Faults are found within a run, where they mean something.

A run names its division by **id**, never by position: the two callers do not agree on position
— `assemble` counts sections it later drops for being empty, the studio only ever sees the ones
that survived — so an index would make the same book's two reports disagree in the one field a
reader would use to go and look.

The printed page number is checked the same way: `pdfPage - printedPage` should be one
constant, and it was 27 across the whole of the first book. The *commonest* offset wins, so one
misread folio cannot move the book; pages that disagree are listed individually.

## Normalization is a no-op on clean text

`normalizeScriptureText` is the post-processing pass, and this is its governing rule. Every
repair fires only on something the writing system forbids or the typesetter demonstrably
inserted; none acts on a matter of taste. That is what makes it safe to run over 442 pages
unattended.

It runs NFC, strips the control characters the format rejects, folds the printed layout away,
and makes exactly three kinds of repair — each reported individually with its context, because
a silent repair is indistinguishable from a misreading that was already there:

| Repair | Why it is safe |
|---|---|
| **hyphen-join** — a word broken across two printed lines is closed up | The one repair that can be wrong: a genuine compound may also break at its hyphen. Hence the flag |
| **pre-base-matra-order** — `િ` standing before its consonant moves after it | Fires only where the matra has *no* base, i.e. where `checkOrthography` already calls the text impossible. Moves past the whole conjunct: `િ` + `સ્થ` is `સ્થિ`, never `સિ્થ` |
| **footnote-marker** — a superscript digit welded onto a word is removed | Gujarati words contain no digits. Requires a letter tight against the digit with no space, and one or two digits only, so `॥૬૧॥`, `(૧)` and `સંવત ૧૮૭૬` are all untouched |

Line joins and whitespace are *counted*, not listed: they happen on nearly every line, so
listing them would bury the three above.

Prose folds printed line breaks into flowing text; verse keeps them, because in verse the line
breaks are the poet's rather than the typesetter's. `--form` picks.

A *paragraph* break is not a line break, and it survives. Two fragments of one passage are
always two different blocks — a printed number closes a passage, so no block contributes twice
to the same one — which makes the page the deciding evidence:

| Boundary | Read as | Why |
|---|---|---|
| Two blocks **on one page** | A paragraph break, kept | The OCR split them because the typesetter did: the second begins with a first-line indent, mid-passage |
| Two blocks **across a page** | The same paragraph carrying on, folded | The ordinary way a passage spans two pages. The only printed signal for a *new* paragraph at the top of a page is that indent, and block-level boxes cannot see it — so the join is folded and `spans-pages` sends a human to the image |
| Either side is a **quotation** | A paragraph break, kept | A Sanskrit shloka is set apart rather than run into the prose around it |

Folding these would be a quiet loss: વાત ૬૭ of the first real book is 4,904 characters over
thirteen blocks, and it is an enumerated list — `(૨)` through `(૭)` each open a paragraph. As one
run it reads as a wall of text in the studio and in the reader alike. Across the book the rule
recovers 328 paragraph breaks in 143 of 625 passages.

Run over the four real OCR'd pages, the pass fires exactly six times: one hyphen join
(`વૈરાટ-પુરુષમાં`) and the five footnote markers, matching what page 86's footnote block
defines. Nothing else changes, and every page stays at zero orthography violations.

## What is kept out of the text, and what is merely set aside

- **Page furniture** (`header`, `page-number`, `folio`) and **non-text blocks** (`image`,
  `chart`) never enter a passage. A running head left in the body would sit inside 442 verses.
- **Footnotes** (`footer`, `footnote`) are real content and are kept — per page, in
  `assembly.json` — but never spliced into a discourse.
- **Blocks in a script the book does not admit** are set aside. A Gujarati book admits Gujarati
  *and* Devanagari, because a Sanskrit shloka quoted mid-discourse is scripture and the format
  has admitted that shape since P0.2. Latin stays the tripwire that caught the model answering
  in English.

Nothing is dropped: everything set aside is recorded with its tag, page and box. A silent drop
is indistinguishable from text the OCR never saw.

**Footnotes are not attached to the words that pointed at them.** The evidence is all
there — each passage records the markers it carried, each page records the notes printed below
its rule — but pairing them means deciding which gloss belongs to which word, and a wrong
pairing corrupts meaning rather than text. That is layer authoring, it is P1.4, and it happens
with a human in the loop.

## Confidence is a legible table, not a formula

Each flag costs a fixed amount, listed in `CONFIDENCE_PENALTY`, and the score is `1 − Σ`. A
reader of the report can see exactly why a passage scored what it did and argue with it. The
score exists to *order* the proofing queue, not to decide anything.

| Flag | Cost | Meaning |
|---|---|---|
| `orthography` | 0.40 | Still contains sequences Gujarati cannot spell |
| `no-number` | 0.35 | No printed number, so no identity of its own in the edition |
| `duplicate-number` | 0.30 | Its number repeats one already seen |
| `out-of-sequence` | 0.30 | Its number does not follow the previous one |
| `very-short` | 0.15 | Short enough to be a fragment |
| `spans-pages` | 0.10 | The one join the OCR could not see for itself |
| `hyphen-join` | 0.05 | A word was closed up across a line break |
| `contains-quotation` | 0.05 | Carries a run in another admitted script |

## What only a human can supply

The source edition, the licence, and the book's title as printed. `assemble` writes `unknown`
into the first two and names all three under "Only you can supply these" rather than inventing
them — a fiction there would be a fiction in a project whose first principle is fidelity.

As evidence, the report tallies the **running heads** it saw, with the folio stripped and
anything not in the book's own script dropped. (The first real book's headers each carry
`INDEX`, a button the PDF's viewer draws rather than anything the edition prints; without the
filter it wins the tally and gets offered as the title.)

A `--meta <file>` JSON supplies all of it properly.

## Ids

- **Verses** take the printed number: `v61`. It is the edition's own identity for the passage,
  it survives re-extraction, and it is what a reader would cite. A passage with no printed
  number falls back to where it was found (`p86-6`) and is flagged, so it is visible in the
  proofing queue as something for a human to settle.
- **Divisions** are positional: `section-1`. Provisional — the studio renames them once the
  Gujarati title can be transliterated (P1.4), and P1.5's cross-version audit is what makes a
  rename safe.

## Status

Every package `assemble` writes is `contentStatus: "draft"` and stays that way. The catalog
serves only `published` packages, which is what makes the proofing gate a property of the
format rather than a step someone might skip. Nothing that comes out of this command has been
read by a human, and the format says so.

The package is validated against P0.2 before it is written; a draft that does not validate is
reported as a bug in `assemble`, not handed to the studio.

## Implementation

| File | Role |
|---|---|
| `core/src/text/digits.ts` | Parse and write Gujarati/Devanagari/Latin numerals |
| `core/src/text/normalize.ts` | The post-processing pass, and the record of what it changed |
| `assemble/read.ts` | Reads back the per-page `.blocks.json` — never the `.md` |
| `assemble/segment.ts` | The state machine: divisions, passages, the sequence checksum, the folio offset. Pure |
| `assemble/package.ts` | Emits the P0.2 package and the assembly report. Pure |
| `assemble.ts` | Argument parsing, I/O, and what the CLI prints |
