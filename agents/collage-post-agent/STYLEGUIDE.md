# Collage style guide

The spec behind the eight layout templates in `design/layouts/`: the **collage look and the layouts**. The templates are drawn in one palette (`orchid`: orchid type on espresso, a signal-red loud slide), which is only one of nine; a product folder adds a tenth (`brand`).

## 1. Format

| | |
|---|---|
| Canvas | 1080 × 1350 px (4:5 portrait, Instagram/LinkedIn carousel) |
| Export | PNG at 1× (1080 × 1350) or 2× (2160 × 2700) |
| Gutter | 80 px left/right for text; images and shapes bleed off every edge |
| Masthead | Brand name, centred, top 58 px, sans 25 px, ink colour, on every slide |
| Series | One palette per carousel, at most one "loud" slide, the cover first |

## 2. Typography

| Role | Face | Size @1080 | Leading | Notes |
|---|---|---|---|---|
| Display headline | Roboto Serif, weight 300, width 112 % | 62–142 px by layout | 0.94–1.02 | Sentence case, tracking −1.2 %, set in 2–5 short lines, `<br>` for rhythm |
| Figure | Roboto Serif 300, outline (4 px stroke) or solid | up to 480 px | 0.92 | One number, share or year per slide (`L-figure`) |
| Body / dek | Inter 400 | 30–31 px | 1.28–1.30 | Short paragraphs, 1.25 em gap; never more than about 30 words per block |
| Sticker | Inter 500 (labels: 600, caps, +8 % tracking) | 27 px (labels 23 px) | 1.26 | Ink slip with `--on-ink` type: the cover dek, then/now labels |
| Masthead | Inter 400 | 25 px | 1 | Centred |
| Emphasis | Underline, 2 px (4 px on headlines), offset 0.22 em | | | Used once per slide, on the key phrase or call to action |

Line pitch at 1080 px, at the default sizes (headlines shrink to fit): cover headline 133 px, strips 139 px (the strip height is 1.21 em), echo 100 px, note 88 px, split 84 px, quote 78 px, figure statement 63 px; body line pitch 40 px. The headline face is a close open-source match: a light, wide transitional serif with ball terminals. Both fonts are bundled in `design/fonts` (SIL OFL), including Latin Extended, so Romanian diacritics (ă â î ș ț) render.

## 3. Colour system (tokens)

Every colour on a slide comes from eight tokens. Photos are re-coloured with duotone/tritone filters built from the same tokens, so the whole carousel stays in one key.

| Token | Role | Value in `orchid` |
|---|---|---|
| `--bg` | Canvas: a near-black with a tint | `#1F110D` espresso |
| `--ink` | All type, outlines, strips, stickers, the note sheet, confetti | `#E95BCF` orchid |
| `--ink2` | Title on the loud slide, type on loud strips and labels, tape | `#F4C3ED` |
| `--loud` | Background of the loud slide; cutout outline, the hot strip, the stage band, the quotation mark | `#CB2B29` signal red |
| `--deep` | Bars and rules | `#691568` plum |
| `--slab` | The tilted slab the cover cutout breaks out of | `#821D23` oxblood |
| `--frame` | Backing behind prints, panes and the eye strip | `#1D081E` |
| `--on-ink` | Type on ink: strips, stickers, the note sheet | `= --bg` |

Image treatments (filters, applied in HTML):

| Class | Used for | Mapping (shadow → highlight) |
|---|---|---|
| `duo-hero` | Dark, low-key prints (a split pane, a full photo) | 4 stops, weighted dark: low-key, moody |
| `duo-cut` | Main cutout (breakout, figure) | deep loud/plum → ink → pale ink |
| `duo-pale` | The strips print; a washed-out pane | deep → pale lavender/tint |
| `duo-loud` | The quote's eye strip; a colour pane | dark loud → loud → ink |
| `duo-mono` / multiply | Black-and-white panes; the quote card and the sheets figure are greyscale multiplied onto their colour | neutral greyscale |
| `duo-ghost` | Faint fragments behind the note | bg → mid ink |
| `duo-shade` | Dark fragments behind the note | almost black → dark loud |
| `duo-t1 … t6` | Echo figures | six different tints of the palette |

