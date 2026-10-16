---
name: editorial-cutout
description: Subjects as printed cut-outs on flat colour — black-and-white halftone (or brand dot-screen) pictures over colour fields, giant type behind the subject, the text-filled silhouette, repeated figures, and how they enter.
metadata:
  tags: editorial, cut-out, halftone, duotone, colour-field, type-behind, silhouette, pattern, entrance
---

# Editorial cut-out

The core image of the style: **one subject, printed in black and white, cut out and laid on a flat field of colour**, with type and line-art around it. Built on `editorial-kit` (cite both).

## Subject on a field

```html
<div class="ed-layer" id="c-back" data-ed-depth="0.25">
  <div class="ed-field ed-in" id="c-field" data-ed-shape="arch" data-ed-size="640x860" style="left:220px; top:200px"></div>
  <div class="ed-pos ed-giant ed-in" id="c-year" style="left:40px; top:140px; font-size:320px">2024</div>
</div>
<div class="ed-layer" id="c-mid" data-ed-depth="0.6">
  <div class="ed-cutout ed-edge ed-in" id="c-subject" style="left:230px; top:330px; width:620px; height:620px">
    <img class="clip" id="c-subject-img" data-start="0" data-duration="6" data-track-index="3" src="assets/images/clerk.png" width="620" height="620"
         data-color-grading='{"adjust":{"saturation":-1,"contrast":0.3},"effects":{"halftone":0.94,"halftoneSize":0.3}}'>
  </div>
</div>
```

```js
E.grow(tl, $("c-field"), 0.0, { from: "bottom", duration: 0.8 });     // the field wipes up
E.rise(tl, $("c-year"), 0.25, { distance: 90 });                        // the giant type behind
E.rise(tl, $("c-subject"), 0.5, { distance: 120, duration: 1.0 });     // the subject rises into place
```

- **Colour is the field, never the subject.** The subject is B&W halftone (or the brand dot-screen); the field carries the brand colour. One field colour per frame; a second hue only as a small accent.
- **Type behind the subject** (the year, the number, the one word): `ed-giant` in the back layer, partly covered by the subject — the overlap is the point. The word must still read (cover ≤ 35% of it) and reach 3:1 against its ground: on a light field (a yellow, a lime) it is ink; set `--ed-giant` when the field colour doesn't read.
- **Fields have shapes**: `arch` (a portrait niche), `circle` (a sun, a spotlight disc), `blob` (an organic silhouette), `slant` (a dynamic band), `round` (a card). A full-bleed ground counts as a field too.
- The **white rim** (`ed-edge`) makes it read as a printed cut-out; use it on every subject in a video, or on none.

## Text-filled silhouette

```html
<div class="ed-field ed-in" id="c-page" data-ed-shape="blob 4" data-ed-size="620x940"
     data-ed-textfill="the banality of evil" data-ed-angle="-10" style="left:440px; top:-40px"></div>
```

A page of words cut to a shape — the idea "written all over" the scene. The words are the brief's key term or claim, repeated; never invented quotes. Behind the subject, grown in from the top (`E.grow … from:"top"`).

## Repeated figures (the crowd)

The same cut-out, many times, in rows — "everyone", "scale", "conformity", "the system":

```html
<div class="ed-layer" id="c-row1" data-ed-depth="0.3"> <!-- back row: smaller, darker treatment --> … 6 × .ed-cutout … </div>
<div class="ed-layer" id="c-row2" data-ed-depth="0.7"> <!-- front row: bigger, B&W halftone --> … 4 × .ed-cutout … </div>
```

```js
E.rise(tl, R.querySelectorAll("#c-row1 .ed-cutout"), 0.2, { distance: 40, stagger: 0.07 });
E.rise(tl, R.querySelectorAll("#c-row2 .ed-cutout"), 0.6, { distance: 70, stagger: 0.09 });
```

- Rows at two or three depths (parallax does the rest); back rows smaller and a darker treatment (two-ink in ink + field), front rows the B&W halftone.
- One generated figure is enough: reuse its file (give each copy its own `data-start` 0, 0.01, 0.02 … to keep lint quiet).
- The odd one out (one figure in colour, or turned the other way) is the argument — land it last.

## Entrances

| piece | move |
|---|---|
| the field | `E.grow` from the edge it "comes from" (0.7–0.9 s, expo.inOut) — or present from t=0 |
| the subject | `E.rise`, 90–140 px, 0.9–1.1 s, `expo.out` — big things move slowly |
| giant type | `E.rise` 60–100 px, before the subject |
| small cut-outs (props, icons) | `E.pop` or `E.rise` 30–50 px, staggered 0.06–0.1 s |

Reveal in reading order, on the beat each piece is named. The subject should be in place by ~40% of the frame; the rest of the frame is for the point (type, callout, highlight) and the held read.

## Critical constraints

- The treated `<img>` is a clip inside the `ed-cutout` wrapper (see `editorial-kit`); the wrapper moves, never the `<img>`.
- Never stretch or recolour a picture in CSS; the treatment does the colour. Never draw people or logos yourself.
- One subject per frame; 3–7 pieces in all; 25–40% empty field.
