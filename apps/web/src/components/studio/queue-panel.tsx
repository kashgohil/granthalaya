import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { flagDescription, flagLabel } from "#/components/studio/flag-help";
import { Hint, InfoTip } from "#/components/studio/info-tip";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import { Label } from "#/components/ui/label";
import { Separator } from "#/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import type { QueueOrder, QueueQuery, VerseStatus } from "#/lib/studio-verses";
import { useFlags, useQueue } from "#/lib/studio-verses";
import { cn } from "#/lib/utils";

/**
 * The list you work down (P1.3).
 *
 * Two orderings, and they are not interchangeable. **Book order** is the one that finishes a
 * book — every passage has to be read against its page, and reading a discourse in sequence is
 * how you notice that the passage before this one ended mid-sentence. **Worst first** is
 * `assembly.json`'s own ordering, and it is the right way *in*: it starts where the machine's own
 * evidence is weakest.
 */
export function QueuePanel({
	bookId,
	query,
	onQueryChange,
	selectedRef,
	onSelect,
}: {
	bookId: string;
	query: QueueQuery;
	onQueryChange: (next: QueueQuery) => void;
	selectedRef: string | null;
	onSelect: (item: { divisionId: string; verseId: string }) => void;
}) {
	const queue = useQueue(bookId, query);
	const flags = useFlags(bookId);
	const set = (patch: Partial<QueueQuery>) => onQueryChange({ ...query, offset: 0, ...patch });

	const total = queue.data?.total ?? 0;
	const shown = queue.data?.items.length ?? 0;
	const flagCount = flags.data?.length ?? 0;
	const [flagsOpen, setFlagsOpen] = useState(query.flag !== undefined);

	const statusValue = query.status ?? "all";

	return (
		<div className="flex h-full flex-col">
			<div className="space-y-3 rounded-lg bg-sunken px-2.5 py-3">
				{/* Order — shadcn Tabs as segmented control */}
				<div className="space-y-1.5">
					<div className="flex items-center gap-0.5">
						<span className="text-[11px] text-muted-foreground uppercase tracking-wide">Order</span>
						<InfoTip label="About queue order">
							Book order finishes the book in print sequence. Worst first starts where the machine's
							evidence is weakest — the right way in.
						</InfoTip>
					</div>
					<Tabs
						value={query.order}
						onValueChange={(value) => set({ order: value as QueueOrder })}
						className="w-full gap-0"
					>
						<TabsList className="h-8 w-full" variant="default">
							<TabsTrigger value="book" className="flex-1 text-xs">
								Book order
							</TabsTrigger>
							<TabsTrigger value="confidence" className="flex-1 text-xs">
								Worst first
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				{/* Status — ToggleGroup chips */}
				<div className="space-y-1.5">
					<span className="text-[11px] text-muted-foreground uppercase tracking-wide">Status</span>
					<ToggleGroup
						type="single"
						value={statusValue}
						onValueChange={(value) => {
							if (value === "" || value === "all") set({ status: undefined });
							else set({ status: value as VerseStatus });
						}}
						variant="outline"
						size="sm"
						spacing={1}
						className="flex w-full flex-wrap justify-start"
					>
						{(
							[
								["all", "All"],
								["raw", "Unread"],
								["proofed", "Proofed"],
								["approved", "Approved"],
							] as const
						).map(([value, label]) => (
							<ToggleGroupItem
								key={value}
								value={value}
								className="h-7 min-w-0 flex-none px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
							>
								{label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>

				{/* Flags — Collapsible + Badge chips */}
				{flagCount > 0 ? (
					<Collapsible open={flagsOpen || query.flag !== undefined} onOpenChange={setFlagsOpen}>
						<div className="flex items-center gap-1">
							<CollapsibleTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 flex-1 justify-between px-1 text-[11px] text-muted-foreground uppercase tracking-wide hover:text-foreground"
								>
									<span className="tabular-nums">
										Flags · {flagCount}
										{query.flag !== undefined ? ` · ${flagLabel(query.flag)}` : ""}
									</span>
									<ChevronDown
										className={cn(
											"size-3.5 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
											(flagsOpen || query.flag !== undefined) && "rotate-180",
										)}
									/>
								</Button>
							</CollapsibleTrigger>
						</div>
						<CollapsibleContent className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
							<div className="mt-1.5 flex flex-wrap gap-1.5">
								<Badge
									asChild
									variant={query.flag === undefined ? "default" : "outline"}
									className="cursor-pointer rounded-md active:scale-[0.97]"
								>
									<button type="button" onClick={() => set({ flag: undefined })}>
										Any
									</button>
								</Badge>
								{flags.data?.map((flag) => {
									const active = query.flag === flag.flag;
									return (
										<Hint key={flag.flag} content={flagDescription(flag.flag)}>
											<Badge
												asChild
												variant={active ? "default" : "secondary"}
												className="cursor-pointer rounded-md active:scale-[0.97]"
											>
												<button type="button" onClick={() => set({ flag: flag.flag })}>
													{flagLabel(flag.flag)}
													<span className="tabular-nums opacity-70">{flag.n}</span>
												</button>
											</Badge>
										</Hint>
									);
								})}
							</div>
						</CollapsibleContent>
					</Collapsible>
				) : null}

				<div className="flex items-center gap-2">
					<Checkbox
						id="orphans-only"
						checked={query.orphaned === true}
						onCheckedChange={(checked) => set({ orphaned: checked === true ? true : undefined })}
					/>
					<Label
						htmlFor="orphans-only"
						className="flex cursor-pointer items-center gap-1 text-xs font-normal text-muted-foreground"
					>
						Orphans only
						<InfoTip label="About orphans">
							Passages the newest draft no longer produces. Kept, not deleted — a re-import never
							silently removes human work.
						</InfoTip>
					</Label>
				</div>
			</div>

			<p className="px-1 py-2 text-muted-foreground text-xs tabular-nums">
				{queue.isPending ? "…" : `${query.offset + 1}–${query.offset + shown} of ${total}`}
			</p>

			<ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-0.5">
				{queue.data?.items.map((item) => {
					const flagList = (item.flags as string[]) ?? [];
					const pages = (item.pages as number[]) ?? [];
					const selected = item.ref === selectedRef;
					return (
						<li key={item.key}>
							<button
								type="button"
								onClick={() => onSelect({ divisionId: item.divisionId, verseId: item.id })}
								className={cn(
									"block w-full rounded-md border-l-2 px-2.5 py-2.5 text-left outline-none",
									"transition-[transform,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
									"active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring",
									selected ? "border-primary bg-accent" : "border-transparent hover:bg-muted/80",
								)}
							>
								<span className="flex items-baseline gap-2">
									<span className="font-medium font-mono text-foreground text-xs">{item.id}</span>
									{item.number === null ? null : (
										<span className="font-gujarati text-muted-foreground text-xs">
											{item.number}
										</span>
									)}
									<StatusDot status={item.status} />
									{item.ocrChanged ? (
										<Hint content="OCR changed under your edit after a re-import.">
											<span className="text-destructive text-xs">⟳</span>
										</Hint>
									) : null}
									{item.edited ? (
										<Hint content="Edited by hand.">
											<span className="text-muted-foreground text-xs">✎</span>
										</Hint>
									) : null}
									<span className="ml-auto text-muted-foreground text-xs tabular-nums">
										{pages.length === 0 ? "" : `p${pages[0]}`}
									</span>
								</span>
								<span className="mt-1 block truncate font-gujarati text-foreground text-sm leading-snug">
									{item.preview}
								</span>
								{flagList.length > 0 ? (
									<span className="mt-1.5 flex flex-wrap gap-1">
										{flagList.slice(0, 2).map((flag) => (
											<Badge
												key={flag}
												variant="outline"
												className="rounded-sm px-1.5 py-0 font-normal text-[10px]"
											>
												{flagLabel(flag)}
											</Badge>
										))}
										{flagList.length > 2 ? (
											<span className="text-[10px] text-muted-foreground">
												+{flagList.length - 2}
											</span>
										) : null}
									</span>
								) : null}
							</button>
						</li>
					);
				})}
			</ul>

			<Separator className="my-2" />
			<div className="flex items-center gap-2 px-0.5">
				<Button
					variant="secondary"
					size="sm"
					disabled={query.offset === 0}
					onClick={() =>
						onQueryChange({ ...query, offset: Math.max(0, query.offset - query.limit) })
					}
				>
					Previous
				</Button>
				<Button
					variant="secondary"
					size="sm"
					disabled={query.offset + shown >= total}
					onClick={() => onQueryChange({ ...query, offset: query.offset + query.limit })}
				>
					Next
				</Button>
			</div>
		</div>
	);
}

function StatusDot({ status }: { status: VerseStatus }) {
	const tone =
		status === "approved"
			? "bg-primary"
			: status === "proofed"
				? "bg-accent"
				: "bg-muted-foreground/40";
	const label = status === "approved" ? "Approved" : status === "proofed" ? "Proofed" : "Unread";
	return <span className={cn("inline-block size-1.5 rounded-full", tone)} title={label} />;
}
