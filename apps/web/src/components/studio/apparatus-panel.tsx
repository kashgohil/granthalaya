import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { usePageContext, usePatchNote, useResolveSetAside } from "#/lib/studio-verses";
import { cn } from "#/lib/utils";

/**
 * What else is on this page (P1.3).
 *
 * Two lists, and they mean opposite things.
 *
 * **Footnotes** are real content the pipeline deliberately kept out of the discourse above them.
 * **Held back** is the list that makes “nothing is dropped silently” true rather than claimed.
 */
export function ApparatusPanel({ bookId, page }: { bookId: string; page: number | null }) {
	const context = usePageContext(bookId, page);

	if (page === null) return null;
	if (context.isPending)
		return <p className="text-muted-foreground text-xs">Loading page {page}…</p>;
	if (context.isError) {
		return (
			<p role="alert" className="text-destructive text-xs">
				{context.error.message}
			</p>
		);
	}

	const { notes, setAside } = context.data;
	const unresolved = setAside.filter((block) => !block.resolved).length;

	return (
		<div className="space-y-5 text-sm">
			<section className="space-y-2">
				<div className="flex items-center gap-2">
					<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Footnotes
					</h3>
					<Badge variant="secondary" className="rounded-md tabular-nums">
						{notes.length}
					</Badge>
				</div>
				{notes.length === 0 ? (
					<p className="text-muted-foreground text-xs">None printed below the rule.</p>
				) : (
					<ul className="space-y-2">
						{notes.map((note) => (
							<NoteRow key={note.id} bookId={bookId} note={note} />
						))}
					</ul>
				)}
				<p className="text-[11px] text-muted-foreground">
					Not yet attached to the words that pointed at them — that is layer authoring (P1.4).
				</p>
			</section>

			<section className="space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Held back
					</h3>
					<Badge variant="secondary" className="rounded-md tabular-nums">
						{setAside.length}
					</Badge>
					{unresolved > 0 ? (
						<Badge variant="outline" className="rounded-md border-primary/40 text-primary">
							{unresolved} unchecked
						</Badge>
					) : null}
				</div>
				{setAside.length === 0 ? (
					<p className="text-muted-foreground text-xs">Nothing was set aside on this page.</p>
				) : (
					<ul className="space-y-2">
						{setAside.map((block) => (
							<SetAsideRow key={block.id} bookId={bookId} block={block} />
						))}
					</ul>
				)}
				<p className="text-[11px] text-muted-foreground">
					Confirm each one really is page furniture — not scripture the filters missed.
				</p>
			</section>
		</div>
	);
}

type Note = {
	id: string;
	marker: number | null;
	text: string;
	ocrText: string;
	status: string;
};

function NoteRow({ bookId, note }: { bookId: string; note: Note }) {
	const [text, setText] = useState(note.text);
	const patch = usePatchNote(bookId);

	return (
		<li className="space-y-2 rounded-md border border-border p-2.5">
			<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
				<span>note {note.marker ?? "—"}</span>
				<Badge variant="outline" className="ml-auto rounded-sm capitalize">
					{note.status}
				</Badge>
			</div>
			<Textarea
				value={text}
				onChange={(event) => setText(event.target.value)}
				onBlur={() => {
					if (text !== note.text) patch.mutate({ noteId: note.id, text });
				}}
				rows={2}
				dir="auto"
				className="min-h-14 bg-paper font-gujarati"
			/>
			<Button
				variant="link"
				size="sm"
				className="h-auto px-0 text-xs"
				onClick={() => patch.mutate({ noteId: note.id, status: "approved" })}
			>
				Approve note
			</Button>
		</li>
	);
}

type SetAside = {
	id: string;
	blockId: string;
	tag: string;
	text: string;
	resolved: boolean;
	note: string | null;
};

function SetAsideRow({ bookId, block }: { bookId: string; block: SetAside }) {
	const resolve = useResolveSetAside(bookId);
	const id = `set-aside-${block.id}`;

	return (
		<li
			className={cn(
				"space-y-2 rounded-md border p-2.5 transition-[opacity,border-color,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
				block.resolved ? "border-border opacity-60" : "border-primary/40 bg-accent",
			)}
		>
			<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
				<Badge variant="outline" className="rounded-sm font-mono text-[10px]">
					{block.tag}
				</Badge>
				<span className="font-mono">{block.blockId}</span>
			</div>
			<p className="whitespace-pre-wrap break-words font-gujarati text-xs leading-relaxed">
				{block.text}
			</p>
			<div className="flex items-center gap-2">
				<Checkbox
					id={id}
					checked={block.resolved}
					onCheckedChange={(checked) =>
						resolve.mutate({ blockId: block.id, resolved: checked === true })
					}
				/>
				<Label htmlFor={id} className="cursor-pointer text-xs font-normal">
					Checked — this is not scripture
				</Label>
			</div>
		</li>
	);
}
