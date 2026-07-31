/**
 * Runtime configuration. Bun auto-loads `.env`, so no dotenv here.
 *
 * Defaults are development defaults: the API sits on :3001 so it does not collide
 * with the web dev server (:3000); allowed origins cover the Vite dev server and
 * Expo's dev server / web preview.
 */

const DEFAULT_PORT = 3001;
const DEFAULT_ORIGINS = ["http://localhost:3000", "http://localhost:8081"];

function parseOrigins(raw: string | undefined): string[] {
	if (!raw) return DEFAULT_ORIGINS;
	return raw
		.split(",")
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0);
}

function parsePort(raw: string | undefined): number {
	if (!raw) return DEFAULT_PORT;
	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`API_PORT must be an integer between 1 and 65535, got: ${raw}`);
	}
	return port;
}

export const config = {
	port: parsePort(process.env.API_PORT),
	corsOrigins: parseOrigins(process.env.API_CORS_ORIGINS),
} as const;
