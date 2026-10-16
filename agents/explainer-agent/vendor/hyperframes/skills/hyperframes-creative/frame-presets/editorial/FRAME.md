---
version: alpha
name: Editorial — Frame (video / frame layer)
description: >
  Cinematic editorial explainer: black-and-white halftone cut-outs printed on flat fields of ONE brand
  colour, giant type set behind the subject, thin line-art callouts (rings, orbits, connector lines with
  dots, slash name tags, a spotlight), a slow camera push with parallax between depth layers, film grain
  and a lens vignette. Built on the editorial kit (assets/editorial/editorial.js — see the editorial skill
  and the editorial-kit rule). Motion is specified by the editorial-* rules.
unit: the frame — 1080×1350 (4:5) primary; 9:16, 1:1 and 16:9 documented
principle: the subject is printed in black and white, the colour is the field · one idea per frame · the eye is guided · the camera always breathes · numbers come from the script

colors:
  paper: "#F2EFE8"
  ink: "#1B1B18"
  field: "#E1381C"
  field-deep: "#8F2414"
  field-tint: "#F6D9D1"
  stone: "#8E8A84"
  muted: "#6F6C66"
  shadow: "rgba(0,0,0,0.28)"

typography:
  display:   { fontFamily: "Archivo Black", px: 104, weight: 400, lineHeight: 0.95, tracking: "-0.035em" }
  headline:  { fontFamily: "Archivo Black", px: 76, weight: 400, lineHeight: 0.98, tracking: "-0.03em" }
  giant:     { fontFamily: "Archivo Black", px: 320, weight: 400, lineHeight: 0.8, tracking: "-0.055em" }
  serif:     { fontFamily: "EB Garamond", px: 64, weight: 400, lineHeight: 1.05 }
  body:      { fontFamily: "Inter", px: 36, weight: 500, lineHeight: 1.3 }
  tag:       { fontFamily: "Archivo Black", px: 54, weight: 400, lineHeight: 1.0, tracking: "-0.02em" }
  label:     { fontFamily: "IBM Plex Mono", px: 24, weight: 500, tracking: "0.06em", upper: true }
  mono:      { fontFamily: "IBM Plex Mono", px: 30, weight: 500 }

spacing:
  edge: "64px"          # frame edge inset at 1080 wide
  gap: "28px"
  keep-out: "17%"       # bottom caption band

components:
  ground:
    description: "One flat ground per frame: paper, ink, or the field colour. Film finish (grain + vignette) over everything."
  colour-field:
    fill: "{colors.field}"
    shapes: "full ground · arch (portrait niche) · circle · blob (organic silhouette) · slant band · rounded card"
    description: "The colour of the frame lives here, behind the subject. One field colour per frame."
  cut-out:
    treatment: "B&W halftone (data-color-grading) · white printed rim · soft contact shadow"
    description: "The subject: a person, an object, a machine — a generated picture or a supplied photo, printed in black and white."
  dot-screen:
    treatment: "monoScreen in [{colors.field-deep}, {colors.field-tint}] or [{colors.ink}, {colors.paper}]"
    description: "The duotone look: a whole frame in one brand hue on its light tint."
  giant-type:
    typography: "{typography.giant} in {colors.field} on paper when it reads (≥ 3:1), else ink; on the field, paper or ink — whichever reads"
    description: "A year, a number, one word — BEHIND the subject, overlapped by it."
  text-fill:
    typography: "{typography.serif} in {colors.ink} on {colors.paper}, tilted −8…−12°"
    description: "A silhouette cut from a page of the key words (data-ed-textfill)."
  name-tag:
    typography: "{typography.tag}"
    slash: "{colors.field}"
    description: "/ Name — the documentary label, paper type on dark, ink type on light."
  connector:
    stroke: "{colors.field} (on paper/ink) or {colors.ink} (on the field), 3–4px, round"
    dots: "24px discs"
    description: "Orthogonal route with rounded corners between two dots: what links to what."
  rings:
    stroke: "{colors.field} 2px (or {colors.paper} on dark)"
    description: "Concentric rings / tilted orbits with numbered markers: scale, levels, reach."
  highlighter:
    fill: "{colors.field-tint} on paper, {colors.ink} band with paper text on the field"
    description: "Behind ONE word per frame."
  spotlight:
    fill: "{colors.ink} at 60–75%"
    description: "Everything but the subject sinks into shadow; a ring draws around it."
  set:
    fill: "{colors.stone}"
    description: "A flat grey plane — desk, floor, shelf — for metaphor scenes."
---

# Editorial — Frame (video / frame layer)

## Overview

