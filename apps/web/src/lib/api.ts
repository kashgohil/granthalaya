import { treaty } from "@elysiajs/eden";
import type { App } from "@granthalaya/api";

/**
 * Typed client for `apps/api`. The `App` type comes straight from the Elysia instance,
 * so a route rename or a changed response shape surfaces here as a type error.
 *
 * Set `VITE_API_URL` to point at a deployed API; the default is the local dev server.
 */
export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * `credentials: "include"` is what carries the admin studio's session cookie. The studio and the
 * API are different *origins* (:3000 and :3001) even in development, and a cross-origin request
 * sends no cookie unless both sides opt in — this, and `credentials: true` on the API's CORS.
 *
 * Page images need the same opt-in and cannot get it from here, because a browser fetches an
 * `<img src>` itself: those carry `crossOrigin="use-credentials"` instead.
 */
export const api = treaty<App>(API_URL, { fetch: { credentials: "include" } });
