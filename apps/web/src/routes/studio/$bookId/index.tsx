import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { type AttentionItem, AttentionList } from "#/components/studio/attention-list";
import { type Division, DivisionRow } from "#/components/studio/division-row";
import { ExportButton } from "#/components/studio/export-button";
import { ManifestForm } from "#/components/studio/manifest-form";
import { ProgressMeter } from "#/components/studio/progress-meter";
import { StudioPageHeader } from "#/components/studio/studio-page-header";
import { StudioPanel } from "#/components/studio/studio-panel";
import { buttonVariants } from "#/components/ui/button";
import { useBook } from "#/lib/studio";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/studio/$bookId/")({ component: BookOverview });

type Sequence = {
	first: number | null;
	last: number | null;
	numbered: number;
	unnumbered: number;
	missing: number[];
	duplicates: number[];
	outOfOrder: number[];
};

/**
 * What is true about a book right now (P1.3).
 *
 * Hero → attention → edition → structure → reference. The verse-number sequence is the only
 * checksum this stage of the pipeline has — a passage the OCR dropped leaves no other trace —
 * so it is recomputed from the current rows every time this page loads.
 */
function BookOverview() {
	const { bookId } = Route.useParams();
	const book = useBook(bookId);

	if (book.isPending) return <p className="text-ink-faint text-sm">Loading…</p>;
	if (book.isError) {
		return (
			<p role="alert" className="text-destructive text-sm">
				{book.error.message}
			</p>
		);
	}

	const data = book.data;
	const manifest = data.manifest as {
		title?: { gu?: string; en?: string };
		source?: { edition?: string };
		license?: { id?: string };
		contentVersion?: string;
		contentStatus?: string;
	};
	const imported = data.assembly as {
		sequence: Sequence;
		numbering: { offset: number | null; disagreements: { page: number; printed: number }[] };
		runningHeads: { text: string; pages: number }[];
		pagesAssembled: number[];
	};
	const live = data.sequence as Sequence;

	const sequenceProblems = live.missing.length + live.duplicates.length + live.outOfOrder.length;

	const attention: AttentionItem[] = [];
	for (const need of data.needsHuman) {
		attention.push({ id: `need-${need}`, label: need });
	}
	if (!data.pagesDir) {
		attention.push({
			id: "no-pages",
			label: "No page images linked — the workbench cannot show the ink this text came from.",
		});
	}
	if (live.missing.length > 0) {
		attention.push({
			id: "missing",
			label: (
				<>
					{live.missing.length} missing verse number
					{live.missing.length === 1 ? "" : "s"}:{" "}
					<span className="tabular-nums">{live.missing.join(", ")}</span>
				</>
			),
		});
	}
	if (live.duplicates.length > 0) {
		attention.push({
			id: "duplicates",
			label: (
				<>
					{live.duplicates.length} repeated number
					{live.duplicates.length === 1 ? "" : "s"}:{" "}
					<span className="tabular-nums">{live.duplicates.join(", ")}</span>
				</>
			),
		});
	}
	if (live.outOfOrder.length > 0) {
		attention.push({
			id: "out-of-order",
			label: (
				<>
					{live.outOfOrder.length} out-of-order number
					{live.outOfOrder.length === 1 ? "" : "s"}:{" "}
					<span className="tabular-nums">{live.outOfOrder.join(", ")}</span>
				</>
			),
		});
	}
	if (data.counts.orphaned > 0) {
		attention.push({
			id: "orphaned",
			label: `${data.counts.orphaned} passage${data.counts.orphaned === 1 ? "" : "s"} the newest draft no longer produces — marked, not deleted.`,
		});
	}
	if (data.counts.setAsideUnresolved > 0) {
		attention.push({
			id: "set-aside",
			label: `${data.counts.setAsideUnresolved} held-back block${data.counts.setAsideUnresolved === 1 ? "" : "s"} not yet checked in the workbench.`,
		});
	}
	if (data.counts.raw > 0) {
		attention.push({
			id: "raw",
			label: `${data.counts.raw} unread passage${data.counts.raw === 1 ? "" : "s"} still in the queue.`,
		});
	} else if (data.counts.proofed > 0) {
		attention.push({
			id: "proofed",
			label: `${data.counts.proofed} passage${data.counts.proofed === 1 ? "" : "s"} proofed but not yet approved.`,
		});
	}

	return (
		<div className="space-y-6">
			<StudioPageHeader
				title={
					<span className="font-gujarati">
						{manifest.title?.gu ?? manifest.title?.en ?? data.id}
					</span>
				}
				meta={`${data.id} · ${manifest.contentStatus ?? "draft"} · v${manifest.contentVersion}`}
				actions={
					<Link
						to="/studio/$bookId/proof"
						params={{ bookId }}
						className={cn(buttonVariants({ size: "sm" }), "no-underline")}
					>
						Open workbench
					</Link>
				}
			>
				<div className="max-w-md space-y-3">
					<ProgressMeter counts={data.counts} />
					<ExportButton bookId={bookId} counts={data.counts} needsHuman={data.needsHuman} />
				</div>
			</StudioPageHeader>

			{imported.runningHeads.length > 0 && data.needsHuman.length > 0 ? (
				<p className="text-ink-faint text-xs">
					Evidence for the title — running heads these pages printed:{" "}
					{imported.runningHeads.map((head) => (
						<span key={head.text} className="font-gujarati">
							“{head.text}” ({head.pages}×){" "}
						</span>
					))}
				</p>
			) : null}

			<AttentionList
				items={attention}
				empty="Every passage is approved and the edition fields are filled. Export when ready."
			/>

			<StudioPanel
				title="Edition and rights"
				note="A re-import leaves these alone — they are the one part of a package a machine can never supply."
			>
				<ManifestForm
					bookId={bookId}
					manifest={data.manifest as Record<string, unknown>}
					embedded
				/>
			</StudioPanel>

			<StudioPanel
				title="Structure"
				note="Section ids stay positional until P1.4 can transliterate them."
			>
				<ul className="divide-y divide-rule text-sm">
					{data.divisions.map((division) => (
						<DivisionRow key={division.id} bookId={bookId} division={division as Division} />
					))}
				</ul>
				{(data.counts.notes > 0 || data.counts.setAside > 0) && (
					<p className="mt-4 border-rule border-t pt-3 text-ink-faint text-xs">
						{data.counts.notes} footnotes and {data.counts.setAside} held-back blocks are reviewed
						page by page in the workbench
						{data.counts.setAsideUnresolved > 0
							? ` (${data.counts.setAsideUnresolved} still unchecked)`
							: ""}
						.
					</p>
				)}
			</StudioPanel>

			<div className="grid gap-6 lg:grid-cols-2">
				<StudioPanel
					title="Verse-number sequence"
					note="The only checksum this stage has: a dropped passage leaves no other trace."
					tone={sequenceProblems > 0 ? "warn" : "plain"}
				>
					<SequenceReport sequence={live} />
					{JSON.stringify(live) === JSON.stringify(imported.sequence) ? null : (
						<details className="mt-3 text-ink-faint text-xs">
							<summary className="cursor-pointer">As imported (the machine's own count)</summary>
							<div className="mt-2">
								<SequenceReport sequence={imported.sequence} />
							</div>
						</details>
					)}
				</StudioPanel>

				<StudioPanel
					title="Provenance"
					note="This PDF → these images → this text → this package. Each hop pins the last by hash."
				>
					<dl className="space-y-1.5 text-sm">
						<Row label="Source">{data.sourceFile}</Row>
						<Row label="SHA-256">
							<span className="font-mono text-xs">{data.sourceSha256}</span>
						</Row>
						<Row label="OCR engine">{data.engine ?? "—"}</Row>
						<Row label="Pages">
							{imported.pagesAssembled.length} of {data.bookPageCount} assembled
						</Row>
						<Row label="Page images">
							{data.pagesDir ?? <span className="text-destructive">missing</span>}
						</Row>
						<Row label="Printed folio">
							{imported.numbering.offset === null
								? "no constant offset found"
								: `${imported.numbering.offset} behind the PDF's page number`}
						</Row>
					</dl>
				</StudioPanel>
			</div>
		</div>
	);
}

function SequenceReport({ sequence }: { sequence: Sequence }) {
	const problems: [string, number[]][] = [
		["missing", sequence.missing],
		["repeated", sequence.duplicates],
		["out of order", sequence.outOfOrder],
	];

	return (
		<div className="text-sm">
			<p>
				{sequence.first ?? "—"}–{sequence.last ?? "—"} · {sequence.numbered} numbered ·{" "}
				{sequence.unnumbered} with no printed number
			</p>
			{problems.every(([, values]) => values.length === 0) ? (
				<p className="mt-1 text-ink-muted">No gaps, repeats or jumps.</p>
			) : (
				<ul className="mt-2 space-y-1">
					{problems
						.filter(([, values]) => values.length > 0)
						.map(([label, values]) => (
							<li key={label}>
								<span className="text-ink-faint">{label}:</span>{" "}
								<span className="tabular-nums">{values.join(", ")}</span>
							</li>
						))}
				</ul>
			)}
		</div>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex gap-3">
			<dt className="w-32 shrink-0 text-ink-faint">{label}</dt>
			<dd className="min-w-0 break-all">{children}</dd>
		</div>
	);
}
