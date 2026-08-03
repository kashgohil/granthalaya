# Granthalaya

A digital library for religious scriptures (primarily Gujarati): premium book-like reading,
recital, memorization, and study tools. `ROADMAP.md` is the source of truth for scope,
phases, and architecture decisions — read it before planning any feature work, and keep its
slice checkboxes/status markers updated as work lands.

## Monorepo layout

| Path | What it is | Audience |
|---|---|---|
| `apps/mobile` | Expo (expo-router) app — **the consumer product**: reading, book install, recital, flashcards, quizzes | End users only; no admin features |
| `apps/web` | TanStack Start + Vite + Tailwind 4 — promotional site + admin studio (PDF proofing, layer authoring, publishing) behind auth | Public visitors + admin |
| `apps/api` | Elysia (Bun) API — auth, book catalog/distribution, sync, TTS proxy (scaffolded in P0.1) | All clients, via typed Eden client |
| `packages/core` | Platform-pure TS domain: book format/Zod schemas, verse addressing, SRS, quiz engine. Zod is its only dependency; shared by mobile, web, api | — |
| `packages/pipeline` | Internal CLI tooling: PDF triage, OCR, normalization, packaging. Never user-facing | Admin |
| `packages/db` | Postgres schema + Drizzle client for the admin studio's editable state. Consumed only by `apps/api` | Admin |

The content flow: PDFs → `packages/pipeline` + admin studio (web) → published packages served
by `apps/api` → installed offline in `apps/mobile`.

## Runtime & tooling

Bun is the runtime and package manager everywhere:

- `bun install`, `bun test`, `bun run <script>`, `bunx <pkg>`, `bun <file>` (never node/npm/pnpm/yarn/jest/vitest)
- Bun auto-loads `.env` — don't add dotenv. It reads from the **process working directory
  and does not walk up**, so each app keeps its own `.env` next to its `package.json`
  (Vite and Expo behave the same way); see the `.env.example` in each app
- Backend code: Elysia for HTTP APIs (not express); `bun:sqlite` for SQLite; `Bun.file` over `node:fs`; `Bun.$` for shell; built-in `WebSocket`
- Exceptions to "Bun for everything": `apps/web` is TanStack Start on **Vite** and `apps/mobile` uses the **Expo/Metro** toolchain — both are intentional; run them via their `bun run` scripts, don't replace them with `Bun.serve()` HTML imports or `bun build`

## Commands

```sh
# repo root — run these three before calling work done (no CI yet, this is the gate)
bun run check            # biome lint + format, whole repo (--write via check:fix)
bun run typecheck        # tsc --noEmit in every workspace
bun test                 # bun:test across every workspace

bun run dev              # api (:4567) + web (:4568) together (--parallel: web depends on api,
                         #   so without it bun waits for the API's dev to exit and web never starts)
bun run dev:api / dev:web / dev:mobile
bun run validate <path>  # check a book package against docs/book-format.md
bun run triage <path>    # inventory a folder of PDFs, pick an extraction strategy per file
bun run render <pdf>     # render a book's pages to images for OCR and proofing (resumable)
bun run ocr <pages-dir>  # read those pages with Sarvam Vision (needs SARVAM_API_KEY; costs money)
bun run assemble <ocr-dir>  # turn that text into a draft book package + proofing queue (free, re-runnable)
bun run admin:password   # mint ADMIN_PASSWORD_HASH + COOKIE_SECRET for the studio (paste into apps/api/.env)
bun run db:generate      # regenerate migrations after editing packages/db/src/schema.ts
bun run db:migrate       # apply them (the API also does this at startup)
bun run db:studio        # drizzle-kit's database browser
bun run fonts:sync       # re-download the Gujarati font stack into both apps (output is committed)
bun run design:sync      # regenerate the paper-grain tile + apps/web tokens.css from packages/core/src/design

# apps/api (run from apps/api)
bun run dev              # Elysia on :4567, watch mode
bun run start            # run once

# apps/web (run from apps/web)
bun run dev              # Vite dev server on :4568
bun run build            # production build
bun run generate-routes  # regenerate TanStack Router route tree (see the caveat below)

# apps/mobile (run from apps/mobile)
bun run start            # expo start
bun run ios / android    # run on simulator/device
bunx expo run:ios        # build + install the dev build (needed after a native dep changes)

# packages/pipeline
bun run --filter '@granthalaya/pipeline' cli   # admin CLI (help / version)
```

Tests use `bun test` with `bun:test` (`import { test, expect } from "bun:test"`), colocated
next to the code as `*.test.ts`.

## Conventions

### Workspace-wide
- **Biome everywhere** (not eslint/prettier) — root `biome.json` is the source of truth;
  nested configs set `"root": false` + `"extends": "//"`. Biome's JSON parser chokes on
  comments in the *nested* config files, so keep those comment-free
- Shared compiler options live in `tsconfig.base.json`; `apps/web` (Vite) and `apps/mobile`
  (Expo) keep their own toolchain configs and layer settings on top
- Workspace packages are consumed as **TypeScript source** — `exports` point at `src/`, there
  is no build step and no `dist/`. Consumers need `allowImportingTsExtensions`
- `bun install` uses Bun's **isolated linker** (real packages in `node_modules/.bun/`, each
  workspace symlinked). Metro must keep hierarchical lookup *enabled* — see the note in
  `apps/mobile/metro.config.js`

