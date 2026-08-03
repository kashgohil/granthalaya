import { createFileRoute, Link } from "@tanstack/react-router";
import { ProgressMeter } from "#/components/studio/progress-meter";
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

	return (
		<div className="space-y-10">
			<section>
				<h2 className="display-title mb-1 text-xl">Books</h2>
				<p className="mb-4 text-ink-faint text-sm">
					Imported and being proofed. Nothing here is published.
				</p>

				{books.data?.length === 0 ? (
					<p className="rounded-lg border border-rule border-dashed p-6 text-ink-muted text-sm">
						Nothing imported yet. Import a draft below.
					</p>
				) : (
					<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{books.data?.map((book) => (
							<li key={book.id}>
								<Link
									to="/studio/$bookId"
									params={{ bookId: book.id }}
									className="block rounded-lg border border-rule bg-surface p-4 text-ink no-underline hover:border-brand"
								>
									<h3 className="font-gujarati text-base">{titleOf(book.title, book.id)}</h3>
									<p className="mt-0.5 font-mono text-ink-faint text-xs">{book.id}</p>
									<ProgressMeter counts={book.counts} className="mt-3" />
									{book.hasPages ? null : (
										<p className="mt-2 text-destructive text-xs">
											No page images — proofing needs them.
										</p>
									)}
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>

			<section>
				<h2 className="display-title mb-1 text-xl">Drafts on disk</h2>
				<p className="mb-4 text-ink-faint text-sm">
					What <code>bun run assemble</code> has written into <code>content/books/</code>.
				</p>

				{drafts.data?.length === 0 ? (
					<p className="rounded-lg border border-rule border-dashed p-6 text-ink-muted text-sm">
						None found. Run <code>bun run render</code>, <code>bun run ocr</code> and{" "}
						<code>bun run assemble</code> on a PDF first.
					</p>
				) : (
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr className="border-rule border-b text-left text-ink-faint text-xs">
								<th className="py-2 font-normal">Book</th>
								<th className="py-2 font-normal">Source</th>
								<th className="py-2 text-right font-normal">Passages</th>
								<th className="py-2 font-normal">Pages</th>
								<th className="py-2" />
							</tr>
						</thead>
						<tbody>
							{drafts.data?.map((draft) => (
								<tr key={draft.dir} className="border-rule border-b align-middle">
									<td className="py-3">
										<span className="font-mono text-xs">{draft.bookId}</span>
										<span className="block text-ink-faint text-xs">{draft.dir}</span>
									</td>
									<td className="py-3 text-ink-muted">{draft.sourceFile}</td>
									<td className="py-3 text-right tabular-nums">{draft.verses}</td>
									<td className="py-3">
										{draft.hasPages ? (
											<span className="text-ink-muted">rendered</span>
										) : (
											<span className="text-destructive">missing</span>
										)}
									</td>
									<td className="py-3 text-right">
										<Button
											variant={draft.imported ? "outline" : "default"}
											size="sm"
											disabled={importDraft.isPending}
											onClick={() => importDraft.mutate(draft.dir)}
										>
											{draft.imported ? "Re-import" : "Import"}
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}

				{importDraft.isError ? (
					<p role="alert" className="mt-3 text-destructive text-sm">
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
		<div className="mt-4 rounded-lg border border-rule bg-surface p-4 text-sm">
			<p className="mb-2 font-medium">
				{result.firstImport ? "Imported" : "Re-imported"} {String(result.bookId)}
			</p>
			<dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
				{lines
					.filter(([, value]) => value > 0)
					.map(([label, value, why]) => (
						<div key={label} className="flex gap-2">
							<dt className="tabular-nums">
								{value} {label}
							</dt>
							<dd className="text-ink-faint">— {why}</dd>
						</div>
					))}
			</dl>
			{warnings.map((warning) => (
				<p key={warning} className="mt-2 text-destructive text-xs">
					{warning}
				</p>
			))}
		</div>
	);
}
