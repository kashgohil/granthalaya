import { expect, test } from "bun:test";
import { COMMANDS, parseArgv, usage } from "./index.ts";

test("no arguments resolves to help", () => {
	expect(parseArgv([])).toEqual({ ok: true, command: "help", args: [] });
});

test("help and version flags resolve to their commands", () => {
	for (const flag of ["-h", "--help"]) {
		expect(parseArgv([flag])).toEqual({ ok: true, command: "help", args: [] });
	}
	for (const flag of ["-v", "--version"]) {
		expect(parseArgv([flag])).toEqual({ ok: true, command: "version", args: [] });
	}
});

test("a registered command keeps its trailing arguments", () => {
	expect(parseArgv(["version", "--json"])).toEqual({
		ok: true,
		command: "version",
		args: ["--json"],
	});
});

test("an unregistered command is an error, not a crash", () => {
	expect(parseArgv(["triage"])).toEqual({ ok: false, error: "Unknown command: triage" });
});

test("usage lists every registered command", () => {
	const text = usage();
	for (const name of Object.keys(COMMANDS)) {
		expect(text).toContain(name);
	}
});
