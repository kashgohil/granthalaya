import { expect, test } from "bun:test";
import { checkOrthography, describeViolation, isNukta, isVowelSign } from "./orthography.ts";

/** Long enough to trip the statistical rule; short enough to read. */
function repeat(text: string, times: number): string {
	return Array(times).fill(text).join(" ");
}

test("counts matras as vowel signs and everything else as not", () => {
	expect(isVowelSign(0x0abe)).toBe(true); // ા
	expect(isVowelSign(0x0abf)).toBe(true); // િ
	expect(isVowelSign(0x0ac1)).toBe(true); // ુ
	// The marks that legitimately follow a vowel sign must not count, or `ું` — the commonest
	// spelling in the language — would read as a violation.
	expect(isVowelSign(0x0a82)).toBe(false); // ં anusvara
	expect(isVowelSign(0x0a81)).toBe(false); // ઁ candrabindu
	expect(isVowelSign(0x0a83)).toBe(false); // ઃ visarga
	expect(isVowelSign(0x0acd)).toBe(false); // ્ virama
	expect(isVowelSign(0x0abc)).toBe(false); // nukta
	expect(isNukta(0x0abc)).toBe(true);
});

test("passes correctly encoded Gujarati", () => {
	const report = checkOrthography(
		"ૐ ભૂર્ભુવઃ સ્વઃ । તત્સવિતુર્વરેણ્યં ભર્ગો દેવસ્ય ધીમહિ । ધિયો યો નઃ પ્રચોદયાત્ ॥ ૧ ॥",
		"gujr",
	);
	expect(report.ok).toBe(true);
	expect(report.count).toBe(0);
	expect(report.rate).toBe(0);
});

test("passes an anusvara after a vowel sign", () => {
	// `ું` is ુ + ં. If the rule folded anusvara in with the vowel signs, every other word in
	// Gujarati would be a violation.
	const report = checkOrthography("આખું ચાંચ સુંદર બંને હું છું", "gujr");
	expect(report.ok).toBe(true);
});

test("catches two vowel signs in a row", () => {
	// The corruption seen in the wild: ચાંચ (ચ ા ં ચ) extracted as ચ ા ુ ં ચ.
	const report = checkOrthography("ચાુંચ", "gujr");
	expect(report.ok).toBe(false);
	expect(report.violations[0]?.kind).toBe("adjacent-vowel-signs");
});

test("catches a virama followed by a vowel instead of a consonant", () => {
	// કહ્યું (ક હ ્ ય ુ ં) extracted as ક હ ્ ુ ુ ં — the ya was dropped.
	const report = checkOrthography("કહ્ુું", "gujr");
	expect(report.ok).toBe(false);
	expect(report.violations.map((violation) => violation.kind)).toContain(
		"virama-before-vowel-sign",
	);
});

test("catches a vowel sign with nothing to attach to", () => {
	expect(checkOrthography("ાબક", "gujr").violations[0]?.kind).toBe("vowel-sign-without-base");
	expect(checkOrthography("ક ાબ", "gujr").violations[0]?.kind).toBe("vowel-sign-without-base");
	// An independent vowel is not a base for a matra either.
	expect(checkOrthography("આા", "gujr").violations[0]?.kind).toBe("vowel-sign-without-base");
});

test("catches a virama with no consonant before it", () => {
	expect(checkOrthography("્ક", "gujr").violations[0]?.kind).toBe("virama-without-base");
});

test("allows a nukta between a consonant and its vowel sign", () => {
	// ડ + nukta + ા is well-formed; walking back one character would call it a violation.
	expect(checkOrthography("ડ઼ા", "gujr").ok).toBe(true);
});

test("calls a long Gujarati text with no pre-base matra impossible", () => {
	// The signature of the broken Shruti mapping: `િ` never appears at all, because the
	// producer never emitted it. Any real page of prose is full of them.
	const withoutI = repeat("કમળ ધરમ સકળ નયન વચન", 30);
	const report = checkOrthography(withoutI, "gujr");
	expect(report.ok).toBe(false);
	expect(report.violations[0]?.kind).toBe("no-pre-base-matra");
});

test("does not apply the statistical rule to a short sample", () => {
	// One line legitimately might not contain a `િ`; a page cannot.
	expect(checkOrthography("કમળ ધરમ સકળ", "gujr").ok).toBe(true);
});

test("clears a long text that does contain pre-base matras", () => {
	const withI = repeat("નિરાંતે બિચારી કિરણ સ્થિતિ વિચાર", 30);
	expect(checkOrthography(withI, "gujr").ok).toBe(true);
});

test("applies the same rules to Devanagari", () => {
	expect(checkOrthography("श्रीमद्भगवद्गीता अध्याय", "deva").ok).toBe(true);
	expect(checkOrthography("चाुं", "deva").ok).toBe(false);
	expect(checkOrthography(repeat("कमल धरम सकल नयन वचन", 30), "deva").violations[0]?.kind).toBe(
		"no-pre-base-matra",
	);
});

test("has no rules to apply to Latin", () => {
	const report = checkOrthography("The quick brown fox", "latn");
	expect(report.ok).toBe(true);
	expect(report.examined).toBe(0);
});

test("caps the examples it reports but not the count", () => {
	const report = checkOrthography(repeat("ચાુંચ", 50), "gujr");
	expect(report.count).toBeGreaterThan(20);
	expect(report.violations.length).toBeLessThanOrEqual(13);
});

test("reports a rate of zero for clean text and a high one for corrupt text", () => {
	expect(checkOrthography("નિરાંતે બિચારી", "gujr").rate).toBe(0);
	expect(checkOrthography(repeat("ચાુંચ", 50), "gujr").rate).toBeGreaterThan(50);
});

test("describes every kind of violation in words", () => {
	const kinds = [
		checkOrthography("ચાુંચ", "gujr"),
		checkOrthography("કહ્ુું", "gujr"),
		checkOrthography("ાબક", "gujr"),
		checkOrthography("્ક", "gujr"),
		checkOrthography(repeat("કમળ ધરમ સકળ નયન", 30), "gujr"),
	].flatMap((report) => report.violations);

	expect(kinds.length).toBeGreaterThan(0);
	for (const violation of kinds) {
		expect(describeViolation(violation).length).toBeGreaterThan(10);
	}
});
