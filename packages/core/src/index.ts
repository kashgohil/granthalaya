/**
 * `@granthalaya/core` — the shared domain layer.
 *
 * Platform-pure by contract: no React, no Bun/Node APIs, no I/O. Types, schemas and
 * pure logic only, so the same code runs in the Expo app, the Elysia API, the admin
 * studio and the pipeline CLI.
 *
 * Modules land here as the roadmap progresses: book format & verse addressing (P0.2),
 * Gujarati text rules (P0.3), the SRS scheduler (P5.1), the quiz engine (P6.1).
 */
export { CORE_VERSION } from "./meta.ts";
