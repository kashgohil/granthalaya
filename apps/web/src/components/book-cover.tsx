import { COVER_SHADING, type CoverSubject, coverFor, resolveTypeStyle } from "@granthalaya/core";
import type { CSSProperties, ReactNode } from "react";

export type BookCoverProps = {
	book: CoverSubject;
	/** Width in px; the height follows the 2:3 ratio. */
	width?: number;
	/** A line under the title: the edition, a verse count. */
	footer?: string;
	className?: string;
};

/**
 * A generated book cover — the web half of P0.4's covers.
 *
 * Same derivation as the Expo component (`coverFor` in `packages/core`), so a cover on a
 * book's promo page (P8.1) and the same cover on the shelf are the same object. The physical
 * cues are done in CSS here and in nested views there, which is the only difference.
 */
export function BookCover({ book, width = 148, footer, className }: BookCoverProps): ReactNode {
	const spec = coverFor(book);
	const title = resolveTypeStyle("display", "gujr", { size: Math.round(width * 0.155) });
	const initial = resolveTypeStyle("caption", "gujr", { size: Math.round(width * 0.1) });
	const foot = resolveTypeStyle("caption", "latn", {
		size: Math.max(9, Math.round(width * 0.068)),
	});

	const style = {
		width,
		aspectRatio: "2 / 3",
		"--cloth": spec.colourway.base,
		"--cloth-ink": spec.colourway.ink,
	} as CSSProperties;

	return (
		<figure
			className={`grain relative m-0 flex flex-col justify-end overflow-hidden rounded-l-[3px] rounded-r-md shadow-lg ${className ?? ""}`}
			style={{
				...style,
				color: spec.colourway.ink,
				// The cloth, lit from the top-left: flat colour reads as a rectangle, a shaded
				// one reads as a bound board. The amounts come from core because they decide
				// how light the cloth under the title can get — see `cover.test.ts`.
				backgroundImage: `linear-gradient(160deg, color-mix(in oklab, var(--cloth) ${
					100 - COVER_SHADING.highlight * 100
				}%, white ${COVER_SHADING.highlight * 100}%), var(--cloth) 58%, color-mix(in oklab, var(--cloth) ${
					100 - COVER_SHADING.shadow * 100
				}%, black ${COVER_SHADING.shadow * 100}%))`,
			}}
		>
			{/* The spine, and the double rule inset from the trim. */}
			<span
				aria-hidden
				className="pointer-events-none absolute inset-y-0 left-0 w-[6px]"
				style={{
					backgroundImage:
						"linear-gradient(90deg, rgba(0,0,0,.3), rgba(0,0,0,.06) 62%, rgba(255,255,255,.1))",
				}}
			/>
			<span
				aria-hidden
				className="pointer-events-none absolute top-2 right-2 bottom-2 left-4 rounded-[2px] border"
				style={{ borderColor: "color-mix(in oklab, var(--cloth-ink) 38%, transparent)" }}
			/>

			<div className="relative flex h-full flex-col justify-between px-3 pt-4 pb-3 pl-5">
				<span
					className="font-serif font-bold opacity-70"
					style={{ fontSize: initial.fontSize, lineHeight: `${initial.lineHeight}px` }}
				>
					{spec.initial}
				</span>
				<span className="flex flex-col gap-0.5">
					<span
						className="font-serif font-bold"
						style={{ fontSize: title.fontSize, lineHeight: `${title.lineHeight}px` }}
					>
						{spec.title}
					</span>
					{footer === undefined ? null : (
						<span
							className="tracking-wide uppercase opacity-65"
							style={{ fontSize: foot.fontSize, lineHeight: `${foot.lineHeight}px` }}
						>
							{footer}
						</span>
					)}
				</span>
			</div>
		</figure>
	);
}
