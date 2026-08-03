import {
	checkOrthography,
	fontFamilyStack,
	normalizeScriptureText,
	resolveTextStyle,
} from "@granthalaya/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	useDeleteVerse,
	useInsertVerse,
	useMergeVerse,
	usePatchVerse,
	useRenumberVerse,
	useSplitVerse,
	type VerseStatus,
} from "#/lib/studio-verses";

/** The Latin-equivalent size the reader starts from; core derives Gujarati's from it. */
const BODY_SIZE = 18;

export type VerseData = {
	key: string;
	divisionId: string;
	id: string;
	ref: string;
	number: string | null;
	form: string;
	text: string;
	ocrText: string;
	status: VerseStatus;
	ocrChanged: boolean;
	orphaned: boolean;
	origin: string;
	note: string | null;
	confidence: number | null;
	flags: unknown;
	pages: unknown;
	repairs: unknown;
	orthography: unknown;
	previous: { divisionId: string; id: string } | null;
	next: { divisionId: string; id: string } | null;
};

type Repair = { kind: string; before: string; after: string; context: string };

/**
 * One passage, and everything a human needs to decide whether it is right (P1.3).
 *
 * The editing surface is set through `resolveTextStyle`/`fontFamilyStack` — the same calls the
 * reader makes — so the text is proofed at the metrics it will be read at, in the face it will be
 * read in, with no letter-spacing (which would split conjuncts) and the leading the P0.3 band
 * requires. Proofing Gujarati in a 13px monospace box would be proofing something else.
 *
 * Three affordances beyond the textarea, each earning its place:
 *
 * - **Orthography, live.** `checkOrthography` is platform-pure, so the gate that scored the page
 *   at OCR time scores every keystroke here. It cannot tell you the right word was read; it can
 *   tell you a word Gujarati cannot spell has just been typed.
 * - **The repairs list.** Normalization is a no-op on clean text and reports every change it did
 *   make, which turns "re-read this passage" into "re-read these six places".
 * - **Structure.** A dropped `॥૬૨॥` welds two passages together and no amount of text editing
 *   fixes it.
 */
