# Storyboard guide — vox-collage

How to write `STORYBOARD.md` (Steps 3–4 of faceless-explainer) for the collage style. Everything in `faceless-explainer/references/visual-design.md` still applies; this adds the collage specifics.

## Video direction (write once, at the top)

```markdown
## Video direction

- **Look**: vox-collage. A paper board seen from above in every frame: paper ground + tone, grain over
  everything, cut paper with soft shadows. Palette by role from frame.md: board = paper, pieces = card /
  newsprint, type + marker + the one contrast band = ink, the accent ONLY as a highlighter fill (one swipe
  per frame) and the CTA sticker.
- **Motion grammar**: pieces move on twos (slap, slide, tape, stamp, highlight, marker draw); held pieces
  boil; the camera is smooth (slow push + parallax; station pans in frame N). Reveals in reading order on
  the beat they are read; annotation after the read. Render 24 fps.
- **Rhythm**: [which frames are busy, which are held reads — e.g. frame 2 is the held breather before
  the turn; the CTA holds ≥ 1.5 s].
- **Openers**: hard cuts between frames; frame [k] and the CTA open with a tear-away.
- **Negative list**: no fades on paper, no floating, no smooth piece tweens, no gradients/glows/blur/3D,
  no stock people, no images with unconfirmed rights, no invented copy (clippings use greeked lines),
  no invented numbers. Both failure modes: slideshow (everything lands at t=0, then frozen) and
  scrapbook (pieces everywhere, nothing to read).
```

## A frame block

```markdown
## Frame 1 — Hook
- scene: AI tool tags pile up; the headline lands on top; "changed" gets the highlighter
- duration: 5.5s
- transition_in: cut
- type: hook
- blueprint: collage-poster-build (Reproduce)
- focal: the two torn headline strips
- roles: tool tags = supporting (back layer, edges) · headline strips = foreground subject · tape = supporting
- rules: collage-kit, collage-cutout-slap, collage-paper-tear, collage-marker-annotate, collage-stop-motion-boil, collage-camera

Scene 1 (0.0–1.0s): paper board with faint grid, slow push starts. Five tags ("AI chat", "AI notes",
  "AI writer", "AI search", "AI assistant") slap in as a pile around the edges, alternating sides.
Scene 2 (0.9–2.7s): strip 1 "Your team has / AI tools." (display) slaps on top, upper-middle; tape pins
  its corner. At 2.2s strip 2 "Nobody changed / how they work." (serif) slaps in under it.
Scene 3 (3.0–3.45s): highlighter swipe behind "changed".
Scene 4 (3.45–5.5s): held read; boil; push continues.
```

- `rules:` **always** starts with `collage-kit` — the frame worker's packet only contains the files named there (or mentioned in the block).
- Name kit moves in the Scene lines with the rules' words: *slaps in*, *slides in from the right*, *tear-away*, *highlighter swipe*, *a loop draws around*, *an arrow draws to*, *strike-through*, *tick draws*, *tape pins*, *stamp thumps*, *camera moves to station 2*, *pull back*, *lifts off*. Never px / eases / ms (the rules carry them).
- Give each frame a `focal` piece and keep the piece count honest (3–8).

## Silent videos (no narration)

The text on screen carries the story, so timing is reading time:

- A line of N words needs ≈ 0.3 s × N on screen after it lands (minimum 1.2 s) before the next thing
  competes with it; annotation counts as a new thing.
- One idea per frame; 3.5–6.5 s per frame; a 30 s video is 5–7 frames.
- Put the verdict word in the highlighter; the eye goes there first.
- The last frame holds ≥ 1.5 s after its final move.

## Choosing frames for a launch / announcement (example arc, 30 s)

| # | beat | blueprint | seconds |
|---|---|---|---|
| 1 | the tension (what's wrong today) | collage-poster-build | 5–5.5 |
| 2 | the reframe (the line that names it) | collage-figure-plate | 4.5–5 |
| 3 | the promise (what the product does) | collage-clipping-highlight | 5 |
| 4 | the offer (options / prices / parts) | collage-board-pan | 6 |
| 5 | the outcome (what you end with) | collage-checklist | 4–4.5 |
| 6 | the call (launch word + CTA + logo) | collage-stamp-title-card | 4.5 |
