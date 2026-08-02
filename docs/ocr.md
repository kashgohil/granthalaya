# OCR

> How a book's rendered pages become Gujarati text. Implemented in
> `packages/pipeline/src/ocr/`; run with `bun run ocr <pages-dir>`. Slice: P1.2.

## The engine: Sarvam Vision

No public benchmark isolates Gujarati, so the choice rests on adjacent evidence. On real
printed **Devanagari** scans a ten-system study found a 76-point chrF++ spread (Gemini 86.3,
Claude Opus 82.2, GPT-5.5 58.5, olmOCR-7B 40.5) and — the finding that decided it — every
model tested failed specifically on **conjuncts, matras and nukta**. That is not a detail of
this content, it *is* this content.

Sarvam Vision is the only candidate trained on Indic documents rather than treating Gujarati
as one language among a hundred: 87.36% average word accuracy across 22 Indian languages on
its own 20,267-sample bench, and 84.3% on the independent olmOCR-Bench, above Gemini 3 Pro's
80.2%. Tesseract is ruled out — 0.797 F1 on Gujarati against PaddleOCR's 0.938.

It is also the only one that classifies page regions, which turned out to matter more than the
accuracy difference. See "The blocks are the point" below.

**This choice is provisional.** One book, four pages of real evidence. The engine sits behind
one interface so a second can be run over the same pages and diffed.

## Images in, never the PDF

`ocr` takes the directory `render` wrote, not a `.pdf`. The PDF's text layer is the thing P1.1
established cannot be trusted, and handing the file to the engine invites it back in.

The render manifest's `sourceSha256` travels into the OCR manifest, so the chain

> *this PDF* → *these images* → *this text*

is unbroken and checkable. Proofed scripture that cannot be tied back to the edition it came
from is not publishable.

## The blocks are the point

The API returns each page as classified regions, not as one string:

```json
{ "text": "૫૬ ગોપાળાનંદસ્વામીની વાતો", "layout_tag": "header",    "reading_order": 1 }
{ "text": "અને વળી પોતે એમ વાત કરી…",   "layout_tag": "paragraph", "reading_order": 2 }
{ "text": "૧. મૂળમાયા",                 "layout_tag": "footer",    "reading_order": 5 }
```

The running head, the body and the footnote arrive already told apart. That is the apparatus
problem P1.2 would otherwise have had to solve from coordinates and guesswork, and it is worth
more here than a point of word accuracy.

Each page is written twice: `page-0083.md` is the text a human reads and verse segmentation
consumes; `page-0083.blocks.json` keeps every block with its tag, reading order and pixel box,
because P1.3's side-by-side proofing view needs to map a line of text back to a place on the
page image.

| Blocks tagged | Go to |
|---|---|
| `header`, `page-number`, `folio` | Set aside — page furniture, true of the page and not of the text |
| `image`, `photograph`, `chart`, `diagram`, `advertisement` | Set aside — no transcribable text |
| `footer`, `footnote` | Below a rule in the markdown — real content, but not body text |
| everything else | The body, in reading order |

Nothing is dropped silently. Everything set aside is recorded per page in `ocr.json`, because
a silent drop is indistinguishable from text the OCR never saw.

### The hazard that justifies the filter

Asked to read a decorative glyph, the model answered:

> *"This image contains no text. It displays three identical black heart symbols with curly
> lines on top against a white background."*

An English sentence, tagged `paragraph`, sitting mid-page. Published unchecked, that becomes
scripture. Any block that comes back in the wrong script is set aside.

A second page proved one filter is not enough: there the model described an illustration **in
Gujarati** (`આ છબીમાં પ્રાર્થનાની મુદ્રામાં બેઠેલી સ્ત્રીની મૂર્તિ…`), where the script check
was blind and only the `image` tag gave it away.

**Residual risk, unmitigated:** a Gujarati image description tagged `paragraph` would pass both
filters. Nothing in the pipeline can catch that — it is well-formed Gujarati in the right place.
It is a case for P1.3's human proofing gate, which is one more reason that gate is mandatory.

## Orthography as a free quality signal

Every page is scored with P1.1's `checkOrthography` as it lands. That does not prove the right
word was read — only a ground-truth transcript can — but it catches every word Gujarati
*cannot spell*, on every page, at no cost. The report ranks the worst pages so proofing starts
where the evidence points rather than at page one.

Measured on the first four real pages: **0 violations per 1000 letters**, all four dominant
`gujr`. The same instrument scored the corrupt source PDF at 50 per 1000.

## Cost and limits

₹0.5 per page, so the 442-page first book is about ₹221. The API allows **10 pages per job**
and **10 requests per minute**, both enforced in the client rather than discovered at a 429;
the rate limiter uses a sliding window, since a fixed one lets twenty requests through either
side of a minute boundary.

Because this is the first command here that spends money:

```sh
bun run ocr <dir> --dry-run          # price the run, send nothing
bun run ocr <dir> --pages 83-86      # a few pages, to judge quality
bun run ocr <dir> --yes              # over 50 pages needs confirming
```

Finished pages are never re-read, so a stopped run resumes and a second page range adds to the
first. One failed batch costs ten pages, not a book — failures are recorded per page and the
run carries on.

Set `SARVAM_API_KEY` in the repo-root `.env` (see `.env.example`); Bun loads it automatically.

## The API, as it actually behaves

Worth writing down, because it does not match its published OpenAPI schema:

| Documented | Actually sent |
|---|---|
| `documents[].file_name` | `documents[].filename` |
| `pages[].page_number` | `pages[].page_num` |
| `pages[].content` (a string) | `pages[].blocks[]` with `layout_tag`, `reading_order`, `coordinates` |

The client accepts both spellings, so a correction on their side will not break it. This cost a
run's worth of pages to discover — the first live call reported "returned no text" for
every page while the OCR itself had worked perfectly.

## Implementation

| File | Role |
|---|---|
| `ocr/sarvam.ts` | The Doc AI client: submit, poll, fetch, rate-limit. `fetch` and `sleep` injected, so it is tested against a stub |
| `ocr.ts` | Reads the render manifest, batches, partitions blocks, scores, writes |
