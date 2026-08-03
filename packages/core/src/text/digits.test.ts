import { expect, test } from "bun:test";
import {
	convertDigits,
	digitScript,
	digitValue,
	formatIndicNumber,
	isDigit,
	parseIndicNumber,
} from "./digits.ts";

const at = (character: string): number => character.codePointAt(0) as number;

test("digitValue reads all three systems", () => {
	expect(digitValue(at("7"))).toBe(7);
	expect(digitValue(at("૭"))).toBe(7);
	expect(digitValue(at("७"))).toBe(7);
	expect(digitValue(at("૦"))).toBe(0);
	expect(digitValue(at("૯"))).toBe(9);
});

test("digitValue refuses what is not a digit", () => {
	// A space is the trap: `Number(" ")` is 0, which would silently invent a verse zero.
	expect(digitValue(at(" "))).toBeNull();
	expect(digitValue(at("ક"))).toBeNull();
	expect(digitValue(at("॥"))).toBeNull();
	expect(isDigit(at("ક"))).toBe(false);
	expect(isDigit(at("૪"))).toBe(true);
});

test("digitScript names the numerals", () => {
	expect(digitScript(at("૫"))).toBe("gujr");
	expect(digitScript(at("५"))).toBe("deva");
	expect(digitScript(at("5"))).toBe("latn");
	expect(digitScript(at("ક"))).toBeNull();
});

test("parseIndicNumber reads a printed verse number", () => {
	expect(parseIndicNumber("૬૨")).toEqual({ value: 62, script: "gujr", text: "૬૨" });
	expect(parseIndicNumber(" ૧૪૨ ")).toEqual({ value: 142, script: "gujr", text: "૧૪૨" });
	expect(parseIndicNumber("21")).toEqual({ value: 21, script: "latn", text: "21" });
	expect(parseIndicNumber("०७")).toEqual({ value: 7, script: "deva", text: "०७" });
});

test("parseIndicNumber refuses rather than half-reads", () => {
	expect(parseIndicNumber("")).toBeNull();
	expect(parseIndicNumber("   ")).toBeNull();
	// A letter among the digits is an OCR fault worth seeing, not worth guessing at.
	expect(parseIndicNumber("૬ર")).toBeNull();
	expect(parseIndicNumber("૬૨॥")).toBeNull();
	// Mixed systems mean one digit was read in the wrong script.
	expect(parseIndicNumber("૬2")).toBeNull();
});

test("parseIndicNumber refuses a run too long to be a number", () => {
	expect(parseIndicNumber("૧".repeat(40))).toBeNull();
});

test("formatIndicNumber is the inverse of parseIndicNumber", () => {
	for (const value of [0, 1, 9, 10, 61, 142, 2026]) {
		for (const script of ["gujr", "deva", "latn"] as const) {
			const written = formatIndicNumber(value, script);
			expect(parseIndicNumber(written)).toEqual({ value, script, text: written });
		}
	}
	expect(formatIndicNumber(62, "gujr")).toBe("૬૨");
});

test("formatIndicNumber refuses what is not a whole count", () => {
	expect(() => formatIndicNumber(-1, "gujr")).toThrow(RangeError);
	expect(() => formatIndicNumber(1.5, "gujr")).toThrow(RangeError);
});

test("convertDigits rewrites only the digits", () => {
	expect(convertDigits("॥૬૨॥", "latn")).toBe("॥62॥");
	expect(convertDigits("પાનું 58", "gujr")).toBe("પાનું ૫૮");
	// Letters, dandas and spacing are left exactly as they were.
	expect(convertDigits("ગોપાળાનંદ", "latn")).toBe("ગોપાળાનંદ");
});
