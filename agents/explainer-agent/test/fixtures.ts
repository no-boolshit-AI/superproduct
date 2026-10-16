/**
 * What Claude and the frame workers would write in a run, as fixtures: a two-frame storyboard (1080×1350, 4 s, silent)
 * and the two frames, in the exact shape the frame-worker contract asks for (one bare <template>, a #root carrying
 * data-composition-id, a class="clip" background, the jsDelivr GSAP tag and one paused timeline per frame, both
 * declared as a top-level `const tl`).
 */
export interface FixtureLook {
  canvas: string;
  ink: string;
  accent: string;
  onAccent: string;
  /** CSS family list for all text */
  family: string;
  /** @font-face rules (the Brand kit block), or "" */
  fontFaceCss: string;
}

export const NEUTRAL: FixtureLook = { canvas: "#f6f4ef", ink: "#1d1d1b", accent: "#3a5bd9", onAccent: "#ffffff", family: "sans-serif", fontFaceCss: "" };

export const STORYBOARD = `---
format: 1080x1350
duration: 4s
message: "Good sourdough takes time"
arc: Hook → Answer
audience: home bakers
mode: autonomous
music: none
---

## Frame 1 — Hook

- scene: The question lands in big type over one accent bar
- duration: 2s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- blueprint: compose
- focal: the question

Open on the question.

## Frame 2 — Answer

- scene: The answer, the wordmark and the call to action
- duration: 2s
- transition_in: crossfade
- status: animated
- src: compositions/frames/02-answer.html
- blueprint: compose
- focal: the call to action

Close on the subscription.

## Video direction

Paper ground, ink type, the accent only as a fill.
`;

function frame(id: string, look: FixtureLook, body: string, css: string, motion: string, duration = 2): string {
  return `<template>
  <div id="root" data-composition-id="${id}" data-width="1080" data-height="1350" data-duration="${duration}">
    <style>
      ${look.fontFaceCss}
      #root { position: relative; width: 1080px; height: 1350px; overflow: hidden; font-family: ${look.family}; color: ${look.ink}; }
      #root .bg { position: absolute; inset: 0; background: ${look.canvas}; }
      ${css}
    </style>
    <div class="clip bg" data-start="0" data-duration="${duration}" data-track-index="0"></div>
    ${body}
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${motion}
      window.__timelines["${id}"] = tl;
    </script>
  </div>
</template>
`;
}

export function hookFrame(look: FixtureLook): string {
  return frame(
    "01-hook",
    look,
    `<div class="hook-bar"></div>
    <h1 class="hook-title">Why does sourdough take [X] hours?</h1>`,
    `#root .hook-title { position: absolute; left: 96px; right: 96px; top: 300px; margin: 0; font-size: 112px; line-height: 1.05; font-weight: 700; }
      #root .hook-bar { position: absolute; left: 96px; top: 230px; width: 360px; height: 28px; background: ${look.accent}; transform-origin: left center; }`,
    `tl.fromTo(".hook-title", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, 0.2);
      tl.fromTo(".hook-bar", { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power2.out" }, 0.5);`,
  );
}

export function answerFrame(look: FixtureLook, line = "Wild yeast is slow. We wait, so you don't.", wordmark = "acme bread"): string {
  return frame(
    "02-answer",
    look,
    `<p class="answer-line">${line}</p>
    <div class="answer-cta">Start a subscription</div>
    <div class="answer-wordmark">${wordmark}</div>`,
    `#root .answer-line { position: absolute; left: 96px; right: 96px; top: 260px; margin: 0; font-size: 84px; line-height: 1.1; font-weight: 600; }
      #root .answer-cta { position: absolute; left: 96px; top: 700px; padding: 28px 44px; background: ${look.accent}; color: ${look.onAccent}; font-size: 48px; font-weight: 700; border-radius: 16px; }
      #root .answer-wordmark { position: absolute; left: 96px; top: 900px; font-size: 56px; font-weight: 700; letter-spacing: -0.02em; }`,
    `tl.fromTo(".answer-line", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.1);
      tl.fromTo(".answer-cta", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.7)" }, 0.6);
      tl.fromTo(".answer-wordmark", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.9);`,
  );
}

/** A one-frame storyboard in the vox-collage style: the frame cites the collage blueprint and rules. */
export const COLLAGE_STORYBOARD = `---
format: 1080x1350
duration: 3s
message: "Good sourdough takes time"
arc: Hook
audience: home bakers
mode: autonomous
music: none
---

## Video direction

- **Look**: vox-collage. Paper board, torn strips, one highlighter swipe, grain.
- **Motion grammar**: pieces on twos, held pieces boil, the camera pushes in slowly.

## Frame 1 — Hook

- scene: two tags pile up, the headline strip slaps on top, "slow" gets the highlighter
- duration: 3s
- transition_in: cut
- status: animated
- src: compositions/frames/01-collage.html
- blueprint: collage-poster-build (Adapt)
- focal: the torn headline strip
- roles: tags = supporting · headline strip = foreground subject · tape = supporting
- rules: collage-kit, collage-cutout-slap, collage-marker-annotate

Scene 1 (0.0–0.6s): two tags slap in at the edges.
Scene 2 (0.6–1.6s): the torn strip "Wild yeast is slow." slaps on top; tape pins it; an underline draws.
Scene 3 (1.6–3.0s): the highlighter swipes behind "slow"; the stamp thumps; held read.
`;

