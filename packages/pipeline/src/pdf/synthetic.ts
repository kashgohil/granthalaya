/**
 * Hand-built PDFs carrying exactly one triage signal each.
 *
 * Triage decides whether a book's text layer can be trusted, so its tests have to exercise
 * real PDF structure — a hand-rolled fake of `PdfFacts` would only ever prove the classifier
 * agrees with itself. These builders emit genuine files that MuPDF parses without repairing,
 * which keeps the corpus in the repository as ~200 lines of readable code instead of as
 * opaque binaries nobody can diff.
 *
 * Test-only: deliberately not re-exported from the package index.
 */

/** Six-letter subset tag, as a real embedded font would carry. */
const SUBSET = "ABCDEF";

class PdfBuilder {
	/** Object 1 is the catalog and object 2 the page tree; both are filled in by `build`. */
	private readonly objects: (string | null)[] = [null, null];

	add(body: string): number {
		this.objects.push(body);
		return this.objects.length;
	}

	addStream(dict: string, body: string): number {
		const length = new TextEncoder().encode(body).length;
		return this.add(`<<${dict}/Length ${length}>>\nstream\n${body}\nendstream`);
	}

	/** `pages` are page-object bodies missing only their `/Parent`, which only `build` knows. */
	build(pages: readonly string[]): Uint8Array {
		const pageNumbers = pages.map((body) => this.add(`<<${body}/Parent 2 0 R>>`));
		this.objects[0] = "<</Type/Catalog/Pages 2 0 R>>";
		this.objects[1] = `<</Type/Pages/Kids[${pageNumbers
			.map((number) => `${number} 0 R`)
			.join(" ")}]/Count ${pageNumbers.length}>>`;

		const encoder = new TextEncoder();
		const chunks: Uint8Array[] = [];
		const offsets: number[] = [];
		let offset = 0;

		const push = (text: string) => {
			const bytes = encoder.encode(text);
			chunks.push(bytes);
			offset += bytes.length;
		};

		push("%PDF-1.7\n");
		this.objects.forEach((body, index) => {
			offsets.push(offset);
			push(`${index + 1} 0 obj\n${body as string}\nendobj\n`);
		});

		const startxref = offset;
		push(`xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`);
		for (const at of offsets) {
			push(`${String(at).padStart(10, "0")} 00000 n \n`);
		}
		push(
			`trailer\n<</Size ${this.objects.length + 1}/Root 1 0 R>>\n` +
				`startxref\n${startxref}\n%%EOF\n`,
		);

		const out = new Uint8Array(offset);
		let at = 0;
		for (const chunk of chunks) {
			out.set(chunk, at);
			at += chunk.length;
		}
		return out;
	}
}

const A4 = "/MediaBox[0 0 595 842]";

/** Characters per line at the size these fixtures use, comfortably inside an A4 text block. */
const LINE_LENGTH = 55;

/**
 * Draw `text` as wrapped lines down the page.
 *
 * A single `Td` would run the whole page's text off the right edge, and MuPDF drops glyphs
 * that fall outside the page — silently truncating every fixture to about fifty characters,
 * which made the tests far weaker than they read. Wrapping keeps a page's worth of text
 * actually extractable.
 *
 * `show` renders one line as a PDF string operand: hex CIDs for a Type0 font, a literal
 * string for a simple one. `invisible` uses text render mode 3, how a searchable scan hides
 * its OCR layer behind the page image.
 */
function textBlock(
	show: (line: string) => string,
	text: string,
	options: { readonly invisible?: boolean } = {},
): string {
	const lines: string[] = [];
	let current = "";
	for (const word of text.split(/\s+/).filter((piece) => piece !== "")) {
		if (current === "") {
			current = word;
		} else if (current.length + 1 + word.length <= LINE_LENGTH) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current !== "") {
		lines.push(current);
	}

	const mode = options.invisible === true ? "3 Tr " : "";
	return [
		`BT ${mode}/F1 11 Tf 14 TL 60 790 Td`,
		...lines.map((line) => `${show(line)} Tj T*`),
		"ET",
	].join(" ");
}

function hex4(value: number): string {
	return value.toString(16).toUpperCase().padStart(4, "0");
}

/** Render a line as a PDF literal string, for a simple (non-Type0) font. */
function literal(line: string): string {
	return `(${line.replace(/([\\()])/g, "\\$1")})`;
}

