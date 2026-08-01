/**
 * Font sync — downloads the P0.3 font stack into the two apps.
 *
 * Run it with `bun run fonts:sync` when the stack in `packages/core/src/text/fonts.ts`
 * changes. The output is committed: a build must never depend on Google's CDN, and a font
 * that silently changed version between two builds would reflow every book.
 *
 * The two apps need different artefacts, so this fetches twice:
 *
 * - **mobile** takes full TrueType files, one per weight. React Native cannot instance a
 *   variable font or synthesise a weight, so each weight ships as its own face. Requesting
 *   the CSS with an ancient user agent is what makes Google serve static TTF instances of
 *   what is now a variable font — there is no other public source for them.
 * - **web** takes the WOFF2 files Google has already subset by writing system, together
 *   with their `unicode-range`s, and a generated stylesheet pointing at local copies. A
 *   visitor reading English on the promo site never downloads the Gujarati subset.
 *
 * Imported by relative path rather than by package name: the repo root is not a workspace,
 * so `@granthalaya/core` is not linked into its `node_modules`.
 */
import { FONT_FACES } from "../packages/core/src/text/fonts.ts";

const CSS_API = "https://fonts.googleapis.com/css2";

/** Chrome. Gets WOFF2, split per writing system, each with its `unicode-range`. */
const MODERN_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
/** Old enough to predate WOFF2, which is what makes the API fall back to whole TTF files. */
const LEGACY_AGENT = "Mozilla/4.0";

/** The writing systems the apps actually render. Google also offers Cyrillic and Vietnamese. */
const WEB_SUBSETS = new Set(["gujarati", "latin", "latin-ext"]);

const MOBILE_FONT_DIR = "apps/mobile/assets/fonts";
const WEB_FONT_DIR = "apps/web/public/fonts";
const WEB_STYLESHEET = "apps/web/src/styles/fonts.css";

type FontFaceRule = {
	readonly subset: string;
	readonly family: string;
	readonly weight: number;
	readonly url: string;
	readonly unicodeRange?: string;
};

/** `family=Rasa:wght@400;500;700`, one entry per family, weights ascending. */
function familyQuery(): string {
	const byFamily = new Map<string, number[]>();
	for (const face of FONT_FACES) {
		byFamily.set(face.family, [...(byFamily.get(face.family) ?? []), face.weight]);
	}
	return [...byFamily]
		.map(([family, weights]) => {
			const sorted = [...new Set(weights)].sort((a, b) => a - b);
			return `family=${family.replaceAll(" ", "+")}:wght@${sorted.join(";")}`;
		})
		.join("&");
}

async function fetchStylesheet(agent: string): Promise<string> {
	const url = `${CSS_API}?${familyQuery()}&display=swap`;
	const response = await fetch(url, { headers: { "User-Agent": agent } });
	if (!response.ok) {
		throw new Error(`${url} responded ${response.status}`);
	}
	return response.text();
}

/**
 * Pull the `@font-face` rules out of a Google stylesheet. The subset name only exists as a
 * comment above each rule, which is why this parses the text rather than a CSS AST.
 */
function parseFontFaces(css: string): FontFaceRule[] {
	const rules: FontFaceRule[] = [];
	const blocks = css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g);
	for (const block of blocks) {
		const body = block[2] ?? "";
		const family = /font-family:\s*'([^']+)'/.exec(body)?.[1];
		const weight = /font-weight:\s*(\d+)/.exec(body)?.[1];
		const url = /src:\s*url\(([^)]+)\)/.exec(body)?.[1];
		if (family === undefined || weight === undefined || url === undefined) {
			throw new Error(`unrecognised @font-face rule:\n${body}`);
		}
		rules.push({
			subset: block[1] ?? "all",
			family,
			weight: Number(weight),
			url,
			unicodeRange: /unicode-range:\s*([^;]+)/.exec(body)?.[1]?.trim(),
		});
	}
	if (rules.length === 0) {
		throw new Error("no @font-face rules found — the CSS API's response format has changed");
	}
	return rules;
}

