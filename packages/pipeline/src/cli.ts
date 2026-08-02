#!/usr/bin/env bun
import { CORE_VERSION } from "@granthalaya/core";
import { parseArgv, usage } from "./commands.ts";
import { PIPELINE_VERSION } from "./meta.ts";
import { runOcr } from "./ocr.ts";
import { runRender } from "./render.ts";
import { runTriage } from "./triage.ts";
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
	case "ocr": {
		const live = process.stderr.isTTY === true;
		const report = await runOcr(invocation.args, {
			onProgress: (done, total) => {
				if (live) {
					process.stderr.write(`\r  ${done}/${total} pages\u001b[K`);
				}
			},
		});
		if (live) {
			process.stderr.write("\r\u001b[K");
		}
		console.log(report.text);
		if (!report.ok) {
			process.exit(1);
		}
		break;
	}
	case "render": {
		const report = await runRender(invocation.args);
		console.log(report.text);
		if (!report.ok) {
			process.exit(1);
		}
		break;
	}
	case "triage": {
		const report = await runTriage(invocation.args);
		console.log(report.text);
		if (!report.ok) {
			process.exit(1);
		}
		break;
	}
	case "validate": {
		const report = await runValidate(invocation.args);
		console.log(report.text);
		if (!report.ok) {
			process.exit(1);
		}
		break;
	}
}
