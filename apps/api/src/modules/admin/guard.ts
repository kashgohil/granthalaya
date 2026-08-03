/**
 * The gate every `/admin` route sits behind.
 *
 * Two things are deliberate here.
 *
 * The cookie's attributes are set in one place, so a future route cannot be mounted with a
 * session cookie that is readable by JavaScript or scoped to the wrong path. Its *signature* is
 * not Elysia's doing — see `service.ts` for why we compute it ourselves.
 *
 * And an unconfigured studio still *has* its routes; they just refuse. The alternative — mounting
 * them conditionally — would make `App`, and therefore the typed client the studio is written
 * against, depend on whether a machine happens to have a password in its environment.
 */
import { Elysia, t } from "elysia";
import type { AdminCredentials } from "./service.ts";
import { decodeSession, SESSION_COOKIE } from "./service.ts";

/** `null` when `ADMIN_PASSWORD_HASH`/`COOKIE_SECRET` are unset: the studio is closed. */
export type AdminConfig = AdminCredentials | null;

export const AdminErrorSchema = t.Object({ error: t.String() });

/** A base instance whose cookie defaults are the session cookie's. */
export function adminInstance(name: string) {
	return new Elysia({
		name,
		cookie: { httpOnly: true, path: "/", sameSite: "lax" },
	});
}

export const NOT_CONFIGURED =
	"The admin studio is not configured on this API. Set ADMIN_PASSWORD_HASH and COOKIE_SECRET — `bun run admin:password` mints both.";

/**
 * Why a request may not proceed, or `null`.
 *
 * Returned as data rather than thrown, and applied by the caller's own `status()`, so Elysia
 * keeps inferring the route's response type — a guard that erased it would take the typed client
 * with it. The two codes are distinct on purpose: the studio shows a login form for 401 and an
 * explanation for 503, and neither should have to be inferred by reading a message.
 */
export function adminRejection(
	credentials: AdminConfig,
	cookie: Record<string, { value?: unknown }>,
): { code: 401 | 503; body: { error: string } } | null {
	if (credentials === null) {
		return { code: 503, body: { error: NOT_CONFIGURED } };
	}
	if (decodeSession(cookie[SESSION_COOKIE]?.value, credentials.cookieSecret) === null) {
		return { code: 401, body: { error: "Not signed in." } };
	}
	return null;
}
