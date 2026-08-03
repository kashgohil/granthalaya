/**
 * The admin session (P1.3).
 *
 * One account, because there is one admin. The studio is not a multi-tenant product and
 * pretending otherwise would buy roles, invitations and a user table that nothing would ever
 * read. What it does need is to be genuinely closed: it is the only surface that can move a
 * book from a machine's draft towards something a reader installs.
 *
 * The password is never stored, only its argon2id hash (`bun run admin:password` mints one).
 * The session is a signed string rather than a row — with a single account there is nothing to
 * revoke that clearing the cookie does not already achieve, and a stateless session survives a
 * database that is down for migration.
 *
 * **The signature is computed here rather than by Elysia's cookie `sign` option.** That option,
 * configured at the instance level, silently did nothing on Elysia 1.4.29: the cookie went out as
 * a bare `granthalaya_admin=admin.1786357083`, and anything that could be read could be written.
 * A gate that fails open without saying so is worse than no gate, so this module does not depend
 * on one — and `service.test.ts` fails if the HMAC ever stops being checked.
 */
import { timingSafeEqual } from "node:crypto";

export type AdminCredentials = {
	readonly passwordHash: string;
	readonly cookieSecret: string;
};

/** What the cookie carries. The signature decides authenticity; `exp` decides freshness. */
export type SessionPayload = {
	readonly sub: "admin";
	/** Unix seconds. Checked server-side — a cookie's own `maxAge` is only the browser's promise. */
	readonly exp: number;
};

export const SESSION_COOKIE = "granthalaya_admin";

export function issueSession(ttlSeconds: number, nowMs: number = Date.now()): SessionPayload {
	return { sub: "admin", exp: Math.floor(nowMs / 1000) + ttlSeconds };
}

function hmac(body: string, secret: string): string {
	return new Bun.CryptoHasher("sha256", secret).update(body).digest("base64url");
}

/** Constant-time, and constant-time about the length too — both sides are a fixed-size digest. */
function signaturesMatch(given: string, expected: string): boolean {
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/**
 * `admin.<unix-seconds>.<hmac>` — deliberately not JSON.
 *
 * Elysia parses a cookie value that looks like JSON back into an object, so a JSON payload would
 * arrive as a string on the way out and an object on the way in. A flat string has one shape in
 * both directions, and it is the exact bytes the signature covers.
 */
export function encodeSession(payload: SessionPayload, secret: string): string {
	const body = `${payload.sub}.${payload.exp}`;
	return `${body}.${hmac(body, secret)}`;
}

/**
 * Decode a cookie value into a live session, or `null`.
 *
 * Takes `unknown` because that is what comes back off the wire — a cookie is a string a stranger
 * chose. Signature first, then shape, then expiry.
 */
export function decodeSession(
	raw: unknown,
	secret: string,
	nowMs: number = Date.now(),
): SessionPayload | null {
	if (typeof raw !== "string") return null;

	const split = raw.lastIndexOf(".");
	if (split <= 0) return null;
	const body = raw.slice(0, split);
	if (!signaturesMatch(raw.slice(split + 1), hmac(body, secret))) return null;

	const match = /^admin\.(\d+)$/.exec(body);
	if (!match?.[1]) return null;
	const exp = Number(match[1]);
	if (!Number.isSafeInteger(exp) || exp <= Math.floor(nowMs / 1000)) return null;
	return { sub: "admin", exp };
}

/**
 * Check a password against the stored hash.
 *
 * `Bun.password.verify` is constant-time for a given hash and argon2id is deliberately slow,
 * which is also the rate limit: a few hundred milliseconds per attempt makes guessing a strong
 * password pointless without a bucket to maintain.
 *
 * A malformed hash throws rather than returning false; that is a misconfiguration, and catching
 * it here means it reads as "wrong password" to a stranger rather than as a 500.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	try {
		return await Bun.password.verify(password, hash);
	} catch {
		return false;
	}
}
