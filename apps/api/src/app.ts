import { cors } from "@elysiajs/cors";
import type { Db } from "@granthalaya/db";
import { Elysia } from "elysia";
import { config } from "./config.ts";
import { getDb } from "./db.ts";
import type { AdminConfig } from "./modules/admin/guard.ts";
import { createAdminSession } from "./modules/admin/index.ts";
import { createCatalog } from "./modules/catalog/index.ts";
import { health } from "./modules/health/index.ts";
import { createStudio } from "./modules/studio/index.ts";

/**
 * The Elysia application, without a listener attached — tests and the Eden client can
 * use it directly via `app.handle(...)` / `treaty(app)`. `index.ts` is what binds a port.
 *
 * Method chaining is required: each call returns a new type reference, and `App` below
 * is what mobile and web consume through the typed Eden client.
 *
 * A factory as well as a value, because the studio's tests need an app around a throwaway
 * database and a known password. Every branch mounts the same routes — an unconfigured studio
 * refuses rather than disappears — so `App` describes one API rather than whichever one the
 * machine that compiled the client happened to have configured.
 */
export type AppOptions = {
	db?: Db;
	contentDir?: string;
	admin?: AdminConfig;
};

export function createApp(options: AppOptions = {}) {
	const admin = options.admin === undefined ? config.admin : options.admin;
	// Lazy on purpose: `getDb()` opens no socket, so importing this module does not require a
	// running Postgres.
	const db = options.db ?? getDb();
	const contentDir = options.contentDir ?? config.contentDir;

	return (
		new Elysia()
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
			// The public half: published books, and the packages themselves. No session, because a
			// reader's phone has none — the gate is that only `publishBook` writes to the catalog.
			.use(createCatalog({ db, contentDir }))
			.use(createAdminSession(admin))
			.use(createStudio({ credentials: admin, db, contentDir }))
	);
}

export const app = createApp();

export type App = typeof app;
