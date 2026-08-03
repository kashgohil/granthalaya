# Granthalaya — Product Roadmap

> A digital granthalaya (library) for religious scriptures — primarily in Gujarati — with a
> premium, book-like reading experience and modern tools for recital, memorization, and study.
>
> This document is the single source of truth for scope and progress. Keep it updated:
> check items off as they land, move slices between phases when priorities change, and
> record decisions in the changelog at the bottom.

---

## Product surfaces — who sees what

| Surface | Location | Audience | Role |
|---|---|---|---|
| **Mobile app** | `apps/mobile` (Expo) | **End users — the product** | Reading, book install, recital, flashcards, quizzes, habits. Purely consumer-facing; no admin features, ever. |
| **Web** | `apps/web` (TanStack Start) | Public + admin (you) | Promotional/landing content, book showcase pages; behind auth: the **admin studio** (proofing, layer authoring, catalog management). No consumer app on web. |
| **API** | `apps/api` (**Elysia** on Bun) | All clients | Auth, book catalog & distribution, sync, TTS proxy, published-content serving. |
| **Core domain** | `packages/core` | Shared | Book format, verse addressing, annotation/SRS/quiz models. Platform-pure TS, runs everywhere (mobile, api, studio). |
| **Pipeline** | `packages/pipeline` | Internal tooling | PDF triage, OCR, normalization, packaging CLI. Bun/TS-first; free to shell out to whatever is optimal per step (e.g. external OCR services, Python tools). Surfaced only through the admin studio + CLI. |

**The flow:** PDFs → `packages/pipeline` + admin studio (web) → published book packages served
by `apps/api` → installed and experienced in `apps/mobile`.

---

## How to read this document

- **Phase** — a large body of work with a clear theme and release checkpoint.
- **Slice** — a thin, vertical, independently shippable unit (`P2.3` = phase 2, slice 3).
  Each slice has a goal, tasks, and a **Done when** acceptance line. A slice should rarely
  exceed ~1–2 weeks of effort; split it if it does.
- **Status** — mark the slice heading with one of:
  `⬜ not started` · `🟨 in progress` · `✅ done` · `⏸ parked`
- Slices within a phase are roughly ordered, but only hard dependencies (called out
  explicitly) block reordering.

### Release checkpoints

| Checkpoint | Meaning | Requires |
|---|---|---|
| **R1 — Reader Alpha** | One real book, read beautifully on a phone (internal build) | P0, P1, P2 |
| **R2 — Study Beta** | Friends & family use it daily: annotate, recite, review (TestFlight/Play beta) | P3, P4, P5 |
| **R3 — Public v1** | In the app stores, with quizzes, habits, and a public website | P6, P7, P8 |
| **R4 — Beyond** | Community, AI, voice | P9+ |

### Progress dashboard

| Phase | Theme | Surface | Status |
|---|---|---|---|
| P0 | Foundations & data model | all | 🟨 |
| P1 | Content pipeline & admin studio | pipeline + web(admin) + api | 🟨 |
| P2 | Library & reader | mobile | ⬜ |
| P3 | Annotations, collections & sync | mobile + api | ⬜ |
| P4 | Audio & recital | mobile + api + studio | ⬜ |
| P5 | Memorization engine | mobile + core | ⬜ |
| P6 | Quizzes & trivia | mobile + core + studio | ⬜ |
| P7 | Habits & goals | mobile | ⬜ |
| P8 | Promo website & store launch | web(public) + mobile | ⬜ |
| P9 | Community, AI & voice | all | ⬜ |

---

## Guiding principles

1. **Scripture-grade fidelity.** The text must be trustworthy. Every book cites its source
   edition; every extraction is human-proofed in the studio before publishing. Fidelity is a feature.
2. **The verse is the atom.** Every feature — highlights, audio sync, flashcards, quizzes,
   deep links, sync — hangs off stable verse/passage IDs. Get the addressing model right first.
3. **Mobile is the product; web is the shopfront and the workbench.** Consumer polish budget
   goes to mobile. The admin studio is an internal product — invest in its ergonomics (you'll
   live in it), not its beauty.
4. **Book-first aesthetics, dignified mechanics.** Skeuomorphic minimalism: paper warmth,
   real serifs, quiet chrome. Gamification that respects a devotional context (streaks with
   grace, no hearts/leagues).
5. **Gujarati is a first-class citizen.** Typography, transliteration, and search are designed
   for Gujarati from day one — not localized in later.
6. **Local-first.** Reading, annotations, and study work fully offline on mobile; sync is
   opportunistic via the API.

---

## P0 — Foundations & data model

*Everything else depends on this phase. Keep it short but get the schemas right.*

### P0.1 Monorepo & tooling baseline ✅
- [x] Bun workspaces wiring for `apps/*` + `packages/*`; root scripts (`dev`, `check`,
      `typecheck`, `test`)
- [x] Create `packages/core` (pure TS, zero runtime deps) and `packages/pipeline` scaffolds
- [x] Scaffold `apps/api` with **Elysia** (Bun): health route, typed client (Eden) consumed by
      mobile and web
- [x] Shared tsconfig/biome config; `bun test` runs across workspaces
- [ ] CI: typecheck + lint + test on every push — **deferred** (see decision log); the three
      commands exist and pass locally, only the GitHub Actions wiring is outstanding
- **Done when:** `bun run check && bun test` passes from the root, ~~CI is green,~~ and mobile/web
  can call the API through the typed client.

  *Landed 2026-07-31.* `GET /health` reports the API and `@granthalaya/core` versions;
  `apps/web/src/lib/api.ts` and `apps/mobile/src/lib/api.ts` are Eden `treaty<App>` clients
  typed off the Elysia instance — an unknown route or a changed response shape is a compile
  error, verified by a throwaway probe against both. Web builds and Metro bundles the client.

### P0.2 Book format & verse addressing spec ✅
The most important design decision in the project.
- [x] Write `docs/book-format.md`: canonical JSON book package — manifest (id, title, source
      edition, language, license), structure tree (book → section/chapter → passage → verse),
      content layers per verse (original, transliteration, word-meanings, translation, commentary)
- [x] Stable ID scheme (e.g. `vachanamrut/gadhada-1/21#v3`) that survives re-extraction and
      content corrections; content-hash per verse for change detection
- [x] Support both verse-structured texts (shlokas) and prose texts (discourses) — passages
      with optional verse subdivision
- [x] Zod schemas + TS types in `packages/core`; validator CLI (`bun run validate <book>`)
- [x] Hand-author one tiny sample book (a short stotra) as the reference fixture
- **Done when:** the sample book validates, round-trips through the schema, and every layer
  is addressable by stable ID.

  *Landed 2026-07-31.* `packages/core/src/book/` holds the schemas (`schema.ts`), the ref
  grammar (`refs.ts`), traversal (`tree.ts`), content hashing (`hash.ts`) and the integrity
  checks a schema can't express (`validate.ts`). Two fixtures ship behind
  `@granthalaya/core/fixtures`: `gayatri-mantra` (verse-structured, four layers) and
  `sample-prose` (nested divisions, prose leaves, a verse quotation mid-discourse, an alias
  map). `bun run validate <path>` reports issues against verse refs and exits non-zero.
  Both fixtures are `contentStatus: "draft"` — neither is proofed, and `sample-prose` is
  synthetic by design.

### P0.3 Gujarati typography & rendering baseline 🟨
Codify the non-negotiables once. Primary target: React Native (the consumer surface); web
needs it too for the studio's preview and the promo site.
- [x] Font pipeline: Rasa (body) + Noto Serif Gujarati (fallback) + Noto Sans Gujarati/Mukta
      Vaani (UI); bundled via `expo-font` on mobile, subsetted/self-hosted on web
- [x] `packages/core` text-rules module: line-height 1.7–2.0, base size +10–15% vs Latin, no
      letter-spacing, danda no-break handling, highlight-not-underline, akshara-safe
      segmentation helpers (never split a conjunct)
- [x] Mobile render test screen: conjuncts, matras above/below, danda, mixed Gujarati/Latin
- [x] iOS simulator: Gujarati renders correctly (checked 2026-08-01). Worth more than the
      usual simulator caveat allows, because the faces are bundled rather than resolved from
      the system — this confirms the `expo-font` registration keys, conjunct shaping and the
      core metrics all reach the screen
