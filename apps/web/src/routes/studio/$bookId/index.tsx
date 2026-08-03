import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { type Division, DivisionRow } from "#/components/studio/division-row";
import { ManifestForm } from "#/components/studio/manifest-form";
import { ProgressMeter } from "#/components/studio/progress-meter";
import { useBook } from "#/lib/studio";

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
 * The screen is built around one contrast: **what the machine concluded when it was imported**,
 * beside **what is true now**. The verse-number sequence is the only checksum this stage of the
 * pipeline has — a passage the OCR dropped leaves no other trace, because the text simply reads
 * on — so it is recomputed from the current rows every time this page loads. Fixing a gap in the
 * workbench makes it disappear here, which is what turns a report into an instrument.
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

	return (
		<div className="space-y-8">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="display-title font-gujarati text-2xl">
						{manifest.title?.gu ?? manifest.title?.en ?? data.id}
					</h1>
					<p className="mt-1 font-mono text-ink-faint text-xs">
						{data.id} · {manifest.contentStatus ?? "draft"} · v{manifest.contentVersion}
					</p>
				</div>
				<Link
					to="/studio/$bookId/proof"
					params={{ bookId }}
					className="rounded-md bg-brand px-4 py-2 font-medium text-brand-ink text-sm no-underline"
				>
					Open the workbench
				</Link>
			</header>

			<ProgressMeter counts={data.counts} className="max-w-md" />

			{data.needsHuman.length > 0 ? (
				<Panel
					title="Only you can supply these"
					note="`assemble` writes `unknown` rather than inventing them. Export refuses while any remain."
					tone="warn"
				>
					<ul className="list-disc space-y-1 pl-5 text-sm">
						{data.needsHuman.map((need) => (
							<li key={need}>{need}</li>
						))}
					</ul>
					{imported.runningHeads.length > 0 ? (
						<p className="mt-3 text-ink-faint text-xs">
							Evidence for the title — the running heads these pages printed:{" "}
							{imported.runningHeads.map((head) => (
								<span key={head.text} className="font-gujarati">
									“{head.text}” ({head.pages}×){" "}
								</span>
							))}
						</p>
					) : null}
				</Panel>
			) : null}

			<ManifestForm bookId={bookId} manifest={data.manifest as Record<string, unknown>} />

			<div className="grid gap-6 lg:grid-cols-2">
				<Panel
					title="Verse-number sequence, now"
					note="The only checksum this stage has: a dropped passage leaves no other trace."
					tone={
						live.missing.length + live.duplicates.length + live.outOfOrder.length > 0
							? "warn"
							: "plain"
					}
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
				</Panel>

				<Panel
					title="Provenance"
					note="This PDF → these images → this text → this package. Each hop pins the last by hash."
				>
					<dl className="space-y-1 text-sm">
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
				</Panel>
			</div>

			<Panel
				title="Structure"
				note="Section ids stay positional until P1.4 can transliterate them."
			>
				<ul className="divide-y divide-rule text-sm">
					{data.divisions.map((division) => (
						<DivisionRow key={division.id} bookId={bookId} division={division as Division} />
					))}
				</ul>
			</Panel>

			<Panel
				title="Held back by the pipeline"
				note="Nothing is dropped silently — a silent drop is indistinguishable from text the OCR never saw."
			>
				<p className="text-sm">
					{data.counts.notes} footnotes kept out of the discourse, and {data.counts.setAside} blocks
					set aside ({data.counts.setAsideUnresolved} not yet looked at). Both are reviewed page by
					page in the workbench.
				</p>
				{data.counts.orphaned > 0 ? (
					<p className="mt-2 text-destructive text-sm">
						{data.counts.orphaned} passages the newest draft no longer produces. Marked, not
						deleted.
					</p>
				) : null}
			</Panel>
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

function Panel({
	title,
	note,
	tone = "plain",
	children,
}: {
	title: string;
	note?: string;
	tone?: "plain" | "warn";
	children: ReactNode;
}) {
	return (
		<section
			className={`rounded-lg border p-5 ${
				tone === "warn" ? "border-brand bg-brand-wash" : "border-rule bg-surface"
			}`}
		>
			<h2 className="font-medium text-base">{title}</h2>
			{note ? <p className="mt-0.5 mb-3 text-ink-faint text-xs">{note}</p> : null}
			{children}
		</section>
	);
}
