/**
 * The API's handle on the studio database.
 *
 * Lazy: `Bun.SQL` does not open a socket until the first query, so importing this costs nothing
 * and `bun test` can build an app around a different database entirely (see `app.ts`).
 *
 * Migrations run at startup rather than by hand. The alternative is a developer discovering a
 * missing column through a 500 in the middle of proofing a page.
 */
import { type BunDb, connect, type Db, migrateToLatest } from "@granthalaya/db";
import { config } from "./config.ts";

let instance: BunDb | undefined;

function client(): BunDb {
	instance ??= connect(config.databaseUrl);
	return instance;
}

export function getDb(): Db {
	return client();
}

export async function migrateDb(): Promise<void> {
	await migrateToLatest(client());
}
