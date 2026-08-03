#!/usr/bin/env bun
/**
 * Mint the studio's two secrets. `bun run admin:password`.
 *
 * The password itself is never written anywhere — only its argon2id hash, which is what
 * `apps/api` compares against. There is no "reset" flow because there is no user table: running
 * this again and pasting the new lines *is* the reset.
 *
 * Reads the password from stdin rather than from an argument, so it does not end up in shell
 * history. Piping works too: `echo hunter2 | bun run admin:password`.
 */

function randomSecret(bytes = 32): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}

async function readPassword(): Promise<string> {
	if (Bun.stdin.stream().locked) {
		throw new Error("stdin is already in use");
	}
	if (process.stdin.isTTY) {
		process.stdout.write("Admin password (typed visibly): ");
	}
	for await (const line of console) {
		const password = line.trim();
		if (password.length > 0) return password;
	}
	throw new Error("no password given");
}

const password = await readPassword();
if (password.length < 12) {
	console.error(
		`\nRefusing: ${password.length} characters. This is the only lock on the surface that publishes scripture — use at least 12.`,
	);
	process.exit(1);
}

const hash = await Bun.password.hash(password, { algorithm: "argon2id" });

/**
 * Bun's `.env` parser expands `$NAME` — **inside single quotes too**, unlike a shell. An argon2
 * hash is `$argon2id$v=19$m=65536,...`, so pasted verbatim it arrives as `=19=65536,...` and the
 * only symptom is that the right password stops working. Double quotes with escaped `$` are the
 * one form that survives; `config.ts` rejects the mangled shape at startup as a backstop.
 */
const forEnvFile = hash.replaceAll("$", "\\$");

console.log(`
Paste these into apps/api/.env — the hash replaces any previous one, and changing
COOKIE_SECRET signs out every existing session.

The backslashes are load-bearing: Bun expands $NAME in .env even inside quotes.

ADMIN_PASSWORD_HASH="${forEnvFile}"
COOKIE_SECRET="${randomSecret()}"
`);
