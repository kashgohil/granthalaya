import type { ReactNode } from "react";

/**
 * Title row for a studio page: what this screen is, and the primary actions for it.
 */
export function StudioPageHeader({
	title,
	description,
	meta,
	actions,
	children,
}: {
	title: ReactNode;
	description?: ReactNode;
	meta?: ReactNode;
	actions?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<header className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="display-title text-2xl text-ink">{title}</h1>
					{description !== undefined ? (
						<p className="mt-1 max-w-2xl text-ink-faint text-sm leading-relaxed">{description}</p>
					) : null}
					{meta !== undefined ? (
						<p className="mt-1.5 font-mono text-ink-faint text-xs">{meta}</p>
					) : null}
				</div>
				{actions !== undefined ? (
					<div className="flex flex-wrap items-center gap-2">{actions}</div>
				) : null}
			</div>
			{children}
		</header>
	);
}
