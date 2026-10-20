# Component reference

Every slide is ONE fragment: `<section class="slide [modifier]">…</section>`. The section is a flex column with
`--pad` padding (96px; 100px in portrait). Children flow top to bottom; push a block to the bottom with `mt-auto`,
centre the slide's main block in the space left with `my-auto`.
Background layers (`.bg`), effects (`.fx-*`), `band`, `shape` and `watermark` are absolutely positioned and must come
FIRST inside the section. The same classes work in every style: the style sets their colours, type and corners.

## Canvases (the style decides what each looks like)
| class | use |
|---|---|
| (none) | the style's main canvas (consulting/bold: brand colour; tech: near-black; minimal/editorial/paper: paper) |
| `slide--brand` | the brand colour with light type |
| `slide--light` / `slide--white` | a light canvas with ink type |
| `slide--dark` / `slide--deep` | a dark canvas with light type (deep is darker or a second dark) |
| `slide--tight` / `slide--roomy` | 72px / 120px padding |

## Background image layers (put the image inside)
```html
<div class="bg bg--duotone"><img src="assets/cover.jpg" alt=""></div>
```
| class | effect |
|---|---|
| `bg` | full-bleed image, object-fit cover; focal point with `style="--focus: 50% 30%"` |
| `bg--duotone` | forces ANY image into the style's palette (grayscale → luminosity blend + highlight). Tunables: `--contrast`, `--brightness` |
| `bg--tint` | keeps natural colours, multiplies a brand wash on top (`--tint: .35`) |
| `bg--soft` | blurs the image (`--blur: 6px`), combine with duotone for a calm backdrop |
| `bg--ghost bg--ghost-left` (`-right`, `-top`, `-bottom`, `-corner`) | faint echo of the cover image fading in from one edge (`--ghost: .28`) |

## Effects and decoration (empty divs, after `.bg`, before content)
| class | effect |
|---|---|
| `fx-glow` | soft light blooms |
| `fx-vignette` | darkens the edges (`--vignette: .45`) |
| `fx-grain` | fine film grain (`--grain: .16`) |
| `fx-stipple` | heavy stipple grain for gritty gradient posters (`--stipple: .9`) |
| `fx-holo` | iridescent pink/yellow/blue blooms |
| `fx-paper` | paper speckle on light canvases (`--paper: .55`) |
| `fx-dots` | dotted halftone fading in from the right |
| `fx-grid` | faint grid fading out at the edges; `fx-grid fx-grid--full` covers the whole canvas evenly (`--grid: 72px`) |
| `fx-shade-bottom` / `fx-shade-top` | gradient shade for legibility over images |
| `fx-sheen` | diagonal glass highlight |
| `<div class="band"></div>` | an angled lower band behind the bottom of the slide (`--band-h: 44%`, `--band-cut: 18%`) |
| `<div class="watermark watermark--logo"></div>` | the brand logo, huge and faint, tilted, bleeding off the edges (`--tilt`, `--watermark: .07`). `<div class="watermark">M</div>` uses one big letter instead |
| `<div class="shape shape--NAME" style="right:-160px;bottom:-60px;--shape-w:520px;--shape-h:640px"></div>` | a big geometric shape in the style's shape colour, bleeding off an edge. Names: {{SHAPE_NAMES}} |
| `<div class="frame frame--holo"></div>` | an iridescent border around the whole canvas (`--frame-w: 36px`); `frame` alone uses `--frame-color` |

## Glass panel (consulting covers)
```html
<div class="glass glass--cover glass--center"> … </div>
```
Frosted, translucent panel (backdrop blur over the image). `glass--cover` = centred box, 74% wide, 15% inset top/bottom
(`glass--tall` for more room). `glass--center` centres text. `glass--rounded` adds radius. Without `glass--cover` it is
an in-flow panel you can size yourself.

## Typography
| class | size @1080 (consulting; styles scale it) | use |
|---|---|---|
| `hero` | 128 | a giant 1–4 word hook or name ("Call for speakers", "Lumen") |
| `h1` | 84 | headline, ≤ 2 lines |
| `h2` | 68 | cover headline inside glass, or longer headlines |
| `h3` | 52 | section headline |
| `display` | 64 | a statement sentence ("From five management layers to three"); `display display--xl` for a big answer or product name |
| `lead` | 48 | the line under a hero or title |
| `mega` | 200 | single giant number |
| `body-lg` / `body` | 38 / 33 | the one paragraph on a slide / supporting text |
| `small` / `source` | 26 / 22 | footnotes, links, sources |
| `kicker` | 26, uppercase, letter-spaced | category or series label above a title ("Track 2", "Interview notes") |

