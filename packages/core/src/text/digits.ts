/**
 * Numerals, in the scripts this project reads them in.
 *
 * Gujarati books number themselves in Gujarati digits, and the numbers carry structure rather
 * than decoration: `॥૬૨॥` is the identity of a passage, and the running head's `૫૮` is the
 * page a reader would cite. Both have to be *parsed* — as integers, so a sequence can be
 * checked for gaps — while the printed form has to survive into the package, because that is
 * what the edition actually says.
 *
 * This lives in `packages/core` for the same reason `script.ts` does: the studio asks the same
 * question when a human types a verse number into the proofing view, and the reader asks the
 * reverse one when it renders a verse number back in the book's own digits. It is pure logic
 * over the format's `Script` union with no I/O in sight.
 */
import type { Script } from "../book/schema.ts";

/** Code point of digit zero in each script's own numerals. */
const DIGIT_ZERO: Readonly<Record<Script, number>> = {
	gujr: 0x0ae6, // ૦
	deva: 0x0966, // ०
	latn: 0x0030, // 0
};

/**
 * Every digit system, for regexes that have to find a number without knowing its script.
 * A character class body, not a full pattern, so callers can compose it.
 */
export const DIGIT_CLASS = "0-9०-९૦-૯";

/**
 * The numeric value of a digit in any of the three systems, or `null` if it isn't a digit.
 *
 * Deliberately not `Number(character)`: that reads Gujarati digits as `NaN` while happily
 * accepting whitespace as zero, which is exactly the wrong pair of behaviours here.
 */
export function digitValue(codePoint: number): number | null {
	for (const zero of Object.values(DIGIT_ZERO)) {
		if (codePoint >= zero && codePoint <= zero + 9) {
			return codePoint - zero;
		}
	}
	return null;
}

export function isDigit(codePoint: number): boolean {
	return digitValue(codePoint) !== null;
}

/** Which script's numerals `codePoint` belongs to, or `null` if it isn't a digit. */
export function digitScript(codePoint: number): Script | null {
	for (const [script, zero] of Object.entries(DIGIT_ZERO)) {
		if (codePoint >= zero && codePoint <= zero + 9) {
			return script as Script;
		}
	}
	return null;
}

export type ParsedNumber = {
	readonly value: number;
	/** The numerals it was written in. */
	readonly script: Script;
	/** Exactly as printed, e.g. `૬૨` — what goes into the package's `number` field. */
	readonly text: string;
};

/**
 * Read a run of digits as an integer.
 *
 * Surrounding whitespace is ignored; anything else is a refusal rather than a partial read,
 * because a "number" with a letter in it is an OCR fault worth seeing, not worth guessing at.
 * Mixed systems (`૬2`) are refused for the same reason — no edition prints those, so it means
 * the OCR read one digit in the wrong script.
 */
export function parseIndicNumber(text: string): ParsedNumber | null {
	const trimmed = text.trim();
	if (trimmed === "") {
		return null;
	}

	let value = 0;
	let script: Script | null = null;
	for (const character of trimmed) {
		const point = character.codePointAt(0) as number;
		const digit = digitValue(point);
		if (digit === null) {
			return null;
		}
		const own = digitScript(point) as Script;
		if (script !== null && own !== script) {
			return null;
		}
		script = own;
		value = value * 10 + digit;
		// A number long enough to overflow is a misread run of digits, not a verse number.
		if (!Number.isSafeInteger(value)) {
			return null;
		}
	}

	return script === null ? null : { value, script, text: trimmed };
}

/** Write an integer in `script`'s own numerals. The inverse of `parseIndicNumber`. */
export function formatIndicNumber(value: number, script: Script): string {
	if (!Number.isInteger(value) || value < 0) {
		throw new RangeError(`cannot write ${value} as a numeral`);
	}
	const zero = DIGIT_ZERO[script];
	return [...String(value)].map((digit) => String.fromCodePoint(zero + Number(digit))).join("");
}

/**
 * Rewrite every digit in `text` into `script`'s numerals, leaving everything else alone.
 *
 * Used where a number has to be comparable rather than displayed — searching for a verse a
 * reader typed in Latin digits against a book that prints Gujarati ones.
 */
export function convertDigits(text: string, script: Script): string {
	const zero = DIGIT_ZERO[script];
	let out = "";
	for (const character of text) {
		const digit = digitValue(character.codePointAt(0) as number);
		out += digit === null ? character : String.fromCodePoint(zero + digit);
	}
	return out;
}
