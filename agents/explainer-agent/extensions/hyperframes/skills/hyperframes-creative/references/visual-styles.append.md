## 9. Paper Collage — the Vox explainer collage

**Mood:** Curious, editorial, hand-made | **Best for:** explainers, launches with an argument, journalism-style breakdowns, "here's what's really going on" stories. Ships as the `vox-collage` frame preset + the `vox-collage` skill (kit, rules `collage-*`, blueprints `collage-*`).

```yaml
name: Paper Collage
colors:
  paper: "#F2EFE8"
  ink: "#1B1B18"
  card: "#FFFFFF"
  accent: "#FFE135"
  marker: "#D9432B"
typography:
  headline:
    fontFamily: Archivo Black
    fontSize: 104px
    fontWeight: 400
  serif:
    fontFamily: Playfair Display
    fontSize: 100px
    fontWeight: 400
  body:
    fontFamily: Inter
    fontSize: 34px
    fontWeight: 500
rounded:
  none: 0px
  tag: 10px
motion:
  energy: moderate
  easing:
    entry: "back.out(1.5) sampled on twos"
    exit: "power2.in on twos"
    ambient: "boil — hash of quantized time, ±1px"
  duration:
    entrance: 0.42
    hold: 1.5
    transition: 0
  atmosphere:
    - paper-tone
    - grid-paper
    - film-grain
    - drop-shadows
  transition: cut
  fps: 24
```

A paper board seen from above. Torn magazine strips, tags, tickets and clippings are slapped on by hand — they move on twos (12 poses a second) and boil while held — then annotated: one highlighter swipe, marker loops and arrows, a strike-through, tape, a rubber stamp. Pictures are ink-and-halftone drawings on paper plates (or cleared photos as halftone cut-outs). The camera glides smoothly over the board. Hard cuts between frames, a tear-away at most twice. Avoid: fades, floating, glossy UI cards, a second accent hue, invented newspaper copy.

| If the content feels... | Use... |
| --- | --- |
| Explanatory, editorial, investigative, "let me show you" | Paper Collage |
