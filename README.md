<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/mark-dark.png">
  <img src="assets/brand/mark-sand.png" alt="Granthalaya" width="112" height="112">
</picture>

<h1>Granthalaya &middot; ગ્રંથાલય</h1>

<p><strong>A library for scripture you can read, recite and learn by heart.</strong></p>

<p><em>Gujarati first. Offline always. Every word proofed by a human.</em></p>

</div>

---

Granthalaya is a reading and study app for religious scriptures, primarily in Gujarati. It is
built on one belief: a scripture app should feel like a book worth holding, and the text inside
it should be trustworthy enough to commit to memory.

Most scripture that matters to a Gujarati household exists as a PDF nobody can search, in a
font nobody can copy out of, at a size nobody can read on a phone. This turns those books into
something better than a PDF and, in the parts that matter, better than the print.

## What it does

**Read.** A vertical reader in real paper — four themes (White, Sepia, Dark, Black) with a
grain that behaves like fibre, and Gujarati typography that follows its own rules rather than
Latin's: taller lines, larger body size, ragged right, never any letter-spacing, and never a
break inside a conjunct. Each verse can carry a stack of layers — the original, transliteration,
word-by-word meanings, translation, commentary — and you compose the view you want. Books
install to the phone and work with the network off.

**Recite.** Per-verse audio that highlights and scrolls as it plays. Loop any range with a
repeat count and a gap to answer into — the core mukhpath drill — or record yourself and play
it back against the reference.

**Memorize.** A ladder that takes a passage from *never seen* to *known*: follow along, then
progressive hiding, then first-letter prompts (the first **akshara**, never a split conjunct),
cloze blanks, a word bank, and finally full recall. Scheduling is FSRS underneath and shows up
as **memory health** — you never see an interval.

**Study.** Quizzes generated from the book itself, a daily challenge, and goals that pace
themselves — *finish this book by Diwali*. Streaks are forgiving by design: no hearts, no
leagues, no punishing a missed morning.

## Fidelity is the feature

A Gujarati religious PDF usually carries a legacy non-Unicode font: the page reads perfectly and
the bytes underneath are Latin nonsense. Copy from one and you get `નનરાુંતે` where the page
says `નિરાંતે` — text that renders beautifully and reads as gibberish. Ship that and you have
published corrupt scripture that no reader can tell from the real thing.

So no book here is trusted out of a PDF. Pages are rendered to images, read by an OCR engine
trained on Indic documents, checked against sequences Gujarati cannot spell, then **read by a
person against the page image** before anything is published. Every book cites the printed
edition it came from, every verse carries a hash, and a package is written once — a correction
is a new version, never an edit to a file already handed out.

Verse IDs are the atom of all of it. Highlights, audio timings, flashcards and quiz answers all
hang off stable verse addresses, so re-proofing a book never orphans the work you did in it.

## Where it is today

Pre-release, and honest about it — there is no public build yet.

| | |
|---|---|
| **Foundations** | Done. Book format, verse addressing, the Gujarati typography rules, and the design language all exist as tested code |
| **Content pipeline** | Working end to end: PDF → triage → page images → OCR → draft book package |
| **Proofing studio** | Working. The first book — 442 pages, 625 passages — is imported and waiting to be read |
| **The reader** | Not built yet. The mobile app is a shell: navigation, themes and the base components, no book in it |

The first milestone is one real book, proofed by hand and read beautifully on a phone.
[`ROADMAP.md`](ROADMAP.md) is the source of truth for everything past that.

## How it is put together

| Path | What it is |
|---|---|
| `apps/mobile` | Expo app — **the product**. Reading, recital, memorization, quizzes |
| `apps/web` | TanStack Start — the promotional site, and the admin studio behind auth |
| `apps/api` | Elysia on Bun — catalog, distribution, sync |
| `packages/core` | The domain, platform-pure: book format, verse addressing, typography rules, SRS, quiz engine |
| `packages/pipeline` | Internal CLI: PDF triage, page rendering, OCR, packaging |
| `packages/db` | Postgres schema for the studio's editable state |

Content flows one way: PDFs → `packages/pipeline` + the studio → published packages served by
`apps/api` → installed offline in `apps/mobile`. The studio never edits a package in place;
it holds its own copy and re-derives the package on export.

## Development

Bun is the runtime and package manager everywhere.

```sh
bun install

# Each app loads .env from its OWN directory — Bun, Vite and Expo all read the process
# working directory and none of them walk up to the repo root.
cp apps/api/.env.example    apps/api/.env
cp apps/web/.env.example    apps/web/.env
cp apps/mobile/.env.example apps/mobile/.env

bun run dev             # api (:4567) + web (:4568)
bun run dev:mobile      # expo start
```

Both dev servers fail loudly if their port is taken rather than moving to another one — the
API's CORS allowlist is pinned to specific origins, so a silent port change would surface later
as a confusing CORS error. Change `API_PORT` / `API_CORS_ORIGINS` and the `--port` in
`apps/web`'s `dev` script together.

There is no CI yet. These three, from the repo root, are the gate:

```sh
bun run check           # biome lint + format, whole repo (check:fix applies)
bun run typecheck       # tsc --noEmit in every workspace
bun test                # bun:test across every workspace
```

[`CLAUDE.md`](CLAUDE.md) holds the working conventions — the pipeline commands, the
per-workspace rules, and the domain rules that are not up for negotiation. Two worth knowing
before your first change:

- Workspace packages are consumed as **TypeScript source** (`exports` point at `src/`). There is
  no build step and no `dist/` to go stale — Bun, Metro and Vite each compile them like app code.
- `bun install` uses Bun's **isolated linker**: real packages live in `node_modules/.bun/` and
  every workspace gets its own symlinked `node_modules`. `apps/mobile/metro.config.js` is set up
  for this — read the note in that file before changing resolver options.

## The mark

The **tilak-chandlo** — the U of chandan with the kumkum chandlo inside it, the mark the
Swaminarayan Sampradaya has carried for two centuries and the one thing every denomination
shares. It is drawn from geometry in `packages/core/src/design/mark.ts` and rasterised into
every platform asset by `bun run icons:sync`; see [`assets/brand/`](assets/brand/README.md).
