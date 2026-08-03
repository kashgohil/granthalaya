import { type FormEvent, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { usePatchManifest } from "#/lib/studio";

type Manifest = {
	title?: { gu?: string; en?: string };
	subtitle?: { gu?: string; en?: string };
	source?: { edition?: string; publisher?: string; year?: number; notes?: string };
	license?: { id?: string; holder?: string; url?: string };
};

const UNKNOWN = "unknown";
const clean = (value: string) => value.trim();

/**
 * The fields no machine can know.
 *
 * `assemble` writes `unknown` into the source edition and the licence and names them in its
 * report rather than guessing — inventing a source edition would be a small fiction in a project
 * whose first principle is fidelity. This form is where they stop being unknown, and export
 * refuses to compile a package while any of them still is.
 *
 * A re-import never touches these, so filling them in once is filling them in for good.
 */
export function ManifestForm({
	bookId,
	manifest,
	embedded = false,
}: {
	bookId: string;
	manifest: Record<string, unknown>;
	/** When true, the outer card chrome is owned by a parent StudioPanel. */
	embedded?: boolean;
}) {
	const current = manifest as Manifest;
	const patch = usePatchManifest(bookId);

	const [titleGu, setTitleGu] = useState(current.title?.gu ?? "");
	const [titleEn, setTitleEn] = useState(current.title?.en ?? "");
	const [edition, setEdition] = useState(
		current.source?.edition === UNKNOWN ? "" : (current.source?.edition ?? ""),
	);
	const [publisher, setPublisher] = useState(current.source?.publisher ?? "");
	const [licenseId, setLicenseId] = useState(
		current.license?.id === UNKNOWN ? "" : (current.license?.id ?? ""),
	);
	const [holder, setHolder] = useState(current.license?.holder ?? "");

	const submit = (event: FormEvent) => {
		event.preventDefault();
		patch.mutate({
			title: {
				...(clean(titleGu) === "" ? {} : { gu: clean(titleGu) }),
				// The schema wants at least one language, and `assemble`'s English placeholder is
				// the only thing standing between a Gujarati-only title and an invalid package.
				...(clean(titleEn) === "" ? {} : { en: clean(titleEn) }),
			},
			source: {
				// Written back as `unknown` rather than omitted: the field is required, and an
				// empty string would read as "we checked and there is none".
				edition: clean(edition) === "" ? UNKNOWN : clean(edition),
				...(clean(publisher) === "" ? {} : { publisher: clean(publisher) }),
			},
			license: {
				id: clean(licenseId) === "" ? UNKNOWN : clean(licenseId),
				...(clean(holder) === "" ? {} : { holder: clean(holder) }),
			},
		});
	};

	return (
		<form
			onSubmit={submit}
			className={embedded ? "" : "rounded-lg border border-rule bg-surface p-5"}
		>
			{embedded ? null : (
				<>
					<h2 className="font-medium text-base">Edition and rights</h2>
					<p className="mt-0.5 mb-4 text-ink-faint text-xs">
						A re-import leaves these alone — they are the one part of a package a machine can never
						supply.
					</p>
				</>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				<Field id="mf-title-gu" label="Title, as printed" hint="Gujarati">
					<Input
						id="mf-title-gu"
						value={titleGu}
						onChange={(event) => setTitleGu(event.target.value)}
						className="font-gujarati"
						dir="auto"
					/>
				</Field>
				<Field id="mf-title-en" label="Title" hint="English or transliterated">
					<Input
						id="mf-title-en"
						value={titleEn}
						onChange={(event) => setTitleEn(event.target.value)}
					/>
				</Field>
				<Field id="mf-edition" label="Source edition" hint="which printed edition this is">
					<Input
						id="mf-edition"
						value={edition}
						onChange={(event) => setEdition(event.target.value)}
					/>
				</Field>
				<Field id="mf-publisher" label="Publisher">
					<Input
						id="mf-publisher"
						value={publisher}
						onChange={(event) => setPublisher(event.target.value)}
					/>
				</Field>
				<Field id="mf-license" label="Licence" hint="whether we have the rights to publish it">
					<Input
						id="mf-license"
						value={licenseId}
						onChange={(event) => setLicenseId(event.target.value)}
						placeholder="public-domain, all-rights-reserved, CC-BY-4.0…"
					/>
				</Field>
				<Field id="mf-holder" label="Rights holder">
					<Input
						id="mf-holder"
						value={holder}
						onChange={(event) => setHolder(event.target.value)}
					/>
				</Field>
			</div>

			<div className="mt-5 flex items-center gap-3">
				<Button type="submit" disabled={patch.isPending}>
					{patch.isPending ? "Saving…" : "Save"}
				</Button>
				{patch.isSuccess ? <span className="text-ink-faint text-sm">Saved.</span> : null}
				{patch.isError ? (
					<span role="alert" className="text-destructive text-sm">
						{patch.error.message}
					</span>
				) : null}
			</div>
		</form>
	);
}

function Field({
	id,
	label,
	hint,
	children,
}: {
	id: string;
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<Label htmlFor={id} className="mb-1.5 block text-sm">
				{label}
				{hint ? <span className="ml-2 font-normal text-ink-faint text-xs">{hint}</span> : null}
			</Label>
			{children}
		</div>
	);
}
