# Granthalaya

A digital granthalaya (library) for religious scriptures — primarily in Gujarati — with a
premium, book-like reading experience and modern tools for recital, memorization and study.

`ROADMAP.md` is the single source of truth for scope and progress. `CLAUDE.md` holds the
working conventions.

## Layout

| Path | What it is |
|---|---|
| `apps/mobile` | Expo (expo-router) app — the consumer product |
| `apps/web` | TanStack Start — promo site + admin studio |
| `apps/api` | Elysia (Bun) API — catalog, distribution, sync |
| `packages/core` | Pure TS domain: book format, verse addressing, SRS, quiz engine |
| `packages/pipeline` | Internal CLI: PDF triage, OCR, packaging |

Content flows: PDFs → `packages/pipeline` + admin studio → published packages served by
`apps/api` → installed offline in `apps/mobile`.

## Getting started

Bun is the runtime and package manager everywhere.

```sh
bun install

# Each app loads .env from its OWN directory — Bun, Vite and Expo all read the process
# working directory and none of them walk up to the repo root.
cp apps/api/.env.example    apps/api/.env
cp apps/web/.env.example    apps/web/.env
cp apps/mobile/.env.example apps/mobile/.env

bun run dev             # api (:3001) + web (:3000)
bun run dev:mobile      # expo start
```

Both dev servers fail loudly if their port is taken rather than moving to another one —
the API's CORS allowlist is pinned to specific origins, so a silent port change would
surface later as a confusing CORS error. Change `API_PORT` / `API_CORS_ORIGINS` and the
`--port` in `apps/web`'s `dev` script together.

## Checks

There is no CI yet — these three, from the repo root, are the gate:

```sh
bun run check           # biome lint + format, whole repo
bun run check:fix       # ...and apply fixes
bun run typecheck       # tsc --noEmit in every workspace
bun test                # bun:test across every workspace
```

## Notes for working in this repo

- Workspace packages are consumed as **TypeScript source** (`exports` point at `src/`).
  There is no build step and no `dist/` to go stale — Bun, Metro and Vite each compile
  them like app code.
- `bun install` uses Bun's **isolated linker**: real packages live in `node_modules/.bun/`
  and every workspace gets its own symlinked `node_modules`. `apps/mobile/metro.config.js`
  is set up for this — see the note in that file before changing resolver options.
