import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ApparatusPanel } from "#/components/studio/apparatus-panel";
import { type BlockRef, PageImage } from "#/components/studio/page-image";
import { QueuePanel } from "#/components/studio/queue-panel";
import { type VerseData, VerseEditor } from "#/components/studio/verse-editor";
import { useBook } from "#/lib/studio";
import type { QueueOrder, QueueQuery, VerseStatus } from "#/lib/studio-verses";
import { usePageContext, usePatchVerse, useVerse } from "#/lib/studio-verses";

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
 * Three columns, in the order the work happens: the queue you are working down, the page image the
 * edition actually printed, and the text that claims to be what it says. The middle column is what
 * makes this a scripture pipeline rather than a text editor — every passage is judged against the
 * ink it came from, and the pixel boxes `assemble` carried through `assembly.json` line the two up.
 *
 * Keyboard-first, because a 442-page book is thousands of small decisions: `j`/`k` move, `Enter`
 * approves and advances (the common case, so it is the one that also moves), `e` returns to the
 * text, `Esc` leaves it, `p` toggles the page apparatus.
 */
function Workbench() {
	const { bookId } = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	const book = useBook(bookId);
	const [offset, setOffset] = useState(0);
	const [showApparatus, setShowApparatus] = useState(true);
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
	// A passage that spans a page break belongs to both; the first is the default and the
	// selector is how you check the join.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset when the selection moves
	useEffect(() => setActivePage(null), [data?.ref]);
	const page = activePage ?? pages[0] ?? null;

	const context = usePageContext(bookId, page);
	const patch = usePatchVerse(bookId);

	// biome-ignore lint/correctness/useExhaustiveDependencies: rebind when the selection moves
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const typing =
				target?.tagName === "TEXTAREA" ||
				target?.tagName === "INPUT" ||
				target?.isContentEditable === true;

			if (typing) {
				// Escape is the way out of the text and back to the shortcuts.
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
				setShowApparatus((value) => !value);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [data?.ref, data?.next?.id, data?.previous?.id]);

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
		<div className="-mx-6 -my-8">
			<div className="flex flex-wrap items-baseline gap-3 border-rule border-b px-6 py-2">
				<Link to="/studio/$bookId" params={{ bookId }} className="text-sm">
					← {bookId}
				</Link>
				<span className="text-ink-faint text-xs">
					j/k move · Enter approves and advances · e edits · Esc leaves the text · p toggles the
					page panel
				</span>
				{book.data ? (
					<span className="ml-auto text-ink-faint text-xs tabular-nums">
						{book.data.counts.approved}/{book.data.counts.total} approved
					</span>
				) : null}
			</div>

			<div className="grid h-[calc(100vh-8.5rem)] grid-cols-[20rem_minmax(0,1fr)_minmax(0,1.1fr)] divide-x divide-rule">
				<div className="min-h-0 overflow-hidden px-3 py-3">
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

				<div className="min-h-0 overflow-y-auto bg-sunken">
					{page === null ? (
						<p className="p-6 text-ink-faint text-sm">
							{data === undefined
								? "Pick a passage from the queue."
								: "No page image for this passage — it was typed in by hand."}
						</p>
					) : (
						<>
							{pages.length > 1 ? (
								<div className="flex gap-1 border-rule border-b bg-surface px-3 py-2">
									<span className="text-ink-faint text-xs">Spans pages:</span>
									{pages.map((candidate) => (
										<button
											key={candidate}
											type="button"
											onClick={() => setActivePage(candidate)}
											className={`rounded-sm px-2 py-0.5 text-xs ${
												candidate === page ? "bg-brand text-brand-ink" : "bg-sunken"
											}`}
										>
											{candidate}
										</button>
									))}
								</div>
							) : null}
							<PageImage bookId={bookId} page={page} highlight={highlight} dim={otherBlocks} />
						</>
					)}
				</div>

				<div className="flex min-h-0 flex-col overflow-y-auto px-4 py-3">
					{verse.isPending && search.verse !== undefined ? (
						<p className="text-ink-faint text-sm">Loading passage…</p>
					) : null}
					{verse.isError ? (
						<p role="alert" className="text-destructive text-sm">
							{verse.error.message}
						</p>
					) : null}
					{data === undefined ? (
						<p className="text-ink-faint text-sm">
							Nothing selected. The queue is sorted{" "}
							{query.order === "confidence" ? "worst-first" : "in book order"}.
						</p>
					) : (
						<VerseEditor bookId={bookId} verse={data} onMoved={select} />
					)}

					{showApparatus && page !== null ? (
						<div className="mt-6 border-rule border-t pt-4">
							<ApparatusPanel bookId={bookId} page={page} />
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
