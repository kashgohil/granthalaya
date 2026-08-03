import { MARK_DARK, MARK_GEOMETRY, type MarkColourway, tilakPathData } from "@granthalaya/core";
import { type ReactNode, useId } from "react";

export type MarkProps = {
	/** Edge length in px. The mark is always square. */
	size?: number;
	colourway?: MarkColourway;
	/**
	 * Rounds the corners like a platform icon. Off when the mark is being used as a glyph
	 * rather than as a stand-in for the installed app.
	 */
	rounded?: boolean;
	/**
	 * Given only when the mark is the sole label for its control. Inside a link that already
	 * has text, leave it out — the mark is then decorative and a second label makes a
	 * screen reader read the destination twice.
	 */
	label?: string;
	className?: string;
};

/**
 * The identity mark — the web half of P0.4's tilak-chandlo.
 *
 * Same geometry as the generated app icons, out of `packages/core/src/design/mark.ts`, so
 * the logo in the studio header and the icon on a phone's home screen are the same drawing
 * rather than two drifting copies. Only the shading differs in construction: an SVG
 * gradient here, a per-pixel blend in the rasteriser, from the same numbers.
 */
export function Mark({
	size = 40,
	colourway = MARK_DARK,
	rounded = true,
	label,
	className,
}: MarkProps): ReactNode {
	const { artboard, chandlo, stroke } = MARK_GEOMETRY;
	// Two marks on one page would otherwise share a gradient id and the second would win.
	const shadingId = useId();
	const shaded = colourway.ground !== null;

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${artboard} ${artboard}`}
			className={`${rounded ? "rounded-[22.5%]" : ""} ${className ?? ""}`}
			role={label === undefined ? "presentation" : "img"}
			aria-hidden={label === undefined ? true : undefined}
			aria-label={label}
		>
			{label === undefined ? null : <title>{label}</title>}
			{shaded ? (
				<defs>
					<linearGradient id={shadingId} x1="0" y1="0" x2="1" y2="1">
						<stop offset="0" stopColor="#FFFFFF" stopOpacity="0.12" />
						<stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
						<stop offset="1" stopColor="#000000" stopOpacity="0.14" />
					</linearGradient>
				</defs>
			) : null}
			{colourway.ground === null ? null : (
				<rect width={artboard} height={artboard} fill={colourway.ground} />
			)}
			<path
				d={tilakPathData()}
				fill="none"
				stroke={colourway.tilak}
				strokeWidth={stroke}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx={chandlo.cx} cy={chandlo.cy} r={chandlo.r} fill={colourway.chandlo} />
			{shaded ? <rect width={artboard} height={artboard} fill={`url(#${shadingId})`} /> : null}
		</svg>
	);
}