/** A Type0 font plus the encoder that turns text into the CIDs it maps back to Unicode. */
type UnicodeFont = {
	readonly object: number;
	readonly encode: (text: string) => string;
};

/**
 * Add a Type0 font carrying a `ToUnicode` CMap for every code point in `corpus` — the shape
 * a correctly made Gujarati PDF has, and the only one whose text may be trusted.
 *
 * `embedded` is off by default: MuPDF would try to *shape* with the fake font programme and
 * log a FreeType error over every test run, while extraction goes through `ToUnicode`
 * regardless. One test turns it on, to prove an embedded font is noticed.
 */
function addUnicodeFont(
	builder: PdfBuilder,
	corpus: readonly string[],
	fontName: string,
	embedded: boolean,
): UnicodeFont {
	// One CID per distinct code point across the whole document, numbered from 1.
	const codePoints = [...new Set(corpus.flatMap((page) => [...page]))];
	const cidOf = new Map(codePoints.map((character, index) => [character, index + 1]));

	const cmap = [
		"/CIDInit /ProcSet findresource begin",
		"12 dict begin",
		"begincmap",
		"1 begincodespacerange",
		"<0000> <FFFF>",
		"endcodespacerange",
		`${codePoints.length} beginbfchar`,
		...codePoints.map(
			(character) =>
				`<${hex4(cidOf.get(character) as number)}> <${hex4(character.codePointAt(0) as number)}>`,
		),
		"endbfchar",
		"endcmap",
		"CMapName currentdict /CMap defineresource pop",
		"end",
		"end",
	].join("\n");

	const toUnicode = builder.addStream("", cmap);
	const fontFile = embedded
		? `/FontFile2 ${builder.addStream("/Length1 16", "not a real font programme")} 0 R`
		: "";
	const descriptor = builder.add(
		`<</Type/FontDescriptor/FontName/${SUBSET}+${fontName}/Flags 4/ItalicAngle 0` +
			"/Ascent 800/Descent -200/CapHeight 700/StemV 80/FontBBox[0 -200 1000 800]" +
			`${fontFile}>>`,
	);
	const descendant = builder.add(
		`<</Type/Font/Subtype/CIDFontType2/BaseFont/${SUBSET}+${fontName}` +
			"/CIDSystemInfo<</Registry(Adobe)/Ordering(Identity)/Supplement 0>>" +
			`/FontDescriptor ${descriptor} 0 R/DW 600>>`,
	);
	const object = builder.add(
		`<</Type/Font/Subtype/Type0/BaseFont/${SUBSET}+${fontName}/Encoding/Identity-H` +
			`/DescendantFonts[${descendant} 0 R]/ToUnicode ${toUnicode} 0 R>>`,
	);

	return {
		object,
		encode: (text) =>
			`<${[...text].map((character) => hex4(cidOf.get(character) as number)).join("")}>`,
	};
}

/**
 * A PDF whose text layer extracts as real Unicode — the only shape whose text we may trust.
 */
export function unicodeTextPdf(
	pages: readonly string[],
	options: { readonly fontName?: string; readonly embedded?: boolean } = {},
): Uint8Array {
	const builder = new PdfBuilder();
	const font = addUnicodeFont(
		builder,
		pages,
		options.fontName ?? "Rasa-Regular",
		options.embedded === true,
	);

	return builder.build(
		pages.map((text) => {
			const content = builder.addStream("", textBlock(font.encode, text));
			return `/Type/Page${A4}/Resources<</Font<</F1 ${font.object} 0 R>>>>/Contents ${content} 0 R`;
		}),
	);
}

/**
 * A PDF whose text layer is a lie: a simple font with a Latin encoding and no `ToUnicode`,
 * so the bytes extract as the ASCII the glyphs were mapped onto rather than as the Gujarati
 * a reader sees. This is the shape the roadmap's OCR-first rule exists for.
 */
export function legacyTextPdf(pages: readonly string[], fontName = "ShreeGuj-0768"): Uint8Array {
	const builder = new PdfBuilder();
	const descriptor = builder.add(
		`<</Type/FontDescriptor/FontName/${fontName}/Flags 4/ItalicAngle 0` +
			"/Ascent 800/Descent -200/CapHeight 700/StemV 80/FontBBox[0 -200 1000 800]>>",
	);
	const font = builder.add(
		`<</Type/Font/Subtype/TrueType/BaseFont/${fontName}/Encoding/WinAnsiEncoding` +
			`/FirstChar 32/LastChar 255/FontDescriptor ${descriptor} 0 R>>`,
	);

	return builder.build(
		pages.map((text) => {
			const content = builder.addStream("", textBlock(literal, text));
			return `/Type/Page${A4}/Resources<</Font<</F1 ${font} 0 R>>>>/Contents ${content} 0 R`;
		}),
	);
}

