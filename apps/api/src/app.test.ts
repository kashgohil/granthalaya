import { expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { CORE_VERSION } from "@granthalaya/core";
import { app } from "./app.ts";
import { API_VERSION, SERVICE_NAME } from "./meta.ts";

test("GET /health reports the service, api and core versions", async () => {
	const response = await app.handle(new Request("http://localhost/health"));

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		status: "ok",
		service: SERVICE_NAME,
		version: API_VERSION,
		core: CORE_VERSION,
	});
});

test("the Eden treaty client reaches the same route with inferred types", async () => {
	const client = treaty(app);
	const { data, error } = await client.health.get();

	expect(error).toBeNull();
	// `data` is typed from the route's response schema, not `any` — if the schema and
	// the handler ever drift apart, this file stops compiling.
	expect(data?.status).toBe("ok");
	expect(data?.core).toBe(CORE_VERSION);
});

test("an unknown route 404s rather than throwing", async () => {
	const response = await app.handle(new Request("http://localhost/does-not-exist"));

	expect(response.status).toBe(404);
});
