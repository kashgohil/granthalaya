/**
 * Package integrity (P1.5).
 *
 * The format has two hashes and they answer different questions (`docs/book-format.md` §5).
 * `hashVerse` is FNV-1a over one verse's layers — change detection, computable in Hermes and
 * the browser with no crypto API, and explicitly *not* a security boundary. This one is: it is
 * SHA-256 over the whole serialized package, computed here and by the pipeline with real
 * platform crypto, recorded in the catalog, and verified by the client after download.
 *
 * It lives in the API rather than `packages/core` because core is platform-pure and has no
 * crypto to reach for — which is the same reason the two hashes are different algorithms.
 */

/** SHA-256, lowercase hex. Over exactly the bytes that were written, never over a re-encode. */
export function sha256Hex(data: Uint8Array | ArrayBuffer | string): string {
	return new Bun.CryptoHasher("sha256").update(data).digest("hex");
}

/**
 * How a package version is serialized before it is hashed and written.
 *
 * Fixed here so the bytes are a function of the package alone: tab-indented, one trailing
 * newline — the same shape `assemble` and export write, so a published file diffs against the
 * proofed one it came from. The hash is over the *file*, so this formatting is part of the
 * artifact's identity and changing it would change every future hash.
 */
export function serializePackage(book: unknown): string {
	return `${JSON.stringify(book, null, "\t")}\n`;
}
