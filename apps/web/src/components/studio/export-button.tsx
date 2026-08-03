import { useState } from "react";
import { Button } from "#/components/ui/button";
import { StudioError } from "#/lib/studio";
import { useExportBook } from "#/lib/studio-verses";

type Counts = { raw: number; proofed: number; approved: number; total: number };

/**
 * Compile a proofed package from the database.
 *
 * The server is the gate — client reasons are a convenience so the button is not a surprise
 * 409. On refusal we surface the API's list of reasons rather than inventing our own.
 */
export function ExportButton({
	bookId,
	counts,
	needsHuman,
}: {
	bookId: string;
	counts: Counts;
	needsHuman: readonly string[];
}) {
	const exportBook = useExportBook(bookId);
	const [reasons, setReasons] = useState<string[] | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const clientReasons: string[] = [];
	if (counts.total === 0) clientReasons.push("This book has no passages.");
	if (counts.approved !== counts.total) {
		clientReasons.push(
			`${counts.total - counts.approved} of ${counts.total} passages are not approved yet.`,
		);
	}
	if (needsHuman.length > 0) {
		clientReasons.push(`${needsHuman.length} edition fields still need a human.`);
	}

	const ready = clientReasons.length === 0;

	const run = () => {
		setReasons(null);
		setSuccess(null);
		exportBook.mutate(
			{},
			{
				onSuccess: (result) => {
					const value = result as {
						ok?: boolean;
						file?: string;
						contentVersion?: string;
						verses?: number;
					};
					if (value.ok === true) {
						setSuccess(
							`Wrote ${value.file ?? "package"} · v${value.contentVersion} · ${value.verses} passages`,
						);
					}
				},
				onError: (error) => {
					const message = error instanceof StudioError ? error.message : String(error);
					// Export refusals arrive as one message per reason, joined with newlines.
					setReasons(message.split("\n").filter((line) => line.length > 0));
				},
			},
		);
	};

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={!ready || exportBook.isPending}
					onClick={run}
					title={ready ? "Re-derive a proofed package from the database" : clientReasons.join(" ")}
				>
					{exportBook.isPending ? "Exporting…" : "Export package"}
				</Button>
				{!ready ? (
					<span className="text-ink-faint text-xs">
						{clientReasons[0]}
						{clientReasons.length > 1 ? ` (+${clientReasons.length - 1} more)` : ""}
					</span>
				) : null}
			</div>
			{success !== null ? <p className="text-ink-muted text-xs">{success}</p> : null}
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
