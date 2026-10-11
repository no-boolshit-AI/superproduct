---
name: collage-marker-annotate
description: Editorial annotation on a collage — highlighter behind one word, hand-drawn marker circles, arrows, underlines, strike-throughs and scribbles drawn on, tape strips and rubber stamps.
metadata:
  tags: collage, marker, highlighter, circle, arrow, underline, strike, scribble, tape, stamp, annotation, emphasis
---

# Marker and stationery

The Vox move: the frame is laid out, then a hand **annotates** it — a highlighter swipe on the verdict word, a loop around the number, an arrow to the culprit, a word struck out. Annotation comes after the content has landed and is read; it is the punchline of the frame. Built on `collage-kit` (cite both).

## Highlighter

```html
<span class="cg-hl-word"><span class="cg-hl" id="x-hl"></span><span class="cg-hl-text">real workflows</span></span>
```
```js
C.highlight(tl, $("x-hl"), 3.0, 0.45);   // grows left → right on twos
```
One highlighted phrase per frame (the verdict). The band is `var(--cg-accent)`; text on it stays ink.

A strike-through sized by the word itself (no coordinates): the band goes AFTER the word, and the same call draws it.
```html
<span class="cg-hl-word"><span class="cg-hl-text">demo data</span><span class="cg-strike" id="x-strike"></span></span>
```
```js
C.highlight(tl, $("x-strike"), 1.8, 0.3);   // tilt it with style="rotate:-2deg" on the band if you like
```

## Marker strokes

```html
<svg class="cg-marker" width="1080" height="1350">   <!-- unscaled: width/height attributes, no viewBox -->
  <path id="x-arrow" data-cg-path="arrow 300 920 470 640 -0.2 3"/>
  <path id="x-strike" data-cg-path="strike 140 512 330"/>
</svg>
```
```js
C.build(R);                               // gives the paths their d
C.draw(tl, $("x-strike"), 2.2, 0.35);
C.draw(tl, $("x-arrow"), 2.6, 0.45);
```

| stroke | generator | draw time |
|---|---|---|
| loop around a word / number | `circle cx cy rx ry [seed]` in a `.cg-around` svg inside the word's wrapper | 0.45–0.6 s |
| arrow from a note to its target | `arrow x1 y1 x2 y2 [bend −0.3…0.3] [seed]` | 0.35–0.5 s |
| underline | `underline x y w [seed]` | 0.3–0.4 s |
| strike-through (a rejected word) | `strike x y w [seed]` | 0.25–0.35 s |
| scribble (crossing a block out) | `scribble x y w h [seed]` | 0.5–0.7 s |
| tick / cross in a checkbox | `check x y size [seed]` / `cross x y size [seed]` | 0.25–0.3 s |

- Colour: `--cg-line` (ink by default; a deeper accent for a second voice). Width `--cg-stroke` 6–8 px.
- A loop around a word: `<span class="cg-hl-word">word<svg class="cg-marker cg-around" width="W" height="H"><path data-cg-path="circle W/2 H/2 W/2−12 H/2−12"/></svg></span>` with W ≈ word width + 60, H ≈ cap height × 1.8. It centres itself on the word.
- Sequence: content lands → hold ≥ 0.5 s → the annotation draws → hold ≥ 1 s.

## Tape

```html
<div class="cg-tape" id="x-tape" data-cg-size="150x40" style="left:52px; top:318px; rotate:-24deg"></div>
```
`C.tape(tl, $("x-tape"), at)` right after the piece it holds lands (+0.3–0.45 s). Across a corner, half on the piece, half on the ground. Max 2–3 per frame.

## Stamp

```html
<div class="cg-stamp" id="x-stamp" style="left:600px; top:930px; font-size:58px; rotate:-9deg">Now live</div>
```
`C.stamp(tl, $("x-stamp"), at, 0.3)` — thumps from 1.6×. Short uppercase words (1–3), on paper (multiply ink), once per video or once per frame at most. `--cg-stamp` sets the ink.

## Critical constraints

- Marker svgs are unscaled; never put the path in a stretched `viewBox` with `vector-effect: non-scaling-stroke` (Chrome dashes those in screen space; the draw ends partial).
- Strokes are hidden by their dash until drawn — never hide them with opacity; never tween `d`.
- Highlighter band before the word in the DOM, both positioned; no `z-index: -1`.
- Annotate what is on screen and true: arrows point at real content, stamps carry real words from the brief.
