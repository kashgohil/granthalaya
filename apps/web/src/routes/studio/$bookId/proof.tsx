import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ApparatusPanel } from "#/components/studio/apparatus-panel";
import { InfoTip } from "#/components/studio/info-tip";
import { type BlockRef, PageImage } from "#/components/studio/page-image";
import { QueuePanel } from "#/components/studio/queue-panel";
import { type VerseData, VerseEditor } from "#/components/studio/verse-editor";
import { Button } from "#/components/ui/button";
import type { QueueOrder, QueueQuery, VerseStatus } from "#/lib/studio-verses";
import { usePageContext, usePatchVerse, useVerse } from "#/lib/studio-verses";
import { cn } from "#/lib/utils";

type Search = {
	division?: string;
	verse?: string;
	order?: QueueOrder;
	status?: VerseStatus;
	flag?: string;
};

export const Route = createFileRoute("/studio/$bookId/proof")({
	component: Workbench,
	// The selected passage lives in the URL, so a proofreader can leave a link to where they
	// stopped — or send one to somebody with a question about a verse.
	validateSearch: (search: Record<string, unknown>): Search => ({
		division: typeof search.division === "string" ? search.division : undefined,
		verse: typeof search.verse === "string" ? search.verse : undefined,
		order: search.order === "confidence" ? "confidence" : undefined,
		status:
			search.status === "raw" || search.status === "proofed" || search.status === "approved"
				? search.status
				: undefined,
		flag: typeof search.flag === "string" ? search.flag : undefined,
	}),
});

const PAGE_SIZE = 50;

/**
 * The proofing workbench (P1.3).
 *
 * Three columns separated by background, not a hard frame stack: queue (well), page (sunken),
 * passage (surface). Keyboard-first: j/k move, Enter approves and advances, e edits, Esc leaves
 * the text, p toggles the page apparatus.
 */
