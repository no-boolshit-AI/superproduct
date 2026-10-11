---
name: collage-paper-tear
description: Torn paper — strips and sheets with torn edges and a white rim, and the tear-away reveal where a covering sheet rips in two and both halves fly off.
metadata:
  tags: collage, paper, torn, tear, rim, reveal, transition, strip, sheet, svg
---

# Paper tear

Torn edges are what make a piece read as paper. The kit draws them as an SVG shape behind the content (no CSS `clip-path`), from authored sizes. Built on `collage-kit` (cite both).

## Torn strips and sheets

```html
<!-- a headline strip torn top and bottom, knife-cut at the ends -->
<div class="cg-paper strip" data-cg-sheet="900x250" data-cg-edges="tb" data-cg-seed="3"
     style="width:900px; height:250px; rotate:-2deg"> … </div>

<!-- an ink band: torn all round, with the white core of the paper showing at the tear -->
<div class="cg-paper cg-on-ink band" data-cg-sheet="940x560" data-cg-edges="trbl" data-cg-amp="7"
     data-cg-fill="var(--cg-ink)" data-cg-rim="#FFFFFF" data-cg-seed="5" style="width:940px; height:560px"> … </div>

<!-- a lime sticker torn on one side -->
<div class="cg-paper" data-cg-sheet="300x120" data-cg-edges="r" data-cg-fill="var(--cg-accent)" style="width:300px; height:120px"> … </div>
```

- Headline strips: torn `tb`, amp 5–7. Clippings and notes: `trbl`, amp 4–6. Big bands: amp 7–9 with a `rim`.
- A different `data-cg-seed` per sheet, or two sheets tear identically.
- A coloured sheet (ink, accent, kraft) always gets `data-cg-rim="#FFFFFF"`: real coloured paper is white inside.
- W×H in `data-cg-sheet` must equal the CSS `width`/`height` of the same element.

## Tear-away reveal (a frame opener)

A full-frame cover sheet rips along a ragged seam and both halves fly off on twos, revealing the board underneath. Use it as a frame's opening (a chapter turn, the CTA), at most twice per video.

```html
<!-- after the board, before the grain -->
<div class="cg-cut cg-shown" id="x-cov-l" style="position:absolute; left:0; top:0">
  <div class="cg-paper cg-on-ink" id="x-cov-l-p" style="width:1080px; height:1350px"></div></div>
<div class="cg-cut cg-shown" id="x-cov-r" style="position:absolute; left:0; top:0">
  <div class="cg-paper cg-on-ink" id="x-cov-r-p" style="width:1080px; height:1350px"></div></div>
```

```js
const halves = C.seam(1080, 1350, 560, { seed: 4, amp: 16 });           // the seam near the middle
C.sheet($("x-cov-l-p"), 1080, 1350, { d: halves[0], fill: "var(--cg-ink)" });
C.sheet($("x-cov-r-p"), 1080, 1350, { d: halves[1], fill: "var(--cg-ink)" });
C.tearAway(tl, $("x-cov-l"), $("x-cov-r"), 0.3, { duration: 0.5, distance: 900 });
```

- The cover is a different paper from the board (ink over paper, paper over ink, the accent over paper) — tearing paper off the same paper reveals nothing.
- Start the tear 0.2–0.4 s into the frame so the cover registers; the first board piece slaps in as the halves clear (~tear + 0.35 s).
- The previous frame cuts (`transition_in: cut`) straight onto the closed cover.

## Critical constraints

- No CSS `clip-path` on paper (capture hazard): only the kit's SVG sheets.
- Sheets are drawn by `C.build(R)` / `C.sheet()` before the timeline is built; never redraw them in a tween callback.
