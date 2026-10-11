---
name: collage-camera
description: The camera over a paper board — a slow smooth push-in with layer parallax for single-station frames, and smooth moves between stations on a board bigger than the frame.
metadata:
  tags: collage, camera, push, parallax, pan, stations, board, depth
---

# Collage camera

A collage is shot like a rostrum camera over a table: the board is flat, the camera moves smoothly, and the pieces sit at slightly different heights (parallax). Built on `collage-kit` (cite both).

## Drift (one station)

```js
C.drift(tl, { duration: 6, board: $("x-board"), push: 0.035, pan: [0, -14],
  layers: [[$("x-back"), 0.5], [$("x-front"), 1]] });
```

- `push` 0.03–0.05 over the frame (scale 1 → 1.035): felt, not seen. `pan` is the parallax travel of a depth-1 layer in px; back layers move less.
- Two or three `.cg-layer`s: back (texture scraps, tags), mid (the clipping, the plate), front (stickers, tape, marker strokes). Pieces in the same layer move together.
- Linear push (`ease: none`) and `sine.inOut` parallax, both smooth — never on twos.

## Stations (a board bigger than the frame)

```html
<div class="cg-camera" id="x-cam">
  <div class="cg-board" id="x-board">
    <!-- station A at left 0…1080, station B at 1080…2160, station C below at top 1350… -->
  </div>
</div>
```

```js
C.camera(tl, $("x-cam"), [
  { x: 0, y: 0 },                                        // opening framing: station A
  { at: 2.6, duration: 0.9, x: -1080 },                  // to station B (to the right)
  { at: 5.0, duration: 1.1, x: -540, y: -200, scale: 0.62 },  // pull back over the whole board
]);
```

- Each station's pieces land as the camera **arrives** (slap at `at + duration − 0.15`), not before — the viewer should see them arrive.
- 0.8–1.1 s per move, `power2.inOut`; hold each station ≥ 1.2 s for reading (silent videos: ≥ 2 words per 0.6 s on screen).
- A final pull-back (scale 0.55–0.7) over everything the frame laid out is a strong close for an enumeration frame.
- Extend `.cg-grid` past the frame when the camera travels (`style="right:-1176px"` for one station to the right), and keep the ground (`cg-ground`, `cg-tone`) outside the camera so it never runs out.

## Critical constraints

- `C.camera` owns `.cg-camera`; `C.drift` owns `.cg-board` (scale) and `.cg-layer` (x/y). Don't use `drift`'s `board` push together with a `camera` scale move on the same frame unless you accept the product of both (fine when push is small).
- No `getBoundingClientRect` to aim the camera: station positions are the px you laid them out at.
- Camera moves are smooth (never `C.twos`).
