import { expect, test } from "bun:test";
import { DANDA, DOUBLE_DANDA, isDanda, protectDanda } from "./punctuation.ts";

const NBSP = " ";

test("the danda constants are the code points, not lookalikes", () => {
	expect(DANDA.codePointAt(0)).toBe(0x0964);
	expect(DOUBLE_DANDA.codePointAt(0)).toBe(0x0965);
	expect(isDanda("।")).toBe(true);
	expect(isDanda("॥")).toBe(true);
	expect(isDanda("|")).toBe(false);
});

test("a danda cannot be orphaned onto a line of its own", () => {
	expect(protectDanda("ધિયો યો નઃ પ્રચોદયાત્ ॥")).toBe(`ધિયો યો નઃ પ્રચોદયાત્${NBSP}॥`);
});

test("the verse number stays inside its dandas", () => {
	expect(protectDanda("સ્વઃ ॥ ૧ ॥")).toBe(`સ્વઃ${NBSP}॥${NBSP}૧${NBSP}॥`);
	expect(protectDanda("धीमहि ॥ ३ ॥")).toBe(`धीमहि${NBSP}॥${NBSP}३${NBSP}॥`);
	expect(protectDanda("verse ॥ 12 ॥")).toBe(`verse${NBSP}॥${NBSP}12${NBSP}॥`);
});

test("every danda in a line is protected, not just the last", () => {
	expect(protectDanda("તત્સવિતુર્વરેણ્યમ્ । ભર્ગો દેવસ્ય ધીમહિ ॥ ૩ ॥")).toBe(
		`તત્સવિતુર્વરેણ્યમ્${NBSP}। ભર્ગો દેવસ્ય ધીમહિ${NBSP}॥${NBSP}૩${NBSP}॥`,
	);
});

test("spaces the reader can break on are left alone", () => {
	const text = "ગ્રંથાલય એ ડિજિટલ પુસ્તકાલય છે.";
	expect(protectDanda(text)).toBe(text);
});

test("protecting twice changes nothing", () => {
	const once = protectDanda("સ્વઃ ॥ ૧ ॥");
	expect(protectDanda(once)).toBe(once);
});

test("a danda with nothing before it is handled without inventing a space", () => {
	expect(protectDanda("॥ ૧ ॥")).toBe(`॥${NBSP}૧${NBSP}॥`);
	expect(protectDanda("॥")).toBe("॥");
	expect(protectDanda("")).toBe("");
});
