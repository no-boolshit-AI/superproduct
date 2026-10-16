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

## 10. Editorial — the cinematic magazine explainer

**Mood:** Clear, cinematic, journalistic | **Best for:** explainers for newcomers, concept lessons, history and people, evidence and numbers, "how it really works" stories. Ships as the `editorial` frame preset + the `editorial` skill (kit, rules `editorial-*`, blueprints `editorial-*`); explainer-agent's default style.

```yaml
name: Editorial
colors:
  paper: "#F2EFE8"
  ink: "#1B1B18"
  field: "#E1381C"
  field-deep: "#8F2414"
  field-tint: "#F6D9D1"
  stone: "#8E8A84"
typography:
  display:
    fontFamily: Archivo Black
    fontSize: 104px
    fontWeight: 400
  serif:
    fontFamily: EB Garamond
    fontSize: 64px
    fontWeight: 400
  body:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 500
  label:
    fontFamily: IBM Plex Mono
    fontSize: 24px
    fontWeight: 500
motion:
  energy: moderate
  easing:
    entry: "expo.out (rise), expo.inOut (field wipes)"
    camera: "sine.inOut push with parallax; power3.inOut reframes"
  duration:
    entrance: 0.9
    hold: 1.5
    transition: 0
  atmosphere:
    - film-grain
    - vignette
    - parallax-layers
  transition: cut
```

One clear picture per idea: a subject printed in black and white (halftone, dot screen, B&W photo — HyperFrames media treatments) laid on a flat field of the brand's colour, giant type behind it, thin line-art that guides the eye (rings, orbits, connector lines with dots, "/ Name" tags, a spotlight that dims all but the subject), a highlighter on the one word. The camera pushes slowly on every frame and three depth layers drift apart; grain and a vignette over everything. Looks per brand: colour-field, paper-data, documentary, duotone. Avoid: coloured subjects, stock people, blur, glows, bouncing, a second hue.

| If the content feels... | Use... |
| --- | --- |
| A lesson for newcomers, cinematic, journalistic, "here's how it really works" | Editorial |