Palettes (`src/palettes.ts`): `orchid` (the templates' own), `cobalt`, `acid`, `ember`, `ultraviolet`, `verdigris`, `saffron`, `newsprint` (light), `graphite`. The agent picks one per carousel from the topic, and avoids `orchid` unless asked, so the feed does not all turn pink and red.

## 4. Collage vocabulary

1. **Duotone everything.** No photo appears in its original colours.
2. **Cutouts.** Transparent-background figures, often with a 3 px outline in `--loud`, bleeding off a canvas edge.
3. **Hand cuts.** Photos without transparency get irregular "scissor" edges (`scissor-1/2/3`, `scissor-torn`).
4. **Tilt.** Prints, panes, strips, sheets, stickers and slabs rotate between −7° and +7°; tape and confetti up to ±25°. Nothing important sits perfectly square, except the text blocks themselves.
5. **Layering.** Type sits *over* images. Fragments sit *under* everything. A cutout may break *out of* its frame or step in front of the giant figure, never over a headline. Colour bars cut across.
6. **Paper and geometry.** Paper strips, ink stickers, torn sheets, translucent tape, flat bars, slabs, small confetti squares, 3 px outline frames offset from what they frame. No rounded corners, drop shadows, gradients-as-decoration or emoji.
7. **Repetition.** The same image repeats with variations: one cutout echoed in four tints, a portrait as eye strip and ID card, one photo in two treatments.
8. **Grain.** A light film grain over the whole canvas (`.grain`).
9. **Restraint in type.** One serif statement, one small sans block (or a sticker), at most one underline per slide.

## 5. Layouts

| # | Layout | Role in a carousel | Text | Images |
|---|---|---|---|---|
| 01 | `L-breakout`: breakout | Hook / slide 1 / single post | Giant headline on top (3–7 words); dek on an ink sticker (12–22 words) | 1 cutout standing on the bottom edge, breaking out over a tilted slab and outline frame, `duo-cut` + outline |
| 02 | `L-strips`: strips | Question / turn | The question cut into 2–4 tilted paper strips (4–9 words, the key strip loud); dek bottom-left | 1 photo or texture as a tilted, torn print bleeding bottom-right, `duo-pale` |
| 03 | `L-note`: note | Core claim / single post | Statement (10–20 words) on a torn ink sheet taped at the corners; dek bottom-right | 1–2 photos or textures as fragments peeking out behind the sheet, `duo-shade` / `duo-ghost` |
| 04 | `L-figure`: figure | One number, share or year | Giant outline numerals (1–5 characters); statement (8–16 words) below; source line | 1 cutout or object stepping in front of the numerals, `duo-cut` + outline |
| 05 | `L-split`: split | Comparison: then/now, before/after | A label sticker on each print (1–3 words); headline across the bottom (5–12 words) | 2 prints tilted against each other, the right one hand-cut; two images or one in two treatments |
| 06 | `L-quote`: quote | A person's voice / single post | Quote (10–24 words) under a giant loud quotation mark; name + role next to the card | 1 frontal portrait: an eye strip across the top (`duo-loud`) and a small ID card |
| 07 | `L-sheets`: sheets (**loud**) | 3–4 steps, tips or principles | Title (3–7 words); numbered paper sheets (4–9 words each) stacked down the right | 1 cutout printed onto the loud colour (multiply), an outline frame |
| 08 | `L-echo`: echo | Community / examples / CTA / closer | 2-line headline + dek with the underlined call to action, below the band | 1–4 cutouts growing left to right on a loud stage band, one tint each (`duo-t1…t4`) |

Typical 8-slide carousel: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08. Shorter carousels keep 01 first, end on 08 (or 07), and use 04, 05 and 06 only when the content has a sourced number, a real comparison or a real quote. A single post uses 01, 03, 04 or 06.

Templates with exact geometry live in `design/layouts/`. Run `npm run preview` to see every layout in every palette.

## 6. Image sourcing rules

- GPT Image 2.5 makes **image ingredients only**: cutouts, portraits, textures, objects. It never makes text, layouts or whole graphics. Prompts ask for black-and-white source material with no text or logos; colour comes from the HTML filters.
- **Real, named people** (a historical scientist, a writer, a living activist) are never generated. Their portraits come from Wikimedia Commons, public domain / CC0 by default, CC BY / BY-SA only when allowed, with credits written to `CREDITS.md`.
- Generated people are archetypes ("a Renaissance scholar with a long beard"), never look-alikes of real people.
- No brand logos or app icons; ghost textures show generic objects.
