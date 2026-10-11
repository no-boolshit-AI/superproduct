---
version: alpha
name: Vox Collage — Frame (video / frame layer)
description: >
  Editorial cut-paper collage in the manner of Vox explainers. The unit is the frame. Atoms —
  a warm paper board, torn white paper strips and cut-outs that cast soft shadows, ink type,
  ONE highlighter accent, a marker hand that annotates, tape and rubber stamps, halftone
  drawings, film grain. Pieces move on twos (stop-motion), the camera glides over the board.
  Built on the collage kit (assets/collage/collage.js — see the vox-collage skill and the
  collage-kit rule). Motion is specified by the collage-* rules.
unit: the frame — 1080×1350 (4:5) primary; 9:16, 1:1 and 16:9 documented
principle: paper is the medium · one accent · the hand annotates · on twos · numbers come from the script

colors:
  paper: "#F2EFE8"
  ink: "#1B1B18"
  card: "#FFFFFF"
  newsprint: "#E7E3D9"
  muted: "#6F6C66"
  highlighter: "#FFE135"
  marker: "#D9432B"
  tape: "rgba(232,230,224,0.82)"
  shadow: "rgba(27,27,24,0.30)"

typography:
  display:   { fontFamily: "Archivo Black", px: 104, weight: 500, lineHeight: 0.98, tracking: "-0.035em" }
  headline:  { fontFamily: "Archivo Black", px: 72, weight: 500, lineHeight: 1.0, tracking: "-0.03em" }
  serif:     { fontFamily: "Playfair Display", px: 100, weight: 400, lineHeight: 1.0, tracking: "-0.015em" }
  body:      { fontFamily: "Inter", px: 34, weight: 500, lineHeight: 1.3 }
  tag:       { fontFamily: "Inter", px: 34, weight: 600, lineHeight: 1.0 }
  label:     { fontFamily: "Inter", px: 22, weight: 600, tracking: "0.16em", upper: true }
  chip:      { fontFamily: "Archivo Black", px: 88, weight: 500, lineHeight: 1.0 }
  stamp:     { fontFamily: "Inter", px: 56, weight: 700, tracking: "0.08em", upper: true }

spacing:
  edge: "64px"          # frame edge inset at 1080 wide
  gap: "28px"
  keep-out: "17%"       # bottom caption band

components:
  board:
    layers: "cg-ground {colors.paper} · cg-tone (paper unevenness) · optional cg-grid · the board · cg-grain on top"
    description: "Every frame is a paper board seen from above. The grain sits over everything."
  torn-strip:
    fill: "{colors.card}"
    edges: "torn top + bottom (data-cg-edges='tb'), knife-cut ends"
    typography: "{typography.display} or {typography.serif}"
    description: "A headline torn from a magazine: one or two lines per strip, resting tilt −3…+3°."
  cut-out:
    fill: "{colors.card} or {colors.newsprint}"
    shadow: "soft drop shadow, long while lifted (the kit's --lift)"
    description: "Any piece on the board: tag, ticket, card, note, plate, sticker."
  ink-band:
    fill: "{colors.ink}"
    rim: "{colors.card} torn rim"
    typography: "{typography.serif} or {typography.display} in {colors.card}"
    description: "The contrast band — one or two per video (the turn, the CTA)."
  highlighter:
    fill: "{colors.highlighter}"
    description: "A band behind ONE word or phrase per frame; text on it stays {colors.ink}."
  marker:
    stroke: "{colors.ink} 7px round (second voice: {colors.marker})"
    description: "Loops, arrows, underlines, strikes, ticks — drawn on after the content is read."
  sticker:
    fill: "{colors.highlighter}"
    typography: "{typography.tag} in {colors.ink}"
    description: "CTA pill or a small label; the only other place the accent appears."
  stamp:
    color: "{colors.ink} (or {colors.marker})"
    typography: "{typography.stamp}"
    description: "Rubber stamp, distressed, multiply; one per video (the launch word)."
  tape:
    fill: "{colors.tape}"
    description: "Translucent strip with torn ends across a corner."
  figure-plate:
    fill: "{colors.card}"
    drawing: "ink outlines 4–6px + halftone dot shading"
    caption: "{typography.label} — FIG. NN — a line from the brief"
    description: "Invented editorial illustration of the script's metaphor."
  clipping:
    fill: "{colors.newsprint} or {colors.card}"
    body: "greeked lines (cg-greek), never invented copy"
    description: "A torn newspaper/magazine clipping carrying one real statement."
