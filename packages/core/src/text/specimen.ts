/**
 * Rendering fixtures — the text every surface must draw correctly.
 *
 * "Renders correctly" is not something a unit test can assert: it means no mark collides
 * with another, no conjunct falls apart, and no line breaks where it shouldn't. That
 * judgement needs eyes on a real screen, so what code can do is guarantee that all three
 * surfaces judge the *same* text. Mobile (P0.3), the studio preview and the promo site all
 * render this list, which makes a regression on one platform visible as a difference from
 * the others.
 *
 * Exported through `@granthalaya/core/fixtures`, so it never reaches a consumer bundle.
 *
 * These are typographic specimens, not canon. The scriptural lines are copied verbatim from
 * the `gayatri-mantra` fixture, whose Gujarati was reviewed on 2026-07-31; everything else —
 * the letter tables, the prose paragraph — is ordinary Gujarati written to exercise shaping,
 * and is chosen for the shapes it contains rather than for what it says.
 */
import type { Script } from "../book/schema.ts";

export type TypeSpecimen = {
	readonly id: string;
	readonly title: string;
	readonly script: Script;
	/** What a correct rendering looks like — and, specifically, what failure looks like. */
	readonly check: string;
	readonly samples: readonly string[];
};

export const TYPE_SPECIMENS: readonly TypeSpecimen[] = [
	{
		id: "conjuncts",
		title: "Conjuncts",
		script: "gujr",
		check:
			"Each of these is one shape, not a consonant followed by a visible halant. If a `્` " +
			"is showing between two letters, the font is not shaping — the platform has fallen " +
			"back to a face without Gujarati conjunct coverage.",
		samples: [
			"ક્ષ જ્ઞ ત્ર દ્ધ દ્વ શ્ર ન્ન ટ્ટ દ્ય હ્ય",
			"ક્ર ગ્ર પ્ર બ્ર શ્ર સ્ર",
			"ર્ક ર્મ ર્ય ર્વ ર્થ",
			"સ્ત્રી ચંદ્ર રાષ્ટ્ર પશ્ચિમ",
			"શ્રી કૃષ્ણ વિદ્યા સ્વામિનારાયણ",
		],
	},
	{
		id: "matras",
		title: "Matras, above and below",
		script: "gujr",
		check:
			"Every vowel sign sits centred on its consonant. The pre-base `િ` is drawn to the " +
			"left of the letter it follows in memory; if it appears after, the shaper is not " +
			"reordering.",
		samples: ["ક કા કિ કી કુ કૂ કૃ કે કૈ કો કૌ", "કં કઁ કઃ કૅ કૉ", "રૂ હૃ ટૂ ડૂ છૂ", "કૈંક શ્રીફળ દૃષ્ટિ બૅન્ક કૉલેજ"],
	},
	{
		id: "stacks",
		title: "Line-height stress",
		script: "gujr",
		check:
			"Two lines chosen so the first hangs below the baseline and the second reaches above " +
			"it. At Latin leading these two rows touch; at 1.7–2.0 they clear with daylight " +
			"between them.",
		samples: ["કૃષ્ણ હૃદય મુદ્રા દૃષ્ટિ\nશ્રી ઊંચે કૈંક ઔષધિ ઈંટ"],
	},
	{
		id: "danda",
		title: "Danda and verse numbering",
		script: "gujr",
		check:
			"The danda never begins a line, and `॥ ૧ ॥` never splits across two. Narrow the " +
			"column until the text wraps — the whole group must move to the next line together.",
		samples: [
			"ૐ ભૂર્ભુવઃ સ્વઃ ॥ ૧ ॥",
			"તત્સવિતુર્વરેણ્યમ્ । ભર્ગો દેવસ્ય ધીમહિ ॥ ૩ ॥",
			"ધિયો યો નઃ પ્રચોદયાત્ ॥ ૪ ॥",
		],
	},
	{
		id: "prose",
		title: "Continuous prose",
		script: "gujr",
		check:
			"A paragraph long enough to wrap several times: the colour of the block should be " +
			"even, with no rivers and no line noticeably tighter than its neighbours.",
		samples: [
			"ગ્રંથાલય એ ગુજરાતી ધર્મગ્રંથો માટેનું ડિજિટલ પુસ્તકાલય છે. અહીં વાંચન, પાઠ અને કંઠસ્થ કરવાની સુવિધા છે. દરેક ગ્રંથ તેની મૂળ આવૃત્તિનો ઉલ્લેખ કરે છે, અને દરેક પંક્તિ માણસે તપાસી હોય પછી જ પ્રકાશિત થાય છે.",
		],
	},
	{
		id: "numerals",
		title: "Numerals",
		script: "gujr",
		check: "Gujarati digits share the Latin digits' width and sit on the same baseline.",
		samples: ["૦ ૧ ૨ ૩ ૪ ૫ ૬ ૭ ૮ ૯", "૨૦૨૬ · 2026"],
	},
	{
		id: "mixed",
		title: "Mixed Gujarati and Latin",
		script: "gujr",
		check:
			"Latin words inside a Gujarati line keep the Gujarati leading and neither script " +
			"shifts off the baseline. The transliteration's combining marks (`r̥`, `ṇ`, `ḥ`) must " +
			"sit under their letters, not after them.",
		samples: [
			"Granthalaya · ગ્રંથાલય · ISO 15919",
			"dhiyo yo naḥ pracodayāt — ધિયો યો નઃ પ્રચોદયાત્",
			"r̥ta · vr̥ndāvana · saṁskr̥ta",
		],
	},
	{
		id: "devanagari",
		title: "Devanagari",
		script: "deva",
		check:
			"The format admits Sanskrit set in Devanagari, so the same rules are checked there: " +
			"the headline (shirorekha) must run unbroken across each word.",
		samples: ["ॐ भूर्भुवः स्वः ।", "तत्सवितुर्वरेण्यम् ॥ ३ ॥"],
	},
];

/** Look one up by id, for a screen that deep-links to a single specimen. */
export function findSpecimen(id: string): TypeSpecimen | undefined {
	return TYPE_SPECIMENS.find((specimen) => specimen.id === id);
}
