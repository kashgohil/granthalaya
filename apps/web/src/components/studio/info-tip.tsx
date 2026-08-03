import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

/**
 * shadcn Tooltip + icon button for first-time studio jargon.
 */
export function InfoTip({
	children,
	label = "More about this",
	side = "top",
	className,
}: {
	children: ReactNode;
	label?: string;
	side?: "top" | "right" | "bottom" | "left";
	className?: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					className={cn("size-5 text-ink-faint hover:text-ink-muted", className)}
					aria-label={label}
					onClick={(event) => {
						// Inside collapsible triggers / summaries, don't flip parent state.
						event.preventDefault();
						event.stopPropagation();
					}}
				>
					<CircleHelp className="size-3.5" strokeWidth={1.75} />
				</Button>
			</TooltipTrigger>
			<TooltipContent
				side={side}
				className="max-w-64 border border-rule bg-surface text-left text-ink leading-relaxed shadow-sm"
			>
				{children}
			</TooltipContent>
		</Tooltip>
	);
}

/** Wrap any control so its surface is the tooltip trigger (badges, labels). */
export function Hint({
	content,
	children,
	side = "top",
}: {
	content: ReactNode;
	children: ReactNode;
	side?: "top" | "right" | "bottom" | "left";
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent
				side={side}
				className="max-w-64 border border-rule bg-surface text-left text-ink leading-relaxed shadow-sm"
			>
				{content}
			</TooltipContent>
		</Tooltip>
	);
}
