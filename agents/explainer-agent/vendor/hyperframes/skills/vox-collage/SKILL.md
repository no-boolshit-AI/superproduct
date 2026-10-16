---
name: vox-collage
description: Vox-style paper-collage motion graphics for HyperFrames — torn paper strips and cut-outs that slap onto a paper board on twos, boil, soft cut-paper shadows, tape, rubber stamps, highlighter and hand-drawn marker annotations, ransom headlines, ink-and-halftone figure plates, generated pictures printed as black-and-white halftone cut-outs on torn colour fields, giant type behind the subject, film grain and a rostrum camera with depth layers. Use when a brief asks for a Vox / collage / cut-paper explainer look, or the run's style is vox-collage. Adds the collage kit (assets/collage), the vox-collage frame preset, the collage-* motion rules and the collage-* blueprints to the normal workflows (faceless-explainer first); the teaching follows hyperframes:clear-explainer.
---

# Vox collage

An explainer made of paper. Every frame is a board seen from above; ideas arrive as cut-outs slapped on by hand; a hand then annotates them. It is a **style layer** over the normal HyperFrames workflows — you still run `faceless-explainer` (or `general-video`, `product-launch-video`) step by step; this skill tells you what to choose at each step and gives the frame workers a tested kit.

**Clarity first.** The collage serves the lesson, not the other way round: follow `hyperframes:clear-explainer` for the story — one driving question, at most three main points, plain words with every term defined, concrete before abstract, one idea and one picture per frame, a recap (`collage-checklist`) before the call to action. A collage that is beautiful and leaves a newcomer confused has failed.

What makes it read as Vox and not as "a slide with a paper texture":

1. **Paper physics** — torn edges (white rim on coloured paper), resting tilts, soft shadows that lengthen when a piece is lifted, tape, grain over everything.
2. **Stop-motion** — pieces move **on twos** (12 poses/s at 24 fps) and **boil** while held; the camera alone moves smoothly (slow push, parallax, station pans).
3. **The hand annotates** — after the content is read: one highlighter swipe, marker loops/arrows/strikes/ticks, a stamp.
4. **Editorial pictures** — the subject printed in black and white: generated pictures (explainer-agent's `generate_images`) or cleared photos as **B&W halftone cut-outs** (HyperFrames' media treatment, see `collage-halftone-figure`) slapped onto **torn sheets of the brand colour**; ink-and-halftone drawings on paper plates ("FIG. 01 —") for diagrams and small marks.
5. **Depth** — three layers on the board (back: the colour field, giant type, clippings · mid: the subject · front: strips, tape, marker) and a camera push with parallax: the board feels shot, not scanned.
6. **Restraint** — paper colours + ink + ONE accent; 3–8 pieces per frame; hard cuts between frames.

## Files

| what | where |
|---|---|
| the kit (helpers + `.cg-*` styles + textures) | `assets/` here → staged in the project at `assets/collage/` |
| kit API, scaffold, constraints (frame workers' reference) | `../hyperframes-animation/rules/collage-kit.md` |
| motion rules | `../hyperframes-animation/rules/collage-{cutout-slap,paper-tear,stop-motion-boil,camera,marker-annotate,halftone-figure}.md` |
| blueprints | `../hyperframes-animation/blueprints/collage-{poster-build,figure-plate,clipping-highlight,board-pan,checklist,stamp-title-card}.md` |
| frame preset | `../hyperframes-creative/frame-presets/vox-collage/` (FRAME.md + caption skin) |
| storyboard method for this style | `references/storyboard-guide.md` |
| the teaching method + the storyboard sheet | `hyperframes:clear-explainer` (and its `references/storyboard-sheet.md`) |

## Setup — the kit in the project

The kit must be in the project before frames are built: `assets/collage/collage.js` + the six SVG textures. explainer-agent stages it automatically for `--style vox-collage`; otherwise copy this skill's `assets/` folder to `<project>/assets/collage/`. Frames load it with `<script src="assets/collage/collage.js"></script>` after the GSAP tag (the textures are referenced by the kit's CSS).

## The workflow, step by step (faceless-explainer)

