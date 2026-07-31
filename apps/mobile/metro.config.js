// Metro needs to be told about the monorepo: workspace packages and hoisted
// dependencies live outside this project directory, so they must be watched and
// added to the module resolution paths.
// https://docs.expo.dev/guides/monorepos/
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(workspaceRoot, "node_modules"),
];

// Note: hierarchical lookup must stay ENABLED. Bun installs this workspace with the
// isolated linker (pnpm-style: real packages in `node_modules/.bun/<pkg>@<ver>/`,
// symlinks everywhere else), so a package's peer dependencies sit next to it inside the
// store and are only reachable by walking up from the resolved file. Setting
// `disableHierarchicalLookup` — the usual advice for hoisted monorepos — breaks
// resolution of things like `@expo/metro-runtime` from `expo-router`.

module.exports = config;