### apps/api
- Feature-based modules in `src/modules/<feature>/` (`index.ts` routes, `service.ts` logic,
  `model.ts` schemas); method chaining is required for Elysia's type inference
- `src/app.ts` builds the instance and exports `type App`; only `src/index.ts` calls `.listen`,
  so tests and `treaty(app)` can drive the app in-process
- Clients import `type { App } from "@granthalaya/api"` and talk to it through Eden treaty
  (`apps/*/src/lib/api.ts`) — never hand-write fetch calls against the API

### apps/web
- File-based routing in `src/routes/`; `src/routeTree.gen.ts` is generated — never edit it by hand.
  **`bun run generate-routes` alone is not enough**: `tsr generate` strips the
  `declare module '@tanstack/react-start'` block that the Start plugin appends, so run
  `bun run build` (or `dev`) afterwards and commit the file the *build* produced
- Import alias `#/*` → `./src/*`
- shadcn/ui (new-york style, zinc base, lucide icons) in `#/components/ui`; add components with `bunx shadcn@latest add <name>`
- Tailwind 4 CSS-first config in `src/styles.css` (no tailwind.config file)
- Biome for lint/format (not eslint/prettier)

### apps/mobile
- expo-router screens in `src/app/`: `(tabs)/` is the four-tab shell (Today · Library ·
  Study · Settings), the root `_layout.tsx` is a stack for everything pushed over it
- shared UI in `src/components/` (`ui/` is the design-language base kit); theme context in
  `src/theme/`
- Import alias `@/*` → `./src/*`
- `src/types/globals.d.ts` is the committed stand-in for Expo's gitignored `expo-env.d.ts`,
  so `bun run typecheck` works on a clean checkout — don't delete it
- See `apps/mobile/CLAUDE.md` / `AGENTS.md` for Expo-specific guidance

### packages/*
- `packages/core` stays platform-pure: no React, no Bun/Node APIs, no I/O — types, schemas, and pure logic only, fully unit-tested with `bun test`
- `packages/pipeline` may use anything optimal per step (Bun APIs, external OCR services)
- `packages/db` owns the studio's Postgres schema (Drizzle). Migrations are **generated SQL,
  committed and applied in order** — never `db:push`: these tables hold human proofing that exists
  nowhere else. Runtime uses `Bun.SQL`; tests use PGlite (`@granthalaya/db/testing`) so `bun test`
  passes with no database server running. Services take the driver-agnostic `Db` type, which is
  what makes that substitution sound

## Domain rules (non-negotiable)

- **Verse IDs are the atom.** Highlights, audio sync, flashcards, quizzes, sync all key off
  stable verse/passage IDs (spec: `docs/book-format.md`, P0.2). Never key user data to text
  offsets or scroll positions.
- **Gujarati typography:** line-height 1.7–2.0 for body text; base font ~10–15% larger than
  Latin; **never** apply `letter-spacing` to Gujarati (splits conjuncts); ragged-right, not
  force-justified; highlights as background color, never underline; never split text inside
  an akshara (conjunct cluster). Body font: Rasa; fallback Noto Serif Gujarati; UI: Noto Sans
  Gujarati / Mukta Vaani. Spec: `docs/typography.md` (P0.3) — the rules live in
  `packages/core/src/text/`, so resolve metrics with `resolveTextStyle` and cut text with
  `aksharaSpans` rather than restating either by hand. `checkTextStyle` enforces them.
- **Scripture fidelity:** book content is published only after human proofing in the studio;
  never trust text extracted from Gujarati PDFs' embedded fonts — render pages to images and
  OCR instead. Text extracted from a page is normalized by `normalizeScriptureText`
  (`packages/core/src/text/normalize.ts`), whose contract is that it is a **no-op on clean
  text** and reports every repair it does make — don't add a transform there that "improves"
  text, and don't hand-roll one elsewhere. Spec: `docs/assembly.md`.
- **Design language:** never write a hex value or a font size in a component. Colour comes
  from `theme(name)` (four themes: White/Sepia/Dark/Black), size from
  `resolveTypeStyle(token, script)`, and spacing/radii/motion from `SPACING`/`RADIUS`/
  `MOTION` — all in `packages/core/src/design/`. A type token names the *Latin-equivalent*
  size; Gujarati's is derived, which is what keeps the typography rules true everywhere.
  Spec: `docs/design-language.md` (P0.4). The web takes the same tokens as CSS variables via
  `bun run design:sync`.
- **Local-first mobile:** reading, annotations, and study must work fully offline; the API is
  for sync and distribution, not for rendering the reading path.
- **The studio never edits a package in place.** `content/books/<id>/book.json` is what `assemble`
  wrote; the editable copy is Postgres, and export re-derives a package from it. That is what makes
  re-running `assemble` safe. A re-import replaces a row nobody has touched and never overwrites
  one somebody has — and deletes nothing, ever. Spec: `docs/proofing-studio.md` (P1.3).
- **A published version is written once.** Publishing hands out the exported file's own bytes,
  hashed as written and recorded in `releases`; corrections ship as a new `contentVersion`. Every
  ref a published version resolved must still point somewhere in the next one — export compiles
  that `aliases` map and `auditRelease` refuses the package if it doesn't, because a dropped ref
  orphans user data on devices that already installed. Spec: `docs/distribution.md` (P1.5).
