import { treaty } from "@elysiajs/eden";
import type { App } from "@granthalaya/api";

/**
 * Typed client for `apps/api`. The `App` type comes straight from the Elysia instance,
 * so a route rename or a changed response shape surfaces here as a type error.
 *
 * Reading and study must work fully offline — this client is for sync and book
 * distribution only, never for the reading path.
 *
 * Set `EXPO_PUBLIC_API_URL` to point at a deployed API; the default is the local dev
 * server, which only resolves from a simulator. On a physical device, set it to your
 * machine's LAN address.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export const api = treaty<App>(API_URL);
