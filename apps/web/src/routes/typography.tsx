import { aksharaSpans, fontFamily, lineHeightBand, resolveTextStyle } from "@granthalaya/core";
import { gayatriMantra, TYPE_SPECIMENS } from "@granthalaya/core/fixtures";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { ScriptureText } from "#/components/scripture-text";

export const Route = createFileRoute("/typography")({ component: TypographyPage });

/** The size the reading surface starts from — the same value the mobile screen uses. */
const BODY_SIZE = 18;

/**
 * The Gujarati rendering test page (P0.3) — the web half of the check.
 *
 * It renders the same specimens as the Expo screen, from the same fixtures, so the two can
 * be held side by side: any difference is a rendering difference rather than a content one.
 * It also stands in for the studio's proofing preview, which has to show an admin exactly
 * what a reader will see.
 */
function TypographyPage() {
	const [cramped, setCramped] = useState(false);
	const band = lineHeightBand("gujr");
	const resolved = resolveTextStyle({ script: "gujr", baseFontSize: BODY_SIZE });

	return (
		<div className="mx-auto max-w-3xl px-6 py-12">
			<h1 className="display-title text-4xl">Gujarati rendering</h1>
			<p className="mt-3 text-ink-muted text-sm">
				The same specimens the mobile app renders, from <code>@granthalaya/core/fixtures</code>.
				Compare the two: a difference here is a platform shaping difference, not a content one.
			</p>

			<Section
				title="Leading"
				check={`Toggle to Latin's 1.4× leading. The marks above one line should meet the conjuncts hanging below the line before it — the collision the ${band.min}–${band.max}× band exists to prevent.`}
			>
				<button
					type="button"
					onClick={() => setCramped((value) => !value)}
					className="mb-2 rounded-md border px-3 py-1 text-sm"
				>
					{cramped ? "1.4× — Latin leading, forced past the rule" : "1.8× — the Gujarati default"}
				</button>
				<ScriptureText
					form="verse"
					size={BODY_SIZE}
					style={cramped ? { lineHeight: `${Math.round(resolved.fontSize * 1.4)}px` } : undefined}
				>
					{"કૃષ્ણ હૃદય મુદ્રા દૃષ્ટિ\nશ્રી ઊંચે કૈંક ઔષધિ ઈંટ"}
				</ScriptureText>
			</Section>

			{TYPE_SPECIMENS.map((specimen) => (
				<Section key={specimen.id} title={specimen.title} check={specimen.check}>
					{specimen.samples.map((sample) => (
						<ScriptureText key={sample} script={specimen.script} form="verse">
							{sample}
						</ScriptureText>
					))}
				</Section>
			))}

			<Section
				title="Danda, at every column width"
				check="Drag the column narrower. The danda must never begin a line, and `॥ ૪ ॥` must never split — the group moves to the next line whole."
			>
				<div className="resize-x overflow-auto rounded-md border p-3" style={{ width: "22rem" }}>
					<ScriptureText form="verse">ધિયો યો નઃ પ્રચોદયાત્ ॥ ૪ ॥</ScriptureText>
				</div>
			</Section>

			<Section
				title="Highlight"
				check="A background wash, never an underline: an underline is drawn exactly where the below-base matras live."
			>
				<ScriptureText form="verse" highlight="rgba(250, 204, 21, 0.35)">
					ધિયો યો નઃ પ્રચોદયાત્ ॥
				</ScriptureText>
			</Section>

			<Section
				title="Akshara segmentation"
				check="Each box is one akshara. No box may hold a bare consonant with a visible halant belonging to the next — that is what a wrongly placed cut looks like."
			>
				{["પ્રચોદયાત્", "ભૂર્ભુવઃ", "દૃષ્ટિ"].map((word) => (
					<div key={word} className="mb-2 flex flex-wrap gap-1">
						{/* Keyed by offset, not by text: an akshara repeats within a word. */}
						{aksharaSpans(word).map((span) => (
							<span key={span.start} className="rounded-md border px-2 py-0.5">
								<ScriptureText as="span" size={16}>
									{span.text}
								</ScriptureText>
							</span>
						))}
					</div>
				))}
			</Section>

			<Section
				title="A real book"
				check={`The ${gayatriMantra.id} fixture, rendered through the same rules the reader will use.`}
			>
				{gayatriMantra.structure.map((unit) =>
					unit.kind === "verse" && typeof unit.layers.gu === "string" ? (
						<ScriptureText key={unit.id} form={unit.form}>
							{unit.layers.gu}
						</ScriptureText>
					) : null,
				)}
			</Section>

			<Section
				title="Faces"
				check="A face that failed to load falls back through the stack — it will look obviously different from its neighbours."
			>
				{(["body", "bodyAlternate", "ui"] as const).map((face) =>
					fontFamily(face).weights.map((weight) => (
						<div key={`${face}-${weight}`} className="mb-2">
							<div className="text-xs opacity-60">
								{fontFamily(face).family} {weight}
							</div>
							<ScriptureText face={face} weight={weight} size={16}>
								ગ્રંથાલય · Granthalaya
							</ScriptureText>
						</div>
					)),
				)}
			</Section>

			<Section
				title="Metrics"
				check="What core resolved for this page's body size, for comparison against the mobile screen."
			>
				<code className="text-xs">{JSON.stringify(resolved)}</code>
			</Section>
		</div>
	);
}

function Section({
	title,
	check,
	children,
}: {
	title: string;
	check: string;
	children: ReactNode;
}) {
	return (
		<section className="grain mt-6 rounded-xl border border-rule bg-surface p-5">
			<h2 className="font-semibold text-sm">{title}</h2>
			<p className="mt-1 mb-4 text-sm opacity-70">{check}</p>
			{children}
		</section>
	);
}
