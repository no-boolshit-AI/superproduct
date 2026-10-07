# Component reference

Every slide is ONE fragment: `<section class="slide [modifier]">…</section>`. The section is a flex column with
`--pad` padding (96px). Children flow top to bottom; push a block to the bottom with `mt-auto`.
Background layers (`.bg`) and effects (`.fx-*`) are absolutely positioned and must come FIRST inside the section.

## Slide modifiers
| class | use |
|---|---|
| (none) | solid brand blue, white type (default for inner slides) |
| `slide--deep` | darker brand blue |
| `slide--light` / `slide--white` | light grey / white canvas, ink type, blue accents (use sparingly, e.g. a data slide) |
| `slide--tight` / `slide--roomy` | 72px / 120px padding |

## Background image layers (put the generated image inside)
```html
<div class="bg bg--duotone"><img src="assets/cover.jpg" alt=""></div>
```
| class | effect |
|---|---|
| `bg` | full-bleed image, object-fit cover; set focal point with `style="--focus: 50% 30%"` |
| `bg--duotone` | forces ANY image into the brand palette (grayscale → luminosity blend on brand blue + violet soft light). Default for covers. Tunables: `--contrast`, `--brightness` |
| `bg--tint` | keeps natural colours, multiplies a brand wash on top (`--tint: .35`) |
| `bg--soft` | blurs the image (`--blur: 6px`), combine with duotone for a calm backdrop |
| `bg--ghost bg--ghost-left` (`-right`, `-top`, `-bottom`, `-corner`) | faint, blurred echo of the cover image fading in from one edge of a solid slide. Gives inner slides continuity with the cover. `--ghost: .28` |

## Effects (empty divs, after `.bg`, before content)
| class | effect |
|---|---|
| `fx-glow` | soft light blooms (top-right light blue, bottom-left violet) |
| `fx-vignette` | darkens the edges (`--vignette: .45`) |
| `fx-grain` | film grain / noise for a printed, premium texture (`--grain: .16`) |
| `fx-dots` | dotted halftone pattern fading in from the right (`--dots-mask` to change direction) |
| `fx-grid` | faint blueprint grid, fades out at edges |
| `fx-shade-bottom` / `fx-shade-top` | gradient shade for legibility over images |
| `fx-sheen` | diagonal glass highlight |

## Glass panel (cover)
```html
<div class="glass glass--cover glass--center"> … </div>
```
Frosted, translucent brand-blue panel (backdrop blur over the image). `glass--cover` = centred box, 74% wide, 15% inset
top/bottom (`glass--tall` for more room). `glass--center` centres text. `glass--rounded` adds radius. Without `glass--cover`
it is an in-flow panel you can size yourself.

## Typography
| class | size @1080 | use |
|---|---|---|
| `h1` | 84 / light | inner-slide headline, ≤ 2 lines, ≤ ~22 characters per line |
| `h2` | 68 / light | cover headline inside glass, or longer inner headlines |
| `h3` | 52 / light | section headline |
| `display` | 64 / regular | big statement ("From five management layers to three") |
| `mega` | 200 / light | single giant number |
| `body-lg` | 38 | the one paragraph on a slide |
| `body` | 33 | supporting paragraph |
| `small` / `source` | 26 / 22 | footnotes, sources ("Source: company reports, 2025") |
Helpers: `muted`, `accent`, `light`, `medium`, `text-center`, `u` (underline). Use `<br>` to control headline line breaks.

## Labels & navigation
- `<span class="pill">Halden's transformation:</span>`: white pill, blue text (kicker / series label). `pill--outline`, `pill--brand`, `pill--sm`.
- `<a class="cta">Read the full case study</a>`: big white pill call to action (last slide, usually bottom-left with `mt-auto`).
- `<div class="next"></div>`: white pill with »» chevrons, bottom-right. Put on the cover (and optionally every slide except the last).
- `<div class="wordmark"></div>`: brand wordmark/logo from brand.json, bottom-left. Put on the cover (optional on the last slide).
- `<div class="counter">02 / 05</div>`: page counter, top-right (optional).

## Rules & layout
- `<hr class="rule">`: 1.5px translucent hairline, full width. Separates headline / content / takeaway. `rule--short` is a 120px accent bar.
- `stack` (+ `stack--xs|sm|lg|xl`), `row` (+ `row--top`, `row--end`, `between`), `grow`, `mt-auto`, `mb-auto`, `center`.
- `split`: two-column grid (1.05fr / 1fr) aligned to bottom. `split--even`, `split--top`.
- `cols-2`, `cols-3`: equal columns. `w-50 … w-90`: max-width.
- Inline `style` is fine for spacing (`margin-top:56px`) and CSS variables; keep spacing on an 8px grid (24/32/40/48/56/64/96).

## Big statistic
```html
<div class="stat">
  <span class="stat__value">&gt;8%</span>
  <div class="stat__meta">
    <i class="icon icon--growth icon--sm"></i>
    <span class="stat__label">operating profit<br>growth in year one</span>
  </div>
</div>
```
`stat--stacked` puts the label under the number. Values auto-shrink to fit their panel.

## Numbered steps
```html
<div class="steps" style="--n:3">
  <div class="step"><span class="badge">1</span><p class="step__text">Reset the portfolio and strategic focus</p></div>
  …
</div>
```
`--n` = number of columns (2–4). `steps--list` stacks them vertically with the badge on the left (good for 4–5 items).
Optional `<p class="step__title">` before `step__text` for a bold title + muted description.

## Scale indicators
- `<div class="diamonds"><i></i><i></i><i></i><i class="off"></i><i class="off"></i></div>`: filled vs outlined diamonds ("five layers → three").
- `<div class="dots-scale">…same pattern with circles…</div>`

## Stat cards
```html
<div class="cards" style="--n:2">
  <div class="card"><span class="card__value">&gt;8%</span><span class="card__label">operating profit growth in the first year</span></div>
  <div class="card"><span class="card__value">~250 bps</span><span class="card__label">path toward margin improvement</span></div>
</div>
```
Light grey cards, blue light-weight numbers, ink labels. `card--glass` (translucent white on blue/image), `card--brand`.
Values in a row are auto-equalised to the same size.

## Photos & objects
- `<div class="photo" style="height:420px"><img src="assets/team.jpg" alt=""></div>`: rounded photo card.
- `photo--bleed-bottom` (runs off the bottom edge; combine with `grow` to fill the remaining height), `photo--bleed-right`, `photo--duotone`, `photo--fade`.
- `<img class="cutout" src="assets/bottle.png" style="right:60px;bottom:0;width:420px">`: transparent object layered over the slide with a drop shadow.

## Charts (pure CSS, values 0–100)
```html
<div class="bars">
  <div class="bar" style="--v:72"><span class="bar__label">Europe</span><span class="bar__track"></span><span class="bar__value">72%</span></div>
  <div class="bar bar--muted" style="--v:41">…</div>
</div>
<div class="donut" style="--v:64"></div>
```
`--label-w` sets the label column width. Put the number next to a donut, not inside it.

## Comparison & quote
- `<div class="versus"><div>…before…</div><i class="versus__arrow"></i><div>…after…</div></div>`
- `<p class="quote">Clarity beats complexity.</p><p class="attribution">Chief Transformation Officer</p>` (only quote real, provided people)

## Icons
`<i class="icon icon--NAME"></i>` (+ `icon--sm` 44px, `icon--lg` 96px). Takes the text colour. Names:
{{ICON_NAMES}}
