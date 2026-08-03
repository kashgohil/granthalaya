import {
	checkOrthography,
	fontFamilyStack,
	normalizeScriptureText,
	resolveTextStyle,
} from "@granthalaya/core";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flagDescription, flagLabel, STATUS_HELP } from "#/components/studio/flag-help";
import { Hint, InfoTip } from "#/components/studio/info-tip";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import {
	useDeleteVerse,
	useInsertVerse,
	useMergeVerse,
	usePatchVerse,
	useRenumberVerse,
	useSplitVerse,
	type VerseStatus,
} from "#/lib/studio-verses";
import { cn } from "#/lib/utils";

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
 * Layout (top → bottom):
 * 1. Identity — ref, status, page/confidence, flags (never one crowded line)
 * 2. Text — the proof surface
 * 3. Decide — number + save / proofed / approve
 * 4. Tools — accordion for OCR, repairs, structure, note, apparatus
 */
export function VerseEditor({
	bookId,
	verse,
	onMoved,
	apparatus,
}: {
	bookId: string;
	verse: VerseData;
	onMoved: (target: { divisionId: string; verseId: string } | null) => void;
	/** Page apparatus (footnotes / held-back), owned by the workbench route. */
	apparatus?: ReactNode;
}) {
	const [text, setText] = useState(verse.text);
	const [number, setNumber] = useState(verse.number ?? "");
	const [note, setNote] = useState(verse.note ?? "");
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

	const pageMeta =
		pages.length === 0
			? "No page image"
			: pages.length === 1
				? `Page ${pages[0]}`
				: `Pages ${pages[0]}–${pages[pages.length - 1]} · ${pages.length} pages`;

	const defaultOpen = [...(repairs.length > 0 ? ["repairs"] : []), ...(verse.note ? ["note"] : [])];

	return (
		// Block flow inside the workbench's overflow-y-auto scroller — never h-full/flex-1
		// here. Flex-grow + field-sizing textareas were stacking content on top of Decide/Tools.
		<div className="flex flex-col gap-5 pb-2">
			{/* ── 1. Identity ───────────────────────────────────────────────── */}
			<header className="space-y-3">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 space-y-1">
						<p className="truncate font-mono text-base font-semibold tracking-tight text-foreground">
							{verse.ref}
						</p>
						<p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
							{pages.length > 1 ? (
								<Hint content={`Spans pages ${pages.join(", ")}.`}>
									<span className="cursor-default">{pageMeta}</span>
								</Hint>
							) : (
								<span>{pageMeta}</span>
							)}
							{verse.confidence !== null ? (
								<>
									<span className="text-border" aria-hidden>
										·
									</span>
									<span className="inline-flex items-center gap-0.5 tabular-nums">
										Confidence {verse.confidence.toFixed(2)}
										<InfoTip label="About confidence">
											Machine trust from assembly. Lower scores mean re-read carefully against the
											page.
										</InfoTip>
									</span>
								</>
							) : null}
							{verse.origin !== "imported" ? (
								<>
									<span className="text-border" aria-hidden>
										·
									</span>
									<span className="text-primary">{verse.origin} by hand</span>
								</>
							) : null}
						</p>
					</div>
					<Hint content={STATUS_HELP[verse.status]}>
						<span>
							<StatusPill status={verse.status} />
						</span>
					</Hint>
				</div>

				{flags.length > 0 ? (
					<div className="space-y-1.5">
						<p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
							Flags
						</p>
						<div className="flex flex-wrap gap-1.5">
							{flags.map((flag) => (
								<Hint key={flag} content={flagDescription(flag)}>
									<Badge variant="secondary" className="cursor-default rounded-md font-normal">
										{flagLabel(flag)}
									</Badge>
								</Hint>
							))}
						</div>
					</div>
				) : null}
			</header>

			{verse.ocrChanged ? (
				<div className="rounded-lg border border-primary/40 bg-accent px-3 py-2.5 text-sm leading-relaxed">
					A re-import brought different OCR text after you edited this. Your reading is in the box;
					compare under <span className="font-medium">Tools → OCR text</span>.
				</div>
			) : null}
			{verse.orphaned ? (
				<div className="rounded-lg border border-primary/40 bg-accent px-3 py-2.5 text-sm leading-relaxed">
					The newest draft no longer produces this passage. Kept, not deleted.
				</div>
			) : null}

			{/* ── 2. Text ───────────────────────────────────────────────────── */}
			<section className="relative z-0 space-y-2">
				<div className="flex items-center justify-between gap-2">
					<h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
						Text
					</h3>
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={() =>
								setText(
									normalizeScriptureText(text, {
										script: "gujr",
										joinLines: verse.form !== "verse",
									}).text,
								)
							}
						>
							Normalize
						</Button>
						<InfoTip label="About normalize">
							Same repair pass assemble ran. No-op on clean text.
						</InfoTip>
					</div>
				</div>

				{/* Native textarea, not shadcn Textarea: that component uses field-sizing-content,
				    which grows the box with the text and painted over Decide/Tools. Fixed height +
				    overflow keeps long passages inside the box. */}
				<textarea
					ref={area}
					value={text}
					onChange={(event) => setText(event.target.value)}
					spellCheck={false}
					dir="auto"
					data-verse-text=""
					className={cn(
						"h-64 max-h-[min(28rem,50vh)] min-h-48 w-full resize-y overflow-y-auto rounded-xl border border-input bg-paper p-4 text-ink outline-none",
						"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
					)}
					style={{
						fontFamily: fontFamilyStack("body")
							.map((name) => (name.includes(" ") ? `"${name}"` : name))
							.join(", "),
						fontSize: `${style.fontSize}px`,
						lineHeight: `${style.lineHeight}px`,
						letterSpacing: `${style.letterSpacing}px`,
						textAlign: style.textAlign,
						whiteSpace: "pre-wrap",
						hyphens: "none",
					}}
				/>

				<div
					className={cn(
						"flex items-center gap-1.5 text-xs",
						orthography.ok ? "text-muted-foreground" : "text-destructive",
					)}
				>
					<span
						className={cn(
							"inline-block size-1.5 shrink-0 rounded-full",
							orthography.ok ? "bg-muted-foreground/40" : "bg-destructive",
						)}
					/>
					<span className={orthography.ok ? "" : "font-medium"}>
						{orthography.ok
							? "Orthography clean"
							: `${orthography.count} impossible sequences (${orthography.rate.toFixed(1)} / 1000)`}
					</span>
					{!orthography.ok ? (
						<span className="min-w-0 truncate text-muted-foreground">
							{orthography.violations
								.slice(0, 2)
								.map((v) => v.sample)
								.join(" · ")}
						</span>
					) : null}
					<InfoTip label="About orthography">
						Live spell-shape check — cannot confirm the right word, only that a sequence cannot be
						Gujarati.
					</InfoTip>
				</div>
			</section>

			{/* ── 3. Decide ─────────────────────────────────────────────────── */}
			<section className="relative z-10 space-y-2 bg-surface">
				<div className="flex items-center gap-1">
					<h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
						Decide
					</h3>
					<InfoTip label="About deciding">
						Proofed means read against the page. Approved clears for export (Enter does the same and
						advances).
					</InfoTip>
				</div>
				<Card className="gap-0 rounded-xl border-border bg-card py-0 shadow-none">
					<CardContent className="flex flex-wrap items-end gap-3 px-4 py-3">
						<div className="space-y-1.5">
							<Label
								htmlFor="verse-number"
								className="flex items-center gap-0.5 text-muted-foreground text-xs"
							>
								Printed number
								<InfoTip label="About printed number">
									The folio mark as printed. Changing it renumbers the verse id.
								</InfoTip>
							</Label>
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
												onSuccess: (result) =>
													onMoved({
														divisionId: verse.divisionId,
														verseId: (result as { id: string }).id,
													}),
											},
										);
									}
								}}
								className="h-9 w-28 font-gujarati"
								placeholder="૬૨"
							/>
						</div>
						<div className="ml-auto flex flex-wrap items-center gap-2">
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
					</CardContent>
				</Card>
			</section>

			{/* ── 4. Tools ──────────────────────────────────────────────────── */}
			<section className="relative z-10 space-y-2 bg-surface">
				<h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
					Tools
				</h3>
				<Accordion
					type="multiple"
					defaultValue={defaultOpen}
					className="overflow-hidden rounded-xl border border-border bg-muted/50"
				>
					<AccordionItem value="ocr" className="border-border px-4">
						<AccordionTrigger className="py-3 hover:no-underline">
							<div className="flex flex-col items-start gap-0.5 text-left">
								<span className="font-medium text-sm">OCR text</span>
								<span className="font-normal text-muted-foreground text-xs">
									Machine reading — compare when you disagree
								</span>
							</div>
						</AccordionTrigger>
						<AccordionContent className="pb-3">
							<pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-paper p-3 font-gujarati text-sm leading-relaxed">
								{verse.ocrText === ""
									? "(typed in by hand — the OCR never produced this)"
									: verse.ocrText}
							</pre>
						</AccordionContent>
					</AccordionItem>

					{repairs.length > 0 ? (
						<AccordionItem value="repairs" className="border-border px-4">
							<AccordionTrigger className="py-3 hover:no-underline">
								<div className="flex flex-col items-start gap-0.5 text-left">
									<span className="inline-flex items-center gap-2 font-medium text-sm">
										Repairs
										<Badge variant="secondary" className="rounded-md tabular-nums">
											{repairs.length}
										</Badge>
									</span>
									<span className="font-normal text-muted-foreground text-xs">
										Places assemble already changed — check these first
									</span>
								</div>
							</AccordionTrigger>
							<AccordionContent className="pb-3">
								<ul className="space-y-2 rounded-lg border border-border bg-paper p-3">
									{repairs.map((repair) => (
										<li
											key={`${repair.kind}-${repair.context}`}
											className="text-xs leading-relaxed"
										>
											<span className="font-medium text-muted-foreground">{repair.kind}</span>
											<span className="mt-0.5 block font-gujarati text-sm">{repair.context}</span>
											<span className="text-muted-foreground">
												{repair.before || "∅"} → {repair.after || "∅"}
											</span>
										</li>
									))}
								</ul>
							</AccordionContent>
						</AccordionItem>
					) : null}

					<AccordionItem value="structure" className="border-border px-4">
						<AccordionTrigger className="py-3 hover:no-underline">
							<div className="flex flex-col items-start gap-0.5 text-left">
								<span className="font-medium text-sm">Structure</span>
								<span className="font-normal text-muted-foreground text-xs">
									Split, merge, insert, or delete passages
								</span>
							</div>
						</AccordionTrigger>
						<AccordionContent className="pb-3">
							<div className="rounded-lg border border-border bg-paper p-2">
								<StructureActions
									verse={verse}
									busy={split.isPending || merge.isPending || remove.isPending || insert.isPending}
									onSplit={() => {
										const offset = area.current?.selectionStart ?? 0;
										split.mutate(
											{ divisionId: verse.divisionId, verseId: verse.id, offset },
											{
												onSuccess: () =>
													onMoved({ divisionId: verse.divisionId, verseId: verse.id }),
											},
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
															: {
																	divisionId: verse.next.divisionId,
																	verseId: verse.next.id,
																},
													),
											},
										)
									}
									onInsert={(insertText, insertNumber) =>
										insert.mutate(
											{
												divisionId: verse.divisionId,
												afterVerseId: verse.id,
												text: insertText,
												number: insertNumber,
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
							</div>
						</AccordionContent>
					</AccordionItem>

					<AccordionItem value="note" className="border-border px-4">
						<AccordionTrigger className="py-3 hover:no-underline">
							<div className="flex flex-col items-start gap-0.5 text-left">
								<span className="inline-flex items-center gap-2 font-medium text-sm">
									Note
									{note !== "" ? (
										<Badge variant="outline" className="rounded-md font-normal">
											has content
										</Badge>
									) : null}
								</span>
								<span className="font-normal text-muted-foreground text-xs">
									Private working note — not published
								</span>
							</div>
						</AccordionTrigger>
						<AccordionContent className="pb-3">
							<Textarea
								id="verse-note"
								value={note}
								onChange={(event) => setNote(event.target.value)}
								onBlur={() => {
									if (note !== (verse.note ?? "")) save();
								}}
								rows={3}
								placeholder="A doubt, a question, something for layer authoring…"
								className="min-h-20 bg-paper"
							/>
						</AccordionContent>
					</AccordionItem>

					{apparatus !== undefined ? (
						<AccordionItem value="apparatus" className="border-border px-4 last:border-b-0">
							<AccordionTrigger className="py-3 hover:no-underline">
								<div className="flex flex-col items-start gap-0.5 text-left">
									<span className="font-medium text-sm">Page apparatus</span>
									<span className="font-normal text-muted-foreground text-xs">
										Footnotes and held-back blocks on this page
									</span>
								</div>
							</AccordionTrigger>
							<AccordionContent className="pb-3">{apparatus}</AccordionContent>
						</AccordionItem>
					) : null}
				</Accordion>
			</section>

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
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-1">
				<Button variant="secondary" size="sm" disabled={busy} onClick={onSplit}>
					Split at cursor
				</Button>
				<Hint content="The earlier passage survives: in a printed book the number closes a passage.">
					<span>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy || verse.previous === null}
							onClick={() => onMerge("previous")}
						>
							Merge into previous
						</Button>
					</span>
				</Hint>
				<Button
					variant="secondary"
					size="sm"
					disabled={busy || verse.next === null}
					onClick={() => onMerge("next")}
				>
					Absorb next
				</Button>
				<Hint content="For a passage the OCR missed entirely.">
					<span>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setInserting((value) => !value)}
						>
							Insert after
						</Button>
					</span>
				</Hint>
				{confirmingDelete ? (
					<>
						<span className="text-destructive text-xs">Delete this passage?</span>
						<Button variant="destructive" size="sm" disabled={busy} onClick={onDelete}>
							Yes, delete
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
							Cancel
						</Button>
					</>
				) : (
					<Hint content="For a block that is not text — a caption or running head.">
						<span className="ml-auto">
							<Button
								variant="ghost"
								size="sm"
								className="text-destructive"
								onClick={() => setConfirmingDelete(true)}
							>
								Delete
							</Button>
						</span>
					</Hint>
				)}
			</div>

			{inserting ? (
				<div className="space-y-2 border-border border-t pt-2">
					<p className="text-muted-foreground text-xs leading-relaxed">
						Type the passage from the page image. It gets no pixel boxes — the OCR never saw it.
					</p>
					<Textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						rows={4}
						dir="auto"
						placeholder="The passage as printed"
						className="min-h-20 bg-paper font-gujarati"
					/>
					<div className="flex items-center gap-2">
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
	const variant =
		status === "approved" ? "default" : status === "proofed" ? "secondary" : "outline";
	return (
		<Badge variant={variant} className="cursor-default rounded-md capitalize">
			{status === "raw" ? "unread" : status}
		</Badge>
	);
}
