import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { config } from "./config.ts";
import type { AdminConfig } from "./modules/admin/guard.ts";
import { createAdminSession } from "./modules/admin/index.ts";
import { health } from "./modules/health/index.ts";

/**
 * The Elysia application, without a listener attached — tests and the Eden client can
 * use it directly via `app.handle(...)` / `treaty(app)`. `index.ts` is what binds a port.
 *
 * Method chaining is required: each call returns a new type reference, and `App` below
 * is what mobile and web consume through the typed Eden client.
 *
 * A factory as well as a value, because the admin routes' tests need an app with a known
 * password. Every branch mounts the same routes — an unconfigured studio refuses rather than
 * disappears — so `App` describes one API rather than whichever one the machine that compiled
 * the client happened to have configured.
 */
export type AppOptions = {
	admin?: AdminConfig;
};

export function createApp(options: AppOptions = {}) {
	const admin = options.admin === undefined ? config.admin : options.admin;

	return new Elysia()
		.use(
			cors({
				origin: config.corsOrigins,
				// The studio authenticates with a cookie, and a cross-origin request only carries
				// one when both sides opt in: this header, and `credentials: "include"` on the
				// client. Page images need the same, via `crossorigin` on the <img>.
				credentials: true,
			}),
		)
		.use(health)
		.use(createAdminSession(admin));
}

export const app = createApp();

export type App = typeof app;
