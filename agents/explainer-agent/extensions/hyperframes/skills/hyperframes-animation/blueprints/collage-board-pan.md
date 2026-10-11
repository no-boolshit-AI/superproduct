# collage-board-pan — Camera Travels a Paper Board, Item by Item, Then Pulls Back

**intent**: The enumeration frame. N items (offers, steps, options, features) are paper pieces — tickets, index cards, price tags, plates — laid out on a board bigger than the frame. The camera travels from station to station; each piece slaps in as the camera arrives; a final pull-back shows the whole board at once. Built on `collage-kit`.

**roles served**

- Benefits / Key_Feature: 3–5 offers or features, one per station.
- Product_Intro: the parts of a service, in order.
- Social_Proof: only with real, supplied proof (logos, quotes the brief gives) — never invented.

**duration**: 5–8 s (≈ 1.3–1.6 s per station + 1–1.5 s pull-back hold).

**shot structure**

```
Scene 1 (0.0–~1.4s): camera framed on station 1 (scale ~1). [item 1] — a ticket/card with
  [label] in the display face, [detail] in the body face, [audience / meta] as a small tag —
  slaps in ~0.15 s after the frame starts; a tape or pin holds it.
Scene 2 (~1.4–~4.2s): for each further item: the camera moves (0.8–1.0 s, smooth) to the next
  station; [item k] slaps in as the camera settles; hold ≥ 0.8 s.
Scene 3 (~4.2–end): the camera pulls back (scale 0.55–0.7) to show all [N] items on the board;
  one item gets the highlighter or a loop if the brief singles it out; held read.
```

**signature move**: the camera, not the pieces, carries the enumeration — smooth travel between stations on a paper board, pieces landing on arrival, then the pull-back reveal of the whole set.

**motion vocabulary**: camera stations + pull-back (smooth), slap on arrival (twos), tape, optional highlighter/loop, boil.

**rule mapping**

- stations / pull-back → `rules/collage-camera.md`
- arrivals → `rules/collage-cutout-slap.md`
- tickets/cards torn or knife-cut → `rules/collage-paper-tear.md`
- tape, highlighter, loop → `rules/collage-marker-annotate.md`
- boil → `rules/collage-stop-motion-boil.md`
- scaffold → `rules/collage-kit.md`

**layout (4:5)**: lay the stations on a 2×2 grid (board 2160×2700) or a zig-zag (each station offset ~1080 px horizontally and ~300 px vertically) so moves alternate direction; the pull-back frames all of them with margins; each station's piece fills ~70–80% of the frame width when the camera is on it. Items keep the same template (same size, same type ramp) so the eye compares contents, not layouts.

**content rule**: every label, price and detail is verbatim from the brief or product facts; a missing value is a visible placeholder, never a guess.