---

# Vox Collage — Frame (video / frame layer)

## Overview

Vox Collage is an **editorial explainer made of paper**. Every frame is a board seen from above: warm paper, a whisper of grid, a film grain over everything. Ideas arrive as **cut-outs** — torn headline strips, tags, tickets, clippings, notes, drawn figures — that a hand slaps onto the board; the hand then **annotates** them with a highlighter, a marker and a rubber stamp. Pieces move **on twos** like stop-motion and never sit perfectly still (boil); the camera **glides** over the board with a slow push and parallax.

**Key characteristics at frame scale:**

- **Paper is the medium** — torn edges, white rims on coloured paper, soft shadows that lengthen when a piece is lifted, tape, grain.
- **One accent** — the highlighter (`{colors.highlighter}`): one swipe per frame, the CTA sticker; never a background, never text colour on paper.
- **Ink type** in two voices — a heavy grotesque for statements (`display`), a serif for the second voice (`serif`); labels small, uppercase, tracked.
- **The hand annotates** — marker loops, arrows, strikes and ticks draw on after the content is read.
- **Drawn, not stock** — pictures are ink-and-halftone drawings on paper plates (FIG. NN) unless the brief supplies cleared photos.

## The Frame

### Frame Craft Bar

- **Squint** — one torn strip or one plate dominates (≥ 3× the next piece); supporting scraps are small and at the edges.
- **Hand** — every frame shows evidence of a hand: a tilt, a torn edge, tape, a marker stroke. A frame that could be a slide has failed.
- **Restraint** — one highlighter swipe per frame, one stamp per video, 3–8 pieces per frame; empty paper is allowed (30–45%).
- **Reference** — a Vox / Johnny Harris style collage explainer, an editorial magazine spread animated by hand. Failure looks like a corporate slide with a paper texture laid on top, or a "scrapbook" crammed with random clip-art.

- **Primary:** 1080×1350 (4:5). Sizes below are px at 1080 wide; scale by width for other formats.
- **Safe area:** `edge` 64px; the bottom 17% (caption band) stays free of content even without captions.

## Colors

`{colors.paper}` is the board (ground). `{colors.card}` is the cut paper most pieces are made of; `{colors.newsprint}` a second, duller paper for clippings and notes. `{colors.ink}` is type, outlines, marker and the ink band. `{colors.highlighter}` is the ONE accent — a fill only (highlighter band, sticker, CTA pill), always with ink text on it. `{colors.marker}` is an optional second voice for a stamp or one correction stroke. `{colors.muted}` is labels and greeked text. Tints come from paper, not from colour: never gradients, never a third hue.

## Typography

- **`display`** — torn headline strips and ticket titles: heavy grotesque, tight tracking, sentence case, 1–2 lines per strip, 88–110px.
- **`serif`** — the second voice: the turn of a sentence ("Nobody changed how they work."), a FIG. caption line, the closing line. 80–110px, light/regular. With a Brand kit in this file, the serif is the Brand kit's accent face.
- **`body`** / **`tag`** — tags, tickets' details, notes: 30–40px.
- **`label`** — FIG. captions, kickers, small meta: uppercase, 0.16em, `{colors.muted}`.
- **`chip`** — ransom headlines: words on separate chips mixing display / serif / ink-chip / accent-chip; max one ransom line per video.
- **`stamp`** — uppercase 1–3 words.
- Legibility floor: 28px for anything that must be read.

## Depth & Surface

- Soft drop shadows on every cut-out (kit default), longer while lifted. No other elevation.
- Paper tone + grain on the ground; grain over everything; white rims on torn coloured paper.
- **Ceiling:** no glows, no gradients, no glass, no 3D, no blur.

## Shapes

- Torn edges on strips, clippings and bands; knife-cut rectangles for tickets, tags and stickers (small radius allowed on tags and pills).
- Resting tilts −12°…+12° (big pieces −3…+3°). Nothing is perfectly level except type on its paper.

## Components

- **board** — ground + tone (+ grid) + grain; the camera rig (`cg-camera` / `cg-board` / `cg-layer`).
- **torn-strip**, **cut-out**, **clipping**, **figure-plate**, **ink-band** — the pieces.
- **highlighter**, **marker**, **sticker**, **stamp**, **tape** — the hand.

