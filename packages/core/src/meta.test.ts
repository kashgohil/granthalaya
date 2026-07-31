import { expect, test } from "bun:test";
import { CORE_VERSION } from "./index.ts";

test("CORE_VERSION is a semver string", () => {
	expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});
