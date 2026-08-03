/**
 * Where the studio's database lives.
 *
 * Its own module, with no imports, because `drizzle.config.ts` reads it under Node (drizzle-kit
 * is not a Bun program) while everything else reads it under Bun. Anything that touched `bun`
 * here would break `db:generate`.
 */

/** Local Postgres, the database this project creates. There is no cloud default. */
export const DEFAULT_DATABASE_URL = "postgres://localhost:5432/granthalaya";

export function databaseUrl(raw: string | undefined = process.env.DATABASE_URL): string {
	return raw?.trim() || DEFAULT_DATABASE_URL;
}
