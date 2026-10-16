---
name: editorial-kit
description: The cinematic editorial kit (assets/editorial/editorial.js + textures) every editorial frame is built on — scaffold, CSS variables, .ed-* classes, data attributes, picture treatments and the Editorial.* timeline helpers.
metadata:
  tags: editorial, cinematic, cut-out, kit, scaffold, camera, parallax, grain, vignette, halftone
---

# Editorial kit

Every frame in the **editorial** style is built on one shared kit, staged in the project at `assets/editorial/`: `editorial.js` (helpers + the `.ed-*` stylesheet it installs) and the textures it references (`film-grain.svg`, `film-grain-light.svg`, `vignette.svg`, `grid.svg`, `halftone.svg`). Use the kit instead of hand-rolling shapes, line-art, spotlights or film finish: it is seek-safe, deterministic, and free of the capture hazards listed at the end.

## Scaffold

```html
<template>
  <style>
    /* 1. the Brand kit @font-face block from frame.md (or the fonts frame.md declares) */
    /* 2. the palette, by role, from frame.md */
    #root {
      position: relative; width: 1080px; height: 1350px; overflow: hidden;
      font-family: "<body face>", sans-serif; color: var(--ed-ink);
      --ed-ground: <this frame's ground>; --ed-paper: <paper>; --ed-ink: <ink>; --ed-field: <colour field>;
      --ed-line: <connector + dot colour>; --ed-mark: <highlighter fill>; --ed-muted: <muted text>;
      --ed-display: "<display face>", sans-serif; --ed-serif: "<serif face>", serif; --ed-mono: "IBM Plex Mono", monospace;
    }
    /* 3. this frame's own layout (sizes in px; nothing else) */
  </style>
  <div id="root" data-composition-id="03-scale" data-width="1080" data-height="1350" data-duration="6">
    <div class="clip ed-ground" id="c-ground" data-start="0" data-duration="6" data-track-index="0"></div>
    <div class="ed-camera" id="c-cam">
      <div class="ed-layer" id="c-back" data-ed-depth="0.25"> …fields, giant type, grid… </div>
      <div class="ed-layer" id="c-mid" data-ed-depth="0.6"> …the subject cut-out… </div>
      <div class="ed-layer" id="c-front" data-ed-depth="1"> …labels, lines, dots, highlights… </div>
    </div>
    <div class="ed-spot" id="c-spot" data-ed-spot="540 520 280"></div>      <!-- only when the frame focuses -->
    <div class="clip ed-finish" id="c-finish" data-start="0" data-duration="6" data-track-index="9"></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>  <!-- the GSAP tag hyperframes-core gives -->
  <script src="assets/editorial/editorial.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const E = window.Editorial;
    const R = document.querySelector('[data-composition-id="03-scale"]');
    const $ = (id) => R.querySelector("#" + id);
    E.build(R);                                   // shapes, line-art, spotlight, film finish — BEFORE the timeline
    const tl = gsap.timeline({ paused: true });
    // … E.rise / E.grow / E.draw / E.connect / E.count … on the beats of this frame …
    E.push(tl, R, { duration: 6 });               // the slow push + parallax, over the whole frame
    E.grain(tl, R, 6);                            // the film grain lives 12× a second
    window.__timelines["03-scale"] = tl;
  </script>
</template>
```

Order back to front: `ed-ground` → `ed-camera` (its `ed-layer`s, back to front by depth) → `ed-spot` → `ed-finish` (always last, over everything). On a dark ground use `class="clip ed-finish ed-dark"` (light grain, screen). Give every element you query an `id` prefixed with the frame's letter (ids must be unique across the assembled video).

## Pieces

A piece is any element with `class="… ed-in"`: transparent until its entrance helper runs. `ed-in ed-shown` = present from t=0. Position pieces with `class="ed-pos"` (or the classes below, which are positioned already) and inline `left/top` in px.

| class | what |
|---|---|
| `ed-cutout` (+ `ed-edge` for a white printed rim, `ed-flat` for no shadow) | a picture cut-out wrapper: absolute, soft contact shadow; its `<img>` fills it |
| `ed-field` | a flat colour shape. Plain = a CSS rectangle in `--ed-field` (radius allowed). With `data-ed-shape` it is drawn as SVG: `rect`, `round <r>`, `circle`, `arch` (portrait niche), `slant <deg>`, `blob <seed>` (organic silhouette). `data-ed-size="W×H"` (must equal the CSS size; the kit sets it), `data-ed-fill` (default `var(--ed-field)`) |
| `ed-field` + `data-ed-textfill="<words>"` | the **text-filled silhouette**: the shape filled with rows of those words (serif, ink on paper, tilted `data-ed-angle`, default −8°, `data-ed-font-size` 22). Words from the brief only — the key term or the claim, repeated |
| `ed-giant` | giant display type in `--ed-giant` (default `--ed-field`) — a year, a number, one word — in the BACK layer, the subject in front of it |
| `ed-display`, `ed-serif`, `ed-mono`, `ed-label` | type roles; `ed-label` = small mono caps, muted |
| `ed-tag` + `<span class="ed-slash"></span>` | the documentary name tag "/ Name": display face, paper colour, a slash in `--ed-line` |
| `ed-dot` | a connector end dot (24 px, centred on its `left/top`) |
| `ed-bar` | a chart bar (grows from its bottom) |
| `ed-grid` | a drafting grid layer (paper-data grounds, charts) |
| `ed-greek` | grey bars standing in for body text — never invent readable copy |
| `ed-hl-word` > `ed-hl` + `ed-hl-text` | highlighter behind one word (band BEFORE the word in the DOM) |

