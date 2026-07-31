import { treaty } from "@elysiajs/eden";
import type { App } from "@granthalaya/api";

/**
 * Typed client for `apps/api`. The `App` type comes straight from the Elysia instance,
 * so a route rename or a changed response shape surfaces here as a type error.
 *
 * Set `VITE_API_URL` to point at a deployed API; the default is the local dev server.
 */
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const api = treaty<App>(API_URL);
