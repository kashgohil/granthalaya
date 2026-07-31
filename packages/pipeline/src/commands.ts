/**
 * Command registry and argv parsing for the pipeline CLI.
 *
 * Parsing is kept pure (no `process`, no I/O) so it can be unit-tested directly;
 * `cli.ts` is the only file that touches the outside world.
 */

/** Every command the CLI understands, mapped to its one-line help text. */
export const COMMANDS = {
	help: "Show this help text",
	version: "Print pipeline and core versions",
} as const;

export type CommandName = keyof typeof COMMANDS;

export type Invocation =
	| { ok: true; command: CommandName; args: readonly string[] }
	| { ok: false; error: string };

function isCommandName(value: string): value is CommandName {
	return Object.hasOwn(COMMANDS, value);
}

/**
 * Resolve raw CLI arguments (everything after the script name) into a command.
 * No arguments, `-h` or `--help` all resolve to `help`.
 */
export function parseArgv(argv: readonly string[]): Invocation {
	const [first, ...rest] = argv;

	if (first === undefined || first === "-h" || first === "--help") {
		return { ok: true, command: "help", args: [] };
	}
	if (first === "-v" || first === "--version") {
		return { ok: true, command: "version", args: [] };
	}
	if (isCommandName(first)) {
		return { ok: true, command: first, args: rest };
	}
	return { ok: false, error: `Unknown command: ${first}` };
}

/** Render the help text listing every registered command. */
export function usage(): string {
	const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
	const lines = Object.entries(COMMANDS).map(
		([name, description]) => `  ${name.padEnd(width)}  ${description}`,
	);
	return ["Usage: granthalaya <command> [options]", "", "Commands:", ...lines].join("\n");
}
