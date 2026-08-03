import { useEffect, useRef } from "react";
import { pageImageUrl } from "#/lib/studio";
import { usePages } from "#/lib/studio-verses";

export type Bbox = readonly [number, number, number, number];

export type BlockRef = {
	page: number;
	printedPage: number | null;
	blockId: string;
	tag: string;
	bbox: Bbox;
};

/**
 * A rendered page with the selected passage's blocks drawn on it (P1.3).
 *
 * This is the whole point of the studio: the text on the right is only trustworthy if a human can
 * see the ink it came from. `assemble` carried each passage's pixel boxes all the way through
 * `assembly.json` for exactly this, and matching them up is the one thing no automated check can
 * do.
 *
 * Boxes are positioned in **percentages** of the image's own pixel dimensions, so the overlay
 * stays correct at any rendered width with no measuring, no `ResizeObserver` and nothing to get
 * out of step during a resize.
 *
 * `crossOrigin="use-credentials"` is load-bearing. The image lives on the API's origin behind the
 * admin guard, and a browser fetches an `<img>` itself — without this it sends no session cookie
 * and every page comes back 401.
 */
export function PageImage({
	bookId,
	page,
	highlight,
	dim = [],
}: {
	bookId: string;
	page: number;
	/** The selected passage's blocks. Scrolled to, and drawn in the accent. */
	highlight: readonly BlockRef[];
	/** Everything else on the page — footnotes, held-back blocks. Drawn quietly. */
	dim?: readonly BlockRef[];
}) {
	const pages = usePages(bookId);
	const dimensions = pages.data?.find((row) => row.number === page);
	const firstBox = useRef<HTMLDivElement>(null);

	// Move to the passage as soon as it is selected: on a 2133px page at reading width, the
	// difference between "shown" and "in view" is most of a screen.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the selection moves
	useEffect(() => {
		firstBox.current?.scrollIntoView({ block: "center", behavior: "smooth" });
	}, [highlight[0]?.blockId, page]);

	if (dimensions === undefined) {
		return (
			<p className="p-4 text-ink-faint text-sm">
				{pages.isPending ? "Loading pages…" : `No rendered image for page ${page}.`}
			</p>
		);
	}

	const place = (bbox: Bbox) => ({
		left: `${(bbox[0] / dimensions.widthPx) * 100}%`,
		top: `${(bbox[1] / dimensions.heightPx) * 100}%`,
		width: `${((bbox[2] - bbox[0]) / dimensions.widthPx) * 100}%`,
		height: `${((bbox[3] - bbox[1]) / dimensions.heightPx) * 100}%`,
	});

	return (
		<div className="relative">
			<img
				src={pageImageUrl(bookId, page)}
				alt={`Page ${page}${dimensions.printedPage === null ? "" : `, printed ${dimensions.printedPage}`}`}
				crossOrigin="use-credentials"
				className="block w-full"
				loading="lazy"
			/>
			{dim.map((block) => (
				<div
					key={`dim-${block.blockId}`}
					title={block.tag}
					className="pointer-events-none absolute rounded-xs border border-ink-faint/40"
					style={place(block.bbox)}
				/>
			))}
			{highlight.map((block, index) => (
				<div
					key={`hit-${block.blockId}`}
					ref={index === 0 ? firstBox : undefined}
					className="pointer-events-none absolute rounded-xs border-2 border-brand bg-brand/10"
					style={place(block.bbox)}
				/>
			))}
		</div>
	);
}