Editorial is the **cinematic magazine explainer**: every frame is one clear picture of one idea. The subject — a person, an object, a machine — is **printed in black and white** (halftone dots, a white cut-out rim, a soft shadow) and laid on a **flat field of the brand's colour**. Around it, a few precise marks guide the eye: giant type set behind the subject, thin rings and orbits, connector lines with dots and slash name tags, a spotlight that dims everything else, a highlighter behind the one word that matters. The camera is never quite still: a slow push, with the layers drifting at different speeds (2.5D parallax), under a film grain that lives and a lens vignette.

**Key characteristics at frame scale:**

- **B&W subject, colour field** — the subject never carries the brand colour; the field behind it does. One field colour per frame.
- **Depth** — 3 layers (back: field, giant type, far line-art · mid: the subject · front: tags, lines, highlight) moving at different speeds.
- **The eye is guided** — every frame has one focal point; callouts (spotlight, ring, connector, highlight) arrive after the content is read.
- **Type as image** — giant numbers and words behind the subject; short lines in the display face; labels in mono caps.
- **Film finish** — grain and vignette on every frame, the same everywhere.

## Looks (chosen per video from the brand, stated in the storyboard)

| look | ground | pictures | best for |
|---|---|---|---|
| **colour-field** | full fields of `{colors.field}`, `{colors.paper}` breathers | B&W halftone cut-outs | bold brands, history, people, opinion, "here's what's really going on" |
| **paper-data** | `{colors.paper}` + drafting grid; the field as type, bars, bands | B&W halftone cut-outs, small | calm or precise brands, numbers, how-tos, comparisons |
| **documentary** | `{colors.ink}` (dark) | B&W photos, spotlight, connectors, name tags | investigations, who-did-what, systems of people |
| **duotone** | `{colors.field-tint}` paper, everything in one hue | dot screen in `[{colors.field-deep}, {colors.field-tint}]` | product and tech explainers, identity, a single-colour brand |

A video keeps one look; one or two frames may borrow another (a documentary spotlight frame inside a paper-data video). When the Brand kit's art direction limits the accent ("orange only as small accents"), the look is **paper-data** or **documentary** and the field colour appears only as type, lines, dots and one band.

## The Frame

### Frame Craft Bar

- **Squint** — the subject (or the giant type) dominates: ≥ 40% of the frame, ≥ 3× the next element.
- **One idea** — a stranger to the topic can say in five words what this frame shows.
- **Depth** — at least three layers drifting at different speeds; nothing sits flat on the ground except the ground.
- **Restraint** — 3–7 pieces; 25–40% empty field; one highlighted word; one field colour.
- **Reference** — Vox, Kurzgesagt's editorial pieces, The Economist and NYT op-ed films, TED-Ed's clearest lessons. Failure looks like a corporate slide with a stock photo, or a busy scrapbook.

- **Primary:** 1080×1350 (4:5). Sizes below are px at 1080 wide; scale by width for other formats.
- **Safe area:** `edge` 64px; the bottom 17% (caption band) stays free of content even without captions.

## Colors

`{colors.paper}` is the light ground; `{colors.ink}` the dark ground, type and lines on light; `{colors.field}` is THE brand colour — fields, giant type, connectors and dots, the slash; `{colors.field-deep}` its dark tint (two-ink prints, the dot screen's dark); `{colors.field-tint}` its light tint (duotone paper, the highlighter on paper). `{colors.stone}` is the flat grey of sets and planes; `{colors.muted}` labels. Pictures are black and white (or the dot screen in the field's tints): colour comes from fields, never from the photo.

## Typography

- **`display`** / **`headline`** — short lines (≤ 8 words), sentence case, tight. Use the heaviest weight the display face ships (Archivo Black is already black at 400; a brand sans at 700–800); a brand serif display stays as light as the brand sets it.
- **`giant`** — one year, number or word, 260–380px, behind the subject, often bleeding off an edge. It must reach 3:1 against its ground (`hyperframes check` enforces it): a light accent (yellow, lime) is never type on paper, and type on a light field is ink.
- **`serif`** — the second voice: a quote, the turn of a sentence, the text fill. With a Brand kit in this file, the serif is the Brand kit's accent face.
- **`tag`** — "/ Name" labels.
- **`label`** / **`mono`** — chart labels, sources, kickers, numbers on rings.
- Legibility floor: 28px for anything that must be read (labels 24px only for decoration).

## Depth & Surface

- Cut-outs: soft contact shadow, white printed rim (all or none in a video).
- Film grain over everything (lives 12×/s); lens vignette (stronger on dark grounds).
- **Ceiling:** no glows, no glass, no 3D extrusion, no blur, no gradients except the vignette.

## Motion