- [ ] **Verify on real iOS and Android hardware.** What the simulator still cannot show:
      system font fallback for glyphs Rasa lacks (the simulator falls back through macOS's
      fonts, a device through iOS's), and rendering at true device DPI
- [ ] **Android has not been run at all** — no emulator, no build. `includeFontPadding` and
      the tab's `ic_menu_sort_alphabetically` drawable are unverified assumptions
- [x] Web render test page for the same fixtures (studio preview parity)
- **Done when:** the fixtures render with no mark collisions on iOS, Android, and web.

  *Code landed 2026-07-31; awaiting the device check.* `packages/core/src/text/` holds the
  rules (`typography.ts` — bands, size scale, and `checkTextStyle`, which turns each rule
  into a testable violation), the akshara segmenter (`akshara.ts`), danda protection
  (`punctuation.ts`), the font stack (`fonts.ts`) and the render fixtures (`specimen.ts`,
  exported via `@granthalaya/core/fixtures`). Seven font faces are committed —
  TrueType per weight for Metro, subset WOFF2 plus a generated `fonts.css` for Vite —
  synced by `bun run fonts:sync`. Both surfaces render the same specimens through the same
  core calls: `apps/mobile/src/app/typography.tsx` (a tab until P0.4, now opened from
  Settings) and the web `/typography` route. Spec: `docs/typography.md`.

### P0.4 Design language & mobile app shell 🟨
The signature look, before any features — on the surface that matters.
- [x] Design tokens: paper/sepia palette with subtle grain, White/Sepia/Dark/Black themes,
      spacing & type scale (Gujarati-aware); tokens shared where practical between RN and web
- [x] Mobile app shell: expo-router navigation skeleton, theme switching, base components
      in the design language
- [x] Generated book covers: paper texture + Gujarati display type component (RN + web impls)
- [x] EAS config: `eas.json` with development/preview/production internal-distribution profiles
- [ ] **Link the EAS project and produce a build** — `eas login && eas init && eas build`
      needs the owner's Expo account, so it can't be done from here; the profiles are ready
      and the steps are in `apps/mobile/AGENTS.md`
- [x] **App icon.** The tilak-chandlo, the mark the Swaminarayan Sampradaya shares across
      every denomination. Geometry in `packages/core/src/design/mark.ts`, rasterised into
      every platform asset by `bun run icons:sync`; design record in
      `docs/brand/icon-directions.html`. **The wordmark is still open** — `ગ્રંથાલય` needs
      the Rasa glyphs outlined, which needs a font toolchain the repo does not carry
- [ ] **Have the arm taper checked by a satsangi.** The mark is drawn from geometry, not
      traced from a reference, and the taper is the detail that reads as right or wrong to
      someone who wears it
- [ ] **Android has still not been run** (inherited from P0.3) — the tab drawables, the
      grain tile's `resizeMode="repeat"`, and `includeFontPadding` are all unverified there
- **Done when:** an empty shell app on a real phone already feels like *this product*.

  *Code landed 2026-08-01; verified on the iOS simulator, awaiting a device build.*
  `packages/core/src/design/` holds the four themes (`themes.ts`), the spacing/radius/motion
  and type scale (`tokens.ts`), the generated-cover derivation (`cover.ts`) and the CSS
  emitter (`css.ts`). `bun run design:sync` writes the paper-grain tile into both apps and
  `apps/web/src/styles/tokens.css` from those tokens. The mobile shell is four native tabs
  (Today · Library · Study · Settings) over a stack, with a persisted theme preference and a
  base kit — `Screen`, `AppText`, `Card`, `List`/`ListRow`, `Button`, `Pill`, `Meter`,
  `EmptyState`, `BookCover`, `PaperGrain`, `ThemePicker`. The Expo starter template is gone.
  The web renders the same language from the same tokens at `/design`. Spec:
  `docs/design-language.md`.

---

## P1 — Content pipeline & admin studio

*Internal tooling only — end users never see any of this. Goal: turn one real PDF into a
published, proofed book package served by the API. You are the user; optimize for your
throughput.*

### P1.1 PDF triage & inventory 🟨
- [x] Triage CLI in `packages/pipeline`: classify each PDF — (a) true Unicode text layer,
      (b) legacy-font text layer, (c) scanned images. **Rule: never trust embedded text from
      (b) — render to image and OCR**
- [x] Inventory *rendering*: `bun run triage <path>` writes the markdown inventory (language/
      script, scan vs text-layer, page count, per-file strategy and evidence) plus JSON for P1.2
- [ ] **Run it over the real corpus** — needs the PDFs. Nothing is inventoried yet; the tool
      has only been exercised against synthetic fixtures and unrelated real PDFs
- [ ] **Source edition and rights per PDF** — not inferable from a file; a human column the
      report deliberately leaves blank
- [ ] Pick the first target book (smallest trustworthy text, verse-structured preferred).
      The report ranks candidates by trustworthiness then length; "verse-structured" and
      "we have the rights" are the parts only you can decide
- **Done when:** a written inventory exists with a chosen first book and per-PDF strategy.

  *Tool landed 2026-08-01; awaiting the corpus.* `packages/pipeline/src/pdf/` splits into
  `inspect.ts` (the only file that touches MuPDF — text, fonts, image coverage, geometry),
  `classify.ts` (pure: facts → strategy, confidence and reasons) and `report.ts` (pure:
  markdown + JSON). The decisive signal is what script the text *extracts* as, via
  `profileScript` in `packages/core/src/text/script.ts`; font names, missing `ToUnicode`
  maps, image coverage and an English-word rate corroborate it. `synthetic.ts` hand-builds
  PDFs carrying one signal each, so the classifier is tested against real PDF structure
  without a corpus in the repo. Spec: `docs/pdf-triage.md`.

### P1.2 OCR & extraction 🟨
- [x] Page rendering: PDF → high-res page images (per-page, deterministic naming).
      `bun run render <pdf>` — 300 DPI greyscale PNG by default, resumable, with a manifest
      that pins the output to the source file by content hash
- [x] **OCR engine chosen: Sarvam Vision** (`sarvam-vision-v1`, Doc AI *digitise*). The only
      candidate trained on Indic documents rather than treating Gujarati as one language among
      a hundred, and the only one that classifies page regions — `footnote`, `header`,
      `page-number`, `folio` — which is the apparatus that must stay out of scripture text.
      ₹0.5/page, so the first book costs about ₹221
- [x] OCR integration: `bun run ocr <pages-dir>`. Batches to the API's 10-page jobs, respects
      its 10 req/min limit, resumes, and scores every page with `checkOrthography` as it lands
- [x] **Verified against the live API** on four real pages (₹2): 4/4 came back Gujarati, 4/4
      orthographically clean at 0 violations per 1000, body text matching the page images.
      Sarvam returns *blocks* with layout tags, not the `content` string its OpenAPI schema
      documents — so the running head, body and footnote arrive already told apart
- [ ] Run the remaining 438 pages — deliberately deferred until P1.3 can receive the text;
      the images are banked and OCR only gets better with time
- [x] ~~Compare against a second engine on the same 20 pages~~ — **dropped 2026-08-03.** Sarvam
      stays. The engine was chosen for its layout blocks, which no other candidate returns, so a
      comparison could not have changed the decision; and the accuracy backstop is P1.3's human
      proofing, which is mandatory whatever the engine. The engine still sits behind one
      interface, so this is reversible if a book comes back badly read
- [x] Post-processing pass: Unicode NFC normalization, pre-base matra reorder repair,
      conjunct sanity checks — `checkOrthography` from P1.1 is the gate this pass has to pass.
      `normalizeScriptureText` in `packages/core/src/text/normalize.ts`; its governing rule is
      that it is a **no-op on clean text**, so every repair is something the writing system
      forbids or the typesetter demonstrably inserted, and each is reported individually
- [x] Structure detection: chapter/verse boundaries from numbering; verse-number sequence used
      as a checksum (flag missing/duplicate verses). **Numbers are in Gujarati digits** and the
      printed page number is not the PDF page number — see `docs/page-rendering.md`
- [x] Output: draft book package (P0.2 format) + per-verse confidence scores.
      `bun run assemble <ocr-dir>` writes `book.json` and an `assembly.json` sidecar
- [ ] **Verify the >95% bar on a full book** — the four OCR'd pages segment perfectly (6/6
      numbered passages, both page-spanning joins, the section boundary, zero orthography
      violations), but four pages is not a measurement. Needs the remaining 438 pages
- **Done when:** the first book emerges as a draft package with >95% of verses auto-segmented correctly.

  *Assembly landed 2026-08-03.* `packages/pipeline/src/assemble/` splits into `read.ts` (reads
  back the per-page blocks, never the markdown), `segment.ts` (pure: the state machine over
  blocks in reading order) and `package.ts` (pure: the P0.2 package plus the proofing queue).
  The grammar comes off the pages themselves: `॥૬૨॥` closes a passage and gives it its id,
  `॥ … સમાપ્ત ॥` closes a work, a `section-title` block opens one, and a passage simply carries
  on across a page break. Spec: `docs/assembly.md`.

  *Rendering landed 2026-08-02.* `pdf/rasterize.ts` renders and `render.ts` parses; spec in
  `docs/page-rendering.md`. Verified on the first real book — *Gopalanand Swami ni Vato*, 442
  pages in 10s, 77 MB. Being a legacy-font PDF rather than a scan, its pages render pristine:
  no noise, no skew, any DPI free. The pages themselves then showed five things the text layer
  could not: Gujarati digits everywhere, a constant 27-page offset between printed and PDF page
  numbers, printed section-end markers (`॥ … વાતો સમાપ્ત ॥`) that are exactly the work
  boundaries structure detection needs, footnotes below a rule that must not be spliced into
  verses, and Devanagari shlokas inline in Gujarati pages.

### P1.3 Proofing studio (web, admin-only) 🟨
Human-in-the-loop correction UI — mandatory for scripture-grade fidelity.
- [x] Admin area in `apps/web` behind auth (single admin account is fine for now)
- [x] Side-by-side page image ↔ extracted text, the passage's pixel boxes drawn on the page
- [x] Inline editing with Gujarati input at the reader's own metrics; keyboard-first flow
      (`j`/`k` move, `Enter` approves and advances, `e` edits, `p` toggles the page panel)
- [x] Verse status workflow: `raw → proofed → approved`; per-book progress meter
- [x] Low-confidence verses surfaced first; diff view against re-runs of OCR
- [x] **Structural editing** — split, merge, insert, delete, renumber; retitle sections. Not in
      the original list, and the slice does not work without it: the verse-number checksum reports
      *segmentation* errors, which no amount of text editing can fix
- [x] Footnotes and held-back blocks reviewed page by page — the backstop for the one OCR hazard
      no filter catches
- [x] Export: approved book compiles to a versioned, immutable package (`contentStatus: "proofed"`)
- [ ] **Proof one full book end-to-end.** Needs the remaining 438 pages OCR'd (~₹219), the source
      edition and rights answered, and the hours. All three are the owner's
- **Done when:** one full book is proofed end-to-end in the studio and exported as `v1`.

  *Studio landed 2026-08-03; awaiting the proofing itself.* `packages/db` is a new workspace
  package — Postgres via Drizzle, migrations as committed SQL, PGlite for hermetic tests.
  `apps/api/src/modules/studio/` splits into `content.ts` (the only file that touches `content/`),
  `import.ts` (import and re-import), `verses.ts` (the queue), `restructure.ts`, `apparatus.ts` and
  `export.ts`; `modules/admin/` holds the session. The web studio is `/studio`: a book list, an
  overview that recomputes the checksum from the current rows, and a three-column workbench.
  Verified end to end against the real draft — imported, queued worst-first, split and merged,
  approved, exported, and the package validated as `proofed` with no issues. Spec:
  `docs/proofing-studio.md`.

