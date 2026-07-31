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
| **Core domain** | `packages/core` | Shared | Book format, verse addressing, annotation/SRS/quiz models. Pure TS, runs everywhere (mobile, api, studio). |
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
| P1 | Content pipeline & admin studio | pipeline + web(admin) + api | ⬜ |
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

### P0.2 Book format & verse addressing spec ⬜
The most important design decision in the project.
- [ ] Write `docs/book-format.md`: canonical JSON book package — manifest (id, title, source
      edition, language, license), structure tree (book → section/chapter → passage → verse),
      content layers per verse (original, transliteration, word-meanings, translation, commentary)
- [ ] Stable ID scheme (e.g. `vachanamrut/gadhada-1/21#v3`) that survives re-extraction and
      content corrections; content-hash per verse for change detection
- [ ] Support both verse-structured texts (shlokas) and prose texts (discourses) — passages
      with optional verse subdivision
- [ ] Zod schemas + TS types in `packages/core`; validator CLI (`bun run validate <book>`)
- [ ] Hand-author one tiny sample book (a short stotra) as the reference fixture
- **Done when:** the sample book validates, round-trips through the schema, and every layer
  is addressable by stable ID.

### P0.3 Gujarati typography & rendering baseline ⬜
Codify the non-negotiables once. Primary target: React Native (the consumer surface); web
needs it too for the studio's preview and the promo site.
- [ ] Font pipeline: Rasa (body) + Noto Serif Gujarati (fallback) + Noto Sans Gujarati/Mukta
      Vaani (UI); bundled via `expo-font` on mobile, subsetted/self-hosted on web
- [ ] `packages/core` text-rules module: line-height 1.7–2.0, base size +10–15% vs Latin, no
      letter-spacing, danda no-break handling, highlight-not-underline, akshara-safe
      segmentation helpers (never split a conjunct)
- [ ] Mobile render test screen: conjuncts, matras above/below, danda, mixed Gujarati/Latin —
      verified on real iOS and Android devices (not just simulator)
- [ ] Web render test page for the same fixtures (studio preview parity)
- **Done when:** the fixtures render with no mark collisions on iOS, Android, and web.

### P0.4 Design language & mobile app shell ⬜
The signature look, before any features — on the surface that matters.
- [ ] Design tokens: paper/sepia palette with subtle grain, White/Sepia/Dark/Black themes,
      spacing & type scale (Gujarati-aware); tokens shared where practical between RN and web
- [ ] Mobile app shell: expo-router navigation skeleton, theme switching, base components
      in the design language
- [ ] Generated book covers: paper texture + Gujarati display type component (RN + web impls)
- [ ] EAS project setup: internal distribution builds so the shell installs on real devices
- **Done when:** an empty shell app on a real phone already feels like *this product*.

---

## P1 — Content pipeline & admin studio

*Internal tooling only — end users never see any of this. Goal: turn one real PDF into a
published, proofed book package served by the API. You are the user; optimize for your
throughput.*

### P1.1 PDF triage & inventory ⬜
- [ ] Inventory the PDFs we have: language, script, scan vs text-layer, source edition, rights
- [ ] Triage CLI in `packages/pipeline`: classify each PDF — (a) true Unicode text layer,
      (b) legacy-font text layer, (c) scanned images. **Rule: never trust embedded text from
      (b) — render to image and OCR**
- [ ] Pick the first target book (smallest trustworthy text, verse-structured preferred)
- **Done when:** a written inventory exists with a chosen first book and per-PDF strategy.

### P1.2 OCR & extraction ⬜
- [ ] Page rendering: PDF → high-res page images (per-page, deterministic naming)
- [ ] OCR integration: Google Cloud Vision `DOCUMENT_TEXT_DETECTION` with `languageHints: ["gu"]`
      (evaluate self-hosted Surya as fallback/offline option — use whatever is optimal per book)
- [ ] Post-processing pass: Unicode NFC normalization, pre-base matra reorder repair,
      conjunct sanity checks
- [ ] Structure detection: chapter/verse boundaries from numbering; verse-number sequence used
      as a checksum (flag missing/duplicate verses)
- [ ] Output: draft book package (P0.2 format) + per-verse confidence scores
- **Done when:** the first book emerges as a draft package with >95% of verses auto-segmented correctly.

### P1.3 Proofing studio (web, admin-only) ⬜
Human-in-the-loop correction UI — mandatory for scripture-grade fidelity.
- [ ] Admin area in `apps/web` behind auth (single admin account is fine for now)
- [ ] Side-by-side page image ↔ extracted text, synced scrolling per verse
- [ ] Inline editing with Gujarati input; keyboard-first flow (approve verse / edit / flag)
- [ ] Verse status workflow: `raw → proofed → approved`; per-book progress meter
- [ ] Low-confidence verses surfaced first; diff view against re-runs of OCR
- [ ] Export: approved book compiles to a versioned, immutable book package
- **Done when:** one full book is proofed end-to-end in the studio and exported as `v1`.

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
- [ ] Studio "publish" action pushes an approved package to the catalog
- [ ] Client install contract documented: download, verify, store locally (SQLite on mobile)
- **Done when:** the studio can publish a book and a test client can list, download, and
  verify it.

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

## Changelog

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
