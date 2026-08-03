/**
 * The studio's data layer (P1.3).
 *
 * Every call goes through the Eden treaty client, so a route rename or a changed response shape
 * in `apps/api` is a compile error here rather than a blank panel at 1am.
 *
 * Queries run in the browser, not through SSR. The session lives in an httpOnly cookie that
 * belongs to the browser, and forwarding it through Nitro to reach the API would be real work
 * with no payoff for a single-admin internal tool — so the studio renders its shell on the server
 * and fetches everything after hydration.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, api } from "./api";

/** Eden hands back `{ data, error }`; a component wants the data or a thrown message. */
async function unwrap<T>(promise: Promise<{ data: T | null; error: unknown }>): Promise<T> {
	const { data, error } = await promise;
	if (error !== null && error !== undefined) {
		const value = error as { status?: number; value?: { error?: string } };
		throw new StudioError(value.value?.error ?? "The API refused that.", value.status ?? 500);
	}
	return data as T;
}

export class StudioError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

export const studioKeys = {
	session: ["studio", "session"] as const,
	drafts: ["studio", "drafts"] as const,
	books: ["studio", "books"] as const,
	book: (bookId: string) => ["studio", "books", bookId] as const,
};

export function useSession() {
	return useQuery({
		queryKey: studioKeys.session,
		queryFn: () => unwrap(api.admin.session.get()),
		// The gate on every screen: a stale "signed in" shows an empty studio full of 401s.
		staleTime: 30_000,
		retry: false,
	});
}

export function useSignIn() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (password: string) => unwrap(api.admin.session.post({ password })),
		onSuccess: () => client.invalidateQueries(),
	});
}

export function useSignOut() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: () => unwrap(api.admin.session.delete()),
		onSuccess: () => client.invalidateQueries(),
	});
}

export function useDrafts(enabled: boolean) {
	return useQuery({
		queryKey: studioKeys.drafts,
		queryFn: () => unwrap(api.admin.drafts.get()),
		enabled,
		retry: false,
	});
}

export function useBooks(enabled: boolean) {
	return useQuery({
		queryKey: studioKeys.books,
		queryFn: () => unwrap(api.admin.books.get()),
		enabled,
		retry: false,
	});
}

export function useBook(bookId: string, enabled = true) {
	return useQuery({
		queryKey: studioKeys.book(bookId),
		queryFn: () => unwrap(api.admin.books({ bookId }).get()),
		enabled,
		retry: false,
	});
}

export function useImportDraft() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (dir: string) => unwrap(api.admin.books.post({ dir })),
		onSuccess: () => client.invalidateQueries(),
	});
}

export function usePatchManifest(bookId: string) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (manifest: Record<string, unknown>) =>
			unwrap(api.admin.books({ bookId }).patch({ manifest })),
		onSuccess: () => client.invalidateQueries({ queryKey: studioKeys.book(bookId) }),
	});
}

/**
 * Retitle a section.
 *
 * A book-level edit rather than a workbench one: section ids stay positional (`section-1`) until
 * P1.4 can transliterate a Gujarati title, but the title itself is readable off the page today —
 * and `assemble` only captures one where the OCR tagged a `section-title` block, so the section
 * before a book's first heading routinely has none.
 */
export function usePatchDivision(bookId: string) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({
			divisionId,
			...patch
		}: {
			divisionId: string;
			title?: Record<string, string>;
			number?: string | null;
		}) => unwrap(api.admin.books({ bookId }).divisions({ divisionId }).patch(patch)),
		onSuccess: () => client.invalidateQueries({ queryKey: studioKeys.book(bookId) }),
	});
}

/**
 * The URL of a rendered page image.
 *
 * Built by hand rather than through the treaty client because a browser fetches an `<img>`
 * itself. The element must carry `crossOrigin="use-credentials"` or the session cookie is not
 * sent and the image 401s — see `PageImage`.
 */
export function pageImageUrl(bookId: string, page: number): string {
	return `${API_URL}/admin/books/${encodeURIComponent(bookId)}/pages/${page}`;
}
