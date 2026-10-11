---
name: collage-kit
description: The paper-collage kit (assets/collage/collage.js + textures) every vox-collage frame is built on — scaffold, CSS variables, .cg-* classes, data attributes and the Collage.* timeline helpers.
metadata:
  tags: collage, vox, paper, cut-out, kit, scaffold, stop-motion, texture, grain
---

# Collage kit

Every frame in the **vox-collage** style is built on one shared kit, staged in the project at `assets/collage/`:
`collage.js` (helpers + the `.cg-*` stylesheet it installs) and the textures it references (`paper-tone.svg`, `paper-grain.svg`, `paper-grain-light.svg`, `grid-paper.svg`, `halftone.svg`, `stamp-mask.svg`). Use the kit instead of hand-rolling paper effects: it is already seek-safe, deterministic, and free of the capture hazards listed at the end.

## Scaffold

```html
<template>
  <style>
    /* 1. the Brand kit @font-face block from frame.md (or the fonts frame.md declares) */
    /* 2. the palette, by role, from frame.md */
    #root {
      position: relative; width: 1080px; height: 1350px; overflow: hidden;
      font-family: "<body face>", sans-serif; color: var(--cg-ink);
      --cg-ground: <paper>; --cg-paper: <card / white paper>; --cg-ink: <ink>;
      --cg-accent: <highlighter fill>; --cg-line: <marker colour>; --cg-muted: <muted text>;
      --cg-serif: "<serif face>", serif; --cg-stamp: <stamp ink>;
    }
    /* 3. this frame's own layout classes (sizes in px; nothing else) */
  </style>
  <div id="root" data-composition-id="03-courses" data-width="1080" data-height="1350" data-duration="6">
    <div class="clip cg-ground" id="c-ground" data-start="0" data-duration="6" data-track-index="0"></div>
    <div class="clip cg-tone" id="c-tone" data-start="0" data-duration="6" data-track-index="1"></div>
    <div class="cg-camera" id="c-cam">              <!-- only when the frame pans between stations -->
      <div class="cg-board" id="c-board">
        <div class="cg-grid"></div>                 <!-- optional grid paper -->
        <div class="cg-layer" id="c-back"> …pieces… </div>
        <div class="cg-layer" id="c-front"> …pieces… </div>
      </div>
    </div>
    <div class="clip cg-grain" id="c-grain" data-start="0" data-duration="6" data-track-index="2"></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>  <!-- the GSAP tag hyperframes-core gives -->
  <script src="assets/collage/collage.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const C = window.Collage;
    const R = document.querySelector('[data-composition-id="03-courses"]');
    const $ = (id) => R.querySelector("#" + id);
    C.build(R);                                      // sheets, tapes, marker paths — BEFORE the timeline
    const tl = gsap.timeline({ paused: true });
    // … C.slap / C.highlight / C.draw … on the beats of this frame …
    C.boil(tl, R.querySelectorAll(".cg-boil"), 6);   // every held piece breathes on twos
    C.drift(tl, { duration: 6, board: $("c-board"), layers: [[$("c-back"), 0.5], [$("c-front"), 1]] });
    window.__timelines["03-courses"] = tl;
  </script>
</template>
```

Order of layers, back to front: `cg-ground` → `cg-tone` → board (grid, layers, pieces) → `cg-grain` (always last, over everything, so cut paper and ground share one film grain). On an ink ground use `class="clip cg-grain cg-light"`. Give every element you query an `id` prefixed with the frame's letter (ids must be unique across the assembled video).

## A piece

```html
<div class="cg-boil" style="left:80px; top:330px">               <!-- position (px) + boil -->
  <div class="cg-cut" id="c-p1">                                   <!-- entrance/exit + shadow -->
    <div class="cg-paper strip" data-cg-sheet="900x250" data-cg-edges="tb" data-cg-seed="3"
         style="width:900px; height:250px; rotate:-2deg">           <!-- the paper; resting tilt -->
      <div class="headline">Your team has AI tools.</div>
    </div>
  </div>
</div>
```

The transform stack — each level is moved by ONE helper only, so tweens never fight:

