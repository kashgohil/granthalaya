/**
 * Where the generated migrations sit, resolved from this file rather than from the process's
 * working directory — the API, the CLI and `bun test` all run from different places.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