/** The collage frame as a frame worker writes it on the kit (assets/collage/collage.js): sheets, slaps, tape, highlighter, marker, stamp, boil, drift. */
export function collageFrame(look: FixtureLook): string {
  return `<template>
  <style>
    ${look.fontFaceCss}
    #root { position: relative; width: 1080px; height: 1350px; overflow: hidden; font-family: ${look.family}; color: ${look.ink};
      --cg-ground: ${look.canvas}; --cg-paper: #ffffff; --cg-ink: ${look.ink}; --cg-accent: ${look.accent}; --cg-line: ${look.ink}; --cg-stamp: ${look.ink}; }
    #root .strip { width: 900px; height: 230px; padding: 0 48px; display: flex; align-items: center; font-size: 96px; font-weight: 700; letter-spacing: -0.03em; }
    #root .tag { padding: 18px 26px; font-size: 34px; font-weight: 600; border-radius: 10px 4px 4px 10px; }
  </style>
  <div id="root" data-composition-id="01-collage" data-width="1080" data-height="1350" data-duration="3">
    <div class="clip cg-ground" id="g-ground" data-start="0" data-duration="3" data-track-index="0"></div>
    <div class="clip cg-tone" id="g-tone" data-start="0" data-duration="3" data-track-index="1"></div>
    <div class="cg-board" id="g-board">
      <div class="cg-grid"></div>
      <div class="cg-layer" id="g-back">
        <div class="cg-boil" style="left:80px; top:160px"><div class="cg-cut" id="g-t1"><div class="cg-paper tag" style="rotate:-8deg">starter</div></div></div>
        <div class="cg-boil" style="left:700px; top:980px"><div class="cg-cut" id="g-t2"><div class="cg-paper tag" style="rotate:6deg">flour, water, salt</div></div></div>
      </div>
      <div class="cg-layer" id="g-front">
        <div class="cg-boil" style="left:90px; top:480px"><div class="cg-cut" id="g-s1"><div class="cg-paper strip" data-cg-sheet="900x230" data-cg-edges="tb" data-cg-seed="3" style="rotate:-2deg">Wild yeast is&nbsp;<span class="cg-hl-word"><span class="cg-hl" id="g-hl"></span><span class="cg-hl-text">slow.</span></span></div></div></div>
        <div class="cg-tape" id="g-tape" data-cg-size="150x40" style="left:60px; top:470px; rotate:-24deg"></div>
        <svg class="cg-marker" width="1080" height="1350"><path id="g-under" data-cg-path="underline 160 760 520 4"/></svg>
        <div class="cg-stamp" id="g-stamp" style="left:620px; top:820px; font-size:52px; rotate:-9deg">[X] hours</div>
      </div>
    </div>
    <div class="clip cg-grain" id="g-grain" data-start="0" data-duration="3" data-track-index="2"></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script src="assets/collage/collage.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const C = window.Collage;
    const R = document.querySelector('[data-composition-id="01-collage"]');
    const $ = (id) => R.querySelector("#" + id);
    C.build(R);
    const tl = gsap.timeline({ paused: true });
    C.slap(tl, $("g-t1"), 0.1, { from: "left", distance: 50, rotate: -9, duration: 0.33 });
    C.slap(tl, $("g-t2"), 0.25, { from: "right", distance: 50, rotate: 9, duration: 0.33 });
    C.slap(tl, $("g-s1"), 0.6, { from: "top", distance: 80 });
    C.tape(tl, $("g-tape"), 1.0);
    C.draw(tl, $("g-under"), 1.2, 0.35);
    C.highlight(tl, $("g-hl"), 1.6, 0.4);
    C.stamp(tl, $("g-stamp"), 2.1);
    C.boil(tl, R.querySelectorAll(".cg-boil"), 3);
    C.drift(tl, { duration: 3, board: $("g-board"), push: 0.03, layers: [[$("g-back"), 0.5], [$("g-front"), 1]] });
    window.__timelines["01-collage"] = tl;
  </script>
</template>
`;
}

