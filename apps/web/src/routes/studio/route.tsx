import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { useEffect } from "react";
import { Mark } from "#/components/mark";
import { SignInForm } from "#/components/studio/sign-in-form";
import { Button } from "#/components/ui/button";
import { TooltipProvider } from "#/components/ui/tooltip";
import { useBook, useSession, useSignOut } from "#/lib/studio";

export const Route = createFileRoute("/studio")({ component: StudioShell });

/**
 * The studio's shell and its gate (P1.3).
 *
 * Nothing below this renders until the session says so. That is not a security boundary — the API
 * is, and every `/admin` route refuses on its own — it is what stops the studio from showing an
 * admin a screen full of failed requests and letting them guess why.
 *
 * The three states are distinct on purpose: signed in, signed out, and *not configured on this
 * API at all*. The last one is a machine with no `ADMIN_PASSWORD_HASH`, and a login form there
 * would be a form that can never work.
 */
function StudioShell() {
	const session = useSession();

	// The studio is a workbench, not a reading surface: it stays on the White theme so an admin
	// proofs against the paper the app renders rather than against a dark chrome.
	useEffect(() => {
		document.documentElement.dataset.theme = "white";
		return () => {
			delete document.documentElement.dataset.theme;
		};
	}, []);

	if (session.isPending) {
		return <Frame>{null}</Frame>;
	}

	if (session.isError) {
		return (
			<Frame>
				<Notice title="The API is not answering.">
					<p>
						The studio talks to <code>apps/api</code> on :4567. Start it with{" "}
						<code>bun run dev</code> from the repo root, or <code>bun run dev:api</code> on its own.
					</p>
					<p className="mt-2 text-sm">{session.error.message}</p>
				</Notice>
			</Frame>
		);
	}

	if (session.data?.configured === false) {
		return (
			<Frame>
				<Notice title="This API has no admin studio.">
					<p>
						<code>ADMIN_PASSWORD_HASH</code> and <code>COOKIE_SECRET</code> are unset, so every
						admin route refuses. There is no default password, because a default password is a
						published one.
					</p>
					<p className="mt-2">
						Run <code>bun run admin:password</code> and paste both lines into{" "}
						<code>apps/api/.env</code>.
					</p>
				</Notice>
			</Frame>
		);
	}

	if (session.data?.authenticated !== true) {
		return (
			<Frame>
				<SignInForm />
			</Frame>
		);
	}

	return (
		<Frame signedIn>
			<Outlet />
		</Frame>
	);
}

/**
 * The header's own height, published to the subtree as `--studio-header`.
 *
 * The workbench is a fixed-height grid that scrolls internally, so it has to subtract the
 * header from the viewport. It used to do that with a hardcoded `3rem` that silently meant
 * "whatever `h-12` is" — so the header could not change height without breaking a screen
 * two directories away. These are the same numbers as the `h-16` / `h-10` classes below,
 * plus the hairline each row contributes.
 */
const IDENTITY_ROW = "4rem";
const CRUMB_ROW = "2.5rem";

function Frame({ children, signedIn = false }: { children: ReactNode; signedIn?: boolean }) {
	const path = useRouterState({ select: (state) => state.location.pathname });
	const isWorkbench = /\/studio\/[^/]+\/proof/.test(path);
	const bookId = bookIdFromPath(path);
	const signOut = useSignOut();
	const hasTrail = signedIn && bookId !== null;

	return (
		<TooltipProvider delayDuration={280} skipDelayDuration={0}>
			<div
				className="flex min-h-screen flex-col bg-background text-ink"
				style={
					{
						"--studio-header": hasTrail
							? `calc(${IDENTITY_ROW} + ${CRUMB_ROW} + 2px)`
							: `calc(${IDENTITY_ROW} + 1px)`,
					} as CSSProperties
				}
			>
				<header className="sticky top-0 z-20 border-rule border-b bg-surface">
					{/* Who you are and where you are signed in — never anything route-specific. */}
					<div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-6">
						<Link to="/studio" className="flex shrink-0 items-center gap-3 no-underline">
							<Mark size={38} className="shadow-sm" />
							<span className="display-title text-ink text-lg">Granthalaya studio</span>
						</Link>

						{signedIn ? (
							<div className="ml-auto flex shrink-0 items-center gap-3">
								{isWorkbench ? <WorkbenchProgress bookId={bookId} /> : null}
								<Button
									variant="ghost"
									size="sm"
									disabled={signOut.isPending}
									onClick={() => signOut.mutate()}
								>
									Sign out
								</Button>
							</div>
						) : null}
					</div>

					{/* The trail gets its own row: it changes on every navigation, and sharing a row
					    with the wordmark made the one fixed thing on the page look like it moved. */}
					{hasTrail ? (
						<div className="border-rule/70 border-t bg-background">
							<nav
								aria-label="Breadcrumb"
								className="mx-auto flex h-10 max-w-[1600px] items-center gap-2 px-6 text-sm"
							>
								<Link to="/studio" className="text-ink-muted no-underline hover:text-ink">
									Books
								</Link>
								<span className="text-ink-faint" aria-hidden>
									/
								</span>
								{isWorkbench ? (
									<>
										<Link
											to="/studio/$bookId"
											params={{ bookId }}
											className="min-w-0 truncate text-ink-muted no-underline hover:text-ink"
										>
											<BookCrumb bookId={bookId} />
										</Link>
										<span className="text-ink-faint" aria-hidden>
											/
										</span>
										<span className="text-ink">Workbench</span>
									</>
								) : (
									<span className="min-w-0 truncate text-ink">
										<BookCrumb bookId={bookId} />
									</span>
								)}
							</nav>
						</div>
					) : null}
				</header>
				<main
					className={
						isWorkbench ? "min-h-0 flex-1" : "mx-auto w-full max-w-[1600px] flex-1 px-6 py-8"
					}
				>
					{children}
				</main>
			</div>
		</TooltipProvider>
	);
}

function bookIdFromPath(path: string): string | null {
	const match = path.match(/^\/studio\/([^/]+)/);
	if (match === null || match[1] === undefined) return null;
	// The index route is `/studio` only; anything else under /studio/ is a book id.
	return match[1];
}

function BookCrumb({ bookId }: { bookId: string }) {
	const book = useBook(bookId);
	const title = book.data
		? titleOf(
				(book.data.manifest as { title?: { gu?: string; en?: string } } | undefined)?.title,
				bookId,
			)
		: bookId;
	return <span className="font-gujarati">{title}</span>;
}

function WorkbenchProgress({ bookId }: { bookId: string | null }) {
	const book = useBook(bookId ?? "", bookId !== null);
	if (book.data === undefined) return null;
	const { approved, total } = book.data.counts;
	return (
		<span className="text-ink-faint text-sm tabular-nums">
			{approved}/{total} approved
		</span>
	);
}

function titleOf(title: { gu?: string; en?: string } | undefined, fallback: string): string {
	return title?.gu ?? title?.en ?? fallback;
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="mx-auto max-w-xl rounded-lg border border-rule bg-surface p-6">
			<h1 className="display-title mb-3 text-xl">{title}</h1>
			<div className="text-ink-muted text-sm leading-relaxed">{children}</div>
		</div>
	);
}
