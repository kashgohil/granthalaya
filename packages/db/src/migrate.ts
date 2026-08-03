/**
 * Apply the generated migrations. `bun run --filter '@granthalaya/db' db:migrate`, or
 * `bun run db:migrate` from the root.
 *
 * Separate from `drizzle-kit migrate` so the API can call the same function at startup and a
 * developer never has to remember whether the schema is current.
 */
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { type BunDb, connect } from "./client.ts";
import { MIGRATIONS_DIR } from "./paths.ts";
import { databaseUrl } from "./url.ts";

export async function migrateToLatest(db: BunDb): Promise<void> {
	await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

if (import.meta.main) {
	const url = databaseUrl();
	await migrateToLatest(connect(url));
	console.log(`granthalaya db → migrated ${url}`);
}
