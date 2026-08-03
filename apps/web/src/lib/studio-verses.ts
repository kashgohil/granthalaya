/**
 * The workbench's data layer (P1.3).
 *
 * Split from `studio.ts` because it has a different shape: the book-level screens read once and
 * cache, while this is a tight edit loop where every mutation has to put the queue, the passage
 * and the book's counters back in step.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { StudioError, studioKeys } from "./studio";

async function unwrap<T>(promise: Promise<{ data: T | null; error: unknown }>): Promise<T> {
	const { data, error } = await promise;
	if (error !== null && error !== undefined) {
		const value = error as { status?: number; value?: { error?: string; reasons?: string[] } };
		throw new StudioError(
			value.value?.error ?? value.value?.reasons?.join("\n") ?? "The API refused that.",
			value.status ?? 500,
		);
	}
	return data as T;
}

export type VerseStatus = "raw" | "proofed" | "approved";
export type QueueOrder = "book" | "confidence";

export type QueueQuery = {
	order: QueueOrder;
	status?: VerseStatus;
	flag?: string;
	divisionId?: string;
	ocrChanged?: boolean;
	orphaned?: boolean;
	page?: number;
	offset: number;
	limit: number;
};

export const verseKeys = {
	queue: (bookId: string, query: QueueQuery) => ["studio", "queue", bookId, query] as const,
	flags: (bookId: string) => ["studio", "flags", bookId] as const,
	verse: (bookId: string, divisionId: string, verseId: string) =>
		["studio", "verse", bookId, divisionId, verseId] as const,
	pageContext: (bookId: string, page: number) => ["studio", "page", bookId, page] as const,
};

export function useQueue(bookId: string, query: QueueQuery) {
	return useQuery({
		queryKey: verseKeys.queue(bookId, query),
		queryFn: () =>
			unwrap(
				api.admin.books({ bookId }).queue.get({
					query: {
						order: query.order,
						...(query.status === undefined ? {} : { status: query.status }),
						...(query.flag === undefined ? {} : { flag: query.flag }),
						...(query.divisionId === undefined ? {} : { divisionId: query.divisionId }),
						...(query.ocrChanged === undefined ? {} : { ocrChanged: query.ocrChanged }),
						...(query.orphaned === undefined ? {} : { orphaned: query.orphaned }),
						...(query.page === undefined ? {} : { page: query.page }),
						offset: query.offset,
						limit: query.limit,
					},
				}),
			),
		// The queue is the list you are working down; a flash of empty between pages is worse
		// than a moment of stale.
		placeholderData: (previous) => previous,
		retry: false,
	});
}

export function useFlags(bookId: string) {
	return useQuery({
		queryKey: verseKeys.flags(bookId),
		queryFn: () => unwrap(api.admin.books({ bookId }).flags.get()),
		retry: false,
	});
}

export function useVerse(bookId: string, divisionId?: string, verseId?: string) {
	return useQuery({
		queryKey: verseKeys.verse(bookId, divisionId ?? "", verseId ?? ""),
		queryFn: () =>
			unwrap(
				api.admin
					.books({ bookId })
					.verses({ divisionId: divisionId as string })({
						verseId: verseId as string,
					})
					.get(),
			),
		enabled: divisionId !== undefined && verseId !== undefined,
		retry: false,
	});
}

/** Every rendered page with its pixel dimensions — what the bbox overlay scales against. */
export function usePages(bookId: string) {
	return useQuery({
		queryKey: ["studio", "pages", bookId] as const,
		queryFn: () => unwrap(api.admin.books({ bookId }).pages.get()),
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
}

export function usePageContext(bookId: string, page: number | null) {
	return useQuery({
		queryKey: verseKeys.pageContext(bookId, page ?? 0),
		queryFn: () =>
			unwrap(
				api.admin
					.books({ bookId })
					.pages({ page: page as number })
					.context.get(),
			),
		enabled: page !== null,
		retry: false,
	});
}

/**
 * Invalidate everything a change to one passage can affect.
 *
 * Broad on purpose. A split changes the queue's length, the book's counters and the sequence
 * check all at once, and a studio showing "62 missing" after the gap was filled would be worse
 * than one that refetches more than it strictly needs.
 */
function useRefresh(bookId: string) {
	const client = useQueryClient();
	return () => {
		client.invalidateQueries({ queryKey: ["studio", "queue", bookId] });
		client.invalidateQueries({ queryKey: ["studio", "verse", bookId] });
		client.invalidateQueries({ queryKey: ["studio", "page", bookId] });
		client.invalidateQueries({ queryKey: verseKeys.flags(bookId) });
		client.invalidateQueries({ queryKey: studioKeys.book(bookId) });
		client.invalidateQueries({ queryKey: studioKeys.books });
	};
}

type VerseTarget = { divisionId: string; verseId: string };

export function usePatchVerse(bookId: string) {
	const refresh = useRefresh(bookId);
	return useMutation({
		mutationFn: (
			input: VerseTarget & {
				text?: string;
				number?: string | null;
				status?: VerseStatus;
				note?: string | null;
			},
		) => {
			const { divisionId, verseId, ...patch } = input;
			return unwrap(api.admin.books({ bookId }).verses({ divisionId })({ verseId }).patch(patch));
		},
		onSuccess: refresh,
	});
}

export function useSplitVerse(bookId: string) {
	const refresh = useRefresh(bookId);
	return useMutation({
		mutationFn: ({ divisionId, verseId, offset }: VerseTarget & { offset: number }) =>
			unwrap(
				api.admin.books({ bookId }).verses({ divisionId })({ verseId }).split.post({ offset }),
			),
		onSuccess: refresh,
	});
}

export function useMergeVerse(bookId: string) {
	const refresh = useRefresh(bookId);
	return useMutation({
		mutationFn: ({
			divisionId,
			verseId,
			direction,
		}: VerseTarget & { direction: "previous" | "next" }) =>
			unwrap(
				api.admin.books({ bookId }).verses({ divisionId })({ verseId }).merge.post({ direction }),
			),
		onSuccess: refresh,
	});
}

export function useRenumberVerse(bookId: string) {
	const refresh = useRefresh(bookId);
	return useMutation({
		mutationFn: ({ divisionId, verseId, number }: VerseTarget & { number: string | null }) =>
			unwrap(
				api.admin.books({ bookId }).verses({ divisionId })({ verseId }).number.post({ number }),
			),
		onSuccess: refresh,
	});
}

export function useInsertVerse(bookId: string) {
	const refresh = useRefresh(bookId);
	return useMutation({
		mutationFn: (input: {
			divisionId: string;
			afterVerseId: string | null;
			text: string;
			number: string | null;
		}) => unwrap(api.admin.books({ bookId }).verses.post(input)),
		onSuccess: refresh,
	});
}

export function useDeleteVerse(bookId: string) {
	const refresh = useRefresh(bookId);
	return useMutation({
		mutationFn: ({ divisionId, verseId }: VerseTarget) =>
			unwrap(api.admin.books({ bookId }).verses({ divisionId })({ verseId }).delete()),
		onSuccess: refresh,
	});
}

export function usePatchNote(bookId: string) {
	const refresh = useRefresh(bookId);
	return useMutation({
		mutationFn: ({ noteId, ...patch }: { noteId: string; text?: string; status?: VerseStatus }) =>
			unwrap(api.admin.books({ bookId }).notes({ noteId }).patch(patch)),
		onSuccess: refresh,
	});
}

export function useResolveSetAside(bookId: string) {
	const refresh = useRefresh(bookId);
	return useMutation({
		mutationFn: ({
			blockId,
			...patch
		}: {
			blockId: string;
			resolved?: boolean;
			note?: string | null;
		}) => unwrap(api.admin.books({ bookId })["set-aside"]({ blockId }).patch(patch)),
		onSuccess: refresh,
	});
}

export function useExportBook(bookId: string) {
	const refresh = useRefresh(bookId);
	return useMutation({
		mutationFn: (options: { contentVersion?: string; dryRun?: boolean }) =>
			unwrap(api.admin.books({ bookId }).export.post(options)),
		onSuccess: refresh,
	});
}

/**
 * Hand an exported package to the catalog (P1.5).
 *
 * The counterpart of `useExportBook`, and deliberately a second button rather than a step of the
 * first: export compiles what a human cleared, publish hands those exact bytes out. A dry run
 * takes the same route and writes nothing, which is what makes a preview trustworthy — it is the
 * publish itself, stopped one line short.
 */
export function usePublishBook(bookId: string) {
	const refresh = useRefresh(bookId);
	return useMutation({
		mutationFn: (options: { contentVersion?: string; dryRun?: boolean }) =>
			unwrap(api.admin.books({ bookId }).publish.post(options)),
		onSuccess: refresh,
	});
}
