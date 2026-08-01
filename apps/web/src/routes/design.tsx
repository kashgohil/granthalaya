import {
	MARK_COLORS,
	MOTION,
	RADIUS,
	resolveTypeStyle,
	SPACING,
	THEME_NAMES,
	type ThemeName,
	TYPE_SCALE,
	type TypeToken,
	theme as themeTokens,
} from "@granthalaya/core";
import { FIXTURE_BOOKS } from "@granthalaya/core/fixtures";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";

import { BookCover } from "#/components/book-cover";
import { ScriptureText } from "#/components/scripture-text";

export const Route = createFileRoute("/design")({ component: DesignPage });

/** The roles a screen actually asks for, in the order they matter. */
const ROLES = [
	["background", "app canvas"],
	["surface", "cards, sheets"],
	["surfaceSunken", "wells, meters, inputs"],
	["paper", "the reading page"],
	["ink", "primary text"],
	["inkMuted", "secondary text"],
	["inkFaint", "labels, quiet chrome"],
	["rule", "hairlines"],
	["accent", "actions, active state"],
	["accentInk", "text on accent"],
	["accentMuted", "accent wash"],
] as const;

const TOKENS = Object.keys(TYPE_SCALE) as TypeToken[];

const SPECIMENS: Record<TypeToken, string> = {
	display: "ગાયત્રી મંત્ર",
	title: "આજનો શ્લોક",
	heading: "મોર્નિંગ પાઠ",
	body: "વાંચન ચાલુ રાખો",
	label: "૪ શ્લોક",
	caption: "જાહેર સંપત્તિ",
	verse: "ધિયો યો નઃ પ્રચોદયાત્ ॥",
	verseLarge: "ભર્ગો દેવસ્ય ધીમહિ ।",
};

/**
 * The design language, rendered from the tokens themselves (P0.4).
 *
 * Two jobs. It is the studio's parity surface — the palette and metrics an admin proofs
 * against are the ones the phone will use, because both come from `packages/core` — and it
 * is where a change to a token is checked before it ships: switch the theme at the top and
 * every swatch, cover and specimen below re-renders from the new values.
 */
