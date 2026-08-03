/**
 * Human labels and short explainers for assembly flags.
 *
 * Keys match what `assemble` writes on a passage. Unknown flags fall back to the raw id.
 */

export type FlagHelp = {
	label: string;
	description: string;
};

const FLAGS: Record<string, FlagHelp> = {
	"no-number": {
		label: "No number",
		description: "This passage has no printed verse number on the page.",
	},
	"duplicate-number": {
		label: "Duplicate number",
		description: "The same printed number appears more than once in sequence.",
	},
	"out-of-sequence": {
		label: "Out of sequence",
		description: "The printed number jumps relative to the passages around it.",
	},
	orthography: {
		label: "Orthography",
		description:
			"Import found Gujarati letter sequences that cannot be spelled — re-read carefully.",
	},
	"spans-pages": {
		label: "Spans pages",
		description: "This passage crosses a page break; check every page it sits on.",
	},
	"hyphen-join": {
		label: "Hyphen join",
		description: "A line-break hyphen was joined during normalization — confirm the word.",
	},
	"very-short": {
		label: "Very short",
		description: "Unusually short for a passage — may be a caption or a split error.",
	},
	"contains-quotation": {
		label: "Quotation",
		description: "Contains quotation marks; check that speech boundaries are correct.",
	},
};

export function flagHelp(flag: string): FlagHelp {
	return (
		FLAGS[flag] ?? {
			label: flag.replace(/-/g, " "),
			description: `Assembly flag “${flag}”.`,
		}
	);
}

export function flagLabel(flag: string): string {
	return flagHelp(flag).label;
}

export function flagDescription(flag: string): string {
	return flagHelp(flag).description;
}

export const STATUS_HELP: Record<"raw" | "proofed" | "approved", string> = {
	raw: "Unread — nobody has cleared this against the page yet.",
	proofed: "Read against the page, but not yet cleared for export.",
	approved: "Cleared for export. Enter also approves and advances.",
};
