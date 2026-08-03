import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { StudioError } from "#/lib/studio";
import { usePublishBook } from "#/lib/studio-verses";

/** The shape `publishBook` answers with — the fields this screen actually renders. */
type PublishResult = {
	readonly ok?: boolean;
	readonly contentVersion?: string;
	readonly file?: string | null;
	readonly sha256?: string;
	readonly bytes?: number;
	readonly verses?: number;
	readonly warnings?: readonly string[];
	readonly diff?: {
		readonly versesAdded: readonly string[];
		readonly versesRetired: readonly string[];
		readonly versesChanged: readonly string[];
		readonly refsAliased: readonly string[];
	};
};

/**
 * Hand a proofed package to the catalog (P1.5).
 *
 * Two buttons, because publishing is the one irreversible step in the studio: a version is
 * written once, and a client that installs it holds those bytes forever. **Check** is the same
 * code path stopped one line short of writing — every refusal, the exact SHA-256, and the
 * cross-version diff — so the preview cannot disagree with the thing it previews.
 *
 * The version defaults to the manifest's, which is what export named the file. Publishing a
 * version this book has already published is refused by the server; the field is here because a
 * correction is a *new* version and typing it is the moment to decide which field moves.
 */
export function PublishButton({
	bookId,
	contentVersion,
	published,
}: {
	bookId: string;
	contentVersion: string;
	published: readonly string[];
}) {
	const publish = usePublishBook(bookId);
	const [version, setVersion] = useState(contentVersion);
	const [reasons, setReasons] = useState<string[] | null>(null);
	const [result, setResult] = useState<PublishResult | null>(null);

	const already = published.includes(version);

	const run = (dryRun: boolean) => {
		setReasons(null);
		setResult(null);
		publish.mutate(
			{ contentVersion: version, ...(dryRun ? { dryRun: true } : {}) },
			{
				onSuccess: (value) => setResult(value as PublishResult),
				onError: (error) => {
					const message = error instanceof StudioError ? error.message : String(error);
					// Refusals arrive as one message per reason, joined with newlines.
					setReasons(message.split("\n").filter((line) => line.length > 0));
				},
			},
		);
	};

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-2">
				<label className="text-ink-faint text-xs" htmlFor="publish-version">
					Version
				</label>
				<Input
					id="publish-version"
					value={version}
					onChange={(event) => setVersion(event.target.value)}
					className="h-8 w-28 font-mono text-xs"
					aria-label="Content version to publish"
				/>
				<Button
					variant="outline"
					size="sm"
					disabled={publish.isPending}
					onClick={() => run(true)}
					title="Run every check and show the diff against the published version. Writes nothing."
				>
					Check
				</Button>
				<Button
					size="sm"
					disabled={publish.isPending || already}
					onClick={() => run(false)}
					title={
						already
							? `v${version} is already published — a correction is a new version.`
							: "Publish these bytes to the catalog. A version is written once."
					}
				>
					{publish.isPending ? "Working…" : "Publish"}
				</Button>
			</div>

			{already ? (
				<p className="text-ink-faint text-xs">
					v{version} is already published. Bump the version to publish a correction.
				</p>
			) : null}

			{result?.ok === true ? <PublishReport result={result} /> : null}

			{reasons !== null ? (
				<ul className="list-disc space-y-1 pl-4 text-destructive text-xs">
					{reasons.map((reason) => (
						<li key={reason}>{reason}</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

function PublishReport({ result }: { result: PublishResult }) {
	const diff = result.diff;

	return (
		<div className="space-y-1 text-xs">
			<p className="text-ink-muted">
				{result.file === null ? "Would publish" : "Published"} v{result.contentVersion} ·{" "}
				{result.verses} passages · {Math.round((result.bytes ?? 0) / 1024)} KB
			</p>
			<p className="break-all font-mono text-ink-faint">sha256 {result.sha256}</p>
			{diff !== undefined ? (
				<p className="text-ink-muted">
					Against the published version: {diff.versesChanged.length} corrected,{" "}
					{diff.versesAdded.length} added, {diff.versesRetired.length} retired
					{diff.refsAliased.length > 0 ? ` (${diff.refsAliased.length} aliased)` : ""}.
				</p>
			) : null}
			{(result.warnings ?? []).map((warning) => (
				<p key={warning} className="text-ink-muted">
					{warning}
				</p>
			))}
		</div>
	);
}
