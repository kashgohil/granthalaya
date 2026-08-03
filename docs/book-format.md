# Book format & verse addressing

> Status: **v1 draft** (P0.2). The canonical implementation is `packages/core/src/book/`;
> this document explains the *why*, the schemas are the *what*. When they disagree, the
> schemas win and this document is the bug.

Every other part of Granthalaya hangs off this format. The pipeline emits it, the studio
edits it, the API serves it, the reader renders it, and every annotation, flashcard, quiz
question and audio timestamp is keyed to an ID defined here.

---

## 1. What a book package is

A **book package** is a single canonical JSON document, `book.json`, describing one edition
of one work: its provenance, its structure, and its text.

```
vachanamrut@1.0.0/
  book.json          # the package — manifest + structure + content
  audio/             # (P4) optional per-verse audio, added later
  images/            # (P1) optional page scans for studio proofing, never shipped to clients
```

Three properties make the rest of the system simple:

**It is a build artifact, not a working document.** The studio's editable state lives in a
database with per-verse proofing status, revision history and OCR confidence. A package is
what falls out of that when you press Publish. Nothing edits a package in place.

**It is immutable once published.** Corrections ship as a new `contentVersion`, never as an
edit to a released one. A client that has `vachanamrut@1.0.0` installed and a client that
downloads it a year later hold byte-identical text.

**It is one file.** Splitting a large book across files buys nothing here: the mobile client
ingests the whole package into SQLite at install time, so runtime memory is unrelated to file
layout, and a single document is trivial to hash, sign, diff and validate. Even a large prose
corpus is a few megabytes of text and compresses to a fraction of that. If a book ever
genuinely outgrows this, the manifest can gain a `parts` array — an additive change.

---

## 2. The structure tree

A book's `structure` is an ordered tree of **units**. There are exactly two kinds of unit:

- a **division** — `volume`, `section`, `chapter` or `passage` — which has `children`
- a **verse** — the leaf, which has `layers`

```
sample-prose                      book
└─ khand-1                        division  (section)
   └─ 3                           division  (chapter)
      ├─ p1                       verse     (form: prose)
      ├─ p2                       verse     (form: prose)
      ├─ quote-1                  division  (passage)
      │  ├─ v1                    verse     (form: verse)
      │  └─ v2                    verse     (form: verse)
      └─ p3                       verse     (form: prose)
```

Divisions may nest freely and may mix division and verse children, as above — a discourse
that quotes a shloka mid-paragraph is a chapter holding prose verses and one passage.
The tree has no fixed depth: a four-line stotra is a book with four verse children and no
divisions at all.

### "Verse" means *smallest addressable unit*

This is a deliberate widening of the word, and the most important naming decision in the
format. A verse is a shloka, a line of an aarti, **or a paragraph of a prose discourse** —
whatever the smallest chunk is that a reader would highlight, memorize, hear read aloud, or
link to. It is the atom.

The alternative — a `verse` type for poetry and a separate `paragraph` type for prose — would
fork every downstream feature into two code paths for no benefit: highlights, SRS items,
audio timestamps and quiz sources all want "the smallest addressable unit" and don't care
about its literary form. One word, one ID space, one atom.

Where literary form *does* matter — typography — the leaf carries `form: "verse" | "prose"`.
That drives rendering (centred, line-broken padas versus a ragged-right paragraph) and
nothing else.

### Numbering is display, IDs are identity

A unit's `id` is a machine identifier, assigned once and never changed (§3). Its `number` is
what the printed edition calls it — `"૨૧"`, `"21"`, `"3a"` — and exists purely to be shown.
Re-numbering a book across editions never touches an ID.

---

## 3. Verse addressing

### Grammar

```
ref      := bookId ( "/" segment )* ( "#" leaf )?
bookId   := segment
segment  := [a-z0-9]+ ( "-" [a-z0-9]+ )*
leaf     := segment
```

```
vachanamrut                        the whole book
vachanamrut/gadhada-1              a section
vachanamrut/gadhada-1/21           a chapter
vachanamrut/gadhada-1/21#v3        a verse — the atom
```

The path before `#` is the chain of division `id`s from the book root. The fragment after
`#` is the verse. One grammar therefore addresses both "link me to this chapter" and "anchor
this highlight to this verse", and — because only a verse carries a `#` — you can tell which
you're holding without consulting the tree. Deep links are the same strings with a scheme in
front.