### P1.4 Layer authoring (studio) ⬜
Translations, word-meanings, glossary — the 5-layer verse stack.
- [ ] Studio support for adding/editing per-verse layers: transliteration, translation,
      word-by-word meanings, commentary
- [ ] Auto-transliteration draft (Gujarati → ISO 15919 / ITRANS via Sanscript.js), human-corrected
- [ ] Glossary entities: define a term once, link occurrences across the book
- **Done when:** the first book ships with original + transliteration + at least one more layer.

### P1.5 Catalog & distribution API (Elysia) ⬜
- [ ] `apps/api`: catalog endpoint (published books + metadata) and versioned book-package
      download endpoints
- [ ] Package integrity (content hash) and semver for content corrections; immutable versions
- [ ] **Cross-version ID audit, blocking at publish time:** diff the candidate package against
      the last published version and refuse any verse ref that disappeared without an entry in
      `aliases`; warn on ID churn that a `patch`/`minor` bump doesn't justify. P0.2's
      `validateBook` only sees one package in isolation, so nothing today stops a careless
      republish from orphaning every annotation, highlight and SRS item keyed to a dropped ref
- [ ] Studio "publish" action pushes an approved package to the catalog
- [ ] Client install contract documented: download, verify, store locally (SQLite on mobile);
      annotations rewritten through `aliases` on version upgrade, orphans surfaced not dropped
- **Done when:** the studio can publish a book and a test client can list, download, and
  verify it — and a republish that drops a verse ref without an alias is rejected.

---

## P2 — Library & reader (mobile) → **R1: Reader Alpha**

*The consumer product begins. Everything in P2–P7 is `apps/mobile`.*

### P2.1 Library shelf & book install ⬜
- [ ] Cover-grid library with generated paper covers; Continue Reading row
- [ ] Install/remove books via the P1.5 API contract; download progress + storage indicators;
      books stored in SQLite, fully offline after install
- [ ] Book detail screen: source edition, summary, structure outline
- **Done when:** installing and opening a book on a phone feels effortless and looks premium.

### P2.2 Core reading surface ⬜
- [ ] Vertical scroll reader rendering the verse stack (original layer only, for now);
      virtualized for large books, 60fps
- [ ] Chapter/section navigation from the book's structure tree
- [ ] Tap center toggles chrome; chrome fades during reading
- [ ] Reading position persistence per book (stable verse anchor, not scroll offset)
- **Done when:** a full book is comfortably readable end-to-end on iOS and Android.

### P2.3 Reading settings ("Aa" sheet) ⬜
- [ ] Single bottom sheet: font size, line spacing, margins, theme, font choice
- [ ] Saveable named presets (Kindle model); settings apply live
- [ ] Per-language defaults (Gujarati sizing rules from P0.3)
- **Done when:** settings persist across sessions and every combination renders correctly.

### P2.4 Layer toggles & inline glossary ⬜
- [ ] Toggle transliteration / translation / word-meanings / commentary per reading session
- [ ] Tap-a-word glossary popover for defined terms
- [ ] Layout adapts gracefully as layers toggle (no jank)
- **Done when:** a reader can compose their own study view, Gita-Supersite style.

### P2.5 Progress & focus ⬜
- [ ] Progress: chapter x of y, % through book, thin progress bar; "time left in chapter"
      once reading-speed data exists
- [ ] Reading Ruler focus mode (dim all but a few lines)
- **Done when:** progress feels meaningful in a reflowable, multi-layer text.

### P2.6 Search ⬜
- [ ] Full-text search within a book and across the library (local index, offline)
- [ ] Dual-script input: Gujarati keyboard + loose phonetic Latin ("bhagwan" → ભગવાન)
      via Sanscript.js/IndicXlit mapping
- [ ] Results grouped by book/chapter with verse context; jump-to-verse
- **Done when:** both scripts find the same verse and navigation lands precisely on it.

### P2.7 Book mode (paginated) ⬜ *(delight — can slip past R1)*
- [ ] Paginated mode with native-feel page transitions (reanimated); optional page-curl
- [ ] Page-edge shadow, paper grain; pagination must never break Gujarati layout
- **Done when:** book mode is a joy on a phone and a tablet.

---

## P3 — Annotations, collections & sync

### P3.1 Highlights, notes, bookmarks ⬜
- [ ] Verse-anchored highlights (3–4 colors), notes, bookmarks; background-style highlight
      rendering (never underline)
- [ ] Local-first storage (SQLite) keyed to stable verse IDs; survives book content updates
- [ ] Annotations index screen per book (filter by color/type), jump-to-verse
- **Done when:** annotating is one gesture, and the index makes re-finding instant.

### P3.2 Mark-for-recital collections ⬜
The seed of the whole memorization system.
- [ ] Mark any verse/passage range as a **recital item**; items live in user-named collections
      ("Morning path", "Aarti", "Mukhpath 2026")
- [ ] Collection view: ordered list, reorder, per-item status (learning/reviewing/mastered — status
      only; mechanics come in P5)
- [ ] Shareable/exportable collection format (JSON) — later the unit of community sharing
- **Done when:** a user can curate their personal recital book from any installed text.

### P3.3 Accounts & sync (API) ⬜
- [ ] Auth in `apps/api` (email/OTP or OAuth); anonymous-first on mobile, upgrade-in-place
- [ ] Sync annotations, collections, reading positions, settings (local-first, background push,
      furthest-position wins; last-write-wins per annotation)
- [ ] Export everything (JSON) — user owns their data
- **Done when:** two devices converge without data loss in normal use.

### P3.4 Cross-references & topic index ⬜
- [ ] Authored cross-references between passages (studio support + mobile UI)
- [ ] Topic/subject index per book (authored in studio), browsable in the reader
- **Done when:** the first book ships a topical index navigable alongside chapters.

---

## P4 — Audio & recital

### P4.1 Audio playback foundation ⬜
- [ ] Per-verse audio in the book package (recorded or TTS-generated); downloadable audio packs
- [ ] Player: play verse/passage/chapter, speed control (0.5×–2×), background audio with
      lock-screen controls, sleep timer
- **Done when:** the first book has audio for at least one section, playable offline on a phone.

### P4.2 Follow-along sync ⬜
- [ ] Verse-level audio↔text sync (timestamps in package); current verse highlights and
      auto-scrolls (karaoke model)
- [ ] Word-level sync where timing data exists; graceful fallback to verse-level
- [ ] Studio tooling to record/align timestamps efficiently
- **Done when:** listening with follow-along feels like Jain Pathshala/Vyoma-class sync.

### P4.3 Recital loops (A-B repeat) ⬜
The core mukhpath primitive.
- [ ] Loop any verse/range with repeat count, delay-between-repeats, and speed
- [ ] "Recital session" mode over a collection (P3.2): step through items, loop each
- [ ] Call-and-response option: reference audio, then a timed silent gap to repeat aloud
- **Done when:** a user can run a complete daily recital session hands-free.

### P4.4 Record & compare ⬜
- [ ] Record your own recitation of an item; store locally; play back side-by-side/alternating
      with the reference
- [ ] Attach the recording to the recital item; optional use as the loop audio
- **Done when:** record → compare → re-record is a tight loop on the phone.

### P4.5 TTS read-aloud ⬜
- [ ] Gujarati TTS behind an `apps/api` proxy (evaluate Sarvam AI vs Indic Parler-TTS vs
      Google/Azure gu-IN); cache generated audio per verse version
- [ ] "Listen to this book" for texts without recorded audio; clearly labeled as synthetic
- **Done when:** any installed book can be listened to with acceptable Gujarati prosody.

---

## P5 — Memorization engine → **R2: Study Beta**

### P5.1 SRS core ⬜
- [ ] FSRS-style scheduler in `packages/core` (pure, unit-tested): per-item stability/difficulty,
      desired-retention setting, due-date computation
- [ ] Review queue over recital items & flashcards; daily review cap; grade UI
      (Again/Hard/Good/Easy)
- [ ] **Memory health** per item (decaying score) — the user-facing face of SRS; never expose
      raw intervals
- [ ] Leech detection: repeatedly failed items get flagged with a suggestion to switch mode
- **Done when:** scheduling behaves correctly in simulated multi-week test runs.

### P5.2 Practice modes — the difficulty ladder ⬜
Each mode is a self-contained exercise over a recital item.
- [ ] **Follow along** (read/listen; P4 integration) — entry level
- [ ] **Progressive hiding**: each tap blurs/hides more words; recite and reveal to check
- [ ] **First-letter prompt**: verse as first letters (Gujarati-aware: first *akshara*,
      never a split conjunct); tap/type to reveal
- [ ] **Fill-in-the-blank** (cloze): auto-generated blanks, multiple variants per verse
- [ ] **Word bank**: reorder scrambled word chips into the verse
- [ ] **Full recall**: text hidden; self-graded (optionally against your P4.4 recording)
- [ ] Mode ladder per item: passing at one level unlocks the next; feeds memory health
- **Done when:** an item can be taken from "never seen" to "mastered" through the ladder,
  entirely in Gujarati, with no rendering glitches.

### P5.3 Flashcards ⬜
- [ ] Auto-generate cards from highlights and recital items (verse↔meaning, term↔definition,
      audio→text); cloze cards from any verse
- [ ] Card review integrated into the same SRS queue; media on cards (audio autoplay)
- [ ] Manual deck curation; deck import/export (interoperable JSON)
- **Done when:** a highlight becomes a reviewable card in two taps.

### P5.4 Study dashboard ⬜
- [ ] Daily review home: due items, memory-health overview, weak-spot list
- [ ] Heatmap calendar of study activity; per-collection mastery progress
- **Done when:** one screen answers "what should I practice today and how am I doing?"

---

## P6 — Quizzes & trivia

### P6.1 Quiz engine ⬜
- [ ] Question types in `packages/core`: multiple choice, complete-the-verse, source
      identification ("which chapter?"), matching, true/false, typed answer
- [ ] Auto-generation from book structure + layers; authored question banks via the studio
- [ ] Quiz session runner: config (types, count, timer), scoring, end-of-round re-queue of misses
      (Quizlet Learn model)
