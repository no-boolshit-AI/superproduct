---
name: vox-collage
description: Vox-style paper-collage motion graphics for HyperFrames — torn paper strips and cut-outs that slap onto a paper board on twos, boil, soft cut-paper shadows, tape, rubber stamps, highlighter and hand-drawn marker annotations, ransom headlines, ink-and-halftone figure plates, film grain and a rostrum camera. Use when a brief asks for a Vox / collage / cut-paper / editorial explainer look, or the run's style is vox-collage. Adds the collage kit (assets/collage), the vox-collage frame preset, the collage-* motion rules and the collage-* blueprints to the normal workflows (faceless-explainer first).
---

# Vox collage

An explainer made of paper. Every frame is a board seen from above; ideas arrive as cut-outs slapped on by hand; a hand then annotates them. It is a **style layer** over the normal HyperFrames workflows — you still run `faceless-explainer` (or `general-video`, `product-launch-video`) step by step; this skill tells you what to choose at each step and gives the frame workers a tested kit.

What makes it read as Vox and not as "a slide with a paper texture":

1. **Paper physics** — torn edges (white rim on coloured paper), resting tilts, soft shadows that lengthen when a piece is lifted, tape, grain over everything.
2. **Stop-motion** — pieces move **on twos** (12 poses/s at 24 fps) and **boil** while held; the camera alone moves smoothly (slow push, parallax, station pans).
3. **The hand annotates** — after the content is read: one highlighter swipe, marker loops/arrows/strikes/ticks, a stamp.
4. **Editorial pictures** — ink-and-halftone drawings on paper plates ("FIG. 01 —"), real photos (supplied and cleared) as halftone/duotone cut-outs, or pictures generated for the video in the house illustration style (explainer-agent's `generate_images`) as cut-out clippings.
5. **Restraint** — paper colours + ink + ONE accent; 3–8 pieces per frame; hard cuts between frames.

## Files

| what | where |
|---|---|
| the kit (helpers + `.cg-*` styles + textures) | `assets/` here → staged in the project at `assets/collage/` |
| kit API, scaffold, constraints (frame workers' reference) | `../hyperframes-animation/rules/collage-kit.md` |
| motion rules | `../hyperframes-animation/rules/collage-{cutout-slap,paper-tear,stop-motion-boil,camera,marker-annotate,halftone-figure}.md` |
| blueprints | `../hyperframes-animation/blueprints/collage-{poster-build,figure-plate,clipping-highlight,board-pan,checklist,stamp-title-card}.md` |
| frame preset | `../hyperframes-creative/frame-presets/vox-collage/` (FRAME.md + caption skin) |
| storyboard method for this style | `references/storyboard-guide.md` |

## Setup — the kit in the project

The kit must be in the project before frames are built: `assets/collage/collage.js` + the six SVG textures. explainer-agent stages it automatically for `--style vox-collage`; otherwise copy this skill's `assets/` folder to `<project>/assets/collage/`. Frames load it with `<script src="assets/collage/collage.js"></script>` after the GSAP tag (the textures are referenced by the kit's CSS).

## The workflow, step by step (faceless-explainer)

- **Step 2 — design**: `node <SKILL_DIR>/scripts/build-frame.mjs --preset vox-collage --hyperframes .` The preset remixes onto brand tokens like any other (paper → brand canvas, ink → brand ink, highlighter → the brand accent as a FILL). If frame.md has a Brand kit section, it wins: its fonts (the serif is the Brand kit's accent face), its accent rules, its logo files.
- **Step 3 — story**: plan 5–8 frames of 3.5–6.5 s; tag candidate blueprints from the collage menu (below). `transition_in`: `cut` almost everywhere (the frames open with their own slap/tear); `push-slide` only for an ordered sequence. A silent video (`music: none`, no SCRIPT.md) paces every reveal to reading time — see the guide.
- **Step 4 — visual design**: write the collage `## Video direction` (template in `references/storyboard-guide.md`), then per frame: `blueprint: collage-…`, `focal`, `roles`, time-coded Scene lines that name the collage moves (slap, tear-away, highlight, draw a loop, stamp, camera to station 2…), and a `rules:` line that **always starts with `collage-kit`** plus the collage rules the scenes use — the packet builder inlines exactly those files for the worker.
- **Step 5 — frames**: workers build on the kit (scaffold in `collage-kit.md`). Nothing else to install.
- **Step 6 — checks and render**: `lint`, `check`, `snapshot` as usual; then **render at 24 fps**: `hyperframes render --fps 24 …` (pieces on twos land exactly on every second frame).

## Collage blueprint menu

| role | blueprint |
|---|---|
| Hook | `collage-poster-build` (evidence pile → headline on top → one highlighter swipe), `collage-figure-plate` |
| Problem | `collage-clipping-highlight` (strike the wrong phrase, circle the right one), `collage-poster-build` |
| Concept / Product_Intro | `collage-figure-plate` (FIG. drawing labelled by hand), `collage-board-pan` |
| Benefits / Key_Feature / offers | `collage-board-pan` (tickets on a big board, camera visits each), `collage-checklist`, `collage-clipping-highlight` |
| Takeaway / outcome | `collage-checklist` (lines land, ticks draw), `collage-clipping-highlight` |
| CTA / Brand_Outro | `collage-stamp-title-card` (tear open → ink band → CTA sticker → logo → stamp) |

Core blueprints still work when their signature move is rebuilt from paper (e.g. `kinetic-type-beats` as ransom-chip beats, `titlecard-reveal` as a single torn strip). Don't mix in glossy UI shapes (`cursor-ui-demo`, `device-surface-showcase`) unless the topic is that UI — then print the screenshot as a cut-out photo.

## Look rules

- **Palette**: board = paper, pieces = white card / newsprint, type + marker + one band = ink, ONE accent (highlighter fill: a swipe per frame max, the CTA sticker), optional marker red for one stamp/correction. No gradients, no glows, no third hue.
- **Type**: display grotesque for statements on torn strips; serif second voice for the turn of a sentence and captions; labels small uppercase tracked; ransom chips at most once per video. FIG. captions and eyebrows read best in a monospace: HyperFrames resolves IBM Plex Mono, JetBrains Mono, Space Mono and Source Code Pro by name (no font file needed) — set `--cg-mono` and use `.cg-mono`.
- **Pictures**: invented drawings (`collage-halftone-figure`) unless the brief supplies cleared images or the run generates pictures. Generated house-style pictures are transparent cut-outs: put each in a torn `.cg-paper` (or straight on the board under the cut-paper shadow), slap, boil and annotate it like any piece. They keep their own colours — printed matter on the board, like a clipping from a period magazine; the palette rule governs the paper, type and marks around them. Never images marked as rights-unconfirmed, never stock people, never logos you weren't given.
- **Honest paper**: clippings' body text is greeked (`cg-greek`); readable words, numbers, prices and quotes come only from the brief. No fake mastheads, sources or dates.
- **Density**: 3–8 pieces per frame, one hero ≥ 3× the next piece, 30–45% empty paper, nothing important in the bottom 17%.

## Motion grammar

| thing | how |
|---|---|
| pieces (slap, slide, lift, tape, stamp, highlight, marker) | on twos (`C.twos`), 0.3–0.45 s, small overshoot |
| held pieces | boil ±1 px / ±0.4°, 12 poses/s |
| camera | smooth: push 3–5% per frame + parallax; station moves 0.8–1.1 s `power2.inOut` |
| reveals | in reading order, on the beat they are read; annotation after the read |
| holds | ≥ 1.2 s on the final state of every frame (silent videos: ~0.3 s per word on screen, minimum) |
| exits | hard cut to the next frame; `lift` only when a frame must clear mid-shot |
| frame openers | a slap within 0.15 s, or a tear-away (max 2 per video) |
| never | fades on paper, floating, smooth piece tweens, blur, 3D, glows |

## Pitfalls (each one broke a test render)

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
