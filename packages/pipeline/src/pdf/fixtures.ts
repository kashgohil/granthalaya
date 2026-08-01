/**
 * Page text for the triage tests, long enough to be evidence.
 *
 * Real book pages carry hundreds of characters; a two-word sample would sit under the
 * "this page says nothing" threshold and prove only that the threshold exists. Test-only.
 */

/** Gujarati verse, as a correctly encoded PDF would yield it. */
export const GUJARATI_PAGES: readonly string[] = [
	"ૐ ભૂર્ભુવઃ સ્વઃ । તત્સવિતુર્વરેણ્યં ભર્ગો દેવસ્ય ધીમહિ । ધિયો યો નઃ પ્રચોદયાત્ ॥ ૧ ॥ " +
		"સર્વે ભવન્તુ સુખિનઃ સર્વે સન્તુ નિરામયાઃ । સર્વે ભદ્રાણિ પશ્યન્તુ મા કશ્ચિદ્દુઃખભાગ્ભવેત્ ॥ ૨ ॥",
	"ત્વમેવ માતા ચ પિતા ત્વમેવ ત્વમેવ બન્ધુશ્ચ સખા ત્વમેવ । ત્વમેવ વિદ્યા દ્રવિણં ત્વમેવ ત્વમેવ સર્વં મમ દેવ દેવ ॥ ૩ ॥ " +
		"અસતો મા સદ્ગમય તમસો મા જ્યોતિર્ગમય મૃત્યોર્મા અમૃતં ગમય ॥ ૪ ॥",
	"વાચ્યં પ્રીતિપૂર્વકં સત્યં હિતં ચ ભાષણીયં નિત્યં । ક્રોધં ત્યજેત્ સદા ધીરઃ શાન્તિમેવ સમાશ્રયેત્ ॥ ૫ ॥ " +
		"ધર્મો રક્ષતિ રક્ષિતઃ ધર્મ એવ હતો હન્તિ ધર્મો રક્ષતિ રક્ષિતઃ ॥ ૬ ॥",
	"જય જય આરતી શ્રીહરિ કેરી ભક્તજનોનાં દુઃખ હરનારી । પ્રેમે પ્રભુને ભજીએ સૌ મળી આનંદ ઉર માંહી ન સમાય ॥ ૭ ॥ " +
		"શરણે આવ્યા તેને તાર્યા એ જ પ્રભુની રીત સદાય ॥ ૮ ॥",
];

/**
 * The same verse as a legacy non-Unicode font yields it: Gujarati glyphs painted onto Latin
 * code points, so the page reads correctly and the bytes are ASCII soup.
 */
export const LEGACY_PAGES: readonly string[] = [
	"Ap[ NA[T> lJvg S\\P VG[ ptp AwyD lJnpguo pQ[ SpP Ap[ NA[T> lJvg S\\P VG[ ptp " +
		"AwyD lJnpguo pQ[ SpP Ap[ NA[T> lJvg S\\P VG[ ptp AwyD lJnpguo pQ[",
	"S\\P VG[ ptp Ap[ NA[T> lJnpguo AwyD lJvg pQ[ SpP S\\P VG[ ptp Ap[ NA[T> " +
		"lJnpguo AwyD lJvg pQ[ SpP S\\P VG[ ptp Ap[ NA[T> lJnpguo AwyD",
	"lJnpguo AwyD S\\P Ap[ VG[ NA[T> lJvg ptp pQ[ SpP lJnpguo AwyD S\\P Ap[ VG[ " +
		"NA[T> lJvg ptp pQ[ SpP lJnpguo AwyD S\\P Ap[ VG[ NA[T> lJvg",
	"ptp SpP lJvg NA[T> VG[ Ap[ S\\P AwyD lJnpguo pQ[ ptp SpP lJvg NA[T> VG[ " +
		"Ap[ S\\P AwyD lJnpguo pQ[ ptp SpP lJvg NA[T> VG[ Ap[ S\\P AwyD",
];

/**
 * Gujarati as a PDF with a *wrong* `ToUnicode` map yields it — every character a legitimate
 * Gujarati code point, every word impossible.
 *
 * Taken from a real file: Foxit PDF Creator wrote a Shruti mapping in which the pre-base
 * matra `િ` never appears, so `નિરાંતે` came out as `નનરાુંતે` (the matra replaced by a copy of
 * its own consonant) and a spurious `ુ` was inserted before every anusvara. The script tally
 * reads 100% `gujr` and the text is nonsense — which is the entire reason `checkOrthography`
 * exists.
 */
export const BROKEN_ENCODING_PAGES: readonly string[] = [
	"એક હતી કાબર અને એક હતો કાગડો. બન્ને વચ્ચે દોસ્તી થઈ. કાબર બબચારી ભલી અને ભોળી હતી, " +
		"પણ કાગડો હતો આળસુ અને ઢોંગી. કાબરે કાગડાને કહ્ુું - ચાલોને આપણે ખેતર ખેડીએ! " +
		"દાણા સારા થાય તો આખુું વરસ ચણવા જવુું ન પડે અને નનરાુંતે ખાઈએ.",
	"પછી કાબર અને કાગડો પોતાની ચાુંચોથી ખેતર ખેડવા લાગયાું. થોડી વાર થઈ તયાું કાગડાની " +
		"ચાુંચ ભાુંગી એટલે કાગડો લુહારને તયાું તે ઘડાવવા ગયો. જતાું જતાું કાબરને કહેતો ગયો - " +
		"તમે ખેતર ખેડતાું થાઓ, હુું હમણાું ચાુંચ ઘડાવીને આવુું છું.",
	"પછી કાબરે તો આખુું ખેતર ખેડી નાખ્ુું પણ કાગડાભાઈનો પત્તો ન લાગે. કાગડાભાઈની દાનત " +
		"ખોટી હતી એટલે ચાુંચ તો ઘડાવી પણ કામ કરવુું નહહ. કાબર તો પાછી ગઈ અને એકલીએ " +
		"ખેતર આખુું નીંદી નાખ્ુું. વખત જતાું કાપણીનો સમય આવયો.",
	"લુચ્ચા કાગડાએ કહ્ુું - ઠાગાઠૈયા કરુું છું, ચાુંચુડી ઘડાવુું છું, જાવ, કાબરબાઈ! આવુું છું. " +
		"કાબરબાઈ તો નનરાશ થઈ પાછી ગઈ અને બખજાઈને એકલીએ આખા ખેતરની કાપણી કરી નાખી.",
];

/** Ordinary English prose — a real text layer that happens not to be Indic. */
export const ENGLISH_PAGES: readonly string[] = [
	"This edition of the text was prepared from the manuscripts held in the library and it " +
		"is offered here with all of the notes that were made by the editors over many years.",
	"The reader will find that some of the passages are marked with a note about the source " +
		"and these have been kept as they were in the first printing of this book.",
	"There is no attempt to change what the author wrote and the spelling has been left as " +
		"it was found in each of the copies that we were able to see for this work.",
	"We have added an index at the end so that any of the topics can be found quickly and " +
		"the page numbers there refer to this printing and not to any of the earlier ones.",
];
