import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { config } from "./config.ts";
import { health } from "./modules/health/index.ts";

/**
 * The Elysia application, without a listener attached — tests and the Eden client can
 * use it directly via `app.handle(...)` / `treaty(app)`. `index.ts` is what binds a port.
 *
 * Method chaining is required: each call returns a new type reference, and `App` below
 * is what mobile and web consume through the typed Eden client.
 */
export const app = new Elysia().use(cors({ origin: config.corsOrigins })).use(health);

export type App = typeof app;
