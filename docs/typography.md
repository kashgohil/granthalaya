# Gujarati typography & rendering

> Status: **v1** (P0.3). The canonical implementation is `packages/core/src/text/`; this
> document explains the *why*, the code is the *what*. When they disagree, the code wins and
> this document is the bug.

Gujarati is not Latin with different glyphs. Its letters stack marks above and below the
baseline, its consonants fuse into conjuncts that are single indivisible shapes, and its
line-breaking has rules of its own. Every one of the constraints below exists because
ignoring it produces text that a Gujarati reader sees as broken — not merely as ugly, but as
*wrong*, which in a scripture is the failure this project cannot afford.

They are stated once, here and in code, so no screen has to rediscover them.

---

## 1. The non-negotiables

| Rule | Value | Enforced by |
|---|---|---|
| Line height | 1.7–2.0× font size | `lineHeightBand`, `clampLineHeight`, `checkTextStyle` |
| Base size | 10–15% larger than Latin at the same nominal size | `scriptSizeScale`, `resolveTextStyle` |
| Letter spacing | exactly `0`, at every size and weight | `INDIC_LETTER_SPACING`, `checkTextStyle` |
| Alignment | ragged-right; never justified | `resolveTextStyle`, `checkTextStyle` |
| Highlights | background wash; never underline or strike | `HIGHLIGHT_RENDERING`, `checkTextStyle` |
| Hyphenation | off | the per-platform adapters |
| Text cuts | only on akshara boundaries | `aksharaSpans` and everything built on it |
| Danda | never orphaned onto its own line | `protectDanda` |

`checkTextStyle(style, script)` returns a violation list for any of the rules a style object
can express. It exists so "we follow the typography rules" is a test, not a habit.

### Line height: 1.7–2.0

Gujarati sets marks two levels above the baseline — a matra plus an anusvara or a Vedic tone
— and hangs conjunct tails below it. At the 1.4–1.5 that suits Latin, the descending zone of
one line meets the ascending zone of the next and the page reads as noise rather than as
text. 1.7 is where they clear. Past 2.0 the lines stop cohering into a paragraph.

The mobile and web render surfaces both ship a toggle that forces 1.4× so the collision can
be seen rather than taken on trust.

### Base size: +10–15%

Gujarati carries its weight in a shorter x-height than Latin and spends vertical room on
marks, so at a nominal 16px it reads smaller than 16px Latin does. `resolveTextStyle` applies
1.12 — the middle of the band — to `gujr` and `deva`, and 1.0 to `latn`. Callers pass the
Latin-equivalent size they mean; they never pre-multiply it themselves.

### Letter spacing: zero, always

The shaper has already positioned the parts of a conjunct relative to each other. Tracking
inserted between them pushes a rakar or a reph off its base, which reads as a misspelling
rather than as loose type. This is not a matter of degree — there is no small safe value.

Latin chrome may track; the rule is about splitting conjuncts, not about taste.

### Highlights are a wash, never a line

An underline is drawn exactly where Gujarati's below-base matras and conjunct tails live, so
it strikes through the letters it means to mark. A background sits behind the glyphs and
touches nothing. This governs highlights (P3.1), search-result emphasis (P2.6) and the
current-verse indicator during follow-along playback (P4.2).

### Android: leave `includeFontPadding` on

Android's `includeFontPadding` reserves the room a tall matra stack or a below-base conjunct
needs. Switching it off is the standard trick for tightening Latin text, and on Gujarati it
clips. The mobile adapter sets it explicitly so nobody removes it as dead configuration.

---

## 2. Aksharas — the unit a cut may fall on

An **akshara** is an orthographic syllable: a consonant, everything stacked on or under it,
and every further consonant bound to it by a virama. `ક્ષ` is three code points and one
akshara. `પ્રચોદયાત્` is ten code points and five: `પ્ર · ચો · દ · યા · ત્`.

Cutting inside one leaves a dead consonant floating alone or a matra with nothing to attach
to — visible corruption of scripture. So every feature that cuts text goes through
`aksharaSpans`:

- first-letter prompts and progressive hiding (P5.2)
- cloze blanks and word-bank chips (P5.2)
- truncated titles on the library shelf (P2.1)
- search-result snippets (P2.6)

`String.slice`, `split("")` and `[...text]` are all wrong for this. So is `Intl.Segmenter`,
which Hermes does not ship — one reason the segmenter is hand-written and lives in
`packages/core`, where it runs identically on the phone, in the studio and in the pipeline.

### The rule the segmenter implements

```
akshara := base (mark | ZWJ)* ( virama (ZWJ)* consonant (mark)* )* (virama)?
```

Two details are worth stating explicitly, because they are where naive implementations go
wrong:

