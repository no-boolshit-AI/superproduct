# Collage style guide

The spec behind the seven layout templates in `design/layouts/`: the **collage look and the layouts**. The templates are drawn in one palette (`orchid`: orchid type on espresso, a signal-red loud slide), which is only one of nine; a product folder adds a tenth (`brand`).

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
| Display headline | Roboto Serif, weight 300, width 112 % | 66–136 px by layout | 0.95–1.0 | Sentence case, tracking −1.2 %, set in 2–5 short lines, `<br>` for rhythm |
| Body / dek | Inter 400 | 30–31 px | 1.28–1.30 | Short paragraphs, 1.25 em gap; never more than about 45 words per block |
| Masthead | Inter 400 | 25 px | 1 | Centred |
| Emphasis | Underline, 2 px (4 px on headlines), offset 0.22 em | | | Used once per slide, on the key phrase or call to action |

Line pitch at 1080 px: cover headline 129 px, statement 98 px, filmstrip 72 px, layered 65 px; body line pitch 44 px. The headline face is a close open-source match: a light, wide transitional serif with ball terminals. Both fonts are bundled in `design/fonts` (SIL OFL), including Latin Extended, so Romanian diacritics (ă â î ș ț) render.

## 3. Colour system (tokens)

Every colour on a slide comes from eight tokens. Photos are re-coloured with duotone/tritone filters built from the same tokens, so the whole carousel stays in one key.

| Token | Role | Value in `orchid` |
|---|---|---|
| `--bg` | Canvas: a near-black with a tint | `#1F110D` espresso |
| `--ink` | All type, outlines, the band, confetti | `#E95BCF` orchid |
| `--ink2` | Body copy on the loud background | `#F4C3ED` |
| `--loud` | Background of the loud slide; cutout outline | `#CB2B29` signal red |
| `--deep` | Wedges and bars | `#691568` plum |
| `--slab` | Large angular slab behind a cutout | `#821D23` oxblood |
| `--frame` | Filmstrip frame | `#1D081E` |
| `--on-ink` | Title text on the ink band | `= --bg` |

Image treatments (filters, applied in HTML):

| Class | Used for | Mapping (shadow → highlight) |
|---|---|---|
| `duo-hero` | Full-bleed cover | 4 stops, weighted dark: low-key, moody |
| `duo-cut` | Main cutout | deep loud/plum → ink → pale ink |
| `duo-pale` | Secondary cutout | deep → pale lavender/tint |
| `duo-loud` | Filmstrip frames | dark loud → loud → ink |
| `duo-mono` / multiply | Lineage cards | greyscale multiplied onto an ink square |
| `duo-ghost` | Background textures | bg → mid ink, shown at about 40 % opacity |
| `duo-shade` | Torn background fragments | almost black → dark loud |
| `duo-t1 … t6` | Mosaic tiles | six different tints of the palette |

Palettes (`src/palettes.ts`): `orchid` (the templates' own), `cobalt`, `acid`, `ember`, `ultraviolet`, `verdigris`, `saffron`, `newsprint` (light), `graphite`. The agent picks one per carousel from the topic, and avoids `orchid` unless asked, so the feed does not all turn pink and red.

## 4. Collage vocabulary

1. **Duotone everything.** No photo appears in its original colours, except a ghost texture, which may keep faint colour.
2. **Cutouts.** Transparent-background figures, often with a 3 px outline in `--loud`, bleeding off a canvas edge.
3. **Hand cuts.** Photos without transparency get irregular "scissor" edges (`scissor-1/2/3`, `scissor-torn`).
4. **Tilt.** Rows, cards and words rotate between −30° and +30°. Nothing important sits perfectly square, except text boxes and the band.
5. **Layering.** Type sits *over* images. Dark fragments sit *under* everything. Colour bars cut across.
6. **Geometry.** Flat bars, wedges, slabs, small confetti squares, 3 px outline frames. No rounded corners, drop shadows, gradients-as-decoration or emoji.
7. **Repetition.** The same image repeats with variations: photo-booth frames, double exposures, a mosaic of tints.
8. **Grain.** A light film grain over the whole canvas (`.grain`).
9. **Restraint in type.** One serif statement, one small sans block, at most one underline per slide.

## 5. Layouts

| # | Layout | Role in a carousel | Text | Images |
|---|---|---|---|---|
| 01 | `L-cover`: cover portrait | Hook / slide 1 | Dek top-right (10–22 words); giant headline bottom-left (3–7 words) | 1 full-bleed portrait or scene, `duo-hero` |
| 02 | `L-diagonal`: diagonal question | Provocation / turn | Question as rotated, stair-stepped words (3–5); dek top-right; caption bottom-left with underline | 1 transparent cutout bleeding bottom-right, `duo-cut` + outline |
| 03 | `L-statement`: statement + ghost | Core claim | Statement (10–18 words) top; short dek lower right | 1 texture/object, tilted −24°, faded |
| 04 | `L-layered`: layered collage | Story / example from history | Dek top-left; statement across the bottom (12–22 words) | 1 cutout bust (`duo-pale`), 1–2 dark fragments, bars, slab |
| 05 | `L-filmstrip`: filmstrip | Human / identity point | Statement right (14–24 words); attribution below | 1 frontal portrait reused in 4 frames (crop / plain / double / offset) |
| 06 | `L-lineage`: lineage box (**loud**) | List of 3–4 traits or steps | 4 outlined boxes (4–9 words each) + a title band (2–4 words) | 4–7 small portraits on tilted ink squares |
| 07 | `L-mosaic`: mosaic grid | Examples today / CTA / closer | 2-line headline + aside with an underlined CTA | 6–10 portraits in three tilted rows, a different tint per tile |

Typical 7-slide carousel: 01 → 02 → 03 → 04 → 05 → 06 → 07. Shorter carousels keep 01 first and end on 07 or 06. A single post uses 01, 03 or 05.

Templates with exact geometry live in `design/layouts/`. Run `npm run preview` to see every layout in every palette.

## 6. Image sourcing rules

- GPT Image 2.5 makes **image ingredients only**: cutouts, portraits, textures, objects. It never makes text, layouts or whole graphics. Prompts ask for black-and-white source material with no text or logos; colour comes from the HTML filters.
- **Real, named people** (a historical scientist, a writer, a living activist) are never generated. Their portraits come from Wikimedia Commons, public domain / CC0 by default, CC BY / BY-SA only when allowed, with credits written to `CREDITS.md`.
- Generated people are archetypes ("a Renaissance scholar with a long beard"), never look-alikes of real people.
- No brand logos or app icons; ghost textures show generic objects.
