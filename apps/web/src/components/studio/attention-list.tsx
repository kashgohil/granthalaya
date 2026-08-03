import type { ReactNode } from "react";
import { StudioPanel } from "./studio-panel";

export type AttentionItem = {
	id: string;
	label: ReactNode;
};

/**
 * What still needs a human before this book can leave the studio.
 *
 * One place for blockers so they are not buried across sequence / held-back / needs-human panels.
 */
export function AttentionList({
	items,
	title = "Needs attention",
	empty,
}: {
	items: readonly AttentionItem[];
	title?: string;
	/** When there is nothing to fix — omit to hide the panel entirely. */
	empty?: ReactNode;
}) {
	if (items.length === 0) {
		if (empty === undefined) return null;
		return (
			<StudioPanel title={title} note="Nothing is blocking export from the fields below.">
				<p className="text-ink-muted text-sm">{empty}</p>
			</StudioPanel>
		);
	}

	return (
		<StudioPanel
			title={title}
			note="Export refuses while any of these remain. Fix them here or in the workbench."
			tone="warn"
		>
			<ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
				{items.map((item) => (
					<li key={item.id}>{item.label}</li>
				))}
			</ul>
		</StudioPanel>
	);
}