/** A two-frame storyboard in the editorial style: both frames cite editorial blueprints and the editorial rules. */
export const EDITORIAL_STORYBOARD = `---
format: 1080x1350
duration: 6s
message: "Sourdough takes a day because wild yeast is slow"
arc: Hook → Evidence
audience: home bakers
mode: autonomous
music: none
---

## Video direction

- **Look**: editorial · colour-field — B&W halftone subject on the brand colour, a paper frame for the number.
- **Camera**: every frame pushes with three depth layers.

## Frame 1 — The question

- scene: the subject printed in halftone on the brand colour; "Wild yeast is slow." lands; the spotlight closes
- duration: 3s
- transition_in: cut
- status: animated
- src: compositions/frames/01-field.html
- blueprint: editorial-subject-field (Adapt)
- focal: the subject cut-out
- pictures: subject.png (cutout, B&W halftone, 600×600)
- rules: editorial-kit, editorial-cutout, editorial-callouts, editorial-camera

Scene 1 (0.0–0.8s): the page of words wipes in; "24h" rises behind; the subject rises.
Scene 2 (0.8–2.0s): a ring draws; the connector routes to "Starter"; the line lands; "slow" highlighted.
Scene 3 (2.0–3.0s): the spotlight closes on the subject; held read.

## Frame 2 — The number

- scene: paper and grid; the subject again; the number counts to 829%; two bars grow
- duration: 3s
- transition_in: cut
- status: animated
- src: compositions/frames/02-paper.html
- blueprint: editorial-compare (Adapt)
- focal: the number
- pictures: subject.png (cutout, B&W halftone, 600×600)
- rules: editorial-kit, editorial-graphics, editorial-cutout

Scene 1 (0.0–1.2s): the subject rises; the bars grow from the baseline.
Scene 2 (1.2–3.0s): the number counts up to 829%; held read.
`;

const HALFTONE = `{"adjust":{"saturation":-1,"contrast":0.3},"effects":{"halftone":0.94,"halftoneSize":0.3}}`;