- Entrances are smooth and decisive: rise (`expo.out`, 0.8–1.1 s for big things), pop for small things, grow (wipe) for fields and bars. No bounce on big pieces.
- The camera pushes 3–6% over every frame with parallax; reframes and zoom-throughs are `power3.inOut`.
- Reveals in reading order, on the beat they are read; callouts after the read; a held read at the end of every frame.
- Seams: hard cuts; a field wipe when the colour changes; at most two designed seams (iris, zoom-through, match cut) per minute.

## Components

- **colour-field**, **cut-out**, **dot-screen**, **giant-type**, **text-fill** — the picture.
- **name-tag**, **connector**, **rings**, **highlighter**, **spotlight** — the guide.
- **set** — the stage for metaphor scenes.

## Frame Treatments

> Recipe: field · subject · type · guide · silence · camera (the editorial-* blueprint).

1. **Subject on a field** (opener · `editorial-subject-field`) — field wipes in, page of words or giant word behind, B&W subject rises, the line lands, one word highlighted. Silence ~30%.
2. **Type behind** (evidence · `editorial-type-behind`) — giant number behind the subject, label + rule. Silence ~25%.
3. **Spotlight & link** (relationship · `editorial-spotlight-link`) — dim all but one, ring, name tag, connector to what it explains. Silence ~30%.
4. **Crowd** (scale · `editorial-crowd`) — rows of the same figure, the odd one out. Silence low.
5. **Metaphor scene** (mechanism · `editorial-metaphor-scene`) — subject at work on a flat set, line-art makes the metaphor literal. Silence ~30%.
6. **Orbit** (levels · `editorial-orbit`) — rings drawn around something small, numbered markers. Silence ~40%.
7. **Hub** (parts · `editorial-hub`) — subject in an arch, panels connected by lines, one hue. Silence ~25%.
8. **Compare** (numbers · `editorial-compare`) — two stacks/bars from one baseline, the gap labelled. Silence ~35%.
9. **Chart** (data · `editorial-chart-highlight`) — a sourced chart, one category lit. Silence ~30%.
10. **Recap** (takeaway · `editorial-recap`) — the main points, one line each, with their icons. Silence ~30%.
11. **Closing card** (CTA · `editorial-closing-card`) — field wipe, closing line, logo, CTA. Silence ~35%.

## Composition Rules

### Do

- Build every frame in three depth layers and give each a depth; let the push run under the whole frame.
- Put the subject where the story is (upper 60%), the line below it; give the type room.
- Use the field colour for one thing at a time: the ground, OR the giant type, OR the line-art.
- Vary framings across the video (centred subject, type-behind, wide crowd, hub, chart, recap) — never the same twice in a row.

### Don't

- Don't colour the subject, don't use stock-photo people, don't use a picture with unconfirmed rights.
- Don't put the highlighter in the field colour on a field-coloured ground (use an ink band with paper text).
- Don't float pieces, don't spin, don't bounce big things, don't blur.
- Don't invent numbers, names, quotes, sources or logos; use placeholders.

## Aspect-Ratio Behavior

| Treatment | 4:5 (1080×1350) | 9:16 (1080×1920) | 1:1 | 16:9 (1920×1080) |
|---|---|---|---|---|
| Subject on a field | subject upper 60%, line below | subject upper half, line below, bigger type | subject centred, line over the lower third | subject left 55%, line right |
| Type behind | type across the upper half | type stacked (2 lines) upper half | type across the middle | type full width |
| Spotlight & link | subject upper half, connector across the lower half | same, longer connector | compact | left name, right destination |
| Crowd | 2–3 rows full width | 3–4 rows | 2 rows | long rows |
| Hub | arch centred, panels above/below | panels stacked | panels around | panels left and right |
| Recap / chart | column centred | column, bigger type | column | column left, icons right |

## Approved Entities

No real customers, logos or vendors are defined by this preset. Only the brand's own logo files (from the Brand kit) and assets the brief supplies may appear.

## Numerals & Claims (hard rule)

Never invent figures, prices, dates, quotes, sources or outcomes. Every number on screen traces to the brief or the product facts; otherwise a visible placeholder (`[X]`). Charts carry the brief's source line or none.

## Pre-Render Self-Audit

- **Picture** — the subject is B&W (or the dot screen); the colour is the field; the treated `<img>` is a clip.
- **Depth** — three layers with depths; the push runs the whole frame; film finish on top.
- **Guide** — one focal point; callouts after the read; one highlighted word.
- **Clarity** — a newcomer can say what the frame shows in five words.
- **Fabrication** — every readable word and number traces to the brief.
- **Caption band** — bottom 17% clear.

## Known Gaps

- Real photographs need rights; generated pictures are the default.
- The halftone needs pictures of at least ~600px on screen to read as dots; tiny cut-outs read as grey.
- 16:9 values are guidance: re-check type sizes against the 28px floor scaled to 1920 wide.