IDs are only unique among siblings; the full ref is what's globally unique.

### Stability rules — the whole point

User data outlives book content. A highlight made against `v1.0.0` must still land on the
right words after a typo fix in `v1.0.1` and after a re-OCR in `v2.0.0`. Therefore:

1. **An ID, once published, is never reused for different content.** Not after a re-run of
   OCR, not after a restructure, not after a correction.
2. **An ID is never renumbered to keep a sequence tidy.** If verse 7 turns out to be two
   verses, the second one gets a new ID (`v7b`); everything after it keeps the ID it had.
   Display numbering is free to renumber — that's what `number` is for.
3. **When content genuinely moves, the old ref is retired into `aliases`.**

`aliases` maps a retired ref to its successor:

```json
"aliases": {
  "sample-prose/khand-1/3#p0": "sample-prose/khand-1/3#p1",
  "sample-prose/khand-1/9#v4": "sample-prose/khand-1/9"
}
```

A merge points two old refs at one new one. A split points the old ref at whichever half
inherits it. A deletion points the old ref at its containing division — "the text you
annotated is gone, here is where it was." On install of a newer version, a client rewrites
its local annotation keys through this map; anything not in the map and no longer resolvable
is orphaned, and the client is expected to surface that rather than silently drop it.

An alias source must not also exist as a live unit, and an alias target must resolve. Both
are checked by the validator.

---

## 4. Content layers

A verse is not one string. It's a stack of parallel readings of the same text, and readers
compose their own view by toggling them (P2.4).

Rather than five fixed fields, a book **declares its layers in the manifest** and each verse
supplies a value per declared layer:

```json
"layers": [
  { "id": "gu",    "kind": "original",        "language": "sa", "script": "gujr",
    "label": { "gu": "મૂળ" } },
  { "id": "iso",   "kind": "transliteration", "language": "sa", "script": "latn",
    "scheme": "iso-15919", "label": { "en": "Transliteration" } },
  { "id": "en",    "kind": "translation",     "language": "en", "script": "latn",
    "label": { "en": "English" }, "attribution": "…" },
  { "id": "words", "kind": "wordMeanings",    "language": "en", "script": "latn",
    "label": { "en": "Word by word" } }
],
"primaryLayer": "gu"
```

**The declaration list is ordered, and that order is the reader's toggle order.** It's an
array rather than a map because JSON objects are unordered by specification: a map would
bind layer ordering to JavaScript's insertion-order semantics, which a Python OCR step or a
future Swift client need not share — and which JavaScript itself breaks for a numeric layer
id like `1`, since the segment grammar permits one and integer-like keys are hoisted. An
array is order-preserving everywhere, and reordering layers in the studio is moving an
element rather than renumbering a field.

A verse's `layers` stays a map, keyed by layer id: lookup there is by name and order is
irrelevant.

```json
{
  "kind": "verse", "id": "v4", "number": "4", "form": "verse",
  "layers": {
    "gu": "ધિયો યો નઃ પ્રચોદયાત્ ॥",
    "iso": "dhiyo yo naḥ pracodayāt",
    "en": "may it impel our thoughts.",
    "words": [{ "word": "ધિયો", "meaning": "thoughts, intellect" }]
  }
}
```

Declared layers rather than fixed fields buys three things the fixed version can't:
**two translations side by side** (`en-sadhu`, `en-modern`), **per-layer attribution and
licence** — translations are frequently under different rights than the original, which
matters for publishing — and a reader UI that renders toggles from data instead of from a
hardcoded list.

`kind` tells the reader how to render and order a layer. Five kinds exist: `original`,
`transliteration`, `translation`, `wordMeanings`, `commentary`. All of them carry a plain
string except `wordMeanings`, which carries an ordered array of `{ word, meaning, note? }`.

### Text hygiene

**No text field may contain a control character.** Verse text allows `\n` — a verse can be
laid out over several lines — and nothing else in C0 or C1; titles, labels, numbering and
word glosses allow no control characters at all.

This is a schema rule rather than a pipeline convention because OCR and PDF extraction emit
form feeds, carriage returns and stray separators as a matter of course. Left unchecked they
enter published scripture invisibly, break shaping and line-breaking on the reader, and are
the one input class that could smuggle a separator into the verse hash's canonical form.
Rejecting them at the door means the pipeline has to normalize rather than being trusted to.