| element | owned by | never |
|---|---|---|
| `.cg-camera` | `C.camera` (pans between stations) | anything else |
| `.cg-board` | `C.drift` push (scale) | x/y moves |
| `.cg-layer` | `C.drift` parallax (x/y) | per-piece tweens |
| `.cg-boil` | `C.boil` (x/y/rotation jitter) + inline `left/top` | entrances |
| `.cg-cut` | `C.slap / slide / lift / show / ransom`, `--lift` shadow | CSS transform |
| `.cg-paper` | static: CSS `rotate:` property for the resting tilt, `data-cg-sheet` shape | GSAP |

`.cg-cut` is hidden until its entrance (`visibility:hidden; opacity:0`); a piece that must be there from t=0 gets `class="cg-cut cg-shown"`.

## Paper

- `class="cg-paper"` alone: a knife-cut white rectangle (CSS background; `border-radius` allowed).
- `data-cg-sheet="W×H"` adds a torn sheet drawn as an SVG behind the content. **W×H must equal the element's CSS width/height.** `data-cg-edges` = which edges are torn (`t r b l`, default `tb`; `""` = knife-cut), `data-cg-amp` tear depth px (5), `data-cg-seed` (a different seed per sheet), `data-cg-fill` (default `var(--cg-paper)`; e.g. `var(--cg-ink)` for an ink band, `var(--cg-accent)` for a sticker), `data-cg-rim="#FFFFFF"` (a thin white torn rim under a coloured sheet — the real-paper tell), `data-cg-grain="dark|light"` (extra tooth; the frame grain usually suffices).
- `class="cg-paper cg-on-ink"`: text on an ink sheet takes the paper colour.
- Text inside a paper is ordinary HTML; it sits above the sheet automatically.

## Helpers (all return the time the move ends)

| call | does |
|---|---|
| `C.build(R)` | draws every `[data-cg-sheet]`, `.cg-tape`, `path[data-cg-path]` in the frame. Call once, before the timeline |
| `C.slap(tl, cut, at, {from, distance=70, rotate=7, scale=1.08, duration=0.42})` | a cut-out lands: arrives lifted (bigger, turned, long shadow) and settles **on twos**. `from`: top/bottom/left/right |
| `C.slide(tl, cut, at, {from="left", distance=1200, duration=0.5, rotate})` | a longer, flatter entrance from off the board |
| `C.lift(tl, cut, at, {to="top", distance=900, rotate=-8, duration=0.36})` | exit: the piece is picked up and leaves; hidden afterwards |
| `C.show(tl, cut, at)` | hard cut-in on the beat, no move |
| `C.ransom(tl, chips, at, {stagger, distance=36, duration=0.3})` | `.cg-cut.cg-chip` words slap in one after another, alternating sides |
| `C.tape(tl, tapeEl, at, 0.25)` | a `.cg-tape` strip lands across a corner |
| `C.stamp(tl, stampEl, at, 0.3)` | a `.cg-stamp` thumps down (1.6× → 1) with the ink |
| `C.highlight(tl, hlEl, at, 0.4)` | the `.cg-hl` band grows behind its word on twos (or a `.cg-strike` band through it) |
| `C.draw(tl, path, at, 0.5)` | a marker path draws on (circle, arrow, underline, strike, scribble) |
| `C.boil(tl, els, duration, {amp=1, rotate=0.4, hold=1})` | held pieces re-pose 12×/s by a hash of quantized time — call once per frame over all `.cg-boil` |
| `C.drift(tl, {duration, board, push=0.04, pan=[0,-18], layers:[[el, depth]]})` | smooth slow push-in + parallax (single-station frames) |
| `C.camera(tl, camEl, [{x,y,scale}, {at, duration=0.9, x, y, scale, ease="power2.inOut"}, …])` | smooth moves between stations on a board bigger than the frame; x = -1080 shows the next station to the right |
| `C.tearAway(tl, left, right, at, {duration=0.5, distance=760})` + `C.seam(w, h, x)` + `C.sheet(el, w, h, {d, fill})` | a covering sheet rips in two and both halves fly off, revealing the board |
| `C.twos(ease, duration)` | any ease sampled on the stop-motion grid, for your own piece tweens |

