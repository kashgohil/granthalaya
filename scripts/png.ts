/**
 * A minimal PNG encoder, shared by `sync-design.ts` and `sync-icons.ts`.
 *
 * Both scripts write committed binary assets, and neither needs anything an image library
 * would give them: no decoding, no resampling, no colour management — just "here are the
 * pixels, write the file". A dependency for that would be several megabytes of native
 * binaries to avoid ninety lines of arithmetic, and it would put a prebuild step between a
 * fresh checkout and `bun run icons:sync`.
 *
 * Greyscale (colour type 0) and RGBA (colour type 6), 8-bit, no interlace, filter type
 * "None" on every scanline. Output is byte-for-byte deterministic, which is what lets the
 * generated files be committed and reviewed as a diff.
 */

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Uint8Array): Uint8Array {
	const body = new Uint8Array(4 + data.length);
	body.set(new TextEncoder().encode(type), 0);
	body.set(data, 4);

	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	out.set(body, 4);
	view.setUint32(8 + data.length, Bun.hash.crc32(body));
	return out;
}

/**
 * PNG's IDAT is a *zlib stream*, and `Bun.deflateSync` returns raw deflate — so the
 * two-byte zlib header and the trailing Adler-32 of the uncompressed data are added here.
 * Six lines of arithmetic, against pulling in `node:zlib` for one call.
 */
function zlibWrap(raw: Uint8Array): Uint8Array {
	const deflated = Bun.deflateSync(raw);
	let a = 1;
	let b = 0;
	for (const byte of raw) {
		a = (a + byte) % 65521;
		b = (b + a) % 65521;
	}

	const out = new Uint8Array(2 + deflated.length + 4);
	out[0] = 0x78; // deflate, 32K window
	out[1] = 0x01; // no preset dictionary; (0x78 << 8 | 0x01) is divisible by 31
	out.set(deflated, 2);
	new DataView(out.buffer).setUint32(2 + deflated.length, ((b << 16) | a) >>> 0);
	return out;
}

function assemble(
	pixels: Uint8Array,
	width: number,
	height: number,
	colourType: 0 | 6,
	bytesPerPixel: number,
): Uint8Array {
	const header = new Uint8Array(13);
	const headerView = new DataView(header.buffer);
	headerView.setUint32(0, width);
	headerView.setUint32(4, height);
	header[8] = 8; // bit depth
	header[9] = colourType;
	header[10] = 0; // deflate
	header[11] = 0; // adaptive filtering
	header[12] = 0; // no interlace

	const stride = width * bytesPerPixel;
	const raw = new Uint8Array((stride + 1) * height);
	for (let row = 0; row < height; row += 1) {
		raw[row * (stride + 1)] = 0; // filter type "None"
		raw.set(pixels.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
	}

	const parts = [
		SIGNATURE,
		chunk("IHDR", header),
		chunk("IDAT", zlibWrap(raw)),
		chunk("IEND", new Uint8Array(0)),
	];

	const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		png.set(part, offset);
		offset += part.length;
	}
	return png;
}

/** One byte per pixel. Used for the paper grain, which has no colour to carry. */
export function encodeGreyscalePng(pixels: Uint8Array, size: number): Uint8Array {
	return assemble(pixels, size, size, 0, 1);
}

/** Four bytes per pixel, straight (not premultiplied) alpha. */
export function encodeRgbaPng(pixels: Uint8Array, width: number, height: number): Uint8Array {
	return assemble(pixels, width, height, 6, 4);
}

/**
 * Three bytes per pixel — no alpha channel at all, from RGBA input.
 *
 * Not an optimisation. App Store Connect rejects an app icon that *has* an alpha channel
 * even when every pixel in it is opaque ("Invalid Image — The app icon can't contain an
 * alpha channel"), and iOS composites any transparency in a home-screen icon against
 * black. So every icon that sits on its own ground is written without the channel rather
 * than with a full one, and the failure shows up here rather than at submission.
 */
export function encodeRgbPng(rgba: Uint8Array, width: number, height: number): Uint8Array {
	const rgb = new Uint8Array(width * height * 3);
	for (let pixel = 0; pixel < width * height; pixel += 1) {
		rgb[pixel * 3] = rgba[pixel * 4] as number;
		rgb[pixel * 3 + 1] = rgba[pixel * 4 + 1] as number;
		rgb[pixel * 3 + 2] = rgba[pixel * 4 + 2] as number;
	}
	return assemble(rgb, width, height, 2, 3);
}

/**
 * A `.ico` whose single image is a PNG.
 *
 * Every browser that still requests `/favicon.ico` by default understands the PNG-in-ICO
 * form, so there is no need to emit a BMP-encoded icon with its upside-down rows and its
 * separate AND mask. The file is a 6-byte directory, one 16-byte entry, then the PNG.
 */
export function encodeIco(png: Uint8Array, size: number): Uint8Array {
	const out = new Uint8Array(22 + png.length);
	const view = new DataView(out.buffer);

	view.setUint16(0, 0, true); // reserved
	view.setUint16(2, 1, true); // type: icon
	view.setUint16(4, 1, true); // one image

	out[6] = size >= 256 ? 0 : size; // 0 means 256
	out[7] = size >= 256 ? 0 : size;
	out[8] = 0; // palette size: not paletted
	out[9] = 0; // reserved
	view.setUint16(10, 1, true); // colour planes
	view.setUint16(12, 32, true); // bits per pixel
	view.setUint32(14, png.length, true);
	view.setUint32(18, 22, true); // offset to the image data

	out.set(png, 22);
	return out;
}