function DesignPage() {
	const [selected, setSelected] = useState<ThemeName>("white");

	// The tokens are selected by `data-theme` on the document element, exactly as a reader's
	// saved preference will select them — no component here knows which theme is on.
	useEffect(() => {
		document.documentElement.dataset.theme = selected;
		return () => {
			delete document.documentElement.dataset.theme;
		};
	}, [selected]);

	const tokens = themeTokens(selected);

	return (
		<div className="mx-auto max-w-4xl px-6 py-12">
			<header className="flex flex-col gap-3">
				<p className="text-xs font-semibold tracking-[0.16em] text-ink-faint uppercase">
					Granthalaya · P0.4
				</p>
				<h1 className="display-title text-4xl">Design language</h1>
				<p className="max-w-[52ch] text-ink-muted">
					Paper, ink and one warm accent. Every value here comes from{" "}
					<code>packages/core/src/design</code> — the same call the app makes, so this page cannot
					drift from the phone.
				</p>
			</header>

			<nav className="sticky top-0 z-10 -mx-6 mt-8 flex flex-wrap items-center gap-2 border-rule border-b bg-background/85 px-6 py-3 backdrop-blur">
				<span className="mr-2 text-xs font-semibold tracking-[0.16em] text-ink-faint uppercase">
					Theme
				</span>
				{THEME_NAMES.map((name) => (
					<button
						key={name}
						type="button"
						onClick={() => setSelected(name)}
						aria-pressed={name === selected}
						className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm capitalize ${
							name === selected
								? "border-rule bg-surface text-ink"
								: "border-transparent text-ink-muted hover:bg-sunken"
						}`}
					>
						<span
							className="size-4 rounded-full border border-rule"
							style={{ background: themeTokens(name).paper }}
						/>
						{name}
					</button>
				))}
			</nav>

			<Plate title="Palette" note="Four themes for four kinds of light. Roles, never literals.">
				<div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
					{ROLES.map(([role, use]) => (
						<div key={role} className="overflow-hidden rounded-lg border border-rule">
							<div className="h-12 border-rule border-b" style={{ background: tokens[role] }} />
							<div className="flex flex-col gap-0.5 bg-surface px-2.5 py-2">
								<span className="font-semibold text-xs">{role}</span>
								<span className="font-mono text-[11px] text-ink-faint">{tokens[role]}</span>
								<span className="text-[11px] text-ink-faint leading-tight">{use}</span>
							</div>
						</div>
					))}
				</div>

				<div className="flex flex-wrap gap-2">
					{MARK_COLORS.map((mark) => (
						<span
							key={mark}
							className="rounded-sm px-2.5 font-serif text-lg leading-8"
							style={{ background: tokens.marks[mark], color: tokens.ink }}
						>
							{SPECIMENS.verse}
						</span>
					))}
				</div>
				<p className="max-w-[68ch] text-ink-faint text-sm">
					Highlights are washes, never underlines — an underline is drawn exactly where Gujarati's
					below-base matras live. All four keep the text above 4.5:1, which{" "}
					<code>themes.test.ts</code> enforces.
				</p>
			</Plate>

			<Plate
				title="Type"
				note="A token names a Latin size. The script decides the rest — +12% and the 1.7–2.0 band."
			>
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr className="text-[11px] tracking-[0.12em] text-ink-faint uppercase">
								<th className="border-rule border-b pb-2 text-left">Token</th>
								<th className="border-rule border-b pb-2 text-left">Latin</th>
								<th className="border-rule border-b pb-2 text-left">Gujarati</th>
								<th className="border-rule border-b pb-2 text-left">Specimen</th>
							</tr>
						</thead>
						<tbody>
							{TOKENS.map((token) => {
								const latin = resolveTypeStyle(token, "latn");
								const gujarati = resolveTypeStyle(token, "gujr");
								return (
									<tr key={token} className="border-rule border-b align-baseline">
										<td className="py-3 pr-3 font-semibold">{token}</td>
										<td className="py-3 pr-3 font-mono text-ink-muted text-xs tabular-nums">
											{latin.fontSize} / {latin.lineHeight}
										</td>
										<td className="py-3 pr-3 font-mono text-ink-muted text-xs tabular-nums">
											{gujarati.fontSize} / {gujarati.lineHeight}
										</td>
										<td className="py-3">
											<ScriptureText
												as="span"
												form="prose"
												face={gujarati.face}
												weight={gujarati.weight}
												size={TYPE_SCALE[token].size}
												lineHeight={TYPE_SCALE[token].lineHeight}
											>
												{SPECIMENS[token]}
											</ScriptureText>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</Plate>

			<Plate
				title="Metrics"
				note="Shared by React Native and CSS; emitted as variables by design:sync."
			>
				<div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6 text-sm">
					<Metric
						label="Spacing"
						entries={Object.entries(SPACING).map(([name, value]) => [name, `${value}`])}
					/>
					<Metric
						label="Radius"
						entries={Object.entries(RADIUS).map(([name, value]) => [name, `${value}`])}
					/>
					<Metric
						label="Motion"
						entries={[
							["tap", `${MOTION.tap}ms`],
							["transition", `${MOTION.transition}ms`],
							["sheet", `${MOTION.sheet}ms`],
							["easing", MOTION.easing.join(", ")],
						]}
					/>
				</div>
			</Plate>

			<Plate
				title="Covers"
				note="Generated, not designed one by one: the colourway is fnv1a64(book.id) % 6."
			>
				<div className="flex flex-wrap gap-6">
					{FIXTURE_BOOKS.map((book) => (
						<figure key={book.id} className="m-0 flex flex-col gap-2">
							<BookCover book={book} footer={book.contentStatus} />
							<figcaption className="font-mono text-[11px] text-ink-faint">{book.id}</figcaption>
						</figure>
					))}
					{/* Ids that do not exist yet, to show the spread of the six colourways. */}
					{["vachanamrut", "shikshapatri", "swamini-vato", "aarti-sangrah"].map((id) => (
						<figure key={id} className="m-0 flex flex-col gap-2">
							<BookCover book={{ id, title: { gu: PLACEHOLDER_TITLES[id] ?? id } }} />
							<figcaption className="font-mono text-[11px] text-ink-faint">{id}</figcaption>
						</figure>
					))}
				</div>
			</Plate>

			<Plate title="The page" note="Where all of it is going.">
				<div className="grain overflow-hidden rounded-xl border border-rule bg-paper">
					<div className="flex items-center justify-between border-rule border-b px-6 py-3 text-ink-faint text-xs">
						<span className="font-gujarati">ગાયત્રી મંત્ર</span>
						<span>Original · Transliteration</span>
					</div>
					<div className="flex flex-col gap-5 px-6 py-7">
						{FIXTURE_BOOKS[0]?.structure.map((unit) =>
							unit.kind === "verse" && typeof unit.layers.gu === "string" ? (
								<div key={unit.id} className="grid grid-cols-[26px_minmax(0,1fr)] gap-4">
									<span className="text-right font-gujarati text-ink-faint">{unit.number}</span>
									<div>
										<ScriptureText
											form={unit.form}
											highlight={unit.id === "v3" ? tokens.marks.saffron : undefined}
										>
											{unit.layers.gu}
										</ScriptureText>
										{typeof unit.layers.iso === "string" ? (
											<p className="mt-1 mb-0 text-ink-faint text-xs italic">{unit.layers.iso}</p>
										) : null}
									</div>
								</div>
							) : null,
						)}
					</div>
				</div>
			</Plate>
		</div>
	);
}

const PLACEHOLDER_TITLES: Record<string, string> = {
	vachanamrut: "વચનામૃત",
	shikshapatri: "શિક્ષાપત્રી",
	"swamini-vato": "સ્વામીની વાતો",
	"aarti-sangrah": "આરતી સંગ્રહ",
};

function Plate({ title, note, children }: { title: string; note: string; children: ReactNode }) {
	return (
		<section className="grid gap-6 border-rule border-b py-12 md:grid-cols-[130px_minmax(0,1fr)] md:gap-10">
			<div className="md:sticky md:top-16 md:self-start">
				<h2 className="m-0 font-semibold text-sm">{title}</h2>
				<p className="mt-1 mb-0 text-ink-faint text-xs leading-relaxed">{note}</p>
			</div>
			<div className="flex min-w-0 flex-col gap-6">{children}</div>
		</section>
	);
}

function Metric({ label, entries }: { label: string; entries: [string, string][] }) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-[11px] font-semibold tracking-[0.16em] text-ink-faint uppercase">
				{label}
			</span>
			<ul className="m-0 flex list-none flex-col gap-1 p-0 text-ink-muted text-xs">
				{entries.map(([name, value]) => (
					<li
						key={name}
						className="flex justify-between gap-3 border-rule border-b border-dotted pb-1"
					>
						<span>{name}</span>
						<span className="font-mono text-ink tabular-nums">{value}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
