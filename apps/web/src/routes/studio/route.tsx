import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { SignInForm } from "#/components/studio/sign-in-form";
import { useSession } from "#/lib/studio";

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
						The studio talks to <code>apps/api</code> on :3001. Start it with{" "}
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

function Frame({ children, signedIn = false }: { children: ReactNode; signedIn?: boolean }) {
	const path = useRouterState({ select: (state) => state.location.pathname });

	return (
		<div className="min-h-screen bg-background text-ink">
			<header className="border-rule border-b bg-surface">
				<div className="mx-auto flex max-w-[1600px] items-baseline gap-4 px-6 py-3">
					<Link to="/studio" className="display-title text-ink text-lg no-underline">
						Granthalaya studio
					</Link>
					<span className="text-ink-faint text-xs">
						proofing — nothing here is published until a human has read it
					</span>
					{signedIn && path !== "/studio" ? (
						<Link to="/studio" className="ml-auto text-sm">
							All books
						</Link>
					) : null}
				</div>
			</header>
			<main className="mx-auto max-w-[1600px] px-6 py-8">{children}</main>
		</div>
	);
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="mx-auto max-w-xl rounded-lg border border-rule bg-surface p-6">
			<h1 className="display-title mb-3 text-xl">{title}</h1>
			<div className="text-ink-muted text-sm leading-relaxed">{children}</div>
		</div>
	);
}
