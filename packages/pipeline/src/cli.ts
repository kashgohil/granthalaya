#!/usr/bin/env bun
import { CORE_VERSION } from "@granthalaya/core";
import { parseArgv, usage } from "./commands.ts";
import { PIPELINE_VERSION } from "./meta.ts";
import { runValidate } from "./validate.ts";

const invocation = parseArgv(Bun.argv.slice(2));

if (!invocation.ok) {
	console.error(`${invocation.error}\n\n${usage()}`);
	process.exit(1);
}

switch (invocation.command) {
	case "help":
		console.log(usage());
		break;
	case "version":
		console.log(`pipeline ${PIPELINE_VERSION}\ncore     ${CORE_VERSION}`);
		break;
	case "validate": {
		const report = await runValidate(invocation.args);
		console.log(report.text);
		if (!report.ok) {
			process.exit(1);
		}
		break;
	}
}
