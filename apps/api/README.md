# @granthalaya/api

Elysia (Bun) API for Granthalaya: auth, book catalog & distribution, sync and the TTS
proxy. Clients (`apps/mobile`, `apps/web`) consume it through the typed Eden client —
they import `type { App }` from this package, so route changes surface as type errors
rather than runtime 404s.

## Commands

```sh
bun run dev        # watch mode on :3001
bun run start      # run once
bun run test       # bun test
bun run typecheck  # tsc --noEmit
```

From the repo root, `bun run dev` starts this API alongside the web app.

## Configuration

Bun auto-loads `.env` — do not add dotenv.

| Variable | Default | Purpose |
|---|---|---|
| `API_PORT` | `3001` | Port to bind (3000 is the web dev server) |
| `API_CORS_ORIGINS` | `http://localhost:3000,http://localhost:8081` | Comma-separated allowed origins |

## Layout

Feature-based modules, per Elysia's recommended structure:

```
src/
├── app.ts              # composes the Elysia instance; exports `app` and `type App`
├── index.ts            # binds the port (the only file that listens)
├── config.ts           # env parsing
└── modules/<feature>/  # index.ts = routes, service.ts = logic, model.ts = schemas
```

`app.ts` deliberately does not listen, so tests and `treaty(app)` can drive it in-process.
