/**
 * Reading back what `ocr` wrote.
 *
 * The per-page `.blocks.json` files are the input, never the `.md` ones: the markdown is a
 * convenience for a human skimming a page, and it has already thrown away the layout tags,
 * the reading order and the pixel boxes that structure detection and P1.3's proofing view both
 * need. The manifest is read alongside them for the chain of custody — *this PDF* → *these
 * images* → *this text* — which has to survive this hop like every other.
 */
import { join } from "node:path";
import type { Block } from "../ocr/sarvam.ts";
import { OCR_MANIFEST_FILE, type OcrManifest } from "../ocr.ts";
import type { PageBlocks } from "./segment.ts";

export type OcrInput = {
	readonly manifest: OcrManifest;
	readonly pages: readonly PageBlocks[];
	/** Pages the manifest lists whose blocks file is missing or unreadable. */
	readonly unreadable: readonly number[];
};

export type ReadResult =
	| { readonly ok: true; readonly input: OcrInput }
	| { readonly ok: false; readonly error: string };

type BlocksFile = {
	page?: number;
	widthPx?: number;
	heightPx?: number;
	blocks?: Block[];
};

async function readJson<T>(path: string): Promise<T | null> {
	try {
		const file = Bun.file(path);
		return (await file.exists()) ? ((await file.json()) as T) : null;
	} catch {
		return null;
	}
}

/** Load an OCR output directory. Pages come back in page order, whatever the manifest's order. */
export async function readOcrOutput(directory: string): Promise<ReadResult> {
	const manifest = await readJson<OcrManifest>(join(directory, OCR_MANIFEST_FILE));
	if (manifest === null) {
		return {
			ok: false,
			error: `no ${OCR_MANIFEST_FILE} in ${directory} — run \`bun run ocr\` on the rendered pages first`,
		};
	}

	const pages: PageBlocks[] = [];
	const unreadable: number[] = [];

	for (const page of [...manifest.pages].sort((a, b) => a.number - b.number)) {
		const parsed = await readJson<BlocksFile>(join(directory, page.blocksFile));
		if (parsed === null || parsed.blocks === undefined) {
			unreadable.push(page.number);
			continue;
		}
		pages.push({
			number: page.number,
			widthPx: parsed.widthPx ?? 0,
			heightPx: parsed.heightPx ?? 0,
			blocks: parsed.blocks,
		});
	}

	if (pages.length === 0) {
		return { ok: false, error: `no readable pages in ${directory}` };
	}

	return { ok: true, input: { manifest, pages, unreadable } };
}
