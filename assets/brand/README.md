# Brand assets

Everything in this folder is **generated**. Do not edit it by hand — change
`packages/core/src/design/mark.ts` and run `bun run icons:sync`.

## The mark

The tilak-chandlo: the U of chandan with the kumkum chandlo inside it, the mark the
Swaminarayan Sampradaya has carried for two centuries and the one thing every denomination
shares. It costs the design language no new colour — the chandan is the `ink` cloth's ink
from `cover.ts` and the kumkum is the accent, which `themes.ts` already describes as "the
colour of kumkum".

Geometry lives on a 100 × 100 artboard in `MARK_GEOMETRY`. The chandlo sits *above* the
optical centre; that was settled by eye and `mark.test.ts` guards it, so if the centring
looks wrong to you, read the test before moving it.

| File | What it is |
|---|---|
| `mark-dark.svg` | The mark on the `ink` cloth — the primary lockup |
| `mark-sand.svg` | The mark on sandalwood — the light-mode alternate |
| `mark-mono.svg` | One colour on transparency, for platform slots that tint it themselves |
| `mark-dark.png`, `mark-sand.png` | 1024px references for anywhere SVG is not accepted |

## Where the rest goes

`bun run icons:sync` also writes into `apps/mobile/assets/images/` (iOS light/dark/tinted,
the three Android adaptive layers, splash and favicon) and `apps/web/public/` (a
theme-aware `favicon.svg`, PNG fallbacks, `apple-touch-icon`, PWA and maskable icons,
`favicon.ico` and `site.webmanifest`).

## Not generated

The wordmark. `ગ્રંથાલય` is set in Rasa and a real wordmark needs the glyphs converted to
outlines, which needs a font toolchain this repo does not carry. Until then, set it live in
Rasa 400 with no tracking on the Gujarati line (P0.3).
