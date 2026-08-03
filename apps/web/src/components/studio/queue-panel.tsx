import type { QueueOrder, QueueQuery, VerseStatus } from "#/lib/studio-verses";
import { useFlags, useQueue } from "#/lib/studio-verses";

/**
 * The list you work down (P1.3).
 *
 * Two orderings, and they are not interchangeable. **Book order** is the one that finishes a
 * book — every passage has to be read against its page, and reading a discourse in sequence is
 * how you notice that the passage before this one ended mid-sentence. **Worst first** is
 * `assembly.json`'s own ordering, and it is the right way *in*: it starts where the machine's own
 * evidence is weakest.
 *
 * Server-paged rather than virtualized. The sample this was built against has seven passages and
 * the book it is for has four hundred and forty-two pages; paging is what makes that difference
 * invisible instead of a rewrite.
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

	return (
		<div className="flex h-full flex-col">
			<div className="space-y-2 border-rule border-b pb-3">
				<div className="flex gap-1">
					{(
						[
							["book", "Book order"],
							["confidence", "Worst first"],
						] as [QueueOrder, string][]
					).map(([value, label]) => (
						<button
							key={value}
							type="button"
							onClick={() => set({ order: value })}
							className={`rounded-sm px-2 py-1 text-xs ${
								query.order === value ? "bg-brand text-brand-ink" : "bg-sunken text-ink-muted"
							}`}
						>
							{label}
						</button>
					))}
				</div>

				<div className="flex flex-wrap gap-1">
					{(
						[
							[undefined, "All"],
							["raw", "Unread"],
							["proofed", "Proofed"],
							["approved", "Approved"],
						] as [VerseStatus | undefined, string][]
					).map(([value, label]) => (
						<button
							key={label}
							type="button"
							onClick={() => set({ status: value })}
							className={`rounded-sm px-2 py-1 text-xs ${
								query.status === value ? "bg-ink text-background" : "bg-sunken text-ink-muted"
							}`}
						>
							{label}
						</button>
					))}
				</div>

				{flags.data && flags.data.length > 0 ? (
					<div className="flex flex-wrap gap-1">
						<button
							type="button"
							onClick={() => set({ flag: undefined })}
							className={`rounded-sm px-2 py-1 text-xs ${
								query.flag === undefined ? "bg-ink text-background" : "bg-sunken text-ink-muted"
							}`}
						>
							Any flag
						</button>
						{flags.data.map((flag) => (
							<button
								key={flag.flag}
								type="button"
								onClick={() => set({ flag: flag.flag })}
								className={`rounded-sm px-2 py-1 text-xs ${
									query.flag === flag.flag ? "bg-ink text-background" : "bg-sunken text-ink-muted"
								}`}
							>
								{flag.flag} {flag.n}
							</button>
						))}
					</div>
				) : null}

				<label className="flex items-center gap-2 text-ink-muted text-xs">
					<input
						type="checkbox"
						checked={query.orphaned === true}
						onChange={(event) => set({ orphaned: event.target.checked ? true : undefined })}
					/>
					Show orphans — passages the newest draft no longer produces
				</label>
			</div>

			<p className="py-2 text-ink-faint text-xs tabular-nums">
				{queue.isPending ? "…" : `${query.offset + 1}–${query.offset + shown} of ${total}`}
			</p>

			<ul className="-mx-2 min-h-0 flex-1 overflow-y-auto">
				{queue.data?.items.map((item) => {
					const flagList = (item.flags as string[]) ?? [];
					const pages = (item.pages as number[]) ?? [];
					return (
						<li key={item.key}>
							<button
								type="button"
								onClick={() => onSelect({ divisionId: item.divisionId, verseId: item.id })}
								className={`block w-full rounded-md px-2 py-2 text-left ${
									item.ref === selectedRef ? "bg-brand-wash" : "hover:bg-sunken"
								}`}
							>
								<span className="flex items-baseline gap-2">
									<span className="font-mono text-xs">{item.id}</span>
									{item.number === null ? null : (
										<span className="font-gujarati text-xs">{item.number}</span>
									)}
									<StatusDot status={item.status} />
									{item.ocrChanged ? (
										<span className="text-destructive text-xs" title="OCR changed under your edit">
											⟳
										</span>
									) : null}
									{item.edited ? (
										<span className="text-ink-faint text-xs" title="edited by hand">
											✎
										</span>
									) : null}
									<span className="ml-auto text-ink-faint text-xs tabular-nums">
										{pages.length === 0 ? "" : `p${pages[0]}`}
									</span>
								</span>
								<span className="mt-0.5 block truncate font-gujarati text-ink-muted text-xs">
									{item.preview}
								</span>
								{flagList.length > 0 ? (
									<span className="mt-0.5 block text-ink-faint text-[10px]">
										{flagList.join(" · ")}
									</span>
								) : null}
							</button>
						</li>
					);
				})}
			</ul>

			<div className="flex items-center gap-2 border-rule border-t pt-2">
				<button
					type="button"
					className="rounded-sm bg-sunken px-2 py-1 text-xs disabled:opacity-40"
					disabled={query.offset === 0}
					onClick={() =>
						onQueryChange({ ...query, offset: Math.max(0, query.offset - query.limit) })
					}
				>
					Previous
				</button>
				<button
					type="button"
					className="rounded-sm bg-sunken px-2 py-1 text-xs disabled:opacity-40"
					disabled={query.offset + shown >= total}
					onClick={() => onQueryChange({ ...query, offset: query.offset + query.limit })}
				>
					Next
				</button>
			</div>
		</div>
	);
}

function StatusDot({ status }: { status: VerseStatus }) {
	const tone =
		status === "approved" ? "bg-brand" : status === "proofed" ? "bg-brand-wash" : "bg-ink-faint";
	return <span className={`inline-block size-1.5 rounded-full ${tone}`} title={status} />;
}
