import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { usePatchDivision } from "#/lib/studio";

export type Division = {
	id: string;
	title: unknown;
	number: string | null;
	kind: string;
	endMarker: string | null;
	verses: number;
};

/**
 * A section, and its title once a human can read one off the page.
 *
 * `assemble` only captures a title where the OCR tagged a `section-title` block, so the first
 * section of a book routinely has none — the one before the first heading. The id stays positional
 * (`section-1`) until P1.4 can transliterate the Gujarati, and a re-import never overwrites what is
 * typed here: it is one of the fields only a human can supply.
 */
export function DivisionRow({ bookId, division }: { bookId: string; division: Division }) {
	const title = division.title as { gu?: string; en?: string } | null;
	const [editing, setEditing] = useState(false);
	const [gu, setGu] = useState(title?.gu ?? "");
	const [en, setEn] = useState(title?.en ?? "");
	const patch = usePatchDivision(bookId);

	if (editing) {
		return (
			<li className="py-2">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-mono text-ink-faint text-xs">{division.id}</span>
					<Input
						value={gu}
						onChange={(event) => setGu(event.target.value)}
						placeholder="Title as printed"
						className="max-w-64 font-gujarati"
						dir="auto"
					/>
					<Input
						value={en}
						onChange={(event) => setEn(event.target.value)}
						placeholder="English"
						className="max-w-48"
					/>
					<Button
						size="sm"
						disabled={patch.isPending}
						onClick={() =>
							patch.mutate(
								{
									divisionId: division.id,
									title: {
										...(gu.trim() === "" ? {} : { gu: gu.trim() }),
										...(en.trim() === "" ? {} : { en: en.trim() }),
									},
								},
								{ onSuccess: () => setEditing(false) },
							)
						}
					>
						Save
					</Button>
					<Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
						Cancel
					</Button>
				</div>
				{division.endMarker === null ? null : (
					<p className="mt-1 font-gujarati text-ink-faint text-xs">
						Closed by: {division.endMarker}
					</p>
				)}
				{patch.isError ? (
					<p role="alert" className="mt-1 text-destructive text-xs">
						{patch.error.message}
					</p>
				) : null}
			</li>
		);
	}

	return (
		<li className="flex items-baseline gap-3 py-2">
			<span className="font-mono text-ink-faint text-xs">{division.id}</span>
			<span className="font-gujarati">
				{title?.gu ?? title?.en ?? <span className="text-ink-faint italic">untitled</span>}
			</span>
			<button
				type="button"
				className="text-ink-muted text-xs underline"
				onClick={() => setEditing(true)}
			>
				{title?.gu === undefined && title?.en === undefined ? "Add a title" : "Retitle"}
			</button>
			<span className="ml-auto text-ink-muted tabular-nums">{division.verses} passages</span>
		</li>
	);
}