- **Step 2 — design**: `node <SKILL_DIR>/scripts/build-frame.mjs --preset vox-collage --hyperframes .` The preset remixes onto brand tokens like any other (paper → brand canvas, ink → brand ink, highlighter → the brand accent as a FILL). If frame.md has a Brand kit section, it wins: its fonts (the serif is the Brand kit's accent face), its accent rules, its logo files.
- **Step 3 — story**: `hyperframes:clear-explainer` first (the question, ≤ 3 main points, the recurring picture, the recap). Plan 5–8 frames of 3.5–6.5 s; tag candidate blueprints from the collage menu (below). `transition_in`: `cut` almost everywhere (the frames open with their own slap/tear); `push-slide` only for an ordered sequence. A silent video (`music: none`, no SCRIPT.md) paces every reveal to reading time — see the guide.
- **Storyboard checkpoint** (explainer-agent): sketch the sheet in the collage treatment (paper ground, torn strips as rotated rectangles with ragged SVG edges, the highlighter band, grey halftone blocks for pictures not made yet) and present it — `clear-explainer/references/storyboard-sheet.md`. Nothing is generated or built before the person approves.
- **Step 4 — visual design**: write the collage `## Video direction` (template in `references/storyboard-guide.md`), then per frame: `blueprint: collage-…`, `focal`, `roles`, time-coded Scene lines that name the collage moves (slap, tear-away, highlight, draw a loop, stamp, camera to station 2…), and a `rules:` line that **always starts with `collage-kit`** plus the collage rules the scenes use — the packet builder inlines exactly those files for the worker.
- **Step 5 — frames**: workers build on the kit (scaffold in `collage-kit.md`). Nothing else to install.
- **Step 6 — checks and render**: `lint`, `check`, `snapshot` as usual; then **render at 24 fps**: `hyperframes render --fps 24 …` (pieces on twos land exactly on every second frame).

## Collage blueprint menu

| role | blueprint |
|---|---|
| Hook | `collage-poster-build` (evidence pile → headline on top → one highlighter swipe), `collage-portrait-field` (B&W subject on a torn colour field), `collage-figure-plate` |
| Problem | `collage-clipping-highlight` (strike the wrong phrase, circle the right one), `collage-poster-build` |
| Concept / Product_Intro | `collage-portrait-field` (the idea embodied, line-art makes it literal), `collage-figure-plate` (FIG. drawing labelled by hand), `collage-board-pan` |
| Benefits / Key_Feature / offers | `collage-board-pan` (tickets on a big board, camera visits each), `collage-checklist`, `collage-clipping-highlight` |
| Takeaway / recap | `collage-checklist` (the main points land, ticks draw, the one to remember highlighted), `collage-clipping-highlight` |
| CTA / Brand_Outro | `collage-stamp-title-card` (tear open → ink band → CTA sticker → logo → stamp) |

Core blueprints still work when their signature move is rebuilt from paper (e.g. `kinetic-type-beats` as ransom-chip beats, `titlecard-reveal` as a single torn strip). Don't mix in glossy UI shapes (`cursor-ui-demo`, `device-surface-showcase`) unless the topic is that UI — then print the screenshot as a cut-out photo.

## Look rules

- **Palette**: board = paper, pieces = white card / newsprint, type + marker + one band = ink, ONE accent (highlighter fill: a swipe per frame max, the CTA sticker), optional marker red for one stamp/correction. No gradients, no glows, no third hue.
- **Type**: display grotesque for statements on torn strips; serif second voice for the turn of a sentence and captions; labels small uppercase tracked; ransom chips at most once per video. FIG. captions and eyebrows read best in a monospace: HyperFrames resolves IBM Plex Mono, JetBrains Mono, Space Mono and Source Code Pro by name (no font file needed) — set `--cg-mono` and use `.cg-mono`.
- **Pictures**: generated pictures (or cleared photos) are the subjects, **printed**: the B&W halftone treatment by default (a `data-color-grading` recipe on a clip `<img>`, `collage-halftone-figure`), slapped onto a torn sheet of the accent colour or onto a torn `.cg-paper`; boil and annotate them like any piece. Keep the house colours (`print colour` treatment) only where the product's palette must show (a mascot, the product itself). Invented ink-and-halftone drawings (`collage-halftone-figure`) for diagrams and small marks. Never images marked as rights-unconfirmed, never stock people, never logos you weren't given.
- **Type behind the subject**: a giant year, number or word (`.cg-giant`, back layer) with the printed subject slapped over it; numbers roll in on twos with `C.count`.
- **Honest paper**: clippings' body text is greeked (`cg-greek`); readable words, numbers, prices and quotes come only from the brief. No fake mastheads, sources or dates.
- **Density**: 3–8 pieces per frame, one hero ≥ 3× the next piece, 30–45% empty paper, nothing important in the bottom 17%.

## Motion grammar

| thing | how |
|---|---|
| pieces (slap, slide, lift, tape, stamp, highlight, marker) | on twos (`C.twos`), 0.3–0.45 s, small overshoot |
| held pieces | boil ±1 px / ±0.4°, 12 poses/s |
| camera | smooth: push 3–5% per frame + parallax across three layers (back 0.4, mid 0.7, front 1); station moves 0.8–1.1 s `power2.inOut` |
| reveals | in reading order, on the beat they are read; annotation after the read |
| holds | ≥ 1.2 s on the final state of every frame (silent videos: ~0.3 s per word on screen, minimum) |
| exits | hard cut to the next frame; `lift` only when a frame must clear mid-shot |
| frame openers | a slap within 0.15 s, or a tear-away (max 2 per video) |
| never | fades on paper, floating, smooth piece tweens, blur, 3D, glows |

## Pitfalls (each one broke a test render)

- A treated `<img>` that isn't its own clip is treated only in the video's first frame; one inside a piece hidden with `visibility` at load is never treated. The kit hides `.cg-cut` with opacity; put `class="clip"` + `data-start/data-duration/data-track-index` on the `<img>`.
- `visibility: visible` on a piece overrides the runtime hiding the whole scene → the piece appears in other frames. The kit uses `autoAlpha` / `visibility: inherit`; `cg-shown` for pieces present at t=0.
- CSS `clip-path` / `filter: blur()` on many pieces → black captures (`composition_heavy_overlay_count_high`). The kit's torn paper is SVG.
- Marker strokes in a stretched `viewBox` with `vector-effect: non-scaling-stroke` draw only partly (Chrome dashes in screen space) → unscaled svgs only.
- A highlighter band with `z-index: -1` → lint `negative_z_index`; the kit orders by DOM.
- Measuring text at build time in a montage → wrong sizes (fonts not loaded, later scenes not laid out): sizes and coordinates are authored.
- Rendering at 30 fps → poses alternate 2/3 frames (stutter): render at 24.
- Ids that start with a digit (`01-hook-title`) break `querySelector("#…")`: prefix element ids with a letter per frame (`a-title`), keep the digits for the composition id.

## Check findings that are expected

`hyperframes check` reports these as `info` on a collage, by design — don't "fix" them:
- `container_overflow` on `.cg-board` / `.cg-camera`: the push-in and the camera scale the board past the frame edge.
- `text_occluded` on a word under a `.cg-strike`: the strike-through is meant to cross it.
