/**
 * A real Postgres for tests, with nothing to install and nothing to clean up.
 *
 * PGlite is Postgres itself compiled to WebAssembly, so these tests run the same DDL, the same
 * `gen_random_uuid()` and the same `jsonb` behaviour as the studio's actual database — and
 * `bun test` still passes on a clean checkout with no server running, which the repo's
 * check/typecheck/test gate depends on.
 *
 * Test-only: `@electric-sql/pglite` is a devDependency and nothing under `src/` outside this
 * file imports it.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client.ts";
import { MIGRATIONS_DIR } from "./paths.ts";
import * as schema from "./schema.ts";

export type TestDb = {
	readonly db: Db;
	readonly close: () => Promise<void>;
};

/** A migrated, empty, in-memory database. One per test file is cheap enough. */
export async function createTestDb(): Promise<TestDb> {
	const client = new PGlite();
	const db = drizzle({ client, schema, casing: "snake_case" });
	await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
	return {
		// The two drivers differ only in how a query is dispatched; every service in the API is
		// written against the driver-agnostic `Db`, which is what makes this substitution sound.
		db: db as unknown as Db,
		close: () => client.close(),
	};
}
