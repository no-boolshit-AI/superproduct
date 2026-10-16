# Storyboard guide — editorial

How to write `STORYBOARD.md` (Steps 3–4 of faceless-explainer) for the editorial style. Everything in `faceless-explainer/references/visual-design.md` and `hyperframes:clear-explainer` still applies; this adds the editorial specifics.

## Video direction (write once, at the top)

```markdown
## Video direction

- **Look**: editorial · [colour-field | paper-data | documentary | duotone] — [one line: why it fits the brand].
  Palette by role from frame.md: ground = [paper / ink / field per frame], pictures = B&W halftone cut-outs
  [or the dot screen in the field's tints], the field colour = [what it carries: fields / giant type / line-art],
  highlighter = [field-tint on paper; an ink band on the field].
- **Teaching spine**: the question "[…]", the answer "[message]", main points ① […] ② […] ③ […];
  the recurring picture: [the one metaphor that grows across frames].
- **Camera**: every frame pushes 3–6% with three depth layers (back = field + giant type, mid = subject,
  front = tags, lines, highlight); reframes in frames [n]; zoom-through out of frame [k] (≤ 2 per video).
- **Guide**: one focal point per frame; spotlight / ring / connector / highlight after the read.
- **Rhythm**: [which frames build, which hold — e.g. frame 3 is the held breather before the turn; the recap
  and CTA hold ≥ 1.5 s].
- **Seams**: hard cuts; a field wipe opens frames [n, m] (colour changes); [match cut 4→5 on the ring].
- **Negative list**: no coloured subjects, no stock people, no blur/glow/3D, no bounce on big pieces, no invented
  numbers/names/sources, no second hue. Both failure modes: slideshow (everything lands at t=0, then frozen)
  and screensaver (things floating with nothing to read).
```

## A frame block

```markdown
## Frame 2 — The everyday picture

- scene: a baker at a counter, printed in halftone on a red arch; the dough bowl beside her; "It's alive." lands
- voiceover: ""
- duration: 5.5s
- transition_in: cut
- type: product_intro
- persuasion: Analogy (a pet you feed) + concretization
- beat: recognition
- blueprint: editorial-subject-field (Adapt)
- focal: the baker cut-out
- roles: arch field = background (brand colour) · baker = foreground subject · bowl = supporting · line = supporting
- pictures: baker.png (cutout, B&W halftone, 620×620) · bowl.png (cutout, B&W halftone, 300×300)
- rules: editorial-kit, editorial-cutout, editorial-camera, editorial-callouts

narrativeRole: Turns "wild yeast" into something every viewer knows: a living thing you feed.
keyMessage: Sourdough is alive — it needs time to eat and grow.

Adapt: keep the B&W-subject-on-a-field signature; the text fill becomes the giant word "ALIVE" behind her.
Scene 1 (0.0–0.8s): the red arch field wipes up from the bottom, centre; slow push starts (3 layers).
Scene 2 (0.4–1.5s): the giant word "ALIVE" rises behind the arch (back layer); the baker rises into the arch
  (mid layer), white rim; the bowl pops beside her hand.
Scene 3 (1.8–3.0s): "It's alive." rises below (display face); the highlighter sweeps behind "alive".
Scene 4 (3.0–5.5s): held read; the push and the grain only.
```

- `rules:` **always** starts with `editorial-kit`; then the rules the scenes use.
- Name the kit moves in the Scene lines with the rules' words: *wipes in*, *rises*, *pops*, *draws*, *the spotlight closes on*, *a ring draws around*, *the connector routes to*, *counts up to*, *the highlighter sweeps behind*, *the camera reframes on*, *zooms through into*. Never px / eases / ms (the rules carry them).
- List each picture with file name, kind, **treatment** and size in the frame that uses it.
- Give every frame a `focal` and keep the piece count honest (3–7).

## Silent videos (no narration)

The words on screen carry the lesson, so timing is reading time:

- A line of N words needs ≈ 0.3 s × N on screen after it lands (minimum 1.2 s) before the next thing competes with it; a callout counts as a new thing.
- One idea per frame; 4–7 s per frame; a 45 s video is 7–9 frames.
- ≤ 12 words on screen at once; one highlighted word.
- The last frame holds ≥ 1.5 s after its final move.

## A 45-second concept lesson (example arc)

| # | beat (clear-explainer) | blueprint | seconds |
|---|---|---|---|
| 1 | the question | editorial-subject-field / editorial-type-behind | 5 |
| 2 | the everyday picture (analogy) | editorial-metaphor-scene | 5.5 |
| 3 | name it (term + plain definition) | editorial-subject-field | 5 |
| 4 | how it works ① | editorial-spotlight-link / editorial-hub | 6 |
| 5 | how it works ② (same stage, one more part) | editorial-metaphor-scene | 6 |
| 6 | why it matters (a number, compared) | editorial-compare | 5.5 |
| 7 | recap: ① ② ③ | editorial-recap | 6 |
| 8 | call to action | editorial-closing-card | 4.5 |
