---
name: editorial
description: Cinematic editorial explainers for HyperFrames — black-and-white halftone cut-outs printed on flat fields of the brand's colour, giant type behind the subject, line-art callouts (rings, orbits, connector lines with dots, slash name tags, a spotlight that dims all but the subject), a slow camera push with 2.5D parallax, film grain and a lens vignette, in the manner of Vox, The Economist and the clearest TED-Ed lessons. Use when the run's style is editorial (explainer-agent's default) or a brief asks for a cinematic / editorial / documentary / magazine explainer look. Adds the editorial kit (assets/editorial), the editorial frame preset, the editorial-* motion rules and the editorial-* blueprints to the normal workflows (faceless-explainer first).
---

# Editorial

A cinematic explainer made of **one clear picture per idea**. Every frame: a subject printed in black and white, laid on a flat field of the brand's colour, with a few precise marks that guide the eye — while the camera slowly pushes in and the layers drift at different speeds. It is a **style layer** over the normal HyperFrames workflows — you still run `faceless-explainer` (or `general-video`, `product-launch-video`) step by step; this skill tells you what to choose at each step and gives the frame workers a tested kit. The teaching itself follows `hyperframes:clear-explainer`.

What makes it read as cinematic editorial and not as "slides with photos":

1. **B&W subject, colour field** — pictures are printed (halftone, dot screen, B&W photo) via HyperFrames' media treatments; the brand colour lives in the field behind them.
2. **Depth and a camera** — three layers at different depths and a slow push with parallax on every frame; reframes, stations and zoom-throughs where the story moves.
3. **Type as image** — giant numbers and words behind the subject; short lines; mono labels.
4. **A guided look** — spotlight, ring, connector with dots, "/ Name" tag, highlighter — always after the content is read.
5. **Film finish** — living grain and a lens vignette over every frame.

## Files

| what | where |
|---|---|
| the kit (helpers + `.ed-*` styles + textures) | `assets/` here → staged in the project at `assets/editorial/` |
| kit API, scaffold, picture treatments, constraints (frame workers' reference) | `../hyperframes-animation/rules/editorial-kit.md` |
| motion rules | `../hyperframes-animation/rules/editorial-{camera,cutout,callouts,graphics,transitions}.md` |
| blueprints | `../hyperframes-animation/blueprints/editorial-*.md` (11) |
| frame preset | `../hyperframes-creative/frame-presets/editorial/` (FRAME.md + caption skin) |
| storyboard method for this style | `references/storyboard-guide.md` |

## Setup — the kit in the project

The kit must be in the project before frames are built: `assets/editorial/editorial.js` + the five SVG textures. explainer-agent stages it for `--style editorial`; otherwise copy this skill's `assets/` folder to `<project>/assets/editorial/`. Frames load it with `<script src="assets/editorial/editorial.js"></script>` after the GSAP tag.

## The look, chosen from the brand

Pick ONE look for the video from the brand (frame.md's Brand kit: its colours, its art direction notes, the product's voice) and the topic; state it in the storyboard with a one-line reason. The person can change it at the review.

| look | when the brand / topic is… | ground | pictures |
|---|---|---|---|
| **colour-field** | bold accent that reads as a large field (a saturated red, blue, green), a confident voice; history, people, opinion, culture | full fields of the brand colour, paper frames as breathers | B&W halftone cut-outs |
| **paper-data** | calm, light, precise; the accent is meant for small touches ("orange only as small accents"); numbers, how-tos, comparisons | paper + drafting grid; the colour as type, bars, dots, one band | B&W halftone cut-outs, smaller |
| **documentary** | serious, investigative, dark-ground brands; who-did-what, systems of people, evidence | ink (dark) | B&W photos, spotlight, connectors, name tags |
| **duotone** | one-colour brands, tech and product explainers, identity, security | the colour's light tint | everything in the dot screen `[deep, tint]` of the brand hue |

Rules that come from the brand: the field is the brand's accent (build-frame maps it exactly); if the Brand kit says the accent is a fill only, it never becomes text on paper (use `accentText` for thin lines and type); the art-direction notes win over this table; the logo file closes the video untouched. A product can pin the look: `product.json → agents.explainer.look`.

## The workflow, step by step (faceless-explainer)

- **Step 2 — design**: `node <SKILL_DIR>/scripts/build-frame.mjs --preset editorial --hyperframes .` (paper → the brand canvas, ink → the brand ink, the field → the brand accent, tints keep their lightness in the brand hue). The Brand kit section in frame.md wins on fonts, accent use and logos.
- **Step 3 — story**: `hyperframes:clear-explainer` first (question, ≤ 3 main points, one idea + one picture per frame, recap). Plan 6–9 frames of 4–7 s for 45–60 s. Tag candidate blueprints from the menu below. `transition_in`: `cut` for most seams; `push-slide` for an ordered sequence on one stage.
- **Storyboard checkpoint** (explainer-agent): sketch the sheet (`clear-explainer/references/storyboard-sheet.md`) in the editorial treatment, present it, wait for approval.
- **Step 4 — visual design**: write the editorial `## Video direction` (template in `references/storyboard-guide.md`), then per frame: `blueprint: editorial-…`, `focal`, `roles`, time-coded Scene lines naming the kit moves (field wipes in, subject rises, giant type behind, spotlight closes, connector draws, ring draws, count-up, highlighter, camera reframes), the pictures with their treatment, and a `rules:` line that **always starts with `editorial-kit`** plus the editorial rules the scenes use — the packet builder inlines exactly those.
- **Step 5 — frames**: workers build on the kit (scaffold in `editorial-kit.md`). Nothing else to install.
- **Step 6 — checks and render**: `lint`, `check`, `snapshot`; render at the default 30 fps.

## Editorial blueprint menu

| role | blueprint |
|---|---|
| Hook | `editorial-subject-field` (B&W subject on a colour field, the question below), `editorial-type-behind`, `editorial-orbit` |
| Problem | `editorial-crowd` (everyone does it), `editorial-metaphor-scene`, `editorial-type-behind` |
| Concept (the named idea) | `editorial-subject-field`, `editorial-metaphor-scene` (the analogy made literal), `editorial-hub` (its parts) |
| Mechanism / steps | `editorial-metaphor-scene`, `editorial-spotlight-link` (this part → that effect), `editorial-hub` |
| Evidence / numbers | `editorial-compare` (two things from one baseline), `editorial-chart-highlight`, `editorial-type-behind` |
| Recap | `editorial-recap` (the main points with their pictures) |
| CTA | `editorial-closing-card` |

Core blueprints still work when rebuilt with the kit (`kinetic-type-beats` on a colour field, `dataviz-countup` with `E.count`). Don't use glossy UI shapes unless the topic is that UI.

## Pictures

- **Generated pictures** (explainer-agent's `generate_images`, in the house illustration style) are the subjects and props: one subject per picture, transparent cut-outs, big enough to read as halftone (≥ 600 px on screen for a person). Ask for pictures that read well in black and white: strong silhouette, clear light and shadow, a three-quarter view, a simple pose; props as separate cut-outs.
- Each frame block names its pictures **and their treatment** (`B&W halftone`, `dot screen [deep, tint]`, `two-ink`, `B&W photo`, `print colour`) so the worker's packet carries it.
- The house style can stay in colour (`print colour`) when the product's pictures must keep its palette (a mascot, a product illustration); the colour-field look then uses fewer, larger fields.
- Never people or logos you weren't given; never stock photos; supplied photos only when cleared.

## Look rules

- **Palette**: paper, ink, the brand colour (field) and its two tints; pictures in black and white. One field colour per frame; never a second hue except a status meaning in a chart.
- **Type**: display face for lines (≤ 8 words), giant for one word or number, serif for the second voice and text fills, mono for labels and sources. One highlighted word per frame.
- **Density**: 3–7 pieces, one hero ≥ 40% of the frame, 25–40% empty field, nothing in the bottom 17%.
- **Honesty**: every word and number on screen from the brief; text fills repeat the brief's words; sources only when given.

## Motion grammar

| thing | how |
|---|---|
| fields, bands, bars | grow (wipe) from an edge, 0.6–0.9 s `expo.inOut` |
| subjects | rise 90–140 px, 0.9–1.1 s `expo.out` — big things move slowly |
| type | rise 40–80 px, 0.7–0.9 s; giant type before the subject |
| small pieces (dots, tags, markers) | pop with a small overshoot, staggered 0.06–0.1 s |
| line-art | draws on, 0.8–1.2 s `power2.inOut` |
| the guide (spotlight, ring, connector, highlight) | after the read, one per beat |
| camera | push 3–6% + parallax every frame; reframes 0.9–1.3 s `power3.inOut`; zoom-through ≤ 2 per video |
| holds | ≥ 1.2 s on the final state of every frame (silent: 0.3 s per word on screen + 1 s) |
| never | bounce on big pieces, spins, floating, blur, glows, 3D |

## Pitfalls (each one broke a test render)

- A treated `<img>` that is not its own clip is treated only in the first frame of the video (HyperFrames initialises media treatments for what is visible at load): `class="clip" data-start="0" data-duration="<frame>" data-track-index="<n>"` on the `<img>`.
- A treated picture inside a piece hidden with `visibility:hidden` at load is never treated: the kit hides with opacity; never use GSAP `autoAlpha` on pieces.
- CSS `clip-path`, `filter: blur()` and `radial-gradient` on many pieces → black captures (`composition_heavy_overlay_count_high`). The kit's shapes, text fills and spotlight are SVG; the vignette is an image.
- Line-art in a stretched `viewBox` with `vector-effect: non-scaling-stroke` draws only partly → unscaled svgs only.
- Measuring text at build time → wrong sizes (fonts not loaded): sizes and coordinates are authored.
- Ids that start with a digit break `querySelector("#…")`: prefix element ids with a letter per frame.

## Check findings that are expected

- `container_overflow` on `.ed-camera` / `.ed-layer`: the push and parallax move layers past the frame edge.
- `duplicate_media_discovery_risk` when one picture repeats (the crowd): stagger the copies' `data-start` by 0.01 s, or accept the warning.
