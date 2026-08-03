import { createFileRoute, Link } from "@tanstack/react-router";
import { ProgressMeter } from "#/components/studio/progress-meter";
import { StudioPageHeader } from "#/components/studio/studio-page-header";
import { StudioPanel } from "#/components/studio/studio-panel";
import { Button } from "#/components/ui/button";
import { useBooks, useDrafts, useImportDraft } from "#/lib/studio";

export const Route = createFileRoute("/studio/")({ component: StudioIndex });

/** A localized title as the studio has it — often only the English placeholder, at first. */
function titleOf(title: unknown, fallback: string): string {
	const value = title as { gu?: string; en?: string } | null;
	return value?.gu ?? value?.en ?? fallback;
}

/**
 * Everything the studio can work on (P1.3).
 *
 * Two lists rather than one, because they are different kinds of thing: a *draft* is a directory
 * the pipeline wrote and nobody has read, and a *book* is one this studio is holding corrections
 * for. Importing moves a draft into the second list; re-importing brings a re-run of `assemble`
 * into a book that already has hours of proofing in it, which is why the button says so.
 */
function StudioIndex() {
	const drafts = useDrafts(true);
	const books = useBooks(true);
	const importDraft = useImportDraft();

	const bookCount = books.data?.length ?? 0;
	const draftCount = drafts.data?.length ?? 0;
	const unreadTotal = books.data?.reduce((sum, book) => sum + (book.counts.raw ?? 0), 0) ?? 0;

	return (
		<div className="space-y-8">
			<StudioPageHeader
				title="Library"
				description="Imported books being proofed, and pipeline drafts waiting to be brought in. Nothing here is published."
				meta={
					books.isPending || drafts.isPending
						? "Loading…"
						: `${bookCount} in progress · ${draftCount} on disk${
								unreadTotal > 0 ? ` · ${unreadTotal} unread passages` : ""
							}`
				}
			/>

			<section className="space-y-3">
				<div className="flex items-baseline justify-between gap-3">
					<h2 className="font-medium text-base">In progress</h2>
					{bookCount > 0 ? (
						<span className="text-ink-faint text-xs tabular-nums">{bookCount}</span>
					) : null}
				</div>

				{books.isPending ? (
					<p className="text-ink-faint text-sm">Loading books…</p>
				) : books.data?.length === 0 ? (
					<StudioPanel>
						<p className="text-ink-muted text-sm">
							Nothing imported yet. Bring a draft in from the import queue below.
						</p>
					</StudioPanel>
				) : (
					<ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{books.data?.map((book) => {
							const chips: string[] = [];
							if (!book.hasPages) chips.push("No page images");
							if (book.counts.raw > 0) chips.push(`${book.counts.raw} unread`);
							if (
								book.counts.total > 0 &&
								book.counts.approved === book.counts.total &&
								book.hasPages
							) {
								chips.push("Ready to export");
							}

							return (
								<li key={book.id}>
									<Link
										to="/studio/$bookId"
										params={{ bookId: book.id }}
										className="block h-full rounded-lg border border-rule bg-surface p-4 text-ink no-underline transition-colors hover:border-brand"
									>
										<h3 className="font-gujarati text-base leading-snug">
											{titleOf(book.title, book.id)}
										</h3>
										<p className="mt-0.5 font-mono text-ink-faint text-xs">{book.id}</p>
										<ProgressMeter counts={book.counts} className="mt-3" />
										{chips.length > 0 ? (
											<ul className="mt-3 flex flex-wrap gap-1.5">
												{chips.map((chip) => (
													<li
														key={chip}
														className={`rounded-sm px-1.5 py-0.5 text-xs ${
															chip === "No page images"
																? "bg-brand-wash text-brand"
																: chip === "Ready to export"
																	? "bg-brand text-brand-ink"
																	: "bg-sunken text-ink-muted"
														}`}
													>
														{chip}
													</li>
												))}
											</ul>
										) : null}
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</section>

			<section className="space-y-3">
				<div>
					<h2 className="font-medium text-base">Import queue</h2>
					<p className="mt-0.5 text-ink-faint text-xs">
						What <code>bun run assemble</code> has written into <code>content/books/</code>. Import
						moves a draft into the studio; re-import refreshes untouched passages only.
					</p>
				</div>

				{drafts.isPending ? (
					<p className="text-ink-faint text-sm">Loading drafts…</p>
				) : drafts.data?.length === 0 ? (
					<StudioPanel>
						<p className="text-ink-muted text-sm">
							None found. Run <code>bun run render</code>, <code>bun run ocr</code> and{" "}
							<code>bun run assemble</code> on a PDF first.
						</p>
					</StudioPanel>
				) : (
					<StudioPanel className="overflow-x-auto p-0">
						<table className="w-full border-collapse text-sm">
							<thead>
								<tr className="border-rule border-b text-left text-ink-faint text-xs">
									<th className="px-5 py-3 font-normal">Book</th>
									<th className="px-3 py-3 font-normal">Source</th>
									<th className="px-3 py-3 text-right font-normal">Passages</th>
									<th className="px-3 py-3 font-normal">Pages</th>
									<th className="px-5 py-3" />
								</tr>
							</thead>
							<tbody>
								{drafts.data?.map((draft) => (
									<tr key={draft.dir} className="border-rule border-b align-middle last:border-b-0">
										<td className="px-5 py-3">
											<span className="font-mono text-xs">{draft.bookId}</span>
											<span className="block text-ink-faint text-xs">{draft.dir}</span>
										</td>
										<td className="px-3 py-3 text-ink-muted">{draft.sourceFile}</td>
										<td className="px-3 py-3 text-right tabular-nums">{draft.verses}</td>
										<td className="px-3 py-3">
											{draft.hasPages ? (
												<span className="text-ink-muted">rendered</span>
											) : (
												<span className="text-destructive">missing</span>
											)}
										</td>
										<td className="px-5 py-3 text-right">
											<div className="flex flex-wrap items-center justify-end gap-2">
												{draft.imported ? (
													<Link
														to="/studio/$bookId"
														params={{ bookId: draft.bookId }}
														className="text-xs no-underline"
													>
														Open
													</Link>
												) : null}
												<Button
													variant={draft.imported ? "outline" : "default"}
													size="sm"
													disabled={importDraft.isPending}
													onClick={() => importDraft.mutate(draft.dir)}
												>
													{draft.imported ? "Re-import" : "Import"}
												</Button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</StudioPanel>
				)}

				{importDraft.isError ? (
					<p role="alert" className="text-destructive text-sm">
						{importDraft.error.message}
					</p>
				) : null}

				{importDraft.data ? <ImportSummary result={importDraft.data} /> : null}
			</section>
		</div>
	);
}

/**
 * What a re-import actually did.
 *
 * Worth showing in full rather than as "done": the numbers that matter are `reset` (edits a new
 * draft disagrees with, now back in the queue) and `orphaned` (passages the new draft no longer
 * produces at all). Both are things a human has to go and look at.
 */
function ImportSummary({ result }: { result: Record<string, unknown> }) {
	const number = (key: string) => Number(result[key] ?? 0);
	const warnings = (result.warnings ?? []) as string[];

	const lines: [string, number, string][] = [
		["inserted", number("inserted"), "new to the studio"],
		["refreshed", number("refreshed"), "nobody had read them; replaced"],
		["reset", number("reset"), "your edit kept, back to raw for a second read"],
		["orphaned", number("orphaned"), "no longer produced; marked, not deleted"],
		["restored", number("restored"), "orphaned before, produced again"],
	];

	return (
		<StudioPanel
			title={
				result.firstImport
					? `Imported ${String(result.bookId)}`
					: `Re-imported ${String(result.bookId)}`
			}
		>
			<dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
				{lines
					.filter(([, value]) => value > 0)
					.map(([label, value, why]) => (
						<div key={label} className="flex gap-2 text-sm">
							<dt className="tabular-nums">
								{value} {label}
							</dt>
							<dd className="text-ink-faint">— {why}</dd>
						</div>
					))}
			</dl>
			{lines.every(([, value]) => value === 0) ? (
				<p className="text-ink-muted text-sm">No row changes.</p>
			) : null}
			{warnings.map((warning) => (
				<p key={warning} className="mt-2 text-destructive text-xs">
					{warning}
				</p>
			))}
			{typeof result.bookId === "string" ? (
				<p className="mt-3">
					<Link
						to="/studio/$bookId"
						params={{ bookId: result.bookId }}
						className="text-sm no-underline"
					>
						Open book desk →
					</Link>
				</p>
			) : null}
		</StudioPanel>
	);
}
