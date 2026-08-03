import { app } from "./app.ts";
import { config } from "./config.ts";
import { migrateDb } from "./db.ts";

// Before the port opens, not after: a schema one migration behind surfaces as a 500 in the
// middle of proofing a page, which is the worst possible place to discover it.
await migrateDb();

if (config.admin === null) {
	console.warn(
		"granthalaya api → admin studio is OFF (no ADMIN_PASSWORD_HASH). `bun run admin:password` mints one.",
	);
}

app.listen(
	{
		port: config.port,
		// Bun enables SO_REUSEPORT by default: without this, starting a second instance on
		// an occupied port succeeds silently and the two servers split incoming requests
		// round-robin — which shows up as requests intermittently hitting the wrong server.
		// Fail loudly instead.
		reusePort: false,
	},
	({ hostname, port }) => {
		console.log(`granthalaya api → http://${hostname}:${port}`);
	},
);