`primaryLayer` names the layer that *is* the scripture — the one that must be present on
every verse, is never hidden in the reader, and is what search, audio alignment and
memorization work against. Everything else is apparatus.

`language` and `script` are per layer, not per book, because they genuinely differ: a
Sanskrit stotra printed in Gujarati script is `language: "sa", script: "gujr"`, and its
transliteration is the same language in `latn`. The reader needs the script to pick a font
and the language to apply the right typographic rules (P0.3).

---

## 5. Versioning and change detection

### `contentVersion` (semver, per book)

| Bump | When | What a client must do |
|---|---|---|
| **major** | IDs retired, structure changed | Migrate local user data through `aliases` |
| **minor** | Content added — a new layer, new verses, new sections | Nothing; new material appears |
| **patch** | Text corrections within existing verses | Nothing; verse hashes change |

The version is part of the package's identity, not metadata on it. `vachanamrut@1.0.0` and
`vachanamrut@1.0.1` are two immutable artifacts that both exist.

### Two hashes, for two different jobs

**Per-verse content hash** — `verse.hash`, e.g. `f1a64:9a3f1c0b7d5e2a48`. Answers "did this
verse's text change between versions?" so the studio can show a diff after re-running OCR
and a client can skip re-indexing unchanged verses. It is **not** a security boundary, so it
is FNV-1a 64 over a canonical serialization of the verse's layers: pure TypeScript, no
BigInt-free tricks, no crypto API, identical in Bun, Hermes and the browser. Computing it
requires no platform capability, which is the entire reason it isn't SHA-256.

The canonical serialization is the layers only — sorted by layer id, NFC-normalized, joined
with control separators. IDs, numbering and `form` are deliberately excluded: they are
identity and presentation, not content, and changing them shouldn't read as a text change.

**Package integrity hash** — SHA-256 over the serialized `book.json`, recorded in the catalog
and verified by the client after download. This one *is* a security boundary and is computed
with real platform crypto by the pipeline and the API, never in `packages/core`. The catalog,
the publish-time cross-version audit that enforces the stability rules above, and the client's
install and upgrade contract are all in `docs/distribution.md` (P1.5).

---

## 6. Provenance

Every package carries where its text came from, because fidelity is a feature and because
publishing rights are per edition:

```json
"source": {
  "edition": "Vachanamrut, Swaminarayan Aksharpith, 5th ed.",
  "publisher": "…", "year": 1998, "isbn": "…", "url": "…", "notes": "…"
},
"license": { "id": "public-domain", "holder": "…", "notes": "…" },
"contentStatus": "draft"
```

`contentStatus` is the P1.3 proofing gate made structural: `draft` (machine output or
hand-authored, unverified), `proofed` (a human has read every verse against the source),
`published` (approved for distribution). **The catalog only serves `published` packages.**
A test fixture stays `draft` forever, and that is exactly why the field exists — nothing
unverified can be mistaken for scripture just because it validates.

---

## 7. Validation

Two layers, both in `packages/core`, both surfaced by `granthalaya validate <path>`:

`parseBook` runs the Zod schemas — shapes, enums, patterns, required fields.

`validateBook` additionally checks the things a schema can't express, and returns a flat list
of `{ severity, code, path, message }` where `path` is a book ref wherever one exists:

- every layer used by a verse is declared in the manifest, and its value shape matches the
  declared `kind`
- `primaryLayer` is declared, is an `original` layer, and is present on every verse
- sibling `id`s are unique, and no layer id is declared twice
- alias sources don't collide with live units; alias targets resolve
- recorded `verse.hash` values match a recomputation
- warnings: a transliteration layer without a declared `scheme`

Errors block publishing. Warnings don't.

---

## 8. Reference fixtures

Two hand-authored packages ship with `packages/core` (`@granthalaya/core/fixtures`) and are
round-tripped in its tests. They exist to pin the format, not to be read as scripture — both
are `contentStatus: "draft"`.

| Fixture | Shape it pins |
|---|---|
| `gayatri-mantra` | Verse form, no divisions, four layers including word-meanings, Sanskrit text in Gujarati script |
| `sample-prose` | Three-deep divisions, prose leaves, mixed division/verse siblings, an alias map, Gujarati-language text |

`sample-prose` is synthetic — text written for this repository, attributed to no edition —
because a fixture that *looks* like a real discourse but was reconstructed from memory is
precisely the failure this format is built to prevent. When a real proofed excerpt exists,
it replaces the fixture's content without changing its shape.
