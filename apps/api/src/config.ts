/**
 * Runtime configuration. Bun auto-loads `.env`, so no dotenv here.
 *
 * Defaults are development defaults: the API sits on :3001 so it does not collide
 * with the web dev server (:3000); allowed origins cover the Vite dev server and
 * Expo's dev server / web preview.
 *
 * The admin studio's two secrets have **no defaults on purpose**. A default password is a
 * published password, and the studio is the one surface that can move scripture from `draft`
 * towards `published`. Unset, the studio does not mount at all — see `modules/admin/guard.ts`.
 */
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { databaseUrl } from "@granthalaya/db";

const DEFAULT_PORT = 3001;
const DEFAULT_ORIGINS = ["http://localhost:3000", "http://localhost:8081"];
/** A week. Long enough that proofing a book is not interrupted by a login. */
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const HERE = dirname(fileURLToPath(import.meta.url));

function parseOrigins(raw: string | undefined): string[] {
	if (!raw) return DEFAULT_ORIGINS;
	return raw
		.split(",")
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0);
}

function parsePort(raw: string | undefined): number {
	if (!raw) return DEFAULT_PORT;
	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`API_PORT must be an integer between 1 and 65535, got: ${raw}`);
	}
	return port;
}

/**
 * The working area the pipeline writes into — source PDFs, rendered pages, draft packages.
 *
 * Resolved from this file rather than from the process's working directory, because the API is
 * started from `apps/api` by its own script and from the repo root by `bun run dev`.
 */
function parseContentDir(raw: string | undefined): string {
	if (!raw) return join(HERE, "..", "..", "..", "content");
	return isAbsolute(raw) ? raw : join(process.cwd(), raw);
}

function parseSeconds(raw: string | undefined, fallback: number, name: string): number {
	if (!raw) return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer number of seconds, got: ${raw}`);
	}
	return value;
}

/** Both secrets or neither — half-configured auth is the failure mode worth refusing outright. */
function parseAdmin(): { passwordHash: string; cookieSecret: string } | null {
	const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
	const cookieSecret = process.env.COOKIE_SECRET?.trim();
	if (!passwordHash && !cookieSecret) return null;
	if (!passwordHash || !cookieSecret) {
		throw new Error(
			"ADMIN_PASSWORD_HASH and COOKIE_SECRET must be set together — the studio cannot sign a session without both. `bun run admin:password` mints them.",
		);
	}
	// Bun expands `$NAME` in .env *inside quotes as well*, and an argon2 hash is nothing but
	// `$`-delimited fields — so a hash pasted verbatim arrives as `=19=65536,...`. Caught here
	// because the only other symptom is the right password being refused, which reads as a
	// forgotten password rather than as a parsing bug.
	if (!passwordHash.startsWith("$argon2")) {
		throw new Error(
			'ADMIN_PASSWORD_HASH does not look like an argon2 hash. Bun expands $NAME in .env even inside single quotes, so the hash must be written with double quotes and escaped dollars: ADMIN_PASSWORD_HASH="\\$argon2id\\$v=19\\$…". `bun run admin:password` prints it in that form.',
		);
	}
	return { passwordHash, cookieSecret };
}

export const config = {
	port: parsePort(process.env.API_PORT),
	corsOrigins: parseOrigins(process.env.API_CORS_ORIGINS),
	databaseUrl: databaseUrl(),
	contentDir: parseContentDir(process.env.CONTENT_DIR),
	/** `null` disables the whole admin surface rather than securing it badly. */
	admin: parseAdmin(),
	sessionTtlSeconds: parseSeconds(
		process.env.SESSION_TTL_SECONDS,
		DEFAULT_SESSION_TTL_SECONDS,
		"SESSION_TTL_SECONDS",
	),
	/**
	 * Cookies go `Secure` in production, where the studio and the API may be different origins.
	 * In development they are same-*site* — a port is not part of a site — so an unsecured `Lax`
	 * cookie crosses :3000 → :3001 fine, and `Secure` would stop it being set over plain http.
	 */
	secureCookies: process.env.NODE_ENV === "production",
} as const;
