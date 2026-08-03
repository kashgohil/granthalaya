import { useState } from "react";
import { usePageContext, usePatchNote, useResolveSetAside } from "#/lib/studio-verses";

/**
 * What else is on this page (P1.3).
 *
 * Two lists, and they mean opposite things.
 *
 * **Footnotes** are real content the pipeline deliberately kept out of the discourse above them.
 * They are proofread here — but not attached to the words that pointed at them, because pairing a
 * gloss to a word decides meaning rather than text, and a wrong pairing is invisible to every
 * check this pipeline has. That is layer authoring, and it happens in P1.4.
 *
 * **Held back** is the list that makes “nothing is dropped silently” true rather than claimed. It
 * is also the backstop for the one hazard the filters cannot catch: asked to read a decorative
 * glyph, the OCR once answered with an English *description* of it, tagged `paragraph`. The
 * script filter caught that one. The same sentence written in Gujarati would have gone straight
 * into a verse, and only a human looking at the page would know.
 */
export function ApparatusPanel({ bookId, page }: { bookId: string; page: number | null }) {
	const context = usePageContext(bookId, page);

	if (page === null) return null;
	if (context.isPending) return <p className="text-ink-faint text-xs">Loading page {page}…</p>;
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
		<div className="space-y-4 text-sm">
			<section>
				<h3 className="font-medium text-xs uppercase tracking-wide text-ink-faint">
					Footnotes on this page ({notes.length})
				</h3>
				{notes.length === 0 ? (
					<p className="mt-1 text-ink-faint text-xs">None printed below the rule.</p>
				) : (
					<ul className="mt-2 space-y-2">
						{notes.map((note) => (
							<NoteRow key={note.id} bookId={bookId} note={note} />
						))}
					</ul>
				)}
				<p className="mt-2 text-ink-faint text-[11px]">
					Not yet attached to the words that pointed at them — that is layer authoring (P1.4), with
					a human deciding which gloss belongs to which word.
				</p>
			</section>

			<section>
				<h3 className="font-medium text-xs uppercase tracking-wide text-ink-faint">
					Held back by the pipeline ({setAside.length}
					{unresolved > 0 ? `, ${unresolved} unchecked` : ""})
				</h3>
				{setAside.length === 0 ? (
					<p className="mt-1 text-ink-faint text-xs">Nothing was set aside on this page.</p>
				) : (
					<ul className="mt-2 space-y-2">
						{setAside.map((block) => (
							<SetAsideRow key={block.id} bookId={bookId} block={block} />
						))}
					</ul>
				)}
				<p className="mt-2 text-ink-faint text-[11px]">
					Confirm each one really is page furniture. A description of an illustration written in
					Gujarati would pass every automated filter and land in a verse.
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
		<li className="rounded-md border border-rule p-2">
			<div className="mb-1 flex items-center gap-2 text-ink-faint text-[11px]">
				<span>note {note.marker ?? "—"}</span>
				<span className="ml-auto">{note.status}</span>
			</div>
			<textarea
				value={text}
				onChange={(event) => setText(event.target.value)}
				onBlur={() => {
					if (text !== note.text) patch.mutate({ noteId: note.id, text });
				}}
				rows={2}
				dir="auto"
				className="w-full resize-y rounded-sm border border-rule bg-paper p-2 font-gujarati text-sm leading-relaxed outline-none focus:border-brand"
			/>
			<button
				type="button"
				className="mt-1 text-ink-muted text-xs underline"
				onClick={() => patch.mutate({ noteId: note.id, status: "approved" })}
			>
				Approve note
			</button>
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

	return (
		<li
			className={`rounded-md border p-2 ${
				block.resolved ? "border-rule opacity-60" : "border-brand bg-brand-wash"
			}`}
		>
			<div className="mb-1 flex items-center gap-2 text-[11px] text-ink-faint">
				<code className="text-[11px]">{block.tag}</code>
				<span>{block.blockId}</span>
			</div>
			<p className="whitespace-pre-wrap break-words font-gujarati text-xs leading-relaxed">
				{block.text}
			</p>
			<label className="mt-1.5 flex items-center gap-2 text-xs">
				<input
					type="checkbox"
					checked={block.resolved}
					onChange={(event) =>
						resolve.mutate({ blockId: block.id, resolved: event.target.checked })
					}
				/>
				Checked — this is not scripture
			</label>
		</li>
	);
}
