export type Counts = { raw: number; proofed: number; approved: number; total: number };

/**
 * How much of a book has been read by a human.
 *
 * Three segments rather than one percentage, because `proofed` and `approved` mean different
 * things here: proofed is "somebody has read this against the page", approved is "this may be
 * published". Only the second one opens the gate, and collapsing them would hide how much of a
 * book is waiting on a second look.
 */
export function ProgressMeter({ counts, className = "" }: { counts: Counts; className?: string }) {
	const total = Math.max(counts.total, 1);
	const segments = [
		{ key: "approved", value: counts.approved, className: "bg-brand" },
		{ key: "proofed", value: counts.proofed, className: "bg-brand-wash" },
	];

	return (
		<div className={className}>
			<div
				className="flex h-1.5 overflow-hidden rounded-full bg-sunken"
				role="img"
				aria-label={`${counts.approved} approved, ${counts.proofed} proofed, ${counts.raw} unread of ${counts.total}`}
			>
				{segments.map((segment) => (
					<div
						key={segment.key}
						className={segment.className}
						style={{ width: `${(segment.value / total) * 100}%` }}
					/>
				))}
			</div>
			<p className="mt-1.5 text-ink-faint text-xs tabular-nums">
				{counts.approved} approved · {counts.proofed} proofed · {counts.raw} unread
			</p>
		</div>
	);
}