- **Done when:** any proofed book can generate a playable, sensible quiz with zero authoring.

### P6.2 Campaigns & daily challenge ⬜
- [ ] Level-based campaigns per book/theme (sequential unlocks, difficulty tiers)
- [ ] Daily challenge: fresh short quiz per day; feeds the streak (P7)
- [ ] Per-category accuracy stats → feed weak areas back into the SRS queue
- **Done when:** the daily challenge is a habit-worthy 2-minute loop.

### P6.3 Exam-prep mode ⬜ *(niche differentiator)*
- [ ] Curriculum definitions (e.g. satsang-exam syllabi) as authored question banks + reading lists
- [ ] Mock exam mode: timed, graded, past-performance tracking
- **Done when:** one real curriculum is fully practiceable in-app.

---

## P7 — Habits & goals

### P7.1 Reading goals ⬜
- [ ] Goal model (Tarteel pattern): action (read/recite/review) × range (book/section) ×
      portion (minutes/verses/passages) × schedule (daily/weekdays/by-deadline)
- [ ] Flexible goals auto-rebalance when behind/ahead; "finish by <festival>" target dates
- [ ] Session progress bars (done / in progress / missed)
- **Done when:** a "read the whole book by Diwali" goal paces itself correctly.

### P7.2 Streaks with grace ⬜
- [ ] Daily streak across reading/recital/review; streak savers (earned, not bought)
- [ ] Milestone celebrations — warm, not gamey; no hearts, no leagues
- **Done when:** missing one day doesn't feel like punishment.

### P7.3 Daily verse & resurfacing ⬜
- [ ] Verse of the day per book/tradition (authored or curated)
- [ ] "From your highlights" resurfacing (Readwise model) in the daily home
- [ ] Push notifications (expo-notifications) at a user-chosen time
- **Done when:** opening the app each morning gives one meaningful thing in <5 seconds.

### P7.4 Verse image composer ⬜
- [ ] Turn any verse into a shareable image: paper textures, Gujarati display type, attribution
- [ ] One-tap share via the native share sheet (WhatsApp-friendly sizes)
- **Done when:** shared images are beautiful enough to market the app by themselves.

---

## P8 — Promo website & store launch → **R3: Public v1**

*The public face of `apps/web` plus getting mobile into the stores.*

### P8.1 Promotional website ⬜
- [ ] Landing page: the pitch, screenshots, the signature paper aesthetic in web form
- [ ] Book showcase pages: one page per published book (source edition, sample verses) —
      doubles as SEO surface and deep-link target (`open in app`)
- [ ] Verse share pages: links from the P7.4 composer resolve to a beautiful web preview
      with an app-install CTA
- [ ] Gujarati + English content
- **Done when:** someone who lands on the site understands the app in 10 seconds and can
  tap through to install it.

### P8.2 Launch readiness ⬜
- [ ] App icons, store listings (Gujarati + English), screenshots, privacy policy, support page
- [ ] Crash reporting & basic analytics (privacy-respecting); OTA update channel (EAS Update)
- [ ] API hardening: rate limits, backups, monitoring
- **Done when:** the boring-but-required launch checklist is fully green.

### P8.3 Store release ⬜
- [ ] TestFlight / Play internal → open beta → production release
- [ ] Feedback channel in-app; triage loop for the first wave of users
- **Done when:** the app is live in both stores and the first stranger has installed it.

---

## P9 — Community, AI & voice → **R4**

*Each slice here is independent; pick by demand signals from R2/R3 users.*

### P9.1 Shared collections & plans ⬜
- [ ] Publish/subscribe recital collections and reading plans; moderated catalog (studio-curated)
- [ ] Plans with friends: shared progress + per-day discussion thread (YouVersion model)

### P9.2 Speech-recognition recital checking ⬜ *(the moat — hard)*
- [ ] Evaluate Gujarati/Sanskrit ASR (AI4Bharat IndicConformer et al.) on recited scripture
- [ ] Speak-to-reveal mode: words appear as recited correctly (Tarteel model)
- [ ] Word-level mistake flagging + historical mistakes log feeding SRS
- **Gate:** ship only if accuracy on real recitals is convincingly high.

### P9.3 Voice search ⬜
- [ ] Recite a half-remembered line → land on the passage ("Shazam for scripture")

### P9.4 Ask-the-scripture ⬜
- [ ] AI Q&A grounded strictly in installed books, answering with verse citations
- [ ] Clear provenance UI; no free-floating theological claims

### P9.5 Ritual mode ⬜
- [ ] End-to-end guided liturgy audio (daily puja/aarti sequences) with follow-along text
      (Jain Pratikraman model)

### P9.6 Live group sessions ⬜
- [ ] Synchronized group recital/kirtan sessions over the network (Kirtanavali model)

---

## Cross-cutting tracks (ongoing, every phase)

- **Quality:** unit tests for `packages/core` (schemas, SRS, quiz gen); Gujarati rendering
  regression fixtures on iOS/Android/web; e2e smoke for install→read→annotate on mobile.
- **Performance:** reader must stay 60fps with all layers on; large books virtualized;
  audio packs streamed/chunked; cold start fast on mid-range Android.
- **Accessibility:** system font scaling respected, screen-reader labels, reduced motion,
  contrast in all four themes.
- **Content ops:** each new book runs the full P1 pipeline; track per-book status
  (`raw → proofed → layered → audio → published`) in `docs/content-status.md`.
- **Licensing:** confirm rights per source edition before publishing any book.

---

## Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-07-31 | **Mobile-only consumer app**; web = promo + admin studio only | Mobile is purely consumer-facing; admin/pipeline tooling never reaches end users |
| 2026-07-31 | Content pipeline is internal tooling (CLI + admin studio), not a user feature | Only the admin (owner) deconstructs PDFs into books |
| 2026-07-31 | **Elysia (Bun) for the API layer**; pipeline free to use whatever is optimal per step | Owner preference; typed end-to-end via Eden client |
| 2026-07-31 | OCR-first pipeline; never trust embedded PDF text | Gujarati religious PDFs commonly use legacy non-Unicode fonts |
| 2026-07-31 | Rasa as body font, Noto Serif Gujarati fallback | Designed for continuous Gujarati reading; bundled via expo-font on mobile |
| 2026-07-31 | FSRS-style SRS presented as "memory health" | Modern scheduling without exposing intervals |
| 2026-07-31 | No hearts/leagues; streaks with grace only | Gamification must fit a devotional context |
| 2026-07-31 | Workspace packages are consumed as **TypeScript source** (`exports` → `src/`) | Bun, Metro and Vite all compile them like app code; no build step, no stale `dist/`. Consumers need `allowImportingTsExtensions` |
| 2026-07-31 | **Biome across the whole repo**, including `apps/mobile` (replaced `expo lint`) | One formatter/linter beats eslint-on-mobile + biome-on-web; nested `biome.json` files `extend: "//"` |
| 2026-07-31 | **No GitHub Actions CI yet** — `check` / `typecheck` / `test` are run locally | Solo project pre-R1; CI adds process overhead without catching anything a local run wouldn't. Revisit when there's a second contributor, or at R2 when TestFlight builds start |
| 2026-07-31 | API on **:3001**, web dev server keeps :3000; both **fail on a taken port** rather than hopping (`reusePort: false`, `--strictPort`) | Both run together under root `bun run dev`. The API's CORS allowlist is pinned to origins, so a silently relocated dev server resurfaces as a confusing CORS error. Bun's default `SO_REUSEPORT` also lets two API instances share a port and split traffic |
| 2026-07-31 | **"Verse" means *smallest addressable unit*** — a shloka, a line of an aarti, or a paragraph of a prose discourse. `form: "verse" \| "prose"` carries the typographic difference | A separate `paragraph` type would fork highlights, SRS, audio sync and quiz generation into two code paths for no gain: they all want "the atom" and don't care about literary form |
| 2026-07-31 | A book package is **one `book.json`**, immutable once published; the studio's editable state is a separate database | The package is a build artifact. One file is trivial to hash, sign, diff and validate, and mobile ingests it into SQLite at install so file layout doesn't affect runtime |
| 2026-07-31 | Layers are **declared in the manifest**, not five fixed fields | Supports two translations side by side, per-layer attribution and licence (translations are often under different rights), and a reader UI built from data instead of a hardcoded list |
| 2026-07-31 | Manifest `layers` is an **ordered array** of declarations (each with its own `id`), not a map; declaration order is the reader's toggle order | JSON objects are unordered by spec, so a map would bind layer order to JavaScript's insertion-order semantics — which a Python/Swift step need not share, and which JS itself breaks for a numeric layer id. Reordering in the studio becomes moving an element, not renumbering |
| 2026-07-31 | `primaryLayer` must be a layer of kind `original` | It's what search, audio alignment and memorization run against. Letting it point at a translation would quietly make an apparatus layer canonical |
| 2026-07-31 | **Control characters are rejected by the schema** — `\n` allowed in verse text, nothing else in C0/C1, and no control characters at all in titles, numbering and glosses | OCR and PDF extraction emit form feeds, CRs and stray separators routinely. As a schema rule the pipeline *must* normalize; as a convention it would only be expected to. Also guarantees the verse hash's separators can't appear in the text it separates |
| 2026-07-31 | Retired refs go in a top-level **`aliases` map** (old ref → successor), not per-verse `formerIds` | A per-verse field can't express a deleted verse. The map handles merges, splits and deletions uniformly, and is what a client replays over local annotations on update |
| 2026-07-31 | **Two hashes:** per-verse FNV-1a 64 for change detection, SHA-256 over the package for integrity | Change detection must run in `packages/core`, which has no crypto API and must behave identically in Hermes. Integrity is a real security boundary and belongs in the pipeline/API where platform crypto exists |
| 2026-07-31 | `contentStatus` (`draft`/`proofed`/`published`) is a **required manifest field**; the catalog serves only `published` | Makes the P1.3 proofing gate structural rather than procedural — nothing unverified can be mistaken for scripture just because it validates |
| 2026-07-31 | **Zod is a dependency of `packages/core`** — "zero runtime deps" restated as "no *platform* deps (no React, no Bun/Node APIs, no I/O)" | Schemas are the single source of truth for the format and `z.infer` keeps types from drifting; the studio reuses them for form validation |
| 2026-07-31 | **Akshara segmentation is hand-written in `packages/core`**, not delegated to `Intl.Segmenter` | Hermes doesn't ship `Intl.Segmenter`, and the reader is the surface that needs it most. Writing it also lets the two Indic scripts the format admits share one table-driven implementation that behaves identically in the app, the studio and the pipeline |
| 2026-07-31 | **ZWNJ ends an akshara; ZWJ does not** | They request opposite things: ZWJ selects a half-form that renders as one shape, ZWNJ the dead-consonant form that renders as two. A cut is safe exactly where the text already renders as two shapes. Matches Unicode 15.1's conjunct-cluster rule (UAX #29, GB9c) |
| 2026-07-31 | Typography rules are **enforced by `checkTextStyle`**, and the line-height band is **clamped rather than recommended** | "We follow the typography rules" is otherwise a habit that erodes screen by screen. As a function it is a unit test, and the P2.3 settings sheet can hand over whatever the slider says without being able to produce an illegal page |
| 2026-07-31 | `protectDanda` is a **display transform, never written back into a package** | The package's text is what `hashVerse` covers and what search and audio alignment run against; a no-break space stored in it would change every verse hash and make stored text differ from the text that was proofed |
| 2026-07-31 | **Font files are committed**, synced from Google's CSS API by `bun run fonts:sync`: TrueType per weight for mobile, subset WOFF2 for web | A build must not depend on a CDN, and a font that silently changed version between two builds would reflow every book. The artefacts differ because the platforms do — React Native cannot synthesise a weight, so each weight is its own registered family; the browser can, and gains per-writing-system subsets on top |
| 2026-07-31 | Fonts registered at runtime with **`useFonts`, not the `expo-font` config plugin** | The plugin registers faces under their internal family names, which differ per platform and cannot express a weight on iOS. Explicit keys are identical on iOS, Android and web and work in Expo Go, which has no native build. Revisit at P0.4 when EAS builds make prebuild part of the flow |
| 2026-07-31 | **Noto Sans Gujarati** is the single bundled UI face; Mukta Vaani stays documented as its substitute | Shipping both costs ~350 KB on device to serve a preference nobody has expressed yet |
| 2026-08-01 | Explicit **`com.granthalaya.app`** bundle identifier / Android package, and the `granthalaya` URI scheme | Expo derives `com.anonymous.<slug>` when these are unset, so with `slug: "mobile"` this project collided with another local Expo project already installed under the same id — `expo start --ios` launched *that* app instead. Placeholder identifiers are only safe until the second project exists |
| 2026-08-01 | **Development happens on a dev build, not Expo Go** | The newest published Expo Go for SDK 57 is client 57.0.5, and this project is on expo 57.0.9. Same SDK major, so Expo Go loads it and then segfaults inside `react-native-worklets` on a JSI ABI mismatch. `expo install --check` confirms 57.0.9's dependency set is the correct one, so the fix is to stop using a client that lags the SDK, not to pin the app down to it |
| 2026-08-01 | **`expo-modules-jsi@57.0.4` is patched locally** (`patches/`, via `bun patch`) | It does not compile under Xcode 26.2 / Swift 6.2.3: one `guard` uses `abs(_:)`, whose overload set the compiler will no longer resolve. `.magnitude` on a `Double` is unambiguous and semantically identical. Both the package and `expo` are already at their newest published versions, so there is nothing to upgrade to — drop the patch once upstream fixes it |
| 2026-08-01 | **Sindoor terracotta is the single accent**, shifting per theme (`#A65328` light, `#DE9A55` dark) | One chromatic voice, and one that belongs to the subject — kumkum and cloth bindings — rather than to a brand palette. It shifts because a colour that holds 4.5:1 on paper is washed out on black, and vice versa |
| 2026-08-01 | Themes are **four palettes, not four skins**; `system` resolves only to White or Dark | A wash that reads as a gentle mark on paper reads as a smear on a black screen, so every theme sets its own ink, hairline and highlight values. Sepia and Black are reader choices the OS has no way to express, so exposing them as "automatic" would be a lie |
| 2026-08-01 | **Contrast is a unit test** (`themes.test.ts`), not a review note | Every pairing the components actually produce is checked in all four themes — including ink on each highlight wash, where a failure would make a marked verse harder to read than an unmarked one. It caught three of the first palette's values |
| 2026-08-01 | **A type token stores the Latin-equivalent size**; Gujarati's is derived by `resolveTypeStyle` | It is the only way the P0.3 rules survive a design system: a screen cannot pick a Gujarati size at all, so +12% and the 1.7–2.0 band hold by construction rather than by discipline. Tracking exists on one token and is dropped for Indic scripts |
| 2026-08-01 | **Covers are generated from the book id**, never authored | These editions have no cover art, and inventing some would be a small fiction in a project whose first principle is fidelity. `fnv1a64(id) % 6` picks the cloth; the title is the artwork. Keyed on the id alone so re-proofing a book never repaints its cover |
| 2026-08-01 | **One mid-grey grain tile**, generated and committed; Black theme has none | Mid-grey does both jobs — it darkens into fibre over paper and lightens into film grain over night themes — so React Native, which has no blend modes, gets the same texture as the web with only an opacity. On a true black OLED panel grain is noise on pixels that would otherwise be off |
| 2026-08-01 | Tabs are **Today · Library · Study · Settings**, on the platform's native tab bar | Fixed now so P2–P7 have somewhere to land. Native gets the blur, scroll-edge behaviour and accessibility for free; a devotional reading app gains nothing from a bespoke navigation control |
| 2026-08-01 | The theme preference is persisted with **`@react-native-async-storage/async-storage`** | The first native dependency added beyond Expo's own. A key-value preference does not justify SQLite, and the splash is held until the stored value is read back so nobody sees a white frame before their Dark theme arrives |
| 2026-08-01 | **The `expo-font` config plugin is still not used** (revisit from P0.3 closed) | EAS builds now make prebuild part of the flow, which was the reason to revisit — but the original objection stands: the plugin registers faces under internal family names that differ per platform and cannot express a weight on iOS. `useFonts` with explicit keys stays |
| 2026-08-01 | The web's **Google-CDN font import is gone**; Fraunces/Manrope replaced by the bundled stack | It contradicted P0.3's own decision that a build must not depend on a CDN, and it meant the studio previewed books in faces the app does not have. The site now sets everything in Rasa and Noto Sans Gujarati, from `tokens.css` and `fonts.css` |
| 2026-08-01 | **MuPDF (WASM) is the pipeline's PDF reader** | One dependency covers triage *and* P1.2's page rendering: structured text with per-line font names, PDF object access for font dictionaries, image blocks with bounding boxes, and page rasterisation. No system binaries — a corpus can be triaged on a clean checkout, which `pdftotext`/`pdffonts` would not allow |
| 2026-08-01 | Triage's decisive signal is **the script the text extracts as**, not the font's name or flags | A legacy font's whole nature is that its bytes are Latin, so the script tally catches every one of them — including the families nobody has listed yet. Font names and missing `ToUnicode` maps corroborate and are reported, but requiring either would let an unlisted legacy font publish as scripture |
| 2026-08-01 | A **common-English-word rate** separates real English PDFs from legacy soup | Both extract as Latin, so the script signal alone cannot tell them apart, and marking every Latin text layer as legacy would send genuinely English front matter to OCR. Known consequence: a book set entirely in romanised Sanskrit fails both tests and goes to OCR — the safe direction, and the report states its reasoning so it can be overruled |
| 2026-08-01 | **Every ambiguity resolves toward OCR** — `needsOcr` is true for all but a plain `unicode-text` verdict | The two mistakes do not cost the same. Re-OCRing a good text layer wastes machine time; trusting a legacy one corrupts scripture silently, and no later step would catch it |
| 2026-08-01 | An **image-dominant page is `scanned` even when its text layer is clean Unicode** | A text layer over a page image is somebody else's OCR of unknown provenance. Worth diffing against ours in P1.2, never worth publishing on its own — P1.3's proofing gate exists precisely because no extraction is trusted unread |
| 2026-08-01 | Pages are **sampled evenly across a book**, not from the front | Front matter is routinely typeset unlike the body — an English title page, a scanned frontispiece — so a prefix would misread a book more often than a spread does. Deterministic, so two runs over the same corpus are comparable |
| 2026-08-01 | Triage fixtures are **hand-built PDFs, not committed binaries or faked fact objects** | Hand-rolled `PdfFacts` would only prove the classifier agrees with itself, and binaries nobody can diff rot silently. `synthetic.ts` emits real files MuPDF parses without repairing, keeping the corpus as ~200 lines of readable code |
| 2026-08-01 | **A `ToUnicode` map is a promise, not a guarantee** — an Indic text layer is checked against Gujarati/Devanagari *orthography* before it is trusted (`broken-encoding` verdict) | The first real Gujarati PDF fed to triage was passed as `unicode-text, no OCR needed` and its text was corrupt: Foxit had written a Shruti mapping in which the pre-base matra `િ` never appeared, so `નિરાંતે` extracted as `નનરાુંતે`. Every code point was legitimate Gujarati and the script tally read 100% — only an impossibility check could see it. Publishing it would have rendered beautifully and read as nonsense |
| 2026-08-01 | Orthography rules describe only what the writing system **forbids**, never what it prefers | Clean text must score exactly zero or the check is a tuning exercise rather than a gate. Measured: 0 violations on correct Gujarati, 50 per 1000 letters on the corrupt file — the threshold sits at 1, with forty-five times of headroom. Anusvara and visarga are deliberately excluded from "vowel signs", or `ું` — the commonest spelling in the language — would read as a violation |
| 2026-08-01 | **Pre-base matras are the diagnostic** for a broken mapping | A PDF stores glyphs in visual order, so `િ` sits *before* the consonant it follows; emitting correct Unicode means reordering it back, and a mapping that gets anything wrong gets that wrong first. Common enough that a page of prose without one is mechanically impossible |
| 2026-08-01 | A missing `ToUnicode` map is only reported when the font **also** lacks a standard encoding | The first version flagged Helvetica and Calibri — which extract perfectly from `WinAnsiEncoding` — while saying nothing about the Shruti font whose map was actually wrong. It pointed the reader at the wrong evidence, which is worse than reporting nothing |
| 2026-08-02 | **Sarvam Vision is the OCR engine** | No public benchmark isolates Gujarati, so the choice rests on adjacent evidence: on real Devanagari scans the field spread 76 chrF++ points (Gemini 86.3, Claude 82.2, GPT-5.5 58.5), and every VLM tested failed specifically on conjuncts, matras and nukta — our content. Sarvam is the only candidate trained on Indic documents rather than treating Gujarati as one language among a hundred (87.36% avg word accuracy across 22 Indian languages on its own bench; 84.3% on the independent olmOCR-Bench, above Gemini 3 Pro's 80.2%), and the only one that classifies `footnote`/`header`/`page-number`/`folio` regions. Tesseract is ruled out: F1 0.797 on Gujarati against PaddleOCR's 0.938 |
| 2026-08-03 | Sarvam's **layout blocks are consumed, not its joined text** — page furniture set aside, notes below a rule, body in reading order | The API returns each page as classified regions (`header`, `paragraph`, `footer`, `page-number`, `folio`), which turned out to matter more than any accuracy difference between engines: it hands over the apparatus separation P1.2 would otherwise have solved from coordinates and guesswork. A running head left in the body would sit inside 442 verses. Blocks are also written per page with their boxes, because P1.3's side-by-side view has to map a line back to a place on the image |
| 2026-08-03 | **A block that comes back in the wrong script is set aside, and recorded** | Asked to read a decorative glyph, the model answered *"This image contains no text. It displays three identical black heart symbols…"* — English, tagged `paragraph`, mid-page. A second page needed the tag filter as well, describing an illustration *in Gujarati* where only its `image` tag gave it away. Residual risk P1.3 must catch: a Gujarati description tagged `paragraph` passes both filters, which is one more reason the human proofing gate is mandatory. Nothing is dropped silently — a silent drop is indistinguishable from text the OCR never saw |
| 2026-08-03 | The client **accepts both the documented and the actual response spellings** | Sarvam sends `filename`/`page_num`/`blocks`; its published OpenAPI schema says `file_name`/`page_number`/`content`. The first live run reported "returned no text" for every page while the OCR itself had worked perfectly. Tolerating both means a correction on their side is not an outage on ours |
| 2026-08-02 | OCR takes **the rendered images, never the source PDF** | The PDF's text layer is the thing P1.1 established we cannot trust, and handing the file to the engine invites it back in. The images are also what the render manifest pins by hash, so what was OCR'd is exactly what a human later proofreads |
| 2026-08-02 | The OCR manifest **carries the source hash forward** from the render manifest | Chain of custody: *this PDF* → *these images* → *this text*. Proofed scripture that cannot be tied back to the edition it came from is not publishable, and the tie has to survive each hop rather than be reconstructed at the end |
| 2026-08-02 | Every OCR'd page is **scored with `checkOrthography` as it lands** | P1.1's gate becomes P1.2's instrument for free. It cannot prove the right word was read, but it catches every word Gujarati cannot spell without a ground-truth transcript, on every page — and it ranks the worst pages, so proofing starts where the evidence points instead of at page one |
| 2026-08-02 | A run of more than **50 pages needs `--yes`** | The first command in this repo that spends money. `--dry-run` prices a run without sending anything and finished pages are never re-read; the gate is small enough to try a chapter freely and large enough that a whole book is a deliberate act |
| 2026-08-02 | Rendered pages default to **300 DPI greyscale PNG** | 300 is the floor every OCR engine asks for on printed text, and it verified legible on a 4.7×7in trim size where the type is physically small. Greyscale because engines binarize anyway and it is a third of the bytes; PNG because JPEG rings around thin strokes and a Gujarati conjunct is mostly thin strokes. `--color` exists for editions that print headings or Sanskrit in red |
| 2026-08-02 | A page is rendered **as published**: no alpha, no annotations | An OCR engine wants ink on white, and a transparent background flattens to black. Annotations are skipped because a previous reader's highlight is an annotation, and it would end up in the scripture |
| 2026-08-02 | The page manifest **pins its images to the source file by SHA-256** | These images are the source of truth for every verse OCR'd out of them, so the tie has to be to one exact file rather than to a name. A re-downloaded or swapped PDF hashes differently and cannot be silently OCR'd as the edition that was proofed |
| 2026-08-02 | A render **resumes only when source hash, DPI, format and colour all agree** | Rendering is minutes of work and settings get tried more than once, so resuming matters — but half a book at 150 DPI mixed with half at 300 is worse than neither, and it would not be visible in a directory listing. Disagreement starts over; a *page range* still adds rather than replaces |
| 2026-08-03 | **No second OCR engine — Sarvam stays, and the comparison is dropped** | It was chosen for its layout blocks, which no other candidate returns, so a bake-off could not have overturned it: the running head, the body and the footnote arriving already told apart is worth more here than a point of word accuracy. The diff's real value was as an *instrument* — disagreements between two engines localise likely errors without a ground-truth transcript — but that only speeds up P1.3, which every verse goes through regardless. A day of work and a second client to make a mandatory step faster is the wrong trade before the step exists. Known limit this leaves standing: `checkOrthography` catches every word Gujarati cannot spell and no word it can, so a correctly-spelled substitution reaches proofing unflagged. Reversible — the engine is behind one interface |
| 2026-08-03 | **Normalization must be a no-op on clean text** — every repair fires only on something the writing system forbids or the typesetter demonstrably inserted | It is the only property that makes an unattended pass over 442 pages of scripture defensible. A pass that "improves" text is a pass that must be reviewed character by character; one that cannot fire on correct text needs reviewing only where it *did* fire. Checked directly: over the four real OCR'd pages it fires exactly six times, and every one is right |
| 2026-08-03 | **A pre-base matra is only reordered where it has no base at all**, and it moves past the whole conjunct | Repairing only what `checkOrthography` already calls impossible is what keeps the rule from being a matter of taste. Moving it past the first consonant instead of the whole cluster would turn `િસ્થ` into `સિ્થ` — trading one impossibility for another, since a virama before a vowel sign is itself a violation |
| 2026-08-03 | **An inline superscript digit is taken off the word it sits on**, and recorded | `આવરણ૧` is not a word; Gujarati spells nothing with a digit inside it, so the marker is the typesetter's and the word is the text's. Left alone it enters the verse hash, the search index and akshara segmentation. The rule needs a letter tight against the digit and at most two digits, which is what leaves `॥૬૧॥`, `(૧)` and `સંવત ૧૮૭૬` untouched |
| 2026-08-03 | **A verse's printed number leaves its text and moves to the `number` field**, while the closing danda stays | How P0.2's own fixtures are written, and the consequence matters: the number would otherwise be inside the verse hash, so correcting a misread `૬૧` would change the hash and orphan every annotation, highlight and SRS item keyed to that passage. `number` is display only — the schema said so before there was anything to display |
| 2026-08-03 | **A verse id is its printed number** (`v61`); a division id is positional (`section-1`) | The number is the edition's own identity for the passage: it survives re-extraction, re-OCR and a page-range rerun, and it is what a reader would cite. A section has no printed identity to borrow, so its id is provisional until the studio can transliterate its Gujarati title (P1.4) |
| 2026-08-03 | The **verse-number sequence is the only checksum this stage has**, so every gap, repeat and jump is reported | A passage the OCR dropped entirely leaves no other trace — the text reads on, the page count is unchanged, orthography is clean. Only the numbering knows. Same argument for the printed-page offset, where the commonest value wins so one misread folio cannot move the book |
| 2026-08-03 | **`book.json` and `assembly.json` are separate artefacts** | A package is a build artefact a reader installs; where a passage came from, what was repaired and how much to trust it is a record of how it was built. Merging them would put pixel coordinates into every reader's SQLite and make the package's hash depend on which pages happened to be assembled. They are joined by the verse ref, which is the only identifier either needs |
| 2026-08-03 | **`assemble` does not attach footnotes to the words that pointed at them** | It has the evidence — each passage records its markers, each page its notes — but pairing them decides which gloss belongs to which word, and a wrong pairing corrupts meaning rather than text, which no orthography check or sequence checksum would ever catch. That is layer authoring, and P1.4 does it with a human watching |
| 2026-08-03 | **Confidence is a table of fixed per-flag penalties**, not a formula | A fabricated number that cannot be argued with is worse than no number. As a table, a report's reader can see that a passage scored 0.65 because it had no printed number, and disagree. Its job is to *order* the proofing queue, not to decide anything |
| 2026-08-03 | **A Gujarati book admits Devanagari as well as Gujarati**; Latin stays the tripwire | A Sanskrit shloka quoted mid-discourse is printed in Devanagari on a Gujarati page and it is scripture — the format has admitted that shape since P0.2's `sample-prose`. The single-script filter written for the English-description hazard would have quietly deleted every one of them. Latin still catches the hazard it was written for |
| 2026-08-03 | The source edition, licence and title are written as **`unknown` and named in the report**, never guessed | Inventing a source edition is a small fiction in a project whose first principle is fidelity. The running heads are offered as *evidence* instead — with the folio stripped and non-Gujarati lines dropped, or `INDEX`, a button the PDF viewer draws, wins the tally and gets offered as the book's title |
| 2026-08-03 | Root `dev` runs its two servers with **`--parallel`** | `bun run --filter` orders scripts *topologically*, and `apps/web` depends on `@granthalaya/api` — so it waited for the API's `dev` to finish before starting the web server's, and a watch server never finishes. The symptom was `bun run dev` starting the API and nothing else, with no error to explain it. `--parallel` is Bun's own flag for exactly this, and it prefixes each server's output besides |
| 2026-08-03 | **Ports moved to :4567 (api) and :4568 (web)**, superseding the 3001/3000 pair above | 3000 and 3001 are the two most contested ports on a developer's machine, and it showed: three stray `bun` listeners were sharing :3001 while a fourth held :3000, so `bun run dev` failed and a request could reach any of them. The reasoning from 2026-07-31 is unchanged — both still fail loudly on a taken port rather than hopping — only the numbers move, somewhere nothing else claims. The API's CORS allowlist, both `.env.example`s and the Eden clients' defaults move with them, because a client pointed at the old port is a CORS error rather than a connection refused |
| 2026-08-03 | **Postgres + Drizzle in a new `packages/db`**, not SQLite in the API | Owner's call on the database; the package exists because the schema is shared ground — the API reads it today and P1.5's catalog will publish out of it. Migrations are generated SQL, committed and applied at API startup, never `db:push`: these tables hold hours of proofing that exists nowhere else, and a schema change that silently rewrites a column is the one failure this project cannot absorb |
| 2026-08-03 | **`jsonb` values are never handed to the driver as strings** — a passthrough column type, and predicates (`jsonb_exists`, `to_jsonb(int)`) that pass no JSON as a parameter | Drizzle's `jsonb` pre-stringifies for `pg`/`postgres.js`; `Bun.SQL` serializes JS values itself. Together they encoded twice, and every value in the live database was a jsonb *string*. Reads round-tripped so nothing looked wrong — but `jsonb_array_elements` errored, and every containment filter matched nothing *silently*, which is the worst way for a filter to fail. Found by running the studio's own queries against the real database during review; migration `0001` repairs existing rows |
| 2026-08-03 | **PGlite cannot catch a driver-encoding fault, and that limit is now written down** | It is the cost of the decision above: PGlite does not double-encode, so the suite was green while Postgres held the wrong bytes. The response is not to abandon hermetic tests but to stop relying on them for this class — the identity of the `toDriver` mapper is pinned by a driver-independent unit test, and the two jsonb predicates were verified by hand against real Postgres |
| 2026-08-03 | Tests run against **PGlite**, not the dev database | Postgres compiled to WebAssembly, so the same DDL, `gen_random_uuid()` and `jsonb` behaviour as production — and `bun test` still passes on a clean checkout with no server running, which the repo's check/typecheck/test gate depends on. A test suite that needs a running database is a gate people stop running |
| 2026-08-03 | **The studio's state is Postgres; the package on disk is never edited** | Restates P0.2's "a package is a build artefact" as a mechanism. Export re-derives `book.json` from the rows, which is what makes re-running `assemble` safe — the draft it overwrites was never the thing being corrected |
| 2026-08-03 | A re-import **replaces an untouched row wholesale and never overwrites a touched one** | The segmentation rules will be tuned for a long time and every run rewrites `book.json`, so the studio has to absorb a new draft without discarding the reading that produced the old one. "Touched" is decided by evidence — text still equal to `ocrText`, status still `raw` — rather than by a flag, so a re-run that improves an unread passage simply improves it, and a disagreement with a human is resolved by a human. Nothing is deleted: a passage the new draft no longer produces is `orphaned`, because a passage vanishing between two runs is exactly what the number checksum exists to catch |
| 2026-08-03 | A re-import **never refreshes the manifest or a section title** | They are precisely the fields `assemble` writes `unknown` into and names as a human's job. Refreshing them would undo the one part of a package a machine can never supply, every time the rules were tuned |
| 2026-08-03 | **Page images are matched to a book by source SHA-256, not by directory name** | The package dir and the pages dir are named differently and nothing links them — but the pipeline carries the source hash forward at every hop, so matching on it turns the chain of custody from a record into a mechanism: the studio cannot put a page image beside text that did not come off that exact file |
| 2026-08-03 | **Structural editing is in scope for P1.3** — split, merge, insert, delete, renumber | The verse-number checksum reports missing, duplicate and out-of-sequence numbers, and all three are *segmentation* faults: a dropped `॥૬૨॥` welds two passages together, a spurious one splits one. Text editing cannot fix either, and the only alternative — retune `assemble`, re-run, re-import — is a machine overruling a human on a book they have already read part of. Ref churn is free here precisely because nothing is published; lineage is recorded so a re-import can still match |
| 2026-08-03 | On a merge the **earlier passage survives**, with its number and id | In a printed book the number *closes* a passage, so when `॥૬૨॥` is misread and two passages run together, the text that follows belongs to the passage that was already open. Evidence is unioned because the merged passage genuinely came off both pages; `no-number` and `very-short` are recomputed rather than inherited, or absorbing an unnumbered half would flag a numbered passage as unnumbered |
| 2026-08-03 | **The app icon is the tilak-chandlo**, not a book | The product is already a book, so a book icon restates the container instead of naming the contents — and it is the most crowded shape in the category, indistinguishable from every reading app at 48px. The sampradaya has had a mark for two centuries that every denomination shares, so it identifies the library without taking a side. It also costs the design language nothing: `themes.ts` already calls the accent "the colour of kumkum" and the chandan is the `ink` colourway's ink, so the mark is two existing values on an existing cloth |
| 2026-08-03 | The **chandlo sits above the tilak's optical centre**, not on or below it | Settled by eye over three rounds, each moving it up. The usual reason to drop a dot below centre is that a closed lower form outweighs open upper strokes, but the round caps topping these arms cancel that; raising it into the open channel leaves a clear band of cloth beneath, so the cradle reads as a stroke that turns rather than a bowl holding something. `mark.test.ts` guards it, because it looks like a centring bug |
| 2026-08-03 | **Icons are rasterised from a signed-distance field, not from the SVG** | The mark is two capsules, two quadratic curves and a circle, and an SDF over those antialiases exactly at any size. The alternative is a native rasteriser or a headless browser standing between `git clone` and a build, for artwork simple enough to solve in closed form. It is also byte-deterministic, which is what makes the generated assets reviewable as a diff |
| 2026-08-03 | **A verse id is re-derived when its number changes** | The number is the identity — it is what a reader would cite and what survives re-extraction. A passage whose id said `v61` while its printed page said `૬૩` would be a lie in the one field that has to be citable |
| 2026-08-03 | **Export refuses unless every passage is `approved`**, and writes `proofed` rather than `published` | `proofed` is "somebody read this against the page"; `approved` is "this may be published". Collapsing them would let a book that has been read but not cleared reach the catalog. And publishing stays P1.5's step, so a proofed package can sit and be re-read before anyone installs it. A version is written once — a correction is a new `contentVersion`, never an edit to a file already handed out |
| 2026-08-03 | **The session cookie's HMAC is computed by hand, not by Elysia's `sign` option** | Configured at the instance level on Elysia 1.4.29 it silently did nothing: the cookie went out as a bare `granthalaya_admin=admin.1786357083`, so anything that could be read could be written and a forged payload was a valid session. Caught by the test that tried it. A gate that fails open without saying so is worse than no gate, and this is the surface that moves scripture out of draft |
| 2026-08-03 | An **unconfigured studio serves its routes and refuses them (503)** rather than not mounting them | Mounting conditionally would make `App` — and therefore the typed Eden client the studio is written against — depend on whether the machine that compiled it happened to have a password in its environment. It also lets the studio say *why* it cannot let anyone in instead of showing a login form that could never work |
| 2026-08-03 | `ADMIN_PASSWORD_HASH` **must be written with escaped dollars**, and the API refuses to start otherwise | Bun expands `$NAME` in `.env` *inside quotes as well*, and an argon2 hash is nothing but `$`-delimited fields — pasted verbatim it becomes `=19=65536,…`. The only symptom is the right password being refused, which reads as a forgotten password rather than a parsing bug, so it is caught at startup with the fix in the message |
| 2026-08-03 | **A block boundary within a page is a paragraph break; one across a page is not** | Two fragments of a passage are always two blocks, so the page is the deciding evidence. Within a page the OCR split them because the typesetter did — the second begins with a first-line indent, mid-passage. Across a page the opposite is the ordinary case, and the only printed signal for a *new* paragraph at the top of a page is that indent, which Sarvam's block-level boxes cannot see; `spans-pages` already sends a human to the image. Assembly previously joined every non-quotation fragment with a single `\n`, which `joinPrintedLines` folds as a line wrap — correct inside a block, wrong between two. It cost 328 paragraph breaks in 143 of 625 passages, including વાત ૬૭, a 4,904-character enumerated list whose `(૨)`–`(૭)` items each open a paragraph |
| 2026-08-01 | **Script detection lives in `packages/core`**, not in the pipeline | The studio needs the same question answered — a translation pasted into the transliteration slot is a `latn` run where `gujr` was declared — and it is platform-pure logic over the format's own `Script` union. The danda counts as script-neutral there for the same reason `punctuation.ts` treats it as shared |

## Changelog

- **2026-08-03** — **P1.3's studio landed: the draft can now be read.** `/studio` in `apps/web`,
  behind a single-admin session, over a new `packages/db` (Postgres + Drizzle). A draft is imported
  from `content/books/`, and its page images are found by **source SHA-256 rather than by name** —
  the two directories are named differently, so matching on the hash the pipeline carries forward
  turns the chain of custody from a record into a mechanism. The workbench is three columns: the
  queue you work down (book order, or `assembly.json`'s own worst-first), the page image with the
  passage's pixel boxes drawn on it, and the text set through the same `resolveTextStyle` the
  reader uses, with `checkOrthography` running live and every normalization repair listed so
  re-reading a passage becomes re-reading six places.
  Two things the original slice list did not have, and the slice does not work without either.
  **Structural editing** — split, merge, insert, delete, renumber — because the verse-number
  checksum reports *segmentation* faults and no amount of text editing fixes a dropped `॥૬૨॥`.
  And **re-import that does not overwrite people**: an untouched row is replaced wholesale, a
  touched one keeps what the human did and goes back in the queue flagged, and a passage the new
  draft no longer produces is orphaned rather than deleted. That is what makes tuning `assemble`
  safe after proofing has started.
  Export refuses more than it writes — every passage `approved` (not merely `proofed`), nothing
  still `unknown`, and a version written once — then recomputes each verse hash over the proofed
  text and validates against P0.2 before writing `contentStatus: "proofed"`. Verified end to end on
  the real draft: imported, queued worst-first (the unnumbered `p86-6` at 0.65 first, both
  page-spanning passages next), split and merged back, approved, exported, and `bun run validate`
  reported no issues.
  Also fixed on the way: Elysia's cookie `sign` option was a **no-op**, shipping the session
  unsigned — a forged `granthalaya_admin=admin.<future>` was a valid login. The HMAC is ours now,
  and the test that found it is permanent. Spec: `docs/proofing-studio.md`.
  Next: **the proofing itself** — OCR the remaining 438 pages (~₹219), answer the source edition
  and rights, and read the book. Those three are what close P1.3. Then **P1.4**, layer authoring,
  which is where the footnotes the studio now displays finally get attached to the words that
  pointed at them.
- **2026-08-03** — **P1.2's back half landed: the pages become a book.** `bun run assemble
  <ocr-dir>` reads what `ocr` wrote and emits a draft P0.2 package plus an `assembly.json`
  sidecar — the proofing queue P1.3 will work from, carrying each passage's pages, pixel boxes,
  repairs and a confidence score, sorted worst-first. The structure comes off the pages
  themselves rather than out of metadata: `॥૬૨॥` closes a passage and becomes its id,
  `॥ … સમાપ્ત ॥` closes a work, a `section-title` block opens one, and a passage carries on
  across a page break as a printed book does. The verse-number sequence is the only checksum
  this stage has — a dropped passage leaves no other trace — so every gap, repeat and jump is
  reported, as is any page whose printed folio disagrees with the prevailing offset.
  Normalization (`normalizeScriptureText`, in core) folds the typesetting away under one rule:
  **it must be a no-op on clean text**. Over the four real OCR'd pages it fires exactly six
  times — one word closed up across an end-of-line hyphen, and the five footnote superscripts
  that page 86's own note block defines — and nothing else moves. Those pages segment into
  verses ૬૧–૬૬ with no gaps, both page-spanning passages rejoined, the section boundary found,
  the 27-page folio offset recovered independently, and the package validating as a draft.
  Also fixed: a Gujarati book now admits Devanagari, so a Sanskrit shloka quoted mid-discourse
  is kept rather than set aside. Spec: `docs/assembly.md`.
  Next: **P1.3, the proofing studio.** The remaining 438 pages are deliberately still not OCR'd:
  the segmentation rules are tuned against four pages of one book's *body*, and front matter,
  the table of contents and the other sections are better met in a studio that can show the page
  image than in a terminal. Build P1.3 for a 442-page book anyway — the sample is 7 passages,
  and virtualization, queue paging and jump-to-page are what a small draft will silently get
  wrong.
- **2026-08-02** — **P1.2 began: pages render.** `bun run render <pdf>` turns a book into the
  images it will be OCR'd and proofed from — 300 DPI greyscale PNG by default, `page-0001.png`
  zero-padded so a listing is in page order, and a `pages.json` manifest that pins the output
  to its source file by SHA-256 so a swapped PDF can never be silently OCR'd as the edition
  that was proofed. Runs resume, but only when hash, DPI, format and colour all agree; a page
  range adds to what is there rather than replacing it. The first real book rendered in 10
  seconds and 77 MB, and the pages then showed five things its text layer never could:
  Gujarati digits throughout, printed page numbers running 27 behind the PDF's, printed
  section-end markers that are exactly the work boundaries structure detection wants,
  footnotes below a rule, and Devanagari shlokas inline in Gujarati pages.
  Spec: `docs/page-rendering.md`.
- **2026-08-02** — **The OCR engine is chosen and wired up: Sarvam Vision.** `bun run ocr
  <pages-dir>` reads what `render` wrote — never the PDF, whose text layer is the thing we
  established we cannot trust — batches into the API's 10-page jobs, respects its 10 req/min
  limit, resumes, and carries the render manifest's source hash forward so *this PDF* → *these
  images* → *this text* stays one unbroken chain. Every page is scored with P1.1's
  `checkOrthography` as it lands, which turns that gate into a free per-page quality signal and
  ranks the worst pages so proofing starts where the evidence points. It is the first command
  here that spends money, so `--dry-run` prices a run, more than fifty pages needs `--yes`, and
  finished pages are never re-read.
- **2026-08-03** — **OCR verified on real pages, and Sarvam reads this book well.** Four pages
  for ₹2: all four came back Gujarati, all four orthographically clean at 0 violations per
  1000, body text matching the page images conjunct for conjunct. The live API turned out not
  to match its own OpenAPI schema — it returns *blocks* with layout tags and pixel boxes rather
  than a `content` string — which is better than what was specified: the running head, the body
  and the footnote arrive already told apart, and that separation is worth more here than a
  point of word accuracy. It also exposed the hazard that justifies filtering: asked to read a
  decorative glyph the model wrote an English *description* of it, tagged `paragraph`,
  mid-page. Blocks in the wrong script and non-text tags are now set aside and recorded.
  Spec: `docs/ocr.md`.
  Next: **assembly** — the remaining 438 pages are deliberately not OCR'd until there is
  somewhere for the text to go, and a second engine over the same four pages is what would
  settle the engine choice properly.
- **2026-08-01** — **P1.1's tool landed: PDF triage.** `bun run triage <path>` walks a folder
  of PDFs and decides, per file, whether its text layer can be trusted or whether the book has
  to be rendered and OCR'd — then writes the inventory as markdown and as JSON for P1.2.
  The decisive signal is what script the text *extracts* as, which is what catches a legacy
  Gujarati font: the page reads perfectly and the bytes are ASCII. `profileScript` in
  `packages/core/src/text/script.ts` tallies it, ignoring the spaces, digits, punctuation and
  dandas that are shared across scripts; font names, missing `ToUnicode` maps, image coverage
  and a common-English-word rate corroborate. The first real PDF then proved that script
  alone is not enough: a `ToUnicode` map can be present and wrong, so `checkOrthography`
  (`packages/core/src/text/orthography.ts`) tests an Indic text layer against sequences the
  writing system forbids — two vowel signs in a row, a virama before a vowel, a page of prose
  without one pre-base matra. Clean Gujarati scores zero; the corrupt file scored 50 per 1000.
  Every ambiguity resolves toward OCR. The report
  ranks first-book candidates and says plainly what it cannot know — rights, source edition,
  and whether a book is verse-structured. Spec: `docs/pdf-triage.md`.
  Next: **point it at the real PDFs** — the inventory, the rights column and the first-book
  choice are what actually close P1.1 — then **P1.2**, OCR & extraction.
- **2026-08-01** — **P0.4's code landed: the design language and the app shell.**
  `packages/core/src/design/` — four themes (White/Sepia/Dark/Black) around a sindoor
  terracotta accent, a Gujarati-aware type scale that derives every size from a
  Latin-equivalent token, spacing/radius/motion, and generated book covers keyed to the book
  id. Contrast is enforced by unit test in all four themes. `bun run design:sync` generates
  the paper-grain tile for both apps and `tokens.css` for the web. The Expo starter template
  is gone: the app is now four native tabs over a stack, with a persisted theme preference,
  a base component kit, and honest empty states. The web renders the same language from the
  same tokens at `/design`, and shadcn/ui's variables now point at them. `eas.json` ships
  three internal-distribution profiles. Spec: `docs/design-language.md`.
  Next: **link the EAS project and install the shell on a real phone** — that, plus an app
  icon, is what closes P0.4 — then **P1.1**, PDF triage and inventory.
- **2026-08-01** — **The mobile app runs on a dev build.** Gave the app its own identity
  (`com.granthalaya.app`, scheme `granthalaya`) after the placeholder `com.anonymous.mobile`
  collided with another local project; established that Expo Go cannot run this SDK 57.0.9
  project (its client lags at 57.0.5 and segfaults in worklets); and patched the one Swift
  line in `expo-modules-jsi` that Xcode 26.2 refuses to compile. `bunx expo run:ios` now
  builds, installs and launches. The P0.3 screens were reachable via a **Type** tab,
  which P0.4 replaced with a row in Settings.
- **2026-07-31** — **P0.3 code landed; the device check is outstanding.**
  `docs/typography.md` plus `packages/core/src/text/`: the rules as enforceable data
  (`checkTextStyle`), an akshara segmenter for Gujarati and Devanagari, danda protection,
  the font stack, and the render fixtures. Seven font faces committed for both platforms via
  `bun run fonts:sync`. A rendering test screen on mobile (reachable from Settings since
  P0.4) and at `/typography` on web, rendering the same specimens through the same core
  calls.
  Next: **look at that screen on a real iPhone and a real Android phone** — that is what
  closes P0.3 — then **P0.4**, the design language & mobile app shell.
- **2026-07-31** — **P0.2 landed.** `docs/book-format.md` plus the implementation in
  `packages/core/src/book/`: Zod schemas, the `book/div/div#verse` ref grammar, tree
  traversal, per-verse content hashing, and integrity validation. `bun run validate <path>`
  in the pipeline CLI. Two reference fixtures (`gayatri-mantra`, `sample-prose`) cover the
  verse and prose shapes and are round-tripped in tests.
  Next: **P0.3**, the Gujarati typography & rendering baseline.
- **2026-07-31** — **P0.1 landed.** Bun workspaces across `apps/*` + `packages/*`; new
  `apps/api` (Elysia) with a `/health` route; `packages/core` and `packages/pipeline`
  scaffolded; Eden typed clients wired into mobile and web; shared `tsconfig.base.json` and
  repo-wide Biome. CI deliberately deferred — lint/typecheck/test are run locally for now.
  Next: **P0.2**, the book format & verse addressing spec.
- **2026-07-31** — Restructured around final architecture: mobile = sole consumer surface;
  web = promo + admin studio; new `apps/api` (Elysia). Reader/study phases (P2–P7) retargeted
  from web to mobile; promo website + store launch consolidated into P8.
- **2026-07-31** — Initial roadmap created from competitive research (YouVersion, Quran.com,
  Tarteel, Dwell, BAPS/Jain apps, Bible Memory, Anki/Quizlet/Duolingo, Kindle/Apple Books).
