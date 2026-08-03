# Design language

> Status: **v1** (P0.4). The canonical implementation is `packages/core/src/design/`; this
> document explains the *why*, the code is the *what*. When they disagree, the code wins and
> this document is the bug.

The product is a book. Everything below follows from that: paper rather than surfaces, ink
rather than text colours, a hairline rather than a shadow, and one warm accent that behaves
like a binding thread rather than like a brand.

Three things are non-negotiable, and each is enforced somewhere rather than remembered:

| Rule | Enforced by |
|---|---|
| No component names a colour. Every hex comes from `theme(name)` | review; `themes.test.ts` owns the values |
| No component names a font size. Every size comes from `resolveTypeStyle(token, script)` | `tokens.test.ts` runs `checkTextStyle` over every token × script |
| Text clears WCAG AA on every surface it is drawn on, in all four themes | `themes.test.ts` |

---

## 1. Four themes

Not four skins over one palette — four palettes for four kinds of light.

| Theme | What it is for | Notes |
|---|---|---|
| **White** | daylight, the default | warm near-white, never `#FFF` chrome on `#FFF` paper |
| **Sepia** | lamplight, long reading | the aged-paper theme; the warmest |
| **Dark** | night | a warm near-black, not a blue-grey |
| **Black** | an OLED phone in a dark room | true black, and the only theme without grain |

`system` is offered as a preference and resolves to **White by day, Dark at night**. Sepia
and Black are deliberately unreachable that way: the OS reports only light or dark, and
those two are choices a reader makes rather than states a phone can put them in.

### Roles, not colours

A screen asks for what a colour is *for*:

```
background   the app canvas          ink         primary text
surface      cards, sheets           inkMuted    secondary text
surfaceSunken wells, meters, inputs  inkFaint    labels, quiet chrome
paper        the reading page        rule        hairlines
accent       actions, active state   accentInk   text drawn on the accent
accentMuted  the accent as a wash    overlay     the scrim behind a sheet
marks.*      the four highlight washes (P3.1)
```

`paper` is separate from `surface` on purpose: the reading page is allowed to be quieter
than the app around it, and in Sepia it is a different stock from the cards.

### The accent

Sindoor terracotta — the colour of kumkum and of an old cloth binding. It shifts per theme:
the light themes take a deep, saturated version that holds 4.5:1 against paper (`#A65328`,
`#91461C`), the dark ones a lighter amber (`#DE9A55`) that would look washed out on white
but reads as lamplight on black.

It is the only chromatic voice in the product. Semantic colour (a destructive action, a
warning) is separate and does not borrow from it.

### Contrast is a test, not a taste

`themes.test.ts` checks every pairing the components actually produce — each ink role on
`background`, `surface`, `paper` and `surfaceSunken`; `accentInk` on `accent`; `accent` on
its own wash; and **ink on all four highlight washes**, because a highlight that drops the
text below AA makes a marked verse harder to read than an unmarked one. A repaint that
looks nicer and reads worse fails the suite.

---

## 2. Type

The rule that makes the P0.3 typography survive contact with a design system:

> **A token stores the Latin-equivalent size** — the number a designer means. What Gujarati
> is set at is derived from it.

`resolveTypeStyle(token, script)` composes the token with `resolveTextStyle`, so Gujarati
automatically gets +12% and the 1.7–2.0 leading band, and Latin keeps the tighter leading
the token asked for. A screen cannot choose a Gujarati size at all.

| Token | Latin size | Use |
|---|---|---|
| `display` | 30 | book titles, screen heroes |
| `title` | 22 | screen titles |
| `heading` | 17 | section headings |
| `body` | 15 | chrome copy, buttons, rows |
| `label` | 13 | tags, eyebrows — uppercase and tracked **in Latin only** |
| `caption` | 12 | footnotes, attributions |
| `verse` | 18 | scripture, and the anchor of the P2.3 settings sheet |
| `verseLarge` | 22 | a pull quote, a verse of the day |

Two families of role, which is the whole font system: **`ui` faces set the app, `body` faces
set the scripture**. A reader should be able to tell the text from the app without reading
either. Tracking exists on exactly one token and is dropped for Indic scripts, where any
tracking splits conjuncts.

---

## 3. Metrics

**Spacing** `2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64` — roughly geometric, so two steps read
as a clear difference. A 4px scale with every multiple available is not a scale, it is a
licence.

**Radius** `6` marks and chips · `10` controls · `16` cards and sheets · `24` covers and
modals · `999` pills. Larger surfaces take larger radii so curvature reads as consistent.

**Motion** `120ms` tap · `200ms` transition · `320ms` sheet, all on `cubic-bezier(.2,.8,.2,1)`
— things arrive quickly and settle. Three durations and one curve is the entire vocabulary;
a devotional reading app earns nothing from more. Reduce-motion must be honoured by the
consumer: these are durations, not permission.

**Elevation** is a hairline and a very soft shadow. Paper does not float.

---

## 4. The paper grain

One texture: a 128px tile of deterministic monochrome noise, generated by
`bun run design:sync` and committed. At 4–8% it stops a large flat fill from banding on an
OLED panel and stops the reading surface from looking like a web view — the difference
between "a screen with a warm background colour" and "paper".

Mid-grey noise does both jobs with one asset: over light paper it darkens into fibre, over a
dark ground it lightens into film grain. What varies per theme is only the opacity and the
blend mode (`multiply` on light, `screen` on dark), and **Black sets it to zero** — grain on
a true black OLED panel is noise on pixels that would otherwise be off.

React Native has no blend modes, so the tile is composited by opacity alone; the web uses
`mix-blend-mode`. The result is close enough that the same tile and the same numbers serve
both.

---

