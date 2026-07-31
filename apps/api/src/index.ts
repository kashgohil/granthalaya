import { app } from "./app.ts";
import { config } from "./config.ts";

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
