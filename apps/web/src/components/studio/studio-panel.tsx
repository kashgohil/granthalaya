import type { ReactNode } from "react";
import { cn } from "#/lib/utils";

/**
 * A titled card used across the studio library and book desk.
 *
 * One chrome for every secondary surface so the desk does not look like a pile of
 * differently-bordered boxes. Warn tone is reserved for things that block progress.
 */
export function StudioPanel({
	title,
	note,
	tone = "plain",
	actions,
	children,
	className,
}: {
	title?: string;
	note?: string;
	tone?: "plain" | "warn";
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"rounded-lg border p-5",
				tone === "warn" ? "border-brand bg-brand-wash" : "border-rule bg-surface",
				className,
			)}
		>
			{(title !== undefined || actions !== undefined) && (
				<div className="mb-3 flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						{title !== undefined ? <h2 className="font-medium text-base">{title}</h2> : null}
						{note !== undefined ? (
							<p className="mt-0.5 text-ink-faint text-xs leading-relaxed">{note}</p>
						) : null}
					</div>
					{actions !== undefined ? <div className="shrink-0">{actions}</div> : null}
				</div>
			)}
			{title === undefined && note !== undefined ? (
				<p className="mb-3 text-ink-faint text-xs leading-relaxed">{note}</p>
			) : null}
			{children}
		</section>
	);
}