/**
 * A scanned page: one image drawn across the sheet.
 *
 * `text` adds an invisible OCR layer over the top, which is how a "searchable PDF" is built.
 * `textEncoding` decides whether that layer is honest Unicode (`"unicode"`, somebody else's
 * OCR) or legacy-encoded (`"latin"`) — the classifier is supposed to reach the same verdict
 * either way, and that is worth a fixture rather than an assertion about a hand-made object.
 */
export function scannedPdf(
	pageCount: number,
	options: {
		readonly text?: readonly string[];
		readonly coverage?: number;
		readonly textEncoding?: "latin" | "unicode";
	} = {},
): Uint8Array {
	const builder = new PdfBuilder();
	const coverage = options.coverage ?? 1;
	const width = Math.round(595 * coverage);
	const height = Math.round(842 * coverage);

	// A 2x2 RGB image, hex-encoded so every byte of the file stays ASCII.
	const image = builder.addStream(
		"/Type/XObject/Subtype/Image/Width 2/Height 2/ColorSpace/DeviceRGB" +
			"/BitsPerComponent 8/Filter/ASCIIHexDecode",
		"ff000000ff000000ff808080>",
	);

	const lines = options.text;
	let show: ((text: string) => string) | null = null;
	let fontObject: number | null = null;

	if (lines !== undefined) {
		if (options.textEncoding === "unicode") {
			const font = addUnicodeFont(builder, lines, "Rasa-Regular", false);
			fontObject = font.object;
			show = font.encode;
		} else {
			fontObject = builder.add(
				"<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
			);
			show = (text) => `(${text.replace(/([\\()])/g, "\\$1")})`;
		}
	}

	return builder.build(
		Array.from({ length: pageCount }, (_, index) => {
			const draw = `q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q`;
			const line = lines?.[index % lines.length];
			// Text render mode 3 draws nothing — how a real searchable scan hides its OCR layer.
			const text =
				line === undefined || show === null ? "" : ` ${textBlock(show, line, { invisible: true })}`;
			const content = builder.addStream("", draw + text);
			const fontResource = fontObject === null ? "" : `/Font<</F1 ${fontObject} 0 R>>`;
			return (
				`/Type/Page${A4}/Resources<<${fontResource}/XObject<</Im1 ${image} 0 R>>>>` +
				`/Contents ${content} 0 R`
			);
		}),
	);
}

/**
 * A PDF whose body text lives inside a Form XObject, which carries a resource dictionary of
 * its own. Typesetters produce these routinely; a font walk that only looks at the page
 * would report the book as having no fonts at all.
 */
export function nestedFormPdf(pages: readonly string[], fontName = "ShreeGuj-0768"): Uint8Array {
	const builder = new PdfBuilder();
	const descriptor = builder.add(
		`<</Type/FontDescriptor/FontName/${fontName}/Flags 4/ItalicAngle 0` +
			"/Ascent 800/Descent -200/CapHeight 700/StemV 80/FontBBox[0 -200 1000 800]>>",
	);
	const font = builder.add(
		`<</Type/Font/Subtype/TrueType/BaseFont/${fontName}/Encoding/WinAnsiEncoding` +
			`/FirstChar 32/LastChar 255/FontDescriptor ${descriptor} 0 R>>`,
	);

	return builder.build(
		pages.map((text) => {
			const form = builder.addStream(
				`/Type/XObject/Subtype/Form/BBox[0 0 595 842]/Resources<</Font<</F1 ${font} 0 R>>>>`,
				textBlock(literal, text),
			);
			const content = builder.addStream("", "/Fm1 Do");
			return `/Type/Page${A4}/Resources<</XObject<</Fm1 ${form} 0 R>>>>/Contents ${content} 0 R`;
		}),
	);
}

/** Pages with nothing on them at all — a PDF that carries no evidence either way. */
export function blankPdf(pageCount: number): Uint8Array {
	const builder = new PdfBuilder();
	return builder.build(
		Array.from({ length: pageCount }, () => {
			const content = builder.addStream("", "");
			return `/Type/Page${A4}/Resources<<>>/Contents ${content} 0 R`;
		}),
	);
}