## Stationery

```html
<!-- highlighter: band BEFORE the word in the DOM; both positioned (no z-index) -->
<span class="cg-hl-word"><span class="cg-hl" id="c-hl"></span><span class="cg-hl-text">changed</span></span>
<!-- strike-through: band AFTER the word; drawn with C.highlight like the highlighter -->
<span class="cg-hl-word"><span class="cg-hl-text">demo data</span><span class="cg-strike" id="c-strike"></span></span>

<!-- tape (size in data-cg-size; rotate it) -->
<div class="cg-tape" id="c-tape1" data-cg-size="150x40" style="left:52px; top:318px; rotate:-24deg"></div>

<!-- rubber stamp (mask-distressed, multiply) -->
<div class="cg-stamp" id="c-stamp" style="left:560px; top:930px; font-size:58px; rotate:-9deg">Now live</div>

<!-- marker strokes: an UNSCALED svg (width/height attributes in px, no viewBox) -->
<svg class="cg-marker" width="1080" height="1350">
  <path id="c-arrow" data-cg-path="arrow 300 920 470 640 -0.2 3"/>
  <path id="c-under" data-cg-path="underline 125 1000 470"/>
</svg>
<!-- a loop around one word: centred on the word; size ≈ the word + margins -->
<span class="cg-hl-word">changed.<svg class="cg-marker cg-around" width="460" height="170">
  <path id="c-ring" data-cg-path="circle 230 85 218 72 6"/></svg></span>

<!-- ransom chips (each one a .cg-cut) -->
<span class="cg-cut cg-chip cg-serif" id="c-r1" style="rotate:-3deg">the</span>
<span class="cg-cut cg-chip cg-on-ink" id="c-r2">machine</span>
<span class="cg-cut cg-chip cg-on-accent" id="c-r3">changed.</span>
```

`data-cg-path` generators: `circle cx cy rx ry [seed]` (an overshooting pen loop), `arrow x1 y1 x2 y2 [bend] [seed]`, `underline x y w [seed]`, `strike x y w [seed]`, `scribble x y w h [seed]`, `check x y size [seed]` (a tick), `cross x y size [seed]`. Coordinates are px in the svg. Other classes: `cg-fig` (FIG. caption: small caps-tracked muted label), `cg-greek` (grey bars standing in for body text on a clipping — never invent readable copy), `cg-serif`, `cg-mono`, `cg-flat` (a cut with no shadow).

## CSS variables

`--cg-ground` `--cg-paper` `--cg-ink` `--cg-accent` `--cg-line` `--cg-muted` `--cg-serif` `--cg-mono` `--cg-stamp` `--cg-tape` (rgba), `--cg-shadow` (an `r,g,b` triplet), `--cg-tone` / `--cg-grid` / `--cg-grain` / `--cg-grain-light` (opacities, defaults .35 / 1 / .3 / .22), `--cg-stroke` (marker width, 7px).

## Critical constraints

- **Never `visibility: visible`** on a piece (in CSS or a tween): it overrides the runtime hiding the whole scene, and the piece shows up in other frames. The kit reveals with `autoAlpha` / `visibility: inherit`.
- **No CSS `clip-path` and no CSS `filter: blur()` on pieces.** ~25–40 such elements across a montage make the capture go black (`composition_heavy_overlay_count_high`). Torn paper is the kit's SVG sheet; shadows are the kit's `drop-shadow`.
- **Sizes are authored, never measured**: `data-cg-sheet` and `data-cg-size` restate the CSS size; marker coordinates are px you choose. Fonts may not be loaded when the script runs.
- **Marker svgs are unscaled** (`width`/`height` attributes, no `viewBox` stretch, no `vector-effect`): Chrome dashes non-scaling strokes in screen space and the draw comes out partial.
- **Highlighter by DOM order**, never `z-index: -1` (`negative_z_index`).
- `C.build(R)` before any `C.draw` (the paths need their `d`).
- Ids on the `clip` layers (`studio_missing_editable_id`) and on everything you tween.
- Render the video at 24 fps (`hyperframes render --fps 24 …`): the twos then land exactly on every second frame.
