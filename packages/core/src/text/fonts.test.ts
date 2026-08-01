import { expect, test } from "bun:test";
import { FONT_FACES, fontFaceId, fontFamily, fontFamilyStack } from "./fonts.ts";

test("face ids are unique — they are registration keys and file stems", () => {
	const ids = FONT_FACES.map((face) => face.id);
	expect(new Set(ids).size).toBe(ids.length);
});

test("face ids carry no spaces, which neither a font registry nor a filename tolerates", () => {
	for (const face of FONT_FACES) {
		expect(face.id).toMatch(/^[A-Za-z]+_[1-9]00[A-Za-z]+$/);
	}
});

test("every declared weight has a face, and every face a declared weight", () => {
	for (const role of ["body", "bodyAlternate", "ui"] as const) {
		const spec = fontFamily(role);
		const faces = FONT_FACES.filter((face) => face.role === role);
		expect(faces.map((face) => face.weight)).toEqual([...spec.weights]);
		expect(faces.every((face) => face.family === spec.family)).toBe(true);
	}
});

test("the regular weight is always available, so a lookup can fall back to it", () => {
	expect(fontFaceId("body")).toBe("Rasa_400Regular");
	expect(fontFaceId("body", 700)).toBe("Rasa_700Bold");
	expect(fontFaceId("ui", 600)).toBe("NotoSansGujarati_600SemiBold");
	// 600 is not cut for Rasa; asking for it gets the regular rather than a missing family.
	expect(fontFaceId("body", 600)).toBe("Rasa_400Regular");
});

test("every stack names its own family first and ends in a generic", () => {
	for (const role of ["body", "bodyAlternate", "ui"] as const) {
		const stack = fontFamilyStack(role);
		expect(stack[0]).toBe(fontFamily(role).family);
		expect(["serif", "sans-serif"]).toContain(stack[stack.length - 1] ?? "");
	}
});

test("every bundled face is under a licence that permits embedding", () => {
	for (const role of ["body", "bodyAlternate", "ui"] as const) {
		expect(fontFamily(role).license).toBe("OFL-1.1");
	}
});