## Pictures and their treatment

Generated pictures (`assets/images/…`, transparent cut-outs) and supplied ones (`public/…`) get the print look from **HyperFrames' media treatments**: a `data-color-grading` attribute on the `<img>`. The treated `<img>` must be **its own clip** — otherwise only the first frame of the video is treated:

```html
<div class="ed-cutout ed-edge ed-in" id="c-subject" style="left:240px; top:260px; width:600px; height:600px">
  <img class="clip" id="c-subject-img" data-start="0" data-duration="6" data-track-index="3"
       src="assets/images/clerk.png" width="600" height="600"
       data-color-grading='{"adjust":{"saturation":-1,"contrast":0.3},"effects":{"halftone":0.94,"halftoneSize":0.3}}'>
</div>
```

`data-duration` = the frame's duration; a `data-track-index` no other clip in the frame uses. The wrapper moves; the `<img>` never animates itself.

| treatment | `data-color-grading` | use |
|---|---|---|
| **B&W halftone** (the signature) | `{"adjust":{"saturation":-1,"contrast":0.3},"effects":{"halftone":0.94,"halftoneSize":0.3}}` | people, objects, props: the black-and-white printed cut-out on a colour field |
| **Dot screen** in brand colours | `{"effects":{"monoScreen":1,"monoScreenSize":0.35,"monoScreenAngle":0.25,"monoScreenSpread":0.3},"palette":["<dark>","<light>"]}` | the duotone look: a portrait or scene printed in one brand hue on paper (`palette` = two `#rrggbb` from frame.md: e.g. the brand's deep colour and paper) |
| **Two-ink** | the dot screen with `"palette":["<ink>","<accent>"]` | a loud poster frame; the turn |
| **B&W photo** | `{"preset":"mono-fade","intensity":1}` (softer) or `{"preset":"mono-clean","intensity":1}` | documentary photos, the dimmed side of a split |
| **Print colour** | `{"preset":"editorial-halftone","intensity":1}` | the house illustration style kept in colour, with print dots (pictures that must keep the product's palette) |

Add `"details":{"grain":0.35}` to any of them for photographic grain. `hyperframes media-treatment --capability <id>` lists more (engraving, dither); the frame worker has no shell, so use only these recipes unless your packet names another. Never treat the product's logo files.

## Helpers (all return the time the move ends)

| call | does |
|---|---|
| `E.build(R)` | draws every `.ed-field[data-ed-shape]`, `path[data-ed-path]`, `g[data-ed-rings]`, `.ed-spot`, and fills `.ed-finish`. Once, before the timeline |
| `E.push(tl, R, {duration, push=0.05, pan=[0,-26], ease="sine.inOut", from=0, camera})` | the camera: `.ed-camera` (the first in R, or `camera`) scales 1 → 1+push while every `.ed-layer` in it drifts by `pan × data-ed-depth` — the 2.5D parallax that makes a flat frame feel shot |
| `E.camera(tl, camEl, [{x,y,scale}, {at, duration=1, x, y, scale, ease="power3.inOut"}, …])` | framed moves: reframe on a detail, travel between stations, a zoom-through at the end of a frame |
| `E.rise(tl, els, at, {from="bottom", distance=60, duration=0.8, ease="expo.out", scale, stagger=0.08})` | the default entrance: slide a short way + fade up (cut-outs, type, panels; several with a stagger) |
| `E.pop(tl, els, at, {scale=0.4, duration=0.5, ease="back.out(2)", stagger=0.06})` | scale-in with a little overshoot: dots, tags, stickers, rays |
| `E.grow(tl, els, at, {from="left"/"right"/"top"/"bottom"/"center", duration=0.7, ease="expo.inOut", stagger})` | a field, band, bar, rule or circle wipes in from an edge or its centre (`center` on a circle = an iris) |
| `E.out(tl, els, at, {to="top", distance=40, duration=0.45})` | exit: slides a little and fades out |
| `E.cut(tl, els, at)` | hard cut-in on the beat |
| `E.draw(tl, paths, at, {duration=0.9, ease="power2.inOut", stagger=0.1})` | line-art draws on (rings, orbits, connectors, arcs, waves) |
| `E.highlight(tl, hlEl, at, 0.5)` | the highlighter sweeps in behind its word |
| `E.focus(tl, spotEl, at, {dim=0.7, duration=0.8, from=2.4})` / `E.unfocus(tl, spotEl, at, 0.6)` | the spotlight: everything but a circle sinks into shadow while the hole closes onto the subject |
| `E.connect(tl, {from: dot, path, to: dot, label}, at, {duration=0.9})` | the documentary callout: dot pops → connector draws → dot pops → label rises |
| `E.count(tl, el, at, {from=0, to, duration=1.2, decimals=0, prefix, suffix, separator=","})` | a number counts to its value (seek-safe: the text is a function of progress) |
| `E.grain(tl, R, duration)` | the film grain re-seeds 12× a second. Once per frame |

## Line-art

```html
<svg class="ed-lines" width="1080" height="1350">                       <!-- UNSCALED: width/height in px, no viewBox -->
  <path id="c-link" data-ed-path="route 40 330 520 330 780 940 780 940 640"/>   <!-- r, then x y pairs -->
  <path id="c-ring" class="ed-paper" data-ed-path="ring 540 520 300"/>
  <g id="c-orbits" data-ed-rings="540 980 120 70 5 0.34" data-ed-class="ed-thin ed-ink"></g>  <!-- cx cy r0 step n [ratio] -->
  <path id="c-rays" class="ed-thin" data-ed-path="rays 540 520 330 470 36"/>
</svg>
```

`data-ed-path` generators (px in the svg): `line x1 y1 x2 y2` · `route r x1 y1 x2 y2 …` (rounded-corner connector) · `ring cx cy r` (from 12 o'clock) · `ellipse cx cy rx ry` · `arc cx cy r a0 a1` (degrees, 0 = 12 o'clock, clockwise) · `rays cx cy r1 r2 n [a0 a1]` · `stack x y w n gap` (a coin pile rising from y) · `wave x y w amp periods [seed]`. Stroke classes: default `--ed-line` 4 px; `ed-thin` 2 px; `ed-ink`, `ed-paper` recolour; `ed-fill` fills instead of stroking.

## CSS variables

`--ed-ground` `--ed-paper` `--ed-ink` `--ed-field` `--ed-giant` (giant type, default the field) `--ed-line` `--ed-mark` `--ed-muted` `--ed-display` `--ed-serif` `--ed-mono` `--ed-shadow` (an `r,g,b` triplet), `--ed-stroke` (4px), `--ed-grain` / `--ed-grain-light` / `--ed-vignette` (opacities, defaults .3 / .2 / .55).

## Critical constraints

- **Contrast ≥ 3:1 for every word** against what is behind it — `hyperframes check` fails the frame otherwise. Type on the field is the Brand kit's colour for type on the accent (ink on a light field such as a yellow or a lime, paper on a dark one); giant type on paper uses the field only when the field reads on paper, else the Brand kit's readable accent or ink (`--ed-giant`).
- **Hide with opacity, never visibility.** The kit's pieces are `opacity:0` until they enter. A picture whose ancestor is `visibility:hidden` when the page loads is never treated, and `visibility: visible` on a piece overrides the runtime hiding the whole scene (it shows up in other frames). Don't use GSAP `autoAlpha` on pieces.
- **A treated `<img>` is a clip** (`class="clip"`, `data-start`, `data-duration`, `data-track-index`), inside an `ed-cutout` wrapper that the helpers move.
- **No CSS `clip-path`, no CSS `filter: blur()`, no CSS `radial-gradient`** on pieces: about 25 such elements in a composition make the capture go black (`composition_heavy_overlay_count_high`). Shapes, text fills and the spotlight are SVG; the vignette is an image; depth comes from parallax and shadow, not blur.
- **Sizes are authored, never measured**: `data-ed-size` restates the CSS size; line-art coordinates are px you choose. Fonts may not be loaded when the script runs.
- **Line-art svgs are unscaled** (`width`/`height` attributes, no `viewBox` stretch, no `vector-effect`): Chrome dashes non-scaling strokes in screen space and the draw comes out partial.
- **One transform owner per element**: `E.push`/`E.camera` own `.ed-camera`; `E.push` owns each `.ed-layer`; entrance helpers own the piece. Nest a wrapper when a piece needs two moves.
- `E.build(R)` before any `E.draw` or `E.focus`. Ids on the clip layers (`studio_missing_editable_id`) and on everything you tween; ids start with a letter.
- Same picture twice in one frame → lint warns `duplicate_media_discovery_risk`: give the copies different `data-start` (e.g. 0 and 0.01) or use one.
