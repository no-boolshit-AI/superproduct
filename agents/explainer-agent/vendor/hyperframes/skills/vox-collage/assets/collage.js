/*
 * collage.js: the Vox-style paper-collage kit for HyperFrames frames (skills/vox-collage, an extension of the
 * HyperFrames skills shipped with explainer-agent). Read skills/vox-collage/references/collage-kit.md first.
 *
 * Load it inside the frame's <template>, right after the GSAP tag:
 *   <script src="assets/collage/collage.js"></script>
 * It installs the kit stylesheet (the .cg-* classes) once per document, then exposes window.Collage.
 *
 * Deterministic and seek-safe by construction:
 *   - no Math.random, no Date: build-time geometry comes from a seeded generator, the boil from a hash of the
 *     QUANTIZED timeline time (a pure function of time: the same pose on every pass over a frame);
 *   - sizes are authored numbers (data-cg-size, function arguments): no layout measurement;
 *   - every move is a tween on the frame's ONE paused timeline; nothing autoplays.
 *   - no CSS clip-path and no CSS blur filter on pieces (HyperFrames' heavy-overlay hazard): torn paper is an
 *     inline SVG shape drawn behind the content.
 *
 * The transform stack of a collage piece; each level is moved by ONE helper only, so tweens never fight:
 *   .cg-camera (Collage.camera) > .cg-board (Collage.drift push) > .cg-layer (Collage.drift parallax)
 *   > .cg-boil (Collage.boil) > .cg-cut (Collage.slap & co + the --lift shadow) > .cg-paper (static: CSS `rotate`)
 */