/** The two editorial frames as frame workers write them on the kit (assets/editorial/editorial.js). */
export function editorialFrames(look: FixtureLook): Record<string, string> {
  const head = (id: string, vars: string) => `<template>
  <style>
    ${look.fontFaceCss}
    #root { position: relative; width: 1080px; height: 1350px; overflow: hidden; font-family: ${look.family}; color: ${look.ink};
      --ed-paper: ${look.canvas}; --ed-ink: ${look.ink}; --ed-field: ${look.accent}; --ed-line: ${look.ink}; --ed-mark: ${look.canvas};
      --ed-display: ${look.family}; --ed-serif: Georgia, serif; ${vars} }
  </style>
  <div id="root" data-composition-id="${id}" data-width="1080" data-height="1350" data-duration="3">`;
  const tail = (id: string, motion: string) => `  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script src="assets/editorial/editorial.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const E = window.Editorial;
    const R = document.querySelector('[data-composition-id="${id}"]');
    const $ = (id) => R.querySelector("#" + id);
    E.build(R);
    const tl = gsap.timeline({ paused: true });
    ${motion}
    E.push(tl, R, { duration: 3 });
    E.grain(tl, R, 3);
    window.__timelines["${id}"] = tl;
  </script>
</template>
`;
  const subject = (p: string) => `<div class="ed-cutout ed-edge ed-in" id="${p}-subject" style="left:240px; top:300px; width:600px; height:600px">
          <img class="clip" id="${p}-subject-img" data-start="0" data-duration="3" data-track-index="3" src="assets/images/subject.png" width="600" height="600" data-color-grading='${HALFTONE}'>
        </div>`;
  return {
    "01-field": `${head("01-field", "--ed-ground: " + look.accent + ";")}
    <div class="clip ed-ground" id="f-ground" data-start="0" data-duration="3" data-track-index="0"></div>
    <div class="ed-camera" id="f-cam">
      <div class="ed-layer" id="f-back" data-ed-depth="0.25">
        <div class="ed-field ed-in" id="f-page" data-ed-shape="blob 4" data-ed-size="520x760" data-ed-textfill="wild yeast is slow" style="left:540px; top:40px"></div>
        <div class="ed-pos ed-giant ed-in" id="f-year" style="left:40px; top:80px; font-size:280px; color:${look.onAccent}">24h</div>
      </div>
      <div class="ed-layer" id="f-mid" data-ed-depth="0.6">
        ${subject("f")}
      </div>
      <div class="ed-layer" id="f-front" data-ed-depth="1">
        <svg class="ed-lines" width="1080" height="1350"><path id="f-link" data-ed-path="route 30 300 760 300 940 900 940"/><path id="f-ring" class="ed-paper" data-ed-path="ring 540 600 300"/></svg>
        <div class="ed-dot ed-in" id="f-d1" style="left:300px; top:760px"></div>
        <div class="ed-dot ed-in" id="f-d2" style="left:900px; top:940px"></div>
        <div class="ed-tag ed-in" id="f-tag" style="left:760px; top:860px; font-size:44px; color:${look.ink}"><span class="ed-slash"></span>Starter</div>
        <div class="ed-pos ed-display ed-in" id="f-line" style="left:64px; top:990px; width:950px; font-size:84px">Wild yeast is <span class="ed-hl-word"><span class="ed-hl" id="f-hl"></span><span class="ed-hl-text">slow</span></span>.</div>
      </div>
    </div>
    <div class="ed-spot" id="f-spot" data-ed-spot="540 600 300"></div>
    <div class="clip ed-finish" id="f-finish" data-start="0" data-duration="3" data-track-index="9"></div>
${tail(
  "01-field",
  `E.grow(tl, $("f-page"), 0, { from: "top", duration: 0.6 });
    E.rise(tl, $("f-year"), 0.1, { distance: 60 });
    E.rise(tl, $("f-subject"), 0.25, { distance: 100, duration: 0.7 });
    E.draw(tl, $("f-ring"), 0.8, 0.5);
    E.connect(tl, { from: $("f-d1"), path: $("f-link"), to: $("f-d2"), label: $("f-tag") }, 1.0, { duration: 0.5 });
    E.rise(tl, $("f-line"), 1.4, { distance: 30, duration: 0.5 });
    E.highlight(tl, $("f-hl"), 1.7, 0.3);
    E.focus(tl, $("f-spot"), 2.0, { dim: 0.7, duration: 0.5 });`,
)}`,
    "02-paper": `${head("02-paper", "--ed-ground: " + look.canvas + ";")}
    <div class="clip ed-ground" id="p-ground" data-start="0" data-duration="3" data-track-index="0"></div>
    <div class="ed-camera" id="p-cam">
      <div class="ed-layer" id="p-back" data-ed-depth="0.2">
        <div class="ed-grid"></div>
        <div class="ed-pos ed-giant ed-in" id="p-num" style="left:60px; top:930px; font-size:180px; color:${look.ink}">0%</div>
      </div>
      <div class="ed-layer" id="p-mid" data-ed-depth="0.6">
        ${subject("p")}
      </div>
      <div class="ed-layer" id="p-front" data-ed-depth="1">
        <div class="ed-bar ed-in" id="p-b1" style="left:780px; top:960px; width:80px; height:120px; background:${look.ink}"></div>
        <div class="ed-bar ed-in" id="p-b2" style="left:900px; top:840px; width:80px; height:240px"></div>
      </div>
    </div>
    <div class="clip ed-finish" id="p-finish" data-start="0" data-duration="3" data-track-index="9"></div>
${tail(
  "02-paper",
  `E.rise(tl, $("p-subject"), 0.1, { distance: 80, duration: 0.6 });
    E.grow(tl, [$("p-b1"), $("p-b2")], 0.5, { from: "bottom", duration: 0.6, stagger: 0.2 });
    E.rise(tl, $("p-num"), 1.2, { distance: 30, duration: 0.4 });
    E.count(tl, $("p-num"), 1.2, { to: 829, suffix: "%", duration: 1.0 });`,
)}`,
  };
}

/** The sketch sheet the agent draws for review (storyboard.html): one cell per frame at the video's aspect. */
export function storyboardSheet(version = 1, hook = "Why does sourdough take [X] hours?"): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Storyboard v${version}</title><style>
body{width:1600px;margin:0;padding:40px;box-sizing:border-box;background:#ECEAE6;font-family:sans-serif;color:#1d1d1b}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.cell{aspect-ratio:4/5;container-type:inline-size;background:#f6f4ef;position:relative;overflow:hidden}
.cell h2{position:absolute;left:8cqw;right:8cqw;top:28cqw;font-size:9cqw;line-height:1.05;margin:0}
.bar{position:absolute;left:8cqw;top:20cqw;width:34cqw;height:2.6cqw;background:#3a5bd9}
.cta{position:absolute;left:8cqw;top:66cqw;padding:2cqw 4cqw;background:#3a5bd9;color:#fff;font-size:4.4cqw;border-radius:1.4cqw}
.note{font-size:15px;margin:8px 0 0}
</style></head><body>
<h1>Why sourdough takes time · v${version}</h1>
<p><b>The question:</b> Why does sourdough take a whole day? · <b>The answer:</b> Wild yeast is slow, so good bread needs time.</p>
<div class="grid">
  <div><div class="cell" id="frame-01"><div class="bar"></div><h2>${hook}</h2></div><p class="note"><b>01 · Hook · 2 s</b><br>Point: sourdough takes longer than other bread.</p></div>
  <div><div class="cell" id="frame-02"><h2>Wild yeast is slow. We wait, so you don't.</h2><div class="cta">Start a subscription</div></div><p class="note"><b>02 · Answer · 2 s</b><br>Point: slow yeast is the reason.</p></div>
</div></body></html>
`;
}