function Workbench() {
	const { bookId } = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	const [offset, setOffset] = useState(0);
	/** null = auto (open when the page has footnotes or unresolved held-back blocks). */
	const [apparatusOverride, setApparatusOverride] = useState<boolean | null>(null);
	const [activePage, setActivePage] = useState<number | null>(null);

	const query: QueueQuery = useMemo(
		() => ({
			order: search.order ?? "book",
			status: search.status,
			flag: search.flag,
			offset,
			limit: PAGE_SIZE,
		}),
		[search.order, search.status, search.flag, offset],
	);

	const verse = useVerse(bookId, search.division, search.verse);
	const data = verse.data as VerseData | undefined;

	const select = (target: { divisionId: string; verseId: string } | null) => {
		navigate({
			search: (previous) => ({
				...previous,
				division: target?.divisionId,
				verse: target?.verseId,
			}),
		});
	};

	const pages = (data?.pages as number[] | undefined) ?? [];
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset when the selection moves
	useEffect(() => setActivePage(null), [data?.ref]);
	const page = activePage ?? pages[0] ?? null;

	const context = usePageContext(bookId, page);
	const patch = usePatchVerse(bookId);

	const unresolvedAside = context.data?.setAside.filter((block) => !block.resolved).length ?? 0;
	const noteCount = context.data?.notes.length ?? 0;
	const apparatusUseful = noteCount > 0 || unresolvedAside > 0;
	// Auto-open when there is work on the page; once the user toggles, stick to their choice.
	const showApparatus = apparatusOverride === null ? apparatusUseful : apparatusOverride;

	// biome-ignore lint/correctness/useExhaustiveDependencies: rebind when the selection moves
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const typing =
				target?.tagName === "TEXTAREA" ||
				target?.tagName === "INPUT" ||
				target?.isContentEditable === true;

			if (typing) {
				if (event.key === "Escape") target?.blur();
				return;
			}
			if (event.metaKey || event.ctrlKey || event.altKey) return;

			if (event.key === "j" && data?.next) {
				event.preventDefault();
				select({ divisionId: data.next.divisionId, verseId: data.next.id });
			} else if (event.key === "k" && data?.previous) {
				event.preventDefault();
				select({ divisionId: data.previous.divisionId, verseId: data.previous.id });
			} else if (event.key === "Enter" && data) {
				event.preventDefault();
				patch.mutate({ divisionId: data.divisionId, verseId: data.id, status: "approved" });
				if (data.next) select({ divisionId: data.next.divisionId, verseId: data.next.id });
			} else if (event.key === "e") {
				event.preventDefault();
				document.querySelector<HTMLTextAreaElement>("[data-verse-text]")?.focus();
			} else if (event.key === "p") {
				event.preventDefault();
				setApparatusOverride(!showApparatus);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [data?.ref, data?.next?.id, data?.previous?.id, showApparatus]);

	const highlight = ((data as { blocks?: BlockRef[] } | undefined)?.blocks ?? []).filter(
		(block) => block.page === page,
	);
	const otherBlocks: BlockRef[] = context.data
		? [
				...context.data.notes.map((note) => note.block as unknown as BlockRef),
				...(context.data.setAside as unknown as BlockRef[]),
			]
		: [];

	return (
		// The height comes from the studio shell rather than from a copy of its row heights:
		// the header grew a second row for the breadcrumbs, and a hardcoded offset here is
		// exactly the kind of thing that survives that change while being silently wrong.
		<div className="grid h-[calc(100vh-var(--studio-header,4rem))] grid-cols-[20.5rem_minmax(0,1fr)_minmax(0,1.2fr)]">
			{/* Queue — quiet list column; filters sit in a well */}
			<section className="flex min-h-0 flex-col overflow-hidden border-rule border-r bg-surface">
				<ColumnLabel>
					Queue
					<span className="ml-auto font-normal normal-case tracking-normal text-ink-faint">
						passages
					</span>
				</ColumnLabel>
				<div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">
					<QueuePanel
						bookId={bookId}
						query={query}
						onQueryChange={(next) => {
							setOffset(next.offset);
							navigate({
								search: (previous) => ({
									...previous,
									order: next.order === "book" ? undefined : next.order,
									status: next.status,
									flag: next.flag,
								}),
							});
						}}
						selectedRef={data?.ref ?? null}
						onSelect={select}
					/>
				</div>
			</section>

			{/* Page image */}
			<section className="flex min-h-0 flex-col overflow-hidden bg-sunken">
				<ColumnLabel>
					{page === null ? "Page" : `Page ${page}`}
					{pages.length > 1 ? (
						<span className="ml-2 flex flex-wrap items-center gap-1 font-normal normal-case tracking-normal">
							<span className="text-muted-foreground">spans</span>
							{pages.map((candidate) => (
								<Button
									key={candidate}
									type="button"
									size="xs"
									variant={candidate === page ? "default" : "secondary"}
									onClick={() => setActivePage(candidate)}
									className="h-6 min-w-6 px-1.5 text-[11px] tabular-nums"
								>
									{candidate}
								</Button>
							))}
						</span>
					) : null}
				</ColumnLabel>
				<div className="min-h-0 flex-1 overflow-y-auto">
					{page === null ? (
						<p className="p-6 text-ink-faint text-sm">
							{data === undefined
								? "Pick a passage from the queue."
								: "No page image for this passage — it was typed in by hand."}
						</p>
					) : (
						<PageImage bookId={bookId} page={page} highlight={highlight} dim={otherBlocks} />
					)}
				</div>
			</section>

			{/* Passage editor */}
			<section className="flex min-h-0 flex-col overflow-hidden border-rule border-l bg-surface">
				<ColumnLabel>
					Passage
					<span className="ml-auto flex items-center gap-1.5 font-normal normal-case tracking-normal text-ink-faint">
						<span className="hidden sm:inline">j/k · Enter · e · Esc · p</span>
						<InfoTip label="Keyboard shortcuts">
							j / k move to next or previous · Enter approves and advances · e focuses the text ·
							Esc leaves the text · p toggles the page apparatus
						</InfoTip>
					</span>
				</ColumnLabel>
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
					{verse.isPending && search.verse !== undefined ? (
						<p className="text-muted-foreground text-sm">Loading passage…</p>
					) : null}
					{verse.isError ? (
						<p role="alert" className="text-destructive text-sm">
							{verse.error.message}
						</p>
					) : null}
					{data === undefined ? (
						<p className="text-muted-foreground text-sm">
							Nothing selected. The queue is sorted{" "}
							{query.order === "confidence" ? "worst-first" : "in book order"}.
						</p>
					) : (
						<VerseEditor
							bookId={bookId}
							verse={data}
							onMoved={select}
							apparatus={
								page !== null ? (
									showApparatus ? (
										<div className="rounded-lg border border-border bg-paper p-3">
											<div className="mb-3 flex items-center justify-between gap-2">
												<p className="text-muted-foreground text-xs">
													{noteCount} footnote{noteCount === 1 ? "" : "s"}
													{unresolvedAside > 0 ? ` · ${unresolvedAside} held-back unchecked` : ""}
												</p>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="h-7 text-xs"
													onClick={() => setApparatusOverride(false)}
												>
													Hide (p)
												</Button>
											</div>
											<ApparatusPanel bookId={bookId} page={page} />
										</div>
									) : (
										<div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-paper px-3 py-2.5">
											<p className="text-muted-foreground text-xs">
												{noteCount} footnote{noteCount === 1 ? "" : "s"}
												{unresolvedAside > 0
													? ` · ${unresolvedAside} held-back unchecked`
													: " · nothing pending"}
											</p>
											<Button
												type="button"
												variant="secondary"
												size="sm"
												className="h-7 text-xs"
												onClick={() => setApparatusOverride(true)}
											>
												Show (p)
											</Button>
										</div>
									)
								) : undefined
							}
						/>
					)}
				</div>
			</section>
		</div>
	);
}

function ColumnLabel({ children }: { children: React.ReactNode }) {
	return (
		<div
			className={cn(
				"flex h-10 shrink-0 items-center gap-2 px-4 font-medium text-[11px] text-muted-foreground uppercase tracking-wide",
			)}
		>
			{children}
		</div>
	);
}