## Frame Treatments

> Recipe: board · pieces · focal · annotation · silence · motion (the collage-* blueprint).

### 1 · Poster build (opener · `collage-poster-build`)
Scraps carrying the evidence pile up at the edges; a two-strip headline lands on top in the upper-middle; one highlighter swipe; tape. **Silence** ~30%.

### 2 · Figure plate (concept · `collage-figure-plate`)
A paper plate with an ink-and-halftone drawing of the metaphor, labelled by tags + arrows; FIG. caption below. **Silence** ~35%.

### 3 · Clipping (argument · `collage-clipping-highlight`)
A torn clipping with one statement and greeked body; strike the wrong phrase, loop/highlight the right one, arrow to a counter-note. **Silence** ~35%.

### 4 · Board pan (enumeration · `collage-board-pan`)
Tickets/cards on a board larger than the frame, visited by the camera, then a pull-back. **Silence** low (the board is busy by design).

### 5 · Checklist (outcome · `collage-checklist`)
A torn notepad sheet; lines land, ticks draw, one line highlighted. **Silence** ~30%.

### 6 · Stamp title card (close · `collage-stamp-title-card`)
Tear-away cover → ink band with the closing line → accent CTA sticker → logo cut-out + URL strip → stamp. **Silence** ~35%.

## Composition Rules

### Do

- Lay out every frame as a board: back layer (scraps, tags), mid (the hero piece), front (stickers, tape, marker).
- Land pieces in reading order, on the beat they are read; annotate after the read.
- Keep one hero per frame and one accent swipe per frame.
- Vary framings: centred strip stack, plate + margin labels, clipping + note, wide board, list sheet, band.
- Hard cuts between frames; open a frame with a tear-away at most twice per video.

### Don't

- Don't fade paper in or out; don't float pieces; don't animate pieces smoothly (that is the camera's job).
- Don't use the accent as a background or as text colour on paper.
- Don't invent readable newspaper copy, quotes, mastheads, logos, people or numbers; use greeked lines and placeholders.
- Don't stack more than ~8 pieces in a frame or more than 3 tapes.
- Don't use CSS clip-path / blur on pieces (capture hazard) — the kit already draws torn paper as SVG.

## Aspect-Ratio Behavior

| Treatment | 4:5 (1080×1350) | 9:16 (1080×1920) | 1:1 | 16:9 (1920×1080) |
|---|---|---|---|---|
| Poster build | strips stacked upper-middle | strips stacked, scraps above/below | strips centred, fewer scraps | strips left 60%, scraps right |
| Figure plate | plate upper 60%, caption below | plate upper half, labels below | plate centred, labels around | plate left, labels + caption right |
| Clipping | clipping upper 60%, note below-right | clipping + note stacked | clipping centred, note overlapping | clipping left, note right |
| Board pan | 2×2 or zig-zag stations | vertical stations | 2×2 | horizontal stations |
| Checklist | sheet centred | sheet taller, bigger lines | sheet centred | sheet left, highlight right |
| Stamp card | band upper half, CTA/logo below | band centred, CTA below | band centred | band left 60%, CTA/logo right |

## Approved Entities

No real customers, logos or vendors are defined by this preset. Only the brand's own logo files (from the Brand kit) and assets the brief supplies may appear.

## Numerals & Claims (hard rule)

Never invent figures, prices, dates, quotes or outcomes. Every number on a ticket or tag traces to the brief or product facts; otherwise render a visible placeholder (`[price]`). FIG. numbers are decorative and sequential.

## Pre-Render Self-Audit

- **Paper** — torn edges, tilts, shadows, grain present on every frame; nothing looks like a UI card.
- **Accent** — one highlighter swipe per frame max; accent never as text colour on paper.
- **Hand** — annotations draw after the read; tape/stamp counts within limits.
- **Motion** — pieces on twos, camera smooth, boil on held pieces, render at 24 fps.
- **Fabrication** — every readable word and number traces to the brief; clippings' body text is greeked.
- **Caption band** — bottom 17% clear.

## Known Gaps

- Real photographs need rights; the default is drawings (halftone figure plates).
- The kit's torn edges are generated (seeded) — vary `data-cg-seed` per piece or edges repeat.
- 16:9 values are guidance: re-check type sizes against the 28px floor scaled to 1920 wide.
