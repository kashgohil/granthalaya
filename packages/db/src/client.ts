/**
 * Connecting to the studio's Postgres.
 *
 * `Bun.SQL` is the driver, per the repo's "Bun for everything" rule — no `pg`, no `postgres.js`.
 * Drizzle's `bun-sql` adapter takes it directly.
 *
 * `Db` is the type every service in `apps/api` takes, and it is deliberately the *union* of this
 * driver and the PGlite one used by tests: a query that only compiles against one of them is a
 * query the tests cannot run.
 */
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";
import { databaseUrl } from "./url.ts";

/**
 * What every service takes. Drizzle's driver-agnostic base rather than `BunSQLDatabase`, so the
 * same code runs against the PGlite instance the tests bring up — see `testing.ts`.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * The concrete driver. Only the migrator needs it — drizzle's `migrate` is written per driver,
 * and widening it to `Db` would make a migration runnable against a database it cannot reach.
 */
export type BunDb = ReturnType<typeof connect>;

export function connect(url: string = databaseUrl()) {
	return drizzle({ client: new SQL(url), schema, casing: "snake_case" });
}
