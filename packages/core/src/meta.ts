/**
 * Version of the shared domain layer.
 *
 * Surfaced by the API health route and reported by the pipeline CLI so that a client
 * built against a different core than the one the server runs is detectable at a glance.
 * Bump this when the domain contracts (book format, verse addressing) change shape.
 */
export const CORE_VERSION = "0.0.0";