## 5. Generated covers

A scripture library has no cover art. The editions these books come from are plain cloth and
a title, and inventing artwork would be a small fiction in a project whose first principle is
fidelity. So a cover is derived:

- the **colourway** is `fnv1a64(book.id) % 6` — six muted cloth bindings (indigo,
  terracotta, sage, plum, ochre, ink). The cloth is a gradient, so each ink is checked
  against the *lit corner* of its own cloth, not the flat base — `cover.test.ts`, and the
  reason `COVER_SHADING` lives in core rather than in the two renderers;
- the **artwork** is the book's own title, set in Rasa;
- the **initial** above it is `firstAkshara(title)`, so a conjunct is never cut in half;
- the physical cues are a shaded spine down the left edge, a double rule inset from the
  trim, and grain over the cloth.

Keyed on the id and nothing else, so it survives every content correction — a cover that
changed when the text was re-proofed would make the shelf feel unstable. `coverFor` returns
a spec; the two renderers (`apps/mobile/src/components/book-cover.tsx`,
`apps/web/src/components/book-cover.tsx`) draw it.

---

## 6. The shell

Four tabs, fixed at P0.4 so the phases that follow have somewhere to land:

| Tab | Today | Fills in at |
|---|---|---|
| **Today** | one verse, rotating by date, from the bundled sample | P7.3 |
| **Library** | the two format fixtures, as generated covers | P2.1 |
| **Study** | an honest empty state and the practice ladder | P4–P6 |
| **Settings** | the theme control (real), a reading preview, the rendering test | P2.3 |

The tab bar is the platform's own (`expo-router` native tabs): it gets the blur, the
scroll-edge behaviour and the accessibility for free, and this product has nothing to gain
from a bespoke navigation control. A stack sits above it so the reader, book detail and the
rendering test can be pushed rather than becoming tabs.

Chrome is English until a localization slice exists; content is Gujarati from the first
frame. Empty states say what *will* appear rather than that something is missing — an empty
screen is where a reading app either explains itself or feels broken.

---

## 7. The identity mark

The **tilak-chandlo**: the U of chandan with the kumkum chandlo inside it. The books this
library carries are almost all Swaminarayan Sampradaya, and the sampradaya has had a mark
for two centuries — one that every denomination shares, so it identifies the library
without taking a side between Vadtal, Ahmedabad, BAPS or Maninagar.

It was chosen over the obvious alternative — a book — for the reason the rest of this
document keeps arriving at: *the product is already a book*, so an icon that says "book"
restates the container instead of naming the contents. A book icon is also the single most
crowded shape in the category, and its bulk is the first thing to die at 48px.

It costs the language **no new colour**. `themes.ts` already describes the accent as "the
colour of kumkum"; the chandan is the ink of the `ink` colourway in `cover.ts`. The mark is
those two values on that cloth, which `mark.test.ts` asserts so the claim cannot quietly
stop being true.

| | |
|---|---|
| Arms | `x 30` / `x 70`, stroke `11`, round cap and join |
| Vertical | `y 18` to `y 77`, painting `12.5`–`82.5` after the caps |
| Chandlo | `cy 45`, `r 10.5` — **above** the optical centre of `47.5` |
| Chandan | `#E4DACA` · Kumkum `#A65328`, lifted to `#C4622F` on dark cloth |

The chandlo sitting *above* centre is the one number that took real work. The usual reason
to drop a dot below centre is that a closed lower form outweighs open upper strokes — but
the round caps topping these arms carry enough weight to cancel that, and raising the dot
into the open channel between the arms leaves a clear band of cloth beneath it, so the
cradle reads as a stroke that turns rather than a bowl holding something. There is a test
guarding it; read that before "fixing" the centring.

`bun run icons:sync` rasterises the mark into every platform asset — iOS light/dark/tinted,
the three Android adaptive layers, splash, favicons, PWA and maskable icons. Pixels come
from a signed-distance field in `scripts/rasterise.ts` rather than from a rasterised SVG,
so there is no native binary or headless browser between a fresh checkout and a build, and
the output is byte-deterministic enough to review as a diff. `docs/brand/icon-directions.html`
is the design record: the alternatives, the size ladders, and where each one failed.

Still open: the arm taper is drawn from geometry rather than traced from a reference, and
it is the detail a satsangi reads as right or wrong.

---

## 8. Sharing with the web

`packages/core/src/design/` is platform-neutral data. React Native reads it directly. A
browser cannot, so `bun run design:sync` emits `apps/web/src/styles/tokens.css` — every
theme as `--gr-*` variables, selected by `data-theme` on `<html>` — and `apps/web`'s
Tailwind `@theme` block names them (`bg-paper`, `text-ink-muted`, `border-rule`,
`bg-brand`). shadcn/ui's own vocabulary is pointed at the same tokens, so studio components
inherit the design language rather than shipping a second palette.

`/design` renders the whole language from the tokens: switch theme at the top and every
swatch, specimen and cover below re-renders. It is the studio's parity surface and the place
a token change is checked before it ships.

---

## 9. What is not decided yet

- **The wordmark.** The mark is done (§7); `ગ્રંથાલય` is not. A real wordmark needs the Rasa
  glyphs converted to outlines, which needs a font toolchain this repo does not carry — so
  it is set live in Rasa 400 for now, with no tracking on the Gujarati line. Store assets
  are P8.2.
- **A second UI face.** Mukta Vaani stays documented as Noto Sans Gujarati's substitute and
  unbundled (P0.3's decision).
- **Localized chrome.** Gujarati UI strings need a localization slice; none exists.
- **Android.** Nothing in this document has been seen on an Android device — see the open
  items under P0.3 and P0.4 in `ROADMAP.md`.