Helpers: `muted`, `accent` (the canvas's highlight colour), `hl` (highlighted words: accent + bold), `light`, `medium`,
`bold`, `italic`, `upper`, `serif`, `mono`, `condensed`, `text-center`, `text-right`, `nowrap`, `u` (underline).
`<span class="mark">2–5 key words</span>` puts a highlighter box behind words (once per slide). Use `<br>` to control
headline line breaks. Never type words in capitals yourself; styles that want caps apply them.

## Labels, stickers & calls to action
- `<span class="pill">Halden's transformation:</span>`: big label pill (consulting kicker). `pill--outline`, `pill--brand`, `pill--sm`.
- `<span class="tag">Article</span>`: small label (section, category, status). `tag--outline`, `tag--hl` (highlight fill).
- Stickers: tilted labels with a shadow, 1–3 words each. Stack 2–3 so they overlap a little:
  ```html
  <div class="stickers"><span class="sticker sticker--ink" style="--tilt:-5deg">The open</span><span class="sticker" style="--tilt:-2deg">Studio season</span></div>
  ```
  Colours: `sticker` (highlight 1), `sticker--2`, `sticker--3`, `sticker--ink`, `sticker--accent`; `sticker--sm`;
  `stickers--right` aligns the stack right. A lone sticker can be pinned to a block's corner or edge: wrap the block
  in `.anchor` and put `<span class="sticker sticker--float" style="right:-16px;top:-32px">` after it (positions are
  relative to the block). Never put a sticker over text, a button, a face or the content of a UI mock.
- `<a class="cta">See the sessions</a>`: the call-to-action button (last slide, single posts). `cta--arrow` adds →,
  `cta--outline`, `cta--overlap` (sits right after a `panel` and overlaps its bottom edge).

## Navigation & brand chrome
- `<div class="next"></div>`: the next-slide cue (bottom-right; the style decides its look). Variants: `next--arrow`
  (big thin arrow), `next--circle`, `next--long` (long arrow, top-right). Cover and inner slides, never the last slide
  or a single post.
- `<div class="swipe">Swipe</div>`: "Swipe →" hint, bottom centre.
- `<div class="progress" style="--at:2;--of:6"></div>`: swipe progress bar, bottom centre (`--at` = this slide).
- `<div class="counter">02 / 05</div>`: page counter, top-right.
- `<div class="wordmark"></div>`: the brand logo (or wordmark text), bottom-left. `wordmark--top` (top-left),
  `wordmark--top-right`, `wordmark--bottom-right`, `wordmark--inline` (in the flow, e.g. inside a `row between`).
  `wordmark--top` sits exactly where an inline logo in a top row lands (both on the content's left edge), so the logo
  stays put across slides; the slide's content starts below it by itself: don't add a margin-top to the first block.
- `<div class="logo-mark"></div>`: the brand's square mark, bottom-right (`logo-mark--inline` in the flow).
- `<div class="topbar"><span>Author name</span><span>Series</span></div>`: a small meta line across the top.
- `<div class="ticker"><span>What's new</span>…×6</div>`: a band across the top repeating a 1–2 word label; content
  starts below it automatically. `ticker--bottom`.
- Chrome owns its corner: on a slide with `next`, keep the bottom-right corner (about 200×200px) free of content; the
  layout QA reports any block that runs into the next cue, a positioned logo, the counter, progress bar or swipe hint.

## Rules & layout
- `<hr class="rule">`: hairline, full width. `rule--short` is a 120px accent bar.
- `stack` (+ `stack--xs|sm|lg|xl`), `row` (+ `row--top`, `row--end`, `between`, `wrap`), `grow`, `mt-auto`, `mb-auto`,
  `my-auto` (centres a block between its neighbours), `center`, `self-center`, `self-end`.
- `anchor`: a positioning box around one block, so a `sticker--float` can be pinned to that block's corner. Put
  `my-auto` on the anchor to centre the block, e.g. a panel followed by its `cta--overlap`.
- `split`: two-column grid (1.05fr / 1fr) aligned to bottom. `split--even`, `split--top`. `cols-2`, `cols-3`. `w-50 … w-90`.
- `bleed` lets a block run off the bottom edge on purpose (`--bleed: 80px`), `bleed-right` off the right edge.
- Inline `style` is fine for spacing (`margin-top:56px`), sizes, positions and CSS variables; keep spacing on an 8px
  grid (24/32/40/48/56/64/96).

## Big statistic
```html
<div class="stat">
  <span class="stat__value">&gt;8%</span>
  <div class="stat__meta"><i class="icon icon--growth icon--sm"></i><span class="stat__label">operating profit<br>growth in year one</span></div>
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
`--n` = number of columns (2–4). `steps--list` stacks them with the badge on the left (4–5 items). Optional
`<p class="step__title">` before `step__text`.

## Lists & event facts
- `<div class="meta"><span class="meta__item"><i class="icon icon--calendar"></i>Oct–Nov 2026</span>…</div>`: a row of
  facts with icons (date, duration, format, place).
- `<div class="icon-list" style="--cols:2"><span class="icon-list__item"><i class="icon icon--ai"></i>AI in daily work</span>…</div>`:
  4–8 items, ≤ 4 words each. `icon-list--rows` (with `--cols:1`) makes bigger, divided rows for 4–6 items that should
  fill the slide.
- Scales: `<div class="diamonds"><i></i><i></i><i class="off"></i></div>`, `dots-scale` (same with circles).

## Cards & panels
```html
<div class="cards" style="--n:2">
  <div class="card"><span class="card__value">&gt;8%</span><span class="card__label">operating profit growth in the first year</span></div>
</div>
<div class="panel"><p class="kicker">Track 1</p><h2 class="h1">AI experiments</h2><p class="body">…</p></div>
```
`card` holds a number and a label (values in a row auto-equalise); `card--glass`, `card--brand`. `panel` is a light
content card with a soft shadow; `panel--glass`, `panel--dark`. Follow a panel with `<a class="cta cta--overlap">`.

Feature or option cards (the options to pick from, tracks, what you get): an icon tile (or a number in it), a title
≤ 4 words and one line ≤ 12 words. They fill a slide far better than a plain list.
```html
<div class="cards cards--list">
  <div class="card"><span class="card__icon"><i class="icon icon--search"></i></span><p class="card__title">Research ops</p><p class="card__text">Interviews and synthesis, on your product.</p></div>
  …
</div>
```
`cards--list` stacks full-width rows with the icon on the left (3–4 items); `cards` with `--n:2` makes a 2×2 grid.
`<span class="card__icon">2</span>` shows a number instead of an icon.

## People
```html
<div class="people people--sm">
  <div class="person"><div class="avatar"><img src="assets/user-ana.jpg" alt=""></div><p class="person__name">Ana<br>Pop</p><p class="person__role">Mentor</p></div>
  <div class="person"><div class="avatar avatar--initials">RC</div><p class="person__name">Radu<br>Costin</p></div>
</div>
```
Only real photos the user provided; otherwise `avatar--initials`. `--avatar` sets the size.

## Apps, windows, devices, UI
- `<div class="app-icon"><img src="assets/user-logo.png" alt=""></div>` (or an `<i class="icon …">`, or 1–2 letters):
  a rounded app tile. `app-icon--brand`, `app-icon--sm`.
- `<div class="chip"><span class="app-icon"><i class="icon icon--sparkle"></i></span>Orbit</div>`: icon + name pill.
- `<div class="window" data-url="example.com"><img src="assets/user-screenshot.png" alt=""></div>`: an app/browser
  window (traffic lights; the URL from `data-url`). `window--bare` = a rounded screenshot card, `window--dark`.
- `<div class="device device--laptop device--tilt"><div class="device__screen"><img src="…" alt=""></div></div>`:
  `device--laptop`, `device--phone`, `device--tablet`; `device--tilt` / `device--tilt-left` for perspective;
  `--device-w` sets the width.
- `<div class="ui">…</div>` inside a window or device screen builds a generic interface in HTML: `ui-bar` (the app's
  top bar: a title left, a `ui-pill` right), `ui-title`, `ui-label`, `ui-bubble` (`ui-bubble--me`), `ui-card` (glowing
  border), `ui-pill` (a status: `ui-pill--done`, `ui-pill--accent`), `ui-check` (a done step; `ui-check--todo`),
  `ui-code` (a few mono lines; `<span class="add">`/`<span class="del">` for a diff), `ui-cols` (two columns, e.g.
  ticket → result), `ui-row` + `ui-dot` + `ui-line` (`--w:70%`, placeholder text bars), `ui-btn`, `ui-stat`; `ui--dark`.
  Fill the screen: a `ui-bar`, then 4–6 rows; a screen that is half empty looks unfinished (the QA warns). Keep it
  illustrative: no invented metrics or real product UI.
  ```html
  <div class="ui">
    <div class="ui-bar"><span>PROJ-142 · Fix export on empty rows</span><span class="ui-pill ui-pill--done">Done</span></div>
    <div class="ui-check">Reproduced the bug</div>
    <div class="ui-check">Found the root cause</div>
    <div class="ui-code"><span class="del">- if (rows.length) export(rows)</span><span class="add">+ export(rows ?? [])</span></div>
    <div class="ui-check">Tests pass</div>
    <span class="ui-btn">Pull request ready for review</span>
  </div>
  ```
- `<div class="logos logos--mono"><img src="assets/user-partner.png" alt="">…</div>`: partner logos the user provided.

## Photos & objects
- `<div class="photo" style="height:420px"><img src="assets/team.jpg" alt=""></div>`: rounded photo card.
- `photo--bleed-bottom` (runs off the bottom; with `grow` fills the rest), `photo--bleed-right`, `photo--bleed-top`
  (full width across the top; set its height, e.g. `style="height:46%"`), `photo--round`, `photo--duotone`, `photo--fade`.
- `<img class="cutout" src="assets/object.png" style="right:60px;bottom:0;width:420px">`: a transparent object or the
  user's portrait cutout layered over the slide with a drop shadow.

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
- `<p class="quote">Clarity beats complexity.</p><p class="attribution">Chief Transformation Officer</p>` (only real, provided quotes)

## Icons
`<i class="icon icon--NAME"></i>` (+ `icon--sm` 44px, `icon--lg` 96px, or `style="--icon:80px"`). Takes the text colour. Names:
{{ICON_NAMES}}
