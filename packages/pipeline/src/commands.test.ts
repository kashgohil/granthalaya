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
	expect(parseArgv(["publish"])).toEqual({ ok: false, error: "Unknown command: publish" });
});

test("triage is registered", () => {
	expect(parseArgv(["triage", "./books"])).toEqual({
		ok: true,
		command: "triage",
		args: ["./books"],
	});
});

test("render is registered", () => {
	expect(parseArgv(["render", "book.pdf", "--dpi", "300"])).toEqual({
		ok: true,
		command: "render",
		args: ["book.pdf", "--dpi", "300"],
	});
});

test("ocr is registered", () => {
	expect(parseArgv(["ocr", "content/pages/book", "--dry-run"])).toEqual({
		ok: true,
		command: "ocr",
		args: ["content/pages/book", "--dry-run"],
	});
});

test("usage lists every registered command", () => {
	const text = usage();
	for (const name of Object.keys(COMMANDS)) {
		expect(text).toContain(name);
	}
});
