/**
 * Signing in and out of the admin studio (P1.3).
 *
 * Three routes and one cookie. An API with no `ADMIN_PASSWORD_HASH` still serves them and still
 * refuses: `POST` answers 503 and `GET` answers "not authenticated", so the studio can say why it
 * cannot let anyone in instead of showing a login form that could never work.
 */
import { t } from "elysia";
import { config } from "../../config.ts";
import { type AdminConfig, AdminErrorSchema, adminInstance, NOT_CONFIGURED } from "./guard.ts";
import {
	decodeSession,
	encodeSession,
	issueSession,
	SESSION_COOKIE,
	verifyPassword,
} from "./service.ts";

const SessionStateSchema = t.Object({
	authenticated: t.Boolean(),
	/** False when the API has no admin secrets — the studio shows this instead of a login form. */
	configured: t.Boolean(),
});

export function createAdminSession(credentials: AdminConfig) {
	return adminInstance("admin-session")
		.post(
			"/admin/session",
			async ({ body, cookie, status }) => {
				if (credentials === null) {
					return status(503, { error: NOT_CONFIGURED });
				}
				if (!(await verifyPassword(body.password, credentials.passwordHash))) {
					return status(401, { error: "Wrong password." });
				}

				const session = issueSession(config.sessionTtlSeconds);
				const jar = cookie[SESSION_COOKIE];
				if (jar !== undefined) {
					jar.value = encodeSession(session, credentials.cookieSecret);
					jar.maxAge = config.sessionTtlSeconds;
					jar.secure = config.secureCookies;
					// Off localhost the studio and the API are plausibly different sites, where a
					// `Lax` cookie would never be sent on the studio's own requests.
					jar.sameSite = config.secureCookies ? "none" : "lax";
				}
				return { authenticated: true, configured: true };
			},
			{
				body: t.Object({ password: t.String({ minLength: 1 }) }),
				response: {
					200: SessionStateSchema,
					401: AdminErrorSchema,
					503: AdminErrorSchema,
				},
			},
		)
		.get(
			"/admin/session",
			({ cookie }) => ({
				authenticated:
					credentials !== null &&
					decodeSession(cookie[SESSION_COOKIE]?.value, credentials.cookieSecret) !== null,
				configured: credentials !== null,
			}),
			{ response: SessionStateSchema },
		)
		.delete(
			"/admin/session",
			({ cookie }) => {
				cookie[SESSION_COOKIE]?.remove();
				return { authenticated: false, configured: credentials !== null };
			},
			{ response: SessionStateSchema },
		);
}
