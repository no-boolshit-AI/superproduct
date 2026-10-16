---
name: editorial-transitions
description: Seams that feel edited, not slid — colour-field wipes that open a frame, the iris, match cuts on shape and colour, the zoom-through, and how they pair with the registry transitions between frames.
metadata:
  tags: editorial, transition, wipe, iris, match-cut, zoom-through, seam, opener, cinematic
---

# Editorial transitions

Most seams in an editorial video are **hard cuts** — the next frame opens with its own move within 0.2 s. A few seams are designed: a colour field wipes across, an iris opens, a shape becomes the next frame. Built on `editorial-kit` (cite both).

## The opener: field wipe

The frame's ground starts as the previous frame's colour; the new field wipes across it:

```html
<div class="clip ed-ground" id="c-ground" … style="--ed-ground: <previous frame's ground>"></div>
<div class="ed-field ed-in" id="c-wipe" style="left:0; top:0; width:1080px; height:1350px; background:<this frame's ground>"></div>
```
```js
E.grow(tl, $("c-wipe"), 0, { from: "left", duration: 0.6, ease: "expo.inOut" });
```

- Direction follows the story (forward = from the right, back in time = from the left, rising stakes = from the bottom); keep one direction rule for the video.
- Use it when the colour changes between frames (a new chapter, the turn). Between frames of the same colour, cut.

## Iris

A circle field grows from the subject until it fills the frame (a new idea born from this one), or a circle of the next ground closes onto a point:

```js
E.grow(tl, $("c-disc"), 0.1, { from: "center", duration: 0.9, ease: "expo.inOut" });
```

The disc is an `ed-field` with `data-ed-shape="circle"` sized past the frame's diagonal (e.g. 1800×1800 centred on the subject).

## Match cut

End frame N on a shape, open frame N+1 on the same shape in the same place: the ring around a head becomes the orbit around a planet; the coin becomes the dot of a chart. Plan it in the storyboard (both frames name the shape and its position); the transition between them is `cut`.

## Zoom-through

See `editorial-camera`: the camera rushes into a point whose colour becomes the next frame's ground. `cut` after it.

## Between frames (STORYBOARD `transition_in`)

| seam | when |
|---|---|
| `cut` | the default (80%+ of seams): the next frame's own opener does the work |
| `push-slide LEFT/RIGHT` | an ordered sequence (step 1 → 2 → 3) on the same stage |
| `zoom-through` | (registry) a dive into detail when the frame itself doesn't end on a zoom |
| `crossfade` | only for a time jump or a dream-like recall; at most once |

## Critical constraints

- No blur-crossfades or glows (capture hazard and off-style). Wipes are scale transforms of flat shapes.
- At most two designed seams (iris, zoom-through, match cut) per minute; everything else cuts.
- A wipe covers the whole frame for ≤ 0.1 s; the first piece of the new frame enters right after.