- **A word-final halant stays with its consonant.** `પ્રચોદયાત્` ends in `ત્`, not in `ત`
  followed by an orphan mark.
- **ZWJ and ZWNJ mean opposite things here.** ZWJ requests a half-form, which renders as one
  shape, so the conjunct holds together and no cut is safe inside it. ZWNJ requests the
  dead-consonant form, which renders as two shapes, so it *is* a boundary. This follows
  Unicode 15.1's conjunct-cluster rule (UAX #29, GB9c).

Scope: Gujarati and Devanagari — the two Indic scripts `docs/book-format.md` admits — plus
combining-mark safety for Latin transliteration, where ISO 15919 spells `r̥` as `r` plus
U+0325 with no precomposed form. Adding a script means adding its virama, its consonant
range and its mark ranges to the tables in `akshara.ts`, and nothing else.

---

## 3. Danda handling

A danda (`।`) closes a line and a double danda (`॥`) closes a verse, usually with the verse
number nested between two of them: `॥ ૧ ॥`. A line-breaker treats the space before a danda
like any other and will start a line with a lone `॥`, or split `॥ ૧ ॥` across two lines.

`protectDanda` replaces the spaces inside a danda group with no-break spaces so the group
moves as a unit.

**It is a display transform, and only ever a display transform.** The text inside a book
package is what `hashVerse` covers and what search and audio alignment run against; writing a
no-break space back into it would change every verse hash and make the stored text differ
from the text that was proofed. Apply it where text meets the screen.

---

## 4. The font stack

Declared in `packages/core/src/text/fonts.ts`, downloaded by `bun run fonts:sync`
(`scripts/fetch-fonts.ts`), and committed.

| Role | Family | Weights | Why |
|---|---|---|---|
| `body` | **Rasa** | 400, 500, 700 | Drawn for continuous Gujarati reading, not for coverage |
| `bodyAlternate` | **Noto Serif Gujarati** | 400, 700 | Web fallback while Rasa loads; second option in the P2.3 font picker |
| `ui` | **Noto Sans Gujarati** | 400, 600 | Chrome: navigation, labels, settings |

All three are SIL OFL 1.1, so they can be embedded and redistributed. **Mukta Vaani** is the
documented substitute for the UI face — a legitimate second choice, left unbundled because
shipping two UI families costs ~350 KB on device to serve a preference nobody has expressed.

Three surfaces have to agree on these names: the sync script, the Expo registration and the
CSS. A typo in any one of them is silent — the platform falls back to a system font and
Gujarati still renders, just not in the typeface the book was designed around. Naming the
stack in one module makes that class of bug an import error instead.

### Why the artefacts differ per platform

- **Mobile** takes whole TrueType files, one per weight, into `apps/mobile/assets/fonts/`.
  React Native cannot instance a variable font or synthesise a weight, so each weight ships
  as its own registered family — `Rasa_700Bold`, not `Rasa` at `fontWeight: 700`.
- **Web** takes the WOFF2 files Google has already subset by writing system, with their
  `unicode-range`s, into `apps/web/public/fonts/` plus a generated
  `apps/web/src/styles/fonts.css`. There the cascade does pick faces by weight, and an
  English-only page never downloads the Gujarati subset.

Both are committed rather than fetched at build time: a build must not depend on a CDN, and a
font that silently changed version between two builds would reflow every book.

---

## 5. Render fixtures

`TYPE_SPECIMENS`, exported from `@granthalaya/core/fixtures`, is the text every surface must
draw correctly: conjuncts, matras above and below, a line-height stress pair, danda and verse
numbering, continuous prose, numerals, mixed Gujarati/Latin, and Devanagari. Each specimen
carries a `check` line stating what a correct rendering looks like *and what failure looks
like*, so the judgement is the same every time and on every device.

Two surfaces render the list:

- `apps/mobile/src/app/typography.tsx` — the Type tab
- `apps/web/src/routes/typography.tsx` — `/typography`

Holding them side by side is the point. Both take the same fixtures through the same
`packages/core` calls, so a difference between them is a platform shaping difference rather
than a content one.

**Simulators are not sufficient.** The iOS Simulator and the Android emulator use the host's
text engine and font fallback, and will hide exactly the shaping bugs this screen exists to
find. The check is only done when it has been done on real hardware.

---

## 6. What is not decided here

- **Colour, texture and the type scale** are P0.4. This document fixes the *ratios and
  rules*; the design tokens that pick specific sizes sit on top of them.
- **Reading settings** — user-chosen size, leading, margins and font — are P2.3. They feed
  `resolveTextStyle` and are clamped by `clampLineHeight`; the band is not a preference.
- **Text normalisation** (NFC, pre-base matra reorder repair, conjunct sanity checks) is
  P1.2, in the pipeline. Rendering assumes it has already happened.
