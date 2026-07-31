import { CORE_VERSION } from "@granthalaya/core";
import { Elysia, t } from "elysia";
import { API_VERSION, SERVICE_NAME } from "../../meta.ts";

/**
 * Liveness probe. Reports the API and `@granthalaya/core` versions so a client built
 * against a different domain layer than the server runs is detectable at a glance.
 */
export const health = new Elysia({ name: "health" }).get(
	"/health",
	() => ({
		status: "ok" as const,
		service: SERVICE_NAME,
		version: API_VERSION,
		core: CORE_VERSION,
	}),
	{
		response: t.Object({
			status: t.Literal("ok"),
			service: t.String(),
			version: t.String(),
			core: t.String(),
		}),
	},
);
