---
name: collage-halftone-figure
description: Invented editorial illustrations for a collage — SVG drawings with ink outlines and halftone-dot shading on a paper plate with a FIG. caption, and the halftone/duotone treatment for a real photo when one is supplied.
metadata:
  tags: collage, halftone, illustration, svg, figure, plate, duotone, photo, editorial, print
---

# Halftone figure

When there is no photography (faceless explainers, rights not cleared), the collage's pictures are **drawn**: simple objects in ink outline with halftone-dot shading, printed on a paper plate with a figure caption — the look of an old textbook or newspaper engraving. Built on `collage-kit` (cite both).

## The plate

```html
<div class="cg-boil" style="left:150px; top:260px"><div class="cg-cut" id="x-plate">
  <div class="cg-paper plate" data-cg-sheet="780x640" data-cg-edges="trbl" data-cg-seed="31" style="width:780px; height:640px; rotate:-1.5deg">
    <svg width="780" height="560" viewBox="0 0 780 560">
      <defs>
        <pattern id="x-dots" patternUnits="userSpaceOnUse" width="11" height="11" patternTransform="rotate(45)">
          <circle cx="5.5" cy="5.5" r="2.4" fill="#1B1B18"/></pattern>
        <pattern id="x-dots-light" patternUnits="userSpaceOnUse" width="11" height="11" patternTransform="rotate(45)">
          <circle cx="5.5" cy="5.5" r="1.3" fill="#1B1B18"/></pattern>
      </defs>
      <path id="x-gear" d="…" fill="url(#x-dots)" stroke="#1B1B18" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="390" cy="280" r="40" fill="#FFFFFF" stroke="#1B1B18" stroke-width="5"/>
    </svg>
    <div class="cg-fig">Fig. 01 — the machine changed.</div>
  </div></div></div>
```

- Shapes: ink outline 4–6 px, round joins; shading = a dot pattern fill (`r` 2.4 dark, 1.3 light) — two tones of dots read as volume. White fills for highlights. At most one accent-coloured element in the drawing.
- Build geometry in JS at build time when it repeats (gear teeth, ticks, a grid of slips): a pure function writing `d` once, before the timeline. Ids in `<pattern>` are document-wide: prefix them with the frame letter.
- Keep drawings iconic and few-part (gear, clock, document, inbox tray, cog + arrows, a hand-drawn chart). They illustrate a metaphor from the script; they are not logos and not people.
- The caption (`cg-fig`) is `FIG. NN — <a line from the brief>`; never a made-up source or citation.
- Animate the plate as one piece (slap), then individual parts on twos: a gear turning in 15° steps (`C.twos("none")` on rotation), slips of paper sliding out, an arrow drawing on.

## A real photo (only when supplied and cleared)

```html
<div class="cg-paper photo" style="padding:14px; rotate:3deg">        <!-- white print border -->
  <div class="duo" style="width:520px; height:380px; background:var(--cg-accent)">
    <img src="public/team.jpg" style="width:100%; height:100%; object-fit:cover; filter:grayscale(1) contrast(1.15); mix-blend-mode:multiply"></div>
</div>
```

- Print look, the deterministic way: `hyperframes media-treatment --capability print` lists the halftone / limited-ink / dither treatments; apply one to the `<img>` with `--selector` (see `media-use`).
- Or by CSS: duotone = grayscale photo multiplied over a flat colour (above); a `halftone.svg` dot layer (`background: url(assets/collage/halftone.svg) 0 0 / 8px 8px; mix-blend-mode: multiply; opacity: .35`) adds print.
- Cut-out people/objects: `hyperframes remove-background` first, then place the PNG in a `.cg-cut` (the kit's shadow follows the alpha).
- Never use images whose rights are not confirmed (product folders flag them, e.g. `rightsToConfirm`), stock photos of "people at laptops", or logos you were not given.

## Critical constraints

- No `filter: blur()` and no `clip-path` on the plate or photo (capture hazard); crop with `overflow: hidden` on a wrapper.
- Pattern ids unique per frame; the drawing's geometry is authored or computed at build time, never measured.