async function download(url: string, path: string): Promise<number> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${url} responded ${response.status}`);
	}
	const bytes = await response.bytes();
	await Bun.write(path, bytes);
	return bytes.byteLength;
}

/** Face ids are the filenames on mobile, so a typo in either place fails the same way. */
function mobileFileName(family: string, weight: number): string {
	const face = FONT_FACES.find((entry) => entry.family === family && entry.weight === weight);
	if (face === undefined) {
		throw new Error(`the CSS API returned ${family} ${weight}, which the stack does not declare`);
	}
	return `${face.id}.ttf`;
}

async function syncMobile(): Promise<void> {
	const rules = parseFontFaces(await fetchStylesheet(LEGACY_AGENT));
	let total = 0;
	for (const rule of rules) {
		const name = mobileFileName(rule.family, rule.weight);
		total += await download(rule.url, `${MOBILE_FONT_DIR}/${name}`);
		console.log(`  ${name}`);
	}
	console.log(`${rules.length} faces, ${Math.round(total / 1024)} KB → ${MOBILE_FONT_DIR}`);
}

async function syncWeb(): Promise<void> {
	const rules = parseFontFaces(await fetchStylesheet(MODERN_AGENT)).filter((rule) =>
		WEB_SUBSETS.has(rule.subset),
	);

	// Google serves one variable file per subset and declares it for each weight, so the same
	// URL comes back several times. Download once, then point every rule at that copy.
	const localNames = new Map<string, string>();
	let total = 0;
	for (const rule of rules) {
		if (localNames.has(rule.url)) {
			continue;
		}
		const name = `${rule.family.replaceAll(" ", "")}-${rule.subset}-${rule.weight}.woff2`;
		localNames.set(rule.url, name);
		total += await download(rule.url, `${WEB_FONT_DIR}/${name}`);
		console.log(`  ${name}`);
	}

	const declarations = rules.map((rule) =>
		[
			"@font-face {",
			`  font-family: '${rule.family}';`,
			"  font-style: normal;",
			`  font-weight: ${rule.weight};`,
			"  font-display: swap;",
			`  src: url('/fonts/${localNames.get(rule.url)}') format('woff2');`,
			...(rule.unicodeRange === undefined ? [] : [`  unicode-range: ${rule.unicodeRange};`]),
			"}",
		].join("\n"),
	);

	const header = [
		"/*",
		" * Generated by `bun run fonts:sync` — edit scripts/fetch-fonts.ts, not this file.",
		" *",
		" * Self-hosted so the studio and the promo site do not depend on Google's CDN, and so",
		" * no visitor's IP reaches a third party just by reading a page. Each rule carries the",
		" * unicode-range Google subset it by: an English-only page never fetches Gujarati.",
		" *",
		" * Rasa, Noto Serif Gujarati and Noto Sans Gujarati are SIL OFL 1.1 — see LICENSES.md",
		" * in this directory's font folder.",
		" */",
		"",
	].join("\n");

	await Bun.write(WEB_STYLESHEET, `${header}${declarations.join("\n\n")}\n`);
	console.log(
		`${localNames.size} files, ${Math.round(total / 1024)} KB → ${WEB_FONT_DIR}\n` +
			`${rules.length} @font-face rules → ${WEB_STYLESHEET}`,
	);
}

const LICENSE_NOTE = `# Font licences

Every face bundled here is licensed under the **SIL Open Font License 1.1**, which permits
embedding in an application and redistribution. Full text: https://openfontlicense.org

| Family | Designer / source | Used for |
|---|---|---|
| Rasa | Rosetta Type Foundry — https://fonts.google.com/specimen/Rasa | Body text (reading) |
| Noto Serif Gujarati | Google — https://fonts.google.com/noto/specimen/Noto+Serif+Gujarati | Alternate reading face, web fallback |
| Noto Sans Gujarati | Google — https://fonts.google.com/noto/specimen/Noto+Sans+Gujarati | UI and chrome |

Downloaded by \`bun run fonts:sync\` (see \`scripts/fetch-fonts.ts\`); the stack itself is
declared in \`packages/core/src/text/fonts.ts\`. Do not edit these files by hand.
`;

console.log("mobile (TrueType, one file per weight):");
await syncMobile();
console.log("\nweb (WOFF2, subset per writing system):");
await syncWeb();
await Bun.write(`${MOBILE_FONT_DIR}/LICENSES.md`, LICENSE_NOTE);
await Bun.write(`${WEB_FONT_DIR}/LICENSES.md`, LICENSE_NOTE);
console.log("\nwrote LICENSES.md alongside both sets");
