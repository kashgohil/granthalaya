import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/url.ts";

/**
 * Migrations are generated SQL files, committed, and applied in order — not `db:push`.
 *
 * The studio's tables hold hours of human proofing that exists nowhere else: the package it came
 * from is a machine's draft and the corrections are not in it. A schema change that silently
 * rewrites a column is the one failure this project cannot absorb, so every change is a file
 * somebody can read before it runs.
 */
export default defineConfig({
	schema: "./src/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	casing: "snake_case",
	dbCredentials: { url: databaseUrl() },
});
