---
name: editorial-camera
description: The cinematic camera for editorial frames — a slow push with 2.5D parallax between depth layers, reframing on a detail, travelling between stations, and the zoom-through that hands one frame to the next.
metadata:
  tags: editorial, camera, push, parallax, depth, 2.5d, reframe, zoom-through, cinematic
---

# Editorial camera

What makes a flat frame feel shot rather than laid out: **depth layers that move at different speeds** under a camera that is always, slightly, moving. Built on `editorial-kit` (cite both).

## The push (every frame)

```js
E.push(tl, R, { duration: 6, push: 0.05, pan: [0, -26] });
```

```html
<div class="ed-camera" id="c-cam">
  <div class="ed-layer" id="c-back" data-ed-depth="0.25"> colour field, giant type, grid, far line-art </div>
  <div class="ed-layer" id="c-mid" data-ed-depth="0.6"> the subject cut-out </div>
  <div class="ed-layer" id="c-front" data-ed-depth="1"> labels, dots, connectors, the highlight </div>
</div>
```

- `push` 0.03–0.06 over the frame: felt, not seen. `pan` is the drift of a depth-1 layer in px; give each layer its depth (back 0.15–0.3, mid 0.5–0.7, front 1). Opposite signs between back and front (`data-ed-depth="-0.2"` on the back) exaggerate depth for a hero shot — once per video.
- The ground (`ed-ground`) and the film finish stay OUTSIDE the camera, so the frame never shows an edge. Make back-layer fields and grids bigger than the frame (`inset:-120px` on `ed-grid`) when they drift.
- The push runs under everything, the whole frame; it is what keeps a held read alive. Nothing else floats.

## Reframe on a detail

```js
E.camera(tl, $("c-cam"), [
  { x: 0, y: 0, scale: 1 },
  { at: 2.8, duration: 1.1, x: -160, y: 120, scale: 1.35 },   // push in on the detail being named
]);
```

Don't put `E.push` and `E.camera` on the same element: nest the rig — `<div class="ed-camera" id="c-rig"><div class="ed-camera" id="c-cam"> …layers… </div></div>` — then `E.camera(tl, $("c-rig"), …)` reframes and `E.push(tl, R, { duration, camera: $("c-cam") })` pushes the inner one with its layers.

- Reframe when the voiceover (or the read, on a silent video) moves to a detail: the eye should arrive where the explanation is. 0.9–1.3 s, `power3.inOut`.
- **Stations**: lay a wide board (pieces beyond the frame edge) and travel between stations as each item is named; end with a pull-back over the whole set (scale 0.6–0.75). Each station's pieces enter as the camera arrives.

## Zoom-through (a seam inside the frame)

The last move of a frame rushes into a point — a dot, a window, the colour field — and the next frame opens on that colour:

```js
E.camera(tl, $("c-cam"), [{ x: 0, y: 0, scale: 1 }, { at: 5.3, duration: 0.7, x: -120, y: 60, scale: 7, ease: "power3.in" }]);
```

- Aim at something whose colour fills the frame at the end (the field, a circle, the subject's dark coat); the next frame's ground is that colour and its first move starts within 0.2 s.
- At most two per video; the transition into the next frame is then `cut` (the move already is the seam).

## Critical constraints

- Camera moves are smooth (`sine.inOut` for the push, `power3.inOut` for reframes); never a bounce, never a shake.
- No blur for depth (capture hazard): depth is parallax, scale, overlap and shadow.
- Coordinates are the px you laid the pieces out at; never measure with `getBoundingClientRect`.
