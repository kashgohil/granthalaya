/**
 * `@granthalaya/pipeline` — internal content tooling, surfaced only through this CLI
 * and the admin studio. End users never see any of it.
 *
 * Unlike `@granthalaya/core` this package is free to use whatever is optimal per step:
 * Bun APIs, shelling out, external OCR services.
 *
 * Commands land here as the roadmap progresses: PDF triage (P1.1), page rendering and
 * OCR (P1.2), book packaging and validation (P0.2 / P1.3).
 */

export type { CommandName, Invocation } from "./commands.ts";
export { COMMANDS, parseArgv, usage } from "./commands.ts";
export { PIPELINE_VERSION } from "./meta.ts";
export type { ValidationReport } from "./validate.ts";
export {
	formatValidationReport,
	PACKAGE_FILENAME,
	resolvePackagePath,
	runValidate,
	validatePackageAt,
} from "./validate.ts";
