import { expect, test } from "bun:test";
import { decodeSession, encodeSession, issueSession, verifyPassword } from "./service.ts";

const HOUR = 3600;
const SECRET = "test-cookie-secret";

test("a session round-trips and carries its expiry", () => {
	const now = 1_700_000_000_000;
	const session = issueSession(HOUR, now);

	expect(session).toEqual({ sub: "admin", exp: 1_700_000_000 + HOUR });
	expect(decodeSession(encodeSession(session, SECRET), SECRET, now)).toEqual(session);
});

test("an expired session decodes to null", () => {
	const now = 1_700_000_000_000;
	const session = issueSession(HOUR, now);
	const cookie = encodeSession(session, SECRET);

	expect(decodeSession(cookie, SECRET, now + HOUR * 1000 + 1000)).toBeNull();
});

/**
 * The one that matters. Elysia's own cookie `sign` option turned out to be a no-op at the
 * instance level — the cookie went out unsigned — so a forged payload was a valid session. These
 * cases are the reason the HMAC is computed in `service.ts` rather than delegated.
 */
test("an unsigned or forged payload is not a session", () => {
	const now = 1_700_000_000_000;
	const far = Math.floor(now / 1000) + HOUR;

	// Exactly what a stranger would try: the payload, with no signature at all.
	expect(decodeSession(`admin.${far}`, SECRET, now)).toBeNull();
	// The right shape, a wrong signature.
	expect(decodeSession(`admin.${far}.deadbeef`, SECRET, now)).toBeNull();
	// A real signature, over a different expiry.
	const real = encodeSession(issueSession(HOUR, now), SECRET);
	const tampered = real.replace(/^admin\.\d+/, `admin.${far + 99999}`);
	expect(decodeSession(tampered, SECRET, now)).toBeNull();
	// A real cookie, under a secret that has since been rotated.
	expect(decodeSession(real, "a-different-secret", now)).toBeNull();
});

test("anything that is not a session string decodes to null", () => {
	for (const value of [undefined, null, "", ".", "admin", "admin.", "root.999999999999", 42, {}]) {
		expect(decodeSession(value, SECRET)).toBeNull();
	}
});

test("a password verifies against its own hash and nothing else", async () => {
	const hash = await Bun.password.hash("a-long-enough-password", { algorithm: "argon2id" });

	expect(await verifyPassword("a-long-enough-password", hash)).toBe(true);
	expect(await verifyPassword("a-long-enough-passwore", hash)).toBe(false);
});

test("a malformed hash is a failed login, not a crash", async () => {
	// A truncated or hand-edited ADMIN_PASSWORD_HASH makes `Bun.password.verify` throw. Letting
	// that reach the route would answer 500 and, worse, distinguish it from a wrong password.
	expect(await verifyPassword("anything", "not-a-real-argon2-hash")).toBe(false);
});
