import { type FormEvent, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useSignIn } from "#/lib/studio";

/**
 * One password, one field.
 *
 * There is no "forgot password" and no account creation, because there is no user table: the
 * hash lives in the API's environment and `bun run admin:password` replaces it. Saying so here
 * is kinder than a link that goes nowhere.
 */
export function SignInForm() {
	const [password, setPassword] = useState("");
	const signIn = useSignIn();

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (password.length > 0) signIn.mutate(password);
	};

	return (
		<form
			onSubmit={submit}
			className="mx-auto max-w-sm rounded-lg border border-rule bg-surface p-6"
		>
			<h1 className="display-title mb-1 text-xl">Sign in</h1>
			<p className="mb-5 text-ink-faint text-sm">
				The studio is the only surface that can move a book out of draft.
			</p>

			<Label htmlFor="studio-password" className="mb-2 block text-sm">
				Admin password
			</Label>
			<Input
				id="studio-password"
				type="password"
				autoComplete="current-password"
				// The single field on the page, and the admin came here to type in it.
				// biome-ignore lint/a11y/noAutofocus: sole input on a dedicated sign-in screen
				autoFocus
				value={password}
				onChange={(event) => setPassword(event.target.value)}
			/>

			{signIn.isError ? (
				<p role="alert" className="mt-3 text-destructive text-sm">
					{signIn.error.message}
				</p>
			) : null}

			<Button type="submit" className="mt-5 w-full" disabled={signIn.isPending}>
				{signIn.isPending ? "Checking…" : "Sign in"}
			</Button>

			<p className="mt-4 text-ink-faint text-xs leading-relaxed">
				Forgotten it? There is no reset — run <code>bun run admin:password</code> and paste the new
				lines into <code>apps/api/.env</code>.
			</p>
		</form>
	);
}
