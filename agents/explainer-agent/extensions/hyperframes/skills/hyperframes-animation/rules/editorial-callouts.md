---
name: editorial-callouts
description: Pointing the eye — the spotlight that dims everything but the subject, a ring drawn around it, documentary connector lines with dots and slash name tags, and the highlighter behind the word that matters.
metadata:
  tags: editorial, callout, spotlight, focus, ring, connector, label, name-tag, highlight, documentary
---

# Editorial callouts

An explainer is a guided look: at every moment the viewer should know where to look and why. Callouts do that job, after the content has landed. Built on `editorial-kit` (cite both).

## Spotlight (focus pull)

```html
<div class="ed-spot" id="c-spot" data-ed-spot="720 470 210"></div>   <!-- after the camera, before the finish -->
```

```js
E.focus(tl, $("c-spot"), 2.4, { dim: 0.68, duration: 0.8 });   // everything but the circle sinks into shadow
E.unfocus(tl, $("c-spot"), 4.6);                               // optional: lift it again
```

- Use it when the frame holds several things and the explanation is about ONE of them ("this one is the inspector").
- `cx cy r` in frame px around the subject's head or the object; `dim` 0.6–0.75. The spot sits outside the camera: aim at where the subject is when the focus lands (the push moves it a little; keep r generous).
- Pair it with a `ring` drawn around the same circle and a name tag.

## Ring

```html
<svg class="ed-lines" width="1080" height="1350"><path id="c-ring" class="ed-paper" data-ed-path="ring 720 470 210"/></svg>
```
```js
E.draw(tl, $("c-ring"), 2.6, { duration: 0.8 });
```

## Connector + name tag (the documentary link)

```html
<svg class="ed-lines" width="1080" height="1350">
  <path id="c-link" data-ed-path="route 40 330 560 330 760 940 760 940 620"/>   <!-- down, along, up -->
</svg>
<div class="ed-dot ed-in" id="c-d1" style="left:330px; top:560px"></div>
<div class="ed-dot ed-in" id="c-d2" style="left:940px; top:620px"></div>
<div class="ed-tag ed-in" id="c-tag1" style="left:110px; top:470px; font-size:58px"><span class="ed-slash"></span>The inspector</div>
<div class="ed-tag ed-in" id="c-tag2" style="left:860px; top:540px; font-size:44px">Head office</div>
```

```js
E.rise(tl, $("c-tag1"), 1.2, { from: "left", distance: 40 });
E.connect(tl, { from: $("c-d1"), path: $("c-link"), to: $("c-d2"), label: $("c-tag2") }, 2.0);
```

- A connector says "these two are related" — who reports to whom, what causes what, where a thing comes from. One or two per frame; the line route is orthogonal with rounded corners (`route r …`), never a diagonal tangle.
- The dot sits on the subject (on the thing, not beside it); the line runs in the empty space, never across a face or a word.
- Name tags: the display face, sentence case, the slash in `--ed-line`. On a light ground set the tag's colour to `var(--ed-ink)`.

## Highlighter

```html
<div class="ed-pos ed-display ed-in" id="c-line" style="left:64px; top:930px; width:950px; font-size:86px">
  It wasn't <span class="ed-hl-word"><span class="ed-hl" id="c-hl"></span><span class="ed-hl-text">evil</span></span>. It was routine.</div>
```
```js
E.rise(tl, $("c-line"), 2.0, { distance: 40 });
E.highlight(tl, $("c-hl"), 2.7, 0.5);
```

- One highlighted word per frame: the verdict, the term being taught. The fill is `--ed-mark` (a highlighter yellow, or the brand accent when it is light); text on it stays ink.

## Order

content lands → it is read (≥ 1 s) → the callout points (spotlight / ring / connector / highlight) → held read. Never callout before the thing it points at is on screen.

## Critical constraints

- The spotlight is SVG with a mask (no CSS radial-gradient, no blur); one per frame.
- Line-art svgs unscaled; `E.build(R)` before `E.draw` / `E.focus`.
- Tags never carry invented names: people and places come from the brief, or the tag names a role ("The inspector", "Head office").
