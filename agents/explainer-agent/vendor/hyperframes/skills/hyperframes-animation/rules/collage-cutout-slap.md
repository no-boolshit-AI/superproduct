---
name: collage-cutout-slap
description: Cut-out paper pieces land on the board on twos — slap, slide, ransom chips, hard cut-ins and lift-off exits, with a shadow that grows while the piece is in the air.
metadata:
  tags: collage, cut-out, slap, entrance, exit, stop-motion, ransom, paper, shadow, stagger
---

# Cut-out slap

The basic verb of a paper collage: a piece arrives **lifted** — 8% bigger, turned a few degrees, its shadow long and soft — and **lands** with a small overshoot, sampled on the stop-motion grid (12 poses a second), so it reads as a hand placing paper, not a UI tween. Built on `collage-kit` (cite both).

## Recipe

```js
C.slap(tl, $("x-strip1"), 0.9, { from: "top", distance: 80 });                 // headline strip
C.slap(tl, $("x-photo"), 1.4, { from: "left", distance: 60, rotate: -9 });     // a cut-out
C.slide(tl, $("x-ticket"), 2.0, { from: "right", distance: 1100 });            // travels in from off the board
C.ransom(tl, [$("x-r1"), $("x-r2"), $("x-r3")], 2.6);                          // a ransom headline, word by word
C.show(tl, $("x-sticker"), 3.1);                                               // hard cut-in on the beat
C.lift(tl, $("x-photo"), 4.6, { to: "top" });                                  // picked up and gone
```

`slap` = `tl.set(cut, {autoAlpha: 1}, at)` + `fromTo(cut, {x, y, rotation, scale: 1.08, "--lift": 1}, {0, 0, 0, 1, "--lift": 0, ease: twos("back.out(1.5)")})`. The `--lift` variable drives the `.cg-cut` drop-shadow: offset 4→22 px, blur 3→23 px while lifted.

## Timing

| move | duration | notes |
|---|---|---|
| slap, hero piece | 0.40–0.45 s | `distance` 70–90, `rotate` 6–10 |
| slap, small piece (tag, chip, sticker) | 0.30–0.35 s | `distance` 40–60 |
| slide | 0.45–0.6 s | from off the board; use for tickets, cards, a band |
| ransom | ≤ 0.5 s for the group | stagger ~0.08 s, `duration` 0.3 |
| lift (exit) | 0.3–0.4 s | only when the frame itself must clear; most frames end on a hold + cut |
| group stagger | 0.10–0.15 s | items × stagger ≤ ~0.6 s so a pile reads as one beat |

- Alternate `from` sides inside a group (left/right, top/bottom): paper thrown from one side looks mechanical.
- Rest tilts (`rotate:` on the `.cg-paper`) between −12° and +12°, never 0 on everything; the slap's own rotation is extra and settles to 0.
- One hero piece per beat. Supporting pieces arrive in a pile first (tags, scraps), then the hero lands on top **on the beat it is read**.
- Pieces land in reading order: the line the viewer reads first lands first.

## Critical constraints

- Each piece's entrance and exit belong to its `.cg-cut`; never tween the `.cg-boil` wrapper or the `.cg-paper` inside (the kit's transform stack).
- Reveal with the kit only (`autoAlpha` → `visibility: inherit`); never `visibility: visible`, or the piece leaks into other frames.
- A piece needed from t=0 is `class="cg-cut cg-shown"` — don't slap it at 0.
- Don't fade paper in. Paper arrives by moving (slap, slide) or by a hard cut (`show`); an opacity fade reads as a slide deck.
