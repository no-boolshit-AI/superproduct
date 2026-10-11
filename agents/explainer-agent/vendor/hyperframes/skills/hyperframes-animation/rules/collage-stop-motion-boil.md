---
name: collage-stop-motion-boil
description: The stop-motion cadence of a collage — pieces move on twos (12 poses a second at 24 fps) while the camera stays smooth, and held pieces boil with a deterministic hash of quantized time.
metadata:
  tags: collage, stop-motion, twos, boil, jitter, cadence, hand-made, deterministic, 24fps
---

# Stop-motion and boil

Paper animated by hand changes pose 12 times a second ("on twos" at 24 fps), and pieces that are "held" are never perfectly still: each re-placement nudges them a pixel. Those two things are most of what makes a collage feel made rather than generated. Built on `collage-kit` (cite both).

## On twos

Every kit move on a piece (slap, slide, lift, tape, stamp, highlight, draw, ransom, tear-away) samples its ease on the 12 fps grid. For your own piece tweens, do the same:

```js
tl.fromTo($("x-arm"), { rotation: -20 }, { rotation: 0, duration: 0.5, ease: C.twos("power3.out", 0.5), immediateRender: false }, 1.2);
```

Keep **camera** moves (`C.drift`, `C.camera`, a scene `push-slide`) smooth: a stepped camera judders, a stepped piece charms. Render at **24 fps** (`hyperframes render --fps 24`) so each pose lasts exactly two frames; at 30 fps the poses alternate 2-3 frames.

## Boil

```js
C.boil(tl, R.querySelectorAll(".cg-boil"), FRAME_DURATION, { amp: 1, rotate: 0.4 });
```

- One call per frame, over every `.cg-boil` wrapper, for the whole frame duration (call it after the entrances; it owns only the wrappers).
- Pose = `hash(floor(t × 12), i)` → x, y in ±amp px, rotation in ±rotate°. A pure function of time: identical on every seek, every render worker.
- `amp` 0.8–1.2 px and `rotate` 0.3–0.5° for paper; 1.5–2 px for drawn line work that should "crawl"; `hold: 2` halves the rate (6 poses/s) for a calmer hold.
- Big boards: exclude the largest sheet (put it in a plain `div` instead of `.cg-boil`) if its edge wobble is visible against the frame edge.

## Critical constraints

- The boil wrappers are moved by `C.boil` only. Positions go in their inline `left/top`; entrances go on the `.cg-cut` inside.
- No `Math.random`, no `Date.now` (the kit uses a seeded generator and a time hash).
- A held read is still a held read: boil is texture, not motion — no extra drifting, floating or breathing on pieces.