export function VerseEditor({
	bookId,
	verse,
	onMoved,
}: {
	bookId: string;
	verse: VerseData;
	onMoved: (target: { divisionId: string; verseId: string } | null) => void;
}) {
	const [text, setText] = useState(verse.text);
	const [number, setNumber] = useState(verse.number ?? "");
	const [note, setNote] = useState(verse.note ?? "");
	const [showOcr, setShowOcr] = useState(false);
	const area = useRef<HTMLTextAreaElement>(null);

	const patch = usePatchVerse(bookId);
	const split = useSplitVerse(bookId);
	const merge = useMergeVerse(bookId);
	const renumber = useRenumberVerse(bookId);
	const remove = useDeleteVerse(bookId);
	const insert = useInsertVerse(bookId);

	// Moving to another passage must not carry the last one's draft with it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset when the passage changes
	useEffect(() => {
		setText(verse.text);
		setNumber(verse.number ?? "");
		setNote(verse.note ?? "");
		setShowOcr(false);
	}, [verse.ref]);

	const dirty = text !== verse.text || note !== (verse.note ?? "");
	const orthography = useMemo(() => checkOrthography(text, "gujr"), [text]);
	const style = resolveTextStyle({
		script: "gujr",
		baseFontSize: BODY_SIZE,
		form: verse.form === "verse" ? "verse" : "prose",
	});
	const repairs = (verse.repairs as Repair[]) ?? [];
	const flags = (verse.flags as string[]) ?? [];
	const pages = (verse.pages as number[]) ?? [];

	const save = (extra: { status?: VerseStatus } = {}) =>
		patch.mutate({
			divisionId: verse.divisionId,
			verseId: verse.id,
			...(text === verse.text ? {} : { text }),
			note: note === "" ? null : note,
			...extra,
		});

	const approveAndAdvance = () => {
		save({ status: "approved" });
		onMoved(
			verse.next === null ? null : { divisionId: verse.next.divisionId, verseId: verse.next.id },
		);
	};

	return (
		<div className="flex h-full flex-col gap-4">
			<header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span className="font-mono text-sm">{verse.ref}</span>
				<StatusPill status={verse.status} />
				{verse.confidence === null ? null : (
					<span className="text-ink-faint text-xs tabular-nums">
						confidence {verse.confidence.toFixed(2)}
					</span>
				)}
				<span className="text-ink-faint text-xs">
					{pages.length === 0 ? "no page" : `page ${pages.join(", ")}`}
				</span>
				{flags.map((flag) => (
					<span key={flag} className="rounded-sm bg-sunken px-1.5 py-0.5 text-ink-muted text-xs">
						{flag}
					</span>
				))}
				{verse.origin === "imported" ? null : (
					<span className="rounded-sm bg-brand-wash px-1.5 py-0.5 text-brand text-xs">
						{verse.origin} by hand
					</span>
				)}
			</header>

			{verse.ocrChanged ? (
				<Callout tone="warn">
					A re-import brought different OCR text for this passage after you had edited it. Your
					reading is what is in the box; the machine's is under “OCR text”. Resolve the disagreement
					and approve.
				</Callout>
			) : null}
			{verse.orphaned ? (
				<Callout tone="warn">
					The newest draft no longer produces this passage. It is kept, not deleted — a passage that
					vanishes between two runs is what the number checksum exists to catch.
				</Callout>
			) : null}

			<textarea
				ref={area}
				value={text}
				onChange={(event) => setText(event.target.value)}
				spellCheck={false}
				dir="auto"
				// What the workbench's `e` shortcut focuses.
				data-verse-text=""
				className="min-h-64 flex-1 resize-y rounded-md border border-rule bg-paper p-4 text-ink outline-none focus:border-brand"
				style={{
					fontFamily: fontFamilyStack("body")
						.map((name) => (name.includes(" ") ? `"${name}"` : name))
						.join(", "),
					fontSize: `${style.fontSize}px`,
					lineHeight: `${style.lineHeight}px`,
					// Never on Gujarati: it splits conjuncts. `resolveTextStyle` already returns 0
					// for Indic scripts, and setting it from there rather than omitting it keeps the
					// rule in one place.
					letterSpacing: `${style.letterSpacing}px`,
					textAlign: style.textAlign,
					whiteSpace: style.preserveLineBreaks ? "pre-wrap" : "pre-wrap",
					hyphens: "none",
				}}
			/>

			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className={orthography.ok ? "text-ink-faint" : "font-medium text-destructive"}>
					{orthography.ok
						? "Orthography clean"
						: `${orthography.count} impossible sequences (${orthography.rate.toFixed(1)} per 1000)`}
				</span>
				{orthography.ok ? null : (
					<span className="text-ink-faint text-xs">
						{orthography.violations
							.slice(0, 3)
							.map((violation) => violation.sample)
							.join(" · ")}
					</span>
				)}
				<button
					type="button"
					className="ml-auto text-ink-muted text-xs underline"
					onClick={() =>
						setText(
							normalizeScriptureText(text, {
								script: "gujr",
								joinLines: verse.form !== "verse",
							}).text,
						)
					}
					title="Runs the same pass `assemble` ran. It is a no-op on clean text."
				>
					Normalize
				</button>
				<button
					type="button"
					className="text-ink-muted text-xs underline"
					onClick={() => setShowOcr((value) => !value)}
				>
					{showOcr ? "Hide OCR text" : "OCR text"}
				</button>
			</div>

			{showOcr ? (
				<pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-rule bg-sunken p-3 font-gujarati text-sm">
					{verse.ocrText === ""
						? "(typed in by hand — the OCR never produced this)"
						: verse.ocrText}
				</pre>
			) : null}

			{repairs.length > 0 ? (
				<details className="rounded-md border border-rule p-3 text-sm">
					<summary className="cursor-pointer text-ink-muted">
						{repairs.length} normalization {repairs.length === 1 ? "repair" : "repairs"} — check
						exactly these places
					</summary>
					<ul className="mt-2 space-y-1.5">
						{repairs.map((repair) => (
							<li key={`${repair.kind}-${repair.context}`} className="text-xs">
								<span className="text-ink-faint">{repair.kind}:</span>{" "}
								<span className="font-gujarati">{repair.context}</span>{" "}
								<span className="text-ink-faint">
									({repair.before || "∅"} → {repair.after || "∅"})
								</span>
							</li>
						))}
					</ul>
				</details>
			) : null}

			<div className="flex flex-wrap items-end gap-3 border-rule border-t pt-4">
				<div className="text-sm">
					<label htmlFor="verse-number" className="mb-1 block text-ink-faint text-xs">
						Printed number
					</label>
					<Input
						id="verse-number"
						value={number}
						onChange={(event) => setNumber(event.target.value)}
						onBlur={() => {
							const next = number.trim() === "" ? null : number.trim();
							if (next !== verse.number) {
								renumber.mutate(
									{ divisionId: verse.divisionId, verseId: verse.id, number: next },
									{
										// The id follows the number, so the passage this component is
										// showing is about to be at a different address.
										onSuccess: (result) =>
											onMoved({
												divisionId: verse.divisionId,
												verseId: (result as { id: string }).id,
											}),
									},
								);
							}
						}}
						className="w-28 font-gujarati"
						placeholder="૬૨"
					/>
				</div>

				<div className="ml-auto flex flex-wrap gap-2">
					<Button variant="outline" size="sm" onClick={() => save()} disabled={!dirty}>
						{dirty ? "Save" : "Saved"}
					</Button>
					<Button variant="outline" size="sm" onClick={() => save({ status: "proofed" })}>
						Mark proofed
					</Button>
					<Button size="sm" onClick={approveAndAdvance}>
						Approve and next
					</Button>
				</div>
			</div>

			<StructureActions
				verse={verse}
				busy={split.isPending || merge.isPending || remove.isPending || insert.isPending}
				onSplit={() => {
					const offset = area.current?.selectionStart ?? 0;
					split.mutate(
						{ divisionId: verse.divisionId, verseId: verse.id, offset },
						{ onSuccess: () => onMoved({ divisionId: verse.divisionId, verseId: verse.id }) },
					);
				}}
				onMerge={(direction) =>
					merge.mutate(
						{ divisionId: verse.divisionId, verseId: verse.id, direction },
						{
							onSuccess: (result) =>
								onMoved({
									divisionId: verse.divisionId,
									verseId: (result as { survivor: string }).survivor,
								}),
						},
					)
				}
				onDelete={() =>
					remove.mutate(
						{ divisionId: verse.divisionId, verseId: verse.id },
						{
							onSuccess: () =>
								onMoved(
									verse.next === null
										? null
										: { divisionId: verse.next.divisionId, verseId: verse.next.id },
								),
						},
					)
				}
				onInsert={(text, number) =>
					insert.mutate(
						{
							divisionId: verse.divisionId,
							afterVerseId: verse.id,
							text,
							number,
						},
						{
							onSuccess: (result) =>
								onMoved({
									divisionId: verse.divisionId,
									verseId: (result as { id: string }).id,
								}),
						},
					)
				}
			/>

			<div className="text-sm">
				<label htmlFor="verse-note" className="mb-1 block text-ink-faint text-xs">
					Your note — a doubt, a question, something for layer authoring
				</label>
				<textarea
					id="verse-note"
					value={note}
					onChange={(event) => setNote(event.target.value)}
					onBlur={() => {
						if (note !== (verse.note ?? "")) save();
					}}
					rows={2}
					className="w-full resize-y rounded-md border border-rule bg-surface p-2 text-sm outline-none focus:border-brand"
				/>
			</div>

			{[patch, split, merge, renumber, remove, insert].map((mutation) =>
				mutation.isError ? (
					<p key={mutation.error.message} role="alert" className="text-destructive text-sm">
						{mutation.error.message}
					</p>
				) : null,
			)}
		</div>
	);
}