(function (root) {
  "use strict";
  if (root.Collage) return;

  var A = "assets/collage/";
  var NS = "http://www.w3.org/2000/svg";

  /** The stop-motion grid: pieces move on twos at 24 fps = 12 poses a second. */
  var FPS = 12;

  var CSS = [
    /* ground and atmosphere (each one a full-frame layer; order: ground, tone, grid, board, grain) */
    ".cg-ground{position:absolute;inset:0;background:var(--cg-ground,#F2EFE8)}",
    ".cg-tone{position:absolute;inset:0;background:url(" + A + "paper-tone.svg) center/1200px 1200px;mix-blend-mode:multiply;opacity:var(--cg-tone,.35);pointer-events:none}",
    ".cg-grid{position:absolute;inset:-96px;background:url(" + A + "grid-paper.svg) 0 0/48px 48px;opacity:var(--cg-grid,1);pointer-events:none}",
    ".cg-grain{position:absolute;inset:0;background:url(" + A + "paper-grain.svg) 0 0/480px 480px;mix-blend-mode:multiply;opacity:var(--cg-grain,.3);pointer-events:none}",
    ".cg-grain.cg-light{background-image:url(" + A + "paper-grain-light.svg);mix-blend-mode:screen;opacity:var(--cg-grain-light,.22)}",
    /* camera rig */
    ".cg-camera,.cg-board,.cg-layer{position:absolute;inset:0}",
    ".cg-camera{transform-origin:50% 50%}",
    ".cg-board{transform-origin:50% 45%}",
    ".cg-boil{position:absolute}",
    /* a piece: hidden until it lands; the shadow grows with --lift while it is in the air */
    ".cg-cut{visibility:hidden;opacity:0;--lift:0;filter:drop-shadow(0 calc(4px + var(--lift) * 18px) calc(3px + var(--lift) * 20px) rgba(var(--cg-shadow,27,27,24),.3))}",
    ".cg-cut.cg-flat{filter:none}",
    ".cg-cut.cg-shown{visibility:inherit;opacity:1}",
    /* paper: the torn sheet is an SVG drawn behind the content (Collage.build) */
    /* the sheet sits at z-index -1 inside the paper's own stacking context: behind any content, text nodes included */
    ".cg-paper{position:relative;isolation:isolate;background:var(--cg-paper,#FFFFFF);color:var(--cg-ink,#1B1B18)}",
    ".cg-paper[data-cg-sheet],.cg-paper.cg-sheeted{background:none}",
    ".cg-paper>svg.cg-sheet,.cg-tape>svg.cg-sheet{position:absolute;left:0;top:0;z-index:-1;overflow:visible;pointer-events:none}",
    ".cg-paper.cg-on-ink{color:var(--cg-paper,#FFFFFF)}",
    /* highlighter: the band is BEHIND the word by DOM order (band first, word second; both positioned) */
    ".cg-hl-word{position:relative;display:inline-block}",
    ".cg-hl-word>.cg-hl{position:absolute;left:-.1em;right:-.12em;top:.2em;bottom:.02em;background:var(--cg-accent,#FFE52E);transform-origin:left center;transform:scaleX(0)}",
    ".cg-hl-word>.cg-hl-text{position:relative}",
    /* a marker strike-through as a band over the word (AFTER the word in the DOM): sized by the word, no measuring */
    ".cg-hl-word>.cg-strike{position:absolute;left:-.08em;right:-.08em;top:52%;height:.085em;margin-top:-.04em;background:var(--cg-line,#1B1B18);border-radius:.05em;transform-origin:left center;transform:scaleX(0)}",
    /* tape, stamp, marker, ransom chips, captions, greeked text */
    ".cg-tape{position:absolute;isolation:isolate;visibility:hidden;transform-origin:left center}",
    ".cg-stamp{position:absolute;visibility:hidden;display:inline-flex;align-items:center;justify-content:center;gap:.3em;padding:.16em .45em .12em;border:.11em solid currentColor;border-radius:.14em;color:var(--cg-stamp,#1B1B18);font-weight:700;text-transform:uppercase;letter-spacing:.08em;line-height:1;white-space:nowrap;mix-blend-mode:multiply;-webkit-mask-image:url(" + A + "stamp-mask.svg);mask-image:url(" + A + "stamp-mask.svg);-webkit-mask-size:600px 300px;mask-size:600px 300px}",
    ".cg-marker{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}",
    ".cg-marker.cg-around{left:50%;top:50%;transform:translate(-50%,-50%)}",
    ".cg-marker path{fill:none;stroke:var(--cg-line,#1B1B18);stroke-width:var(--cg-stroke,7px);stroke-linecap:round;stroke-linejoin:round}",
    ".cg-chip{display:inline-block;padding:.05em .16em .09em;margin:0 .02em;background:var(--cg-paper,#FFFFFF);color:var(--cg-ink,#1B1B18);line-height:1;white-space:nowrap}",
    ".cg-chip.cg-on-ink{background:var(--cg-ink,#1B1B18);color:var(--cg-paper,#FFFFFF)}",
    ".cg-chip.cg-on-accent{background:var(--cg-accent,#FFE52E);color:var(--cg-ink,#1B1B18)}",
    ".cg-serif{font-family:var(--cg-serif,serif)}",
    ".cg-mono{font-family:var(--cg-mono,monospace)}",
    ".cg-fig{font-size:22px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--cg-muted,#6F6C66)}",
    ".cg-greek{background:repeating-linear-gradient(to bottom,rgba(var(--cg-shadow,27,27,24),.2) 0 7px,transparent 7px 17px)}",
  ].join("\n");

  function install() {
    var d = root.document;
    if (!d || d.getElementById("cg-kit-css")) return;
    var s = d.createElement("style");
    s.id = "cg-kit-css";
    s.textContent = CSS;
    (d.head || d.documentElement).appendChild(s);
  }

  /** Sin-fold hash of integers to [0, 1). */
  function hash(a, b) {
    var x = Math.sin(a * 127.1 + (b || 0) * 311.7 + 0.5) * 43758.5453;
    return x - Math.floor(x);
  }

  /** Seeded generator for build-time geometry (torn edges, scatter): same seed, same shape. */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /**
   * An ease sampled on the stop-motion grid: the value only changes FPS times a second, which is what makes paper
   * look hand-animated. Use it for pieces; keep the camera smooth.
   */
  function twos(ease, duration, fps) {
    var fn = typeof ease === "function" ? ease : gsap.parseEase(ease || "power3.out");
    var n = Math.max(1, Math.round((duration || 0.4) * (fps || FPS)));
    return function (p) {
      return fn(Math.min(1, Math.floor(p * n + 1e-6) / n));
    };
  }

  function f1(v) {
    return (Math.round(v * 10) / 10).toString();
  }

  function pathFrom(pts, close) {
    var d = "M" + f1(pts[0][0]) + " " + f1(pts[0][1]);
    for (var i = 1; i < pts.length; i++) d += "L" + f1(pts[i][0]) + " " + f1(pts[i][1]);
    return close ? d + "Z" : d;
  }

  /** Catmull-Rom through the points, as cubic Béziers: a hand-drawn line instead of a polyline. */
  function smooth(pts) {
    var d = "M" + f1(pts[0][0]) + " " + f1(pts[0][1]);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[i + 2] || p2;
      d +=
        "C" + f1(p1[0] + (p2[0] - p0[0]) / 6) + " " + f1(p1[1] + (p2[1] - p0[1]) / 6) +
        " " + f1(p2[0] - (p3[0] - p1[0]) / 6) + " " + f1(p2[1] - (p3[1] - p1[1]) / 6) +
        " " + f1(p2[0]) + " " + f1(p2[1]);
    }
    return d;
  }

  /**
   * Torn-paper outline of a w×h sheet as an SVG path (local px, origin top-left).
   * opts.edges: the torn edges among "t", "r", "b", "l" (default all; the others stay knife-cut).
   * opts.amp: tear depth px (default 5), opts.step: tooth width px (default 16), opts.inset: pull the torn edges in
   * by this many px (for the coloured layer over a white rim), opts.seed.
   */
  function tornPath(w, h, opts) {
    var o = opts || {};
    var amp = o.amp == null ? 5 : o.amp;
    var step = o.step || 16;
    var edges = o.edges == null ? "trbl" : o.edges;
    var inset = o.inset || 0;
    var r = rng(o.seed || 1);
    var pts = [];
    function edge(x0, y0, x1, y1, torn, nx, ny) {
      var len = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
      var n = torn ? Math.max(2, Math.round(len / step)) : 1;
      var off = torn ? inset : 0;
      for (var i = 0; i < n; i++) {
        var t = i / n;
        var j = torn && i > 0 ? r() * amp * (r() < 0.2 ? 1.9 : 1) : 0;
        var wob = torn && i > 0 ? (r() - 0.5) * step * 0.35 : 0;
        pts.push([x0 + (x1 - x0) * t + nx * (j + off) + ny * wob, y0 + (y1 - y0) * t + ny * (j + off) + nx * wob]);
      }
    }
    edge(0, 0, w, 0, edges.indexOf("t") >= 0, 0, 1);
    edge(w, 0, w, h, edges.indexOf("r") >= 0, -1, 0);
    edge(w, h, 0, h, edges.indexOf("b") >= 0, 0, -1);
    edge(0, h, 0, 0, edges.indexOf("l") >= 0, 1, 0);
    return pathFrom(pts, true);
  }

  /**
   * A vertical torn seam at x through a w×h sheet: [leftPath, rightPath], two halves that fit exactly
   * (for Collage.tearAway). opts.amp (default 16), opts.step (default 22), opts.seed.
   */
  function seam(w, h, x, opts) {
    var o = opts || {};
    var amp = o.amp == null ? 16 : o.amp;
    var step = o.step || 22;
    var r = rng(o.seed || 7);
    var n = Math.max(3, Math.round(h / step));
    var line = [];
    for (var i = 0; i <= n; i++) line.push([x + (i === 0 || i === n ? 0 : (r() - 0.5) * 2 * amp), (h * i) / n]);
    var left = [[0, 0]].concat(line, [[0, h]]);
    var right = line.slice().concat([[w, h], [w, 0]]);
    return [pathFrom(left, true), pathFrom(right, true)];
  }

  var uid = 0;
  function svgEl(name, attrs) {
    var e = root.document.createElementNS(NS, name);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  /**
   * Draw a paper shape behind el's content: an SVG sized w×h inserted as el's first child.
   * opts: edges/amp/step/seed (see tornPath; edges "" = a knife-cut rectangle), d (your own path instead),
   *       fill (default var(--cg-paper)), rim (a second colour showing as a thin torn rim under the fill, e.g. white
   *       under an ink sheet), grain ("dark" | "light" | false: paper tooth inside the shape; default false, the
   *       frame's .cg-grain covers it).
   * Returns the svg.
   */
  function sheet(el, w, h, opts) {
    var o = opts || {};
    var old = el.querySelector(":scope > svg.cg-sheet");
    if (old) old.parentNode.removeChild(old);
    var svg = svgEl("svg", { class: "cg-sheet", width: w, height: h, viewBox: "0 0 " + w + " " + h, "aria-hidden": "true" });
    var d = o.d || tornPath(w, h, o);
    if (o.rim) {
      var rim = svgEl("path", { d: d });
      rim.style.fill = o.rim;
      svg.appendChild(rim);
      d = o.d || tornPath(w, h, { edges: o.edges, amp: (o.amp == null ? 5 : o.amp) * 1.2, step: o.step, seed: (o.seed || 1) + 17, inset: 3 });
    }
    var base = svgEl("path", { d: d });
    base.style.fill = o.fill || "var(--cg-paper, #FFFFFF)";
    svg.appendChild(base);
    if (o.grain) {
      var id = "cg-grain-" + ++uid;
      var defs = svgEl("defs", {});
      var pat = svgEl("pattern", { id: id, patternUnits: "userSpaceOnUse", width: 480, height: 480 });
      pat.appendChild(svgEl("image", { href: A + (o.grain === "light" ? "paper-grain-light.svg" : "paper-grain.svg"), width: 480, height: 480 }));
      defs.appendChild(pat);
      svg.insertBefore(defs, svg.firstChild);
      var g = svgEl("path", { d: d, fill: "url(#" + id + ")", opacity: o.grain === "light" ? 0.5 : 0.35 });
      svg.appendChild(g);
    }
    el.insertBefore(svg, el.firstChild);
    if (el.classList) el.classList.add("cg-sheeted");
    return svg;
  }

  function size(v, dw, dh) {
    var m = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/.exec(v || "");
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [dw, dh];
  }

  /**
   * Declarative set-up for everything inside scope (the frame root), once, before the timeline is built:
   *   [data-cg-sheet="W×H"]  a paper shape (data-cg-edges, data-cg-amp, data-cg-seed, data-cg-fill, data-cg-rim,
   *                          data-cg-grain): see sheet()
   *   .cg-tape                a tape strip with torn ends (data-cg-size, default 150×40; data-cg-fill)
   *   [data-cg-path]          an SVG <path> whose d comes from a generator: "circle cx cy rx ry [seed]",
   *                          "arrow x1 y1 x2 y2 [bend] [seed]", "underline x y w [seed]", "strike x y w [seed]",
   *                          "scribble x y w h [seed]", "check x y size [seed]", "cross x y size [seed]"
   */
  function build(scope) {
    var i;
    var sheets = scope.querySelectorAll("[data-cg-sheet]");
    for (i = 0; i < sheets.length; i++) {
      var el = sheets[i];
      var sz = size(el.getAttribute("data-cg-sheet"), 400, 200);
      var ds = el.dataset;
      sheet(el, sz[0], sz[1], {
        edges: ds.cgEdges == null ? "tb" : ds.cgEdges,
        amp: ds.cgAmp == null ? undefined : parseFloat(ds.cgAmp),
        seed: ds.cgSeed == null ? i + 1 : parseInt(ds.cgSeed, 10),
        fill: ds.cgFill,
        rim: ds.cgRim,
        grain: ds.cgGrain,
      });
    }
    var tapes = scope.querySelectorAll(".cg-tape");
    for (i = 0; i < tapes.length; i++) {
      var t = tapes[i];
      var ts = size(t.dataset.cgSize, 150, 40);
      t.style.width = ts[0] + "px";
      t.style.height = ts[1] + "px";
      sheet(t, ts[0], ts[1], { edges: "lr", amp: 4, step: 6, seed: 40 + i, fill: t.dataset.cgFill || "var(--cg-tape, rgba(236,231,214,.8))" });
    }
    var paths = scope.querySelectorAll("path[data-cg-path]");
    for (i = 0; i < paths.length; i++) {
      var spec = paths[i].getAttribute("data-cg-path").trim().split(/\s+/);
      var kind = spec.shift();
      var n = spec.map(parseFloat);
      var p =
        kind === "circle" ? circlePath(n[0], n[1], n[2], n[3], { seed: n[4] }) :
        kind === "arrow" ? arrowPath(n[0], n[1], n[2], n[3], { bend: n[4], seed: n[5] }) :
        kind === "underline" ? underlinePath(n[0], n[1], n[2], { seed: n[3] }) :
        kind === "strike" ? underlinePath(n[0], n[1], n[2], { seed: n[3] }) :
        kind === "scribble" ? scribblePath(n[0], n[1], n[2], n[3], { seed: n[4] }) :
        kind === "check" ? checkPath(n[0], n[1], n[2], { seed: n[3] }) :
        kind === "cross" ? crossPath(n[0], n[1], n[2], { seed: n[3] }) : null;
      if (p) paths[i].setAttribute("d", p);
    }
  }

  /** A hand-drawn marker loop around (cx, cy): overshoots its start like a real pen. opts.seed, opts.turns. */
  function circlePath(cx, cy, rx, ry, opts) {
    var o = opts || {};
    var r = rng(o.seed || 5);
    var turns = o.turns || 1.12;
    var n = Math.round(30 * turns);
    var a0 = -2.4 + (r() - 0.5) * 0.4;
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var a = a0 + t * turns * Math.PI * 2;
      var k = 1 + (r() - 0.5) * 0.05 + (t - 0.5) * 0.08;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return smooth(pts);
  }

  /** A hand-drawn arrow from (x1, y1) to (x2, y2): a bowed shaft (bend, default 0.18) and a two-stroke head. */
  function arrowPath(x1, y1, x2, y2, opts) {
    var o = opts || {};
    var bend = o.bend == null || isNaN(o.bend) ? 0.18 : o.bend;
    var r = rng(o.seed || 9);
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len;
    var ny = dx / len;
    var pts = [];
    for (var i = 0; i <= 12; i++) {
      var t = i / 12;
      var b = Math.sin(t * Math.PI) * bend * len + (i > 0 && i < 12 ? (r() - 0.5) * 2.5 : 0);
      pts.push([x1 + dx * t + nx * b, y1 + dy * t + ny * b]);
    }
    var e = pts[12];
    var p = pts[10];
    var ang = Math.atan2(e[1] - p[1], e[0] - p[0]);
    var hl = o.head || Math.min(34, Math.max(18, len * 0.14));
    var h1 = [e[0] - Math.cos(ang - 0.5) * hl, e[1] - Math.sin(ang - 0.5) * hl];
    var h2 = [e[0] - Math.cos(ang + 0.45) * hl * 0.9, e[1] - Math.sin(ang + 0.45) * hl * 0.9];
    return smooth(pts) + "M" + f1(h1[0]) + " " + f1(h1[1]) + "L" + f1(e[0]) + " " + f1(e[1]) + "L" + f1(h2[0]) + " " + f1(h2[1]);
  }

  /** A hand-drawn underline (also the strike-through) from (x, y), w wide: a slight wave and a rising finish. */
  function underlinePath(x, y, w, opts) {
    var o = opts || {};
    var r = rng(o.seed || 3);
    var pts = [];
    var n = Math.max(4, Math.round(w / 60));
    for (var i = 0; i <= n; i++) pts.push([x + (w * i) / n, y + (r() - 0.5) * 5 - (i / n) * (i / n) * 7]);
    return smooth(pts);
  }

  /** A loose back-and-forth scribble filling a w×h box from (x, y): crossing something out. */
  function scribblePath(x, y, w, h, opts) {
    var o = opts || {};
    var r = rng(o.seed || 4);
    var rows = Math.max(3, Math.round(h / 22));
    var pts = [];
    for (var i = 0; i <= rows; i++) {
      var yy = y + (h * i) / rows + (r() - 0.5) * 6;
      pts.push(i % 2 ? [x + w + (r() - 0.5) * 12, yy] : [x + (r() - 0.5) * 12, yy]);
    }
    return smooth(pts);
  }

  /** A hand-drawn tick in a size×size box at (x, y): a short dip, then a long flick up to the right. */
  function checkPath(x, y, s, opts) {
    var r = rng((opts && opts.seed) || 6);
    var j = function () { return (r() - 0.5) * s * 0.06; };
    return smooth([
      [x + s * 0.06 + j(), y + s * 0.52 + j()],
      [x + s * 0.24 + j(), y + s * 0.7 + j()],
      [x + s * 0.38 + j(), y + s * 0.9],
      [x + s * 0.62 + j(), y + s * 0.5 + j()],
      [x + s * 0.98 + j(), y + s * 0.04 + j()],
    ]);
  }

  /** A hand-drawn cross in a size×size box at (x, y): two strokes, the second drawn after the first. */
  function crossPath(x, y, s, opts) {
    var r = rng((opts && opts.seed) || 8);
    var j = function () { return (r() - 0.5) * s * 0.08; };
    var a = smooth([[x + j(), y + j()], [x + s * 0.5 + j(), y + s * 0.52 + j()], [x + s + j(), y + s + j()]]);
    var b = smooth([[x + s + j(), y + j()], [x + s * 0.48 + j(), y + s * 0.5 + j()], [x + j(), y + s + j()]]);
    return a + b;
  }

  /**
   * The camera over the board, for single-station frames: a slow push-in on .cg-board (smooth, not on twos) plus
   * parallax on .cg-layer elements. opts: { duration, board, push = 0.04, pan = [x, y] px at depth 1,
   * layers: [[el, depth], ...] }.
   */
  function drift(tl, opts) {
    var d = opts.duration;
    var push = opts.push == null ? 0.04 : opts.push;
    var pan = opts.pan || [0, -18];
    if (opts.board) tl.fromTo(opts.board, { scale: 1 }, { scale: 1 + push, duration: d, ease: "none" }, 0);
    (opts.layers || []).forEach(function (l) {
      tl.fromTo(l[0], { x: 0, y: 0 }, { x: pan[0] * l[1], y: pan[1] * l[1], duration: d, ease: "sine.inOut" }, 0);
    });
  }

  /**
   * The camera between stations, for boards bigger than the frame: moves .cg-camera from key to key (smooth,
   * power2.inOut by default). keys: [{ x, y, scale }, { at, duration, x, y, scale, ease }, ...]; the first key is
   * the opening framing. x/y are the camera offset in px (negative x reveals what is to the right).
   */
  function camera(tl, el, keys) {
    var prev = keys[0];
    gsap.set(el, { x: prev.x || 0, y: prev.y || 0, scale: prev.scale || 1 });
    for (var i = 1; i < keys.length; i++) {
      var k = keys[i];
      tl.fromTo(
        el,
        { x: prev.x || 0, y: prev.y || 0, scale: prev.scale || 1 },
        { x: k.x || 0, y: k.y || 0, scale: k.scale || 1, duration: k.duration || 0.9, ease: k.ease || "power2.inOut", immediateRender: false },
        k.at,
      );
      prev = k;
    }
  }

  /**
   * Slap a cut-out onto the board: it arrives lifted (bigger, turned, long soft shadow) and lands on twos.
   * el is a .cg-cut (hidden in CSS until it lands). opts: from "top" | "bottom" | "left" | "right", distance px (70),
   * rotate deg (7), scale (1.08), duration (0.42). Returns the time it has landed.
   */
  function slap(tl, el, at, opts) {
    var o = opts || {};
    var dur = o.duration || 0.42;
    var dist = o.distance == null ? 70 : o.distance;
    var from = o.from || "top";
    var rot = o.rotate == null ? 7 : o.rotate;
    var dx = from === "left" ? -dist : from === "right" ? dist : 0;
    var dy = from === "top" ? -dist : from === "bottom" ? dist : 0;
    tl.set(el, { autoAlpha: 1 }, at);
    tl.fromTo(
      el,
      { x: dx, y: dy, rotation: rot, scale: o.scale || 1.08, "--lift": 1 },
      { x: 0, y: 0, rotation: 0, scale: 1, "--lift": 0, duration: dur, ease: twos("back.out(1.5)", dur), immediateRender: false },
      at,
    );
    return at + dur;
  }

  /** Slide a piece in from off the board on twos (a longer, flatter move than slap). Returns the end time. */
  function slide(tl, el, at, opts) {
    var o = opts || {};
    var dur = o.duration || 0.5;
    var dist = o.distance == null ? 1200 : o.distance;
    var from = o.from || "left";
    var dx = from === "left" ? -dist : from === "right" ? dist : 0;
    var dy = from === "top" ? -dist : from === "bottom" ? dist : 0;
    tl.set(el, { autoAlpha: 1 }, at);
    tl.fromTo(
      el,
      { x: dx, y: dy, rotation: o.rotate || 0, "--lift": 0.6 },
      { x: 0, y: 0, rotation: 0, "--lift": 0, duration: dur, ease: twos(o.ease || "power3.out", dur), immediateRender: false },
      at,
    );
    return at + dur;
  }

  /** Lift a landed piece off the board again (exit): up, turned, shadow growing, gone. Returns the end time. */
  function lift(tl, el, at, opts) {
    var o = opts || {};
    var dur = o.duration || 0.36;
    var dist = o.distance == null ? 900 : o.distance;
    var to = o.to || "top";
    var dx = to === "left" ? -dist : to === "right" ? dist : 0;
    var dy = to === "top" ? -dist : to === "bottom" ? dist : 0;
    tl.fromTo(
      el,
      { x: 0, y: 0, rotation: 0, "--lift": 0 },
      { x: dx, y: dy, rotation: o.rotate == null ? -8 : o.rotate, "--lift": 1, duration: dur, ease: twos("power2.in", dur), immediateRender: false },
      at,
    );
    tl.set(el, { autoAlpha: 0 }, at + dur);
    return at + dur;
  }

  /**
   * Boil: held pieces re-pose on the stop-motion grid (hand-placed paper never sits perfectly still).
   * els are .cg-boil wrappers that nothing else moves. opts: amp px (1), rotate deg (0.4), fps, hold (grid frames
   * per pose, default 1).
   */
  function boil(tl, els, duration, opts) {
    var o = opts || {};
    var amp = o.amp == null ? 1 : o.amp;
    var rot = o.rotate == null ? 0.4 : o.rotate;
    var fps = o.fps || FPS;
    var hold = o.hold || 1;
    var list = Array.prototype.slice.call(els);
    function pose(t) {
      var k = Math.floor(Math.floor(t * fps + 1e-6) / hold);
      for (var i = 0; i < list.length; i++) {
        gsap.set(list[i], {
          x: (hash(k, i + 1) - 0.5) * 2 * amp,
          y: (hash(k, i + 31) - 0.5) * 2 * amp,
          rotation: (hash(k, i + 61) - 0.5) * 2 * rot,
        });
      }
    }
    var proxy = { t: 0 };
    tl.fromTo(proxy, { t: 0 }, { t: duration, duration: duration, ease: "none", onUpdate: function () { pose(proxy.t); } }, 0);
    pose(0);
  }

  /** Highlighter: the .cg-hl band grows behind its word on twos (also draws a .cg-strike over its word). Returns the end time. */
  function highlight(tl, el, at, duration) {
    var d = duration || 0.4;
    tl.fromTo(el, { scaleX: 0 }, { scaleX: 1, duration: d, ease: twos("power2.inOut", d), immediateRender: false }, at);
    return at + d;
  }

  /**
   * Marker stroke (circle, arrow, underline, strike, scribble): an SVG path draws on, on twos. Nothing is measured:
   * the path is normalised with pathLength="1". Draw in an unscaled SVG (width/height attributes in px, no viewBox
   * stretching, no vector-effect): Chrome dashes non-scaling strokes in screen space and the draw comes out partial.
   * Returns the end time.
   */
  function draw(tl, path, at, duration) {
    var d = duration || 0.5;
    path.setAttribute("pathLength", "1");
    path.style.strokeDasharray = "1 2";
    path.style.strokeDashoffset = "1.02";
    tl.fromTo(path, { strokeDashoffset: 1.02 }, { strokeDashoffset: 0, duration: d, ease: twos("power1.inOut", d), immediateRender: false }, at);
    return at + d;
  }

  /** Tape: a strip lands across a corner (hidden in CSS until then). Returns the end time. */
  function tape(tl, el, at, duration) {
    var d = duration || 0.25;
    tl.set(el, { autoAlpha: 1 }, at);
    tl.fromTo(el, { scaleX: 0.3, y: -10 }, { scaleX: 1, y: 0, duration: d, ease: twos("power3.out", d), immediateRender: false }, at);
    return at + d;
  }

  /** Stamp: thumps down from 1.6× with the ink coming in on contact (hidden in CSS until then). */
  function stamp(tl, el, at, duration) {
    var d = duration || 0.3;
    tl.set(el, { visibility: "inherit" }, at);
    tl.fromTo(el, { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: d, ease: twos("back.out(2.2)", d), immediateRender: false }, at);
    return at + d;
  }

  /** Ransom headline: .cg-chip pieces slap in one after another from alternating sides. Returns the end time. */
  function ransom(tl, chips, at, opts) {
    var o = opts || {};
    var list = Array.prototype.slice.call(chips);
    var gap = o.stagger == null ? Math.min(0.08, 0.5 / Math.max(1, list.length)) : o.stagger;
    var end = at;
    list.forEach(function (c, i) {
      end = slap(tl, c, at + i * gap, {
        distance: o.distance == null ? 36 : o.distance,
        rotate: (hash(i + 1, 7) - 0.5) * 18,
        duration: o.duration || 0.3,
        from: i % 2 ? "bottom" : "top",
      });
    });
    return end;
  }

  /**
   * Tear away: the two halves of a covering sheet (drawn with Collage.seam) lift off left and right on twos,
   * uncovering what is underneath. Returns the end time.
   */
  function tearAway(tl, left, right, at, opts) {
    var o = opts || {};
    var d = o.duration || 0.5;
    var dist = o.distance || 760;
    tl.fromTo(left, { x: 0, rotation: 0 }, { x: -dist, rotation: -9, duration: d, ease: twos("power3.in", d), immediateRender: false }, at);
    tl.fromTo(right, { x: 0, rotation: 0 }, { x: dist, rotation: 7, duration: d, ease: twos("power3.in", d), immediateRender: false }, at + 0.06);
    return at + d + 0.06;
  }

  /** Reveal a piece instantly (a hard cut-in on the beat, no move): visible from `at`. */
  function show(tl, el, at) {
    tl.set(el, { autoAlpha: 1 }, at);
    return at;
  }

  install();

  root.Collage = {
    FPS: FPS,
    css: CSS,
    install: install,
    hash: hash,
    rng: rng,
    twos: twos,
    smooth: smooth,
    tornPath: tornPath,
    seam: seam,
    sheet: sheet,
    build: build,
    circlePath: circlePath,
    arrowPath: arrowPath,
    underlinePath: underlinePath,
    scribblePath: scribblePath,
    checkPath: checkPath,
    crossPath: crossPath,
    drift: drift,
    camera: camera,
    slap: slap,
    slide: slide,
    lift: lift,
    boil: boil,
    highlight: highlight,
    draw: draw,
    tape: tape,
    stamp: stamp,
    ransom: ransom,
    tearAway: tearAway,
    show: show,
  };
})(window);