function StructureActions({
	verse,
	busy,
	onSplit,
	onMerge,
	onDelete,
	onInsert,
}: {
	verse: VerseData;
	busy: boolean;
	onSplit: () => void;
	onMerge: (direction: "previous" | "next") => void;
	onDelete: () => void;
	onInsert: (text: string, number: string | null) => void;
}) {
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [inserting, setInserting] = useState(false);
	const [draft, setDraft] = useState("");
	const [draftNumber, setDraftNumber] = useState("");

	return (
		<div className="rounded-md bg-sunken px-3 py-2 text-xs">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-ink-faint">Structure</span>
				<Button variant="ghost" size="sm" disabled={busy} onClick={onSplit}>
					Split at cursor
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={busy || verse.previous === null}
					onClick={() => onMerge("previous")}
					title="The earlier passage survives: in a printed book the number closes a passage."
				>
					Merge into previous
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={busy || verse.next === null}
					onClick={() => onMerge("next")}
				>
					Absorb next
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={() => setInserting((value) => !value)}
					title="For a passage the OCR missed entirely — the gap the number checksum reports."
				>
					Insert after
				</Button>
				{confirmingDelete ? (
					<>
						<span className="text-destructive">Delete this passage?</span>
						<Button variant="destructive" size="sm" disabled={busy} onClick={onDelete}>
							Yes, delete
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
							Cancel
						</Button>
					</>
				) : (
					<Button
						variant="ghost"
						size="sm"
						className="ml-auto text-destructive"
						onClick={() => setConfirmingDelete(true)}
						title="For a block that is not text at all — a caption, a running head the filter missed."
					>
						Delete
					</Button>
				)}
			</div>

			{inserting ? (
				<div className="mt-2 border-rule border-t pt-2">
					<p className="mb-2 text-ink-faint">
						A passage the OCR never produced — type it from the page image. It gets no pixel boxes,
						because there is nothing to line it up against.
					</p>
					<textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						rows={4}
						dir="auto"
						placeholder="The passage as printed"
						className="w-full resize-y rounded-sm border border-rule bg-paper p-2 font-gujarati text-sm leading-relaxed outline-none focus:border-brand"
					/>
					<div className="mt-2 flex items-center gap-2">
						<Input
							value={draftNumber}
							onChange={(event) => setDraftNumber(event.target.value)}
							placeholder="૬૪"
							className="w-24 font-gujarati"
						/>
						<Button
							size="sm"
							disabled={busy || draft.trim() === ""}
							onClick={() => {
								onInsert(draft.trim(), draftNumber.trim() === "" ? null : draftNumber.trim());
								setDraft("");
								setDraftNumber("");
								setInserting(false);
							}}
						>
							Insert
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setInserting(false)}>
							Cancel
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}

function StatusPill({ status }: { status: VerseStatus }) {
	const tone =
		status === "approved"
			? "bg-brand text-brand-ink"
			: status === "proofed"
				? "bg-brand-wash text-brand"
				: "bg-sunken text-ink-muted";
	return <span className={`rounded-sm px-1.5 py-0.5 text-xs ${tone}`}>{status}</span>;
}

function Callout({ tone, children }: { tone: "warn"; children: React.ReactNode }) {
	return (
		<p
			className={`rounded-md p-3 text-sm ${tone === "warn" ? "border border-brand bg-brand-wash" : ""}`}
		>
			{children}
		</p>
	);
}
