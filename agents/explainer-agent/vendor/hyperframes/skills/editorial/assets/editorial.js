/*
 * editorial.js: the cinematic editorial cut-out kit for HyperFrames frames (skills/editorial, an extension of the
 * HyperFrames skills shipped with explainer-agent). Read hyperframes-animation/rules/editorial-kit.md first.
 *
 * Load it inside the frame's <template>, right after the GSAP tag:
 *   <script src="assets/editorial/editorial.js"></script>
 * It installs the kit stylesheet (the .ed-* classes) once per document, then exposes window.Editorial.
 *
 * The look it builds: black-and-white (halftone) cut-outs on flat colour fields, giant type behind the subject,
 * line-art (rings, orbits, rays, connector lines with dots), a spotlight that dims everything but the subject,
 * a slow camera push with parallax between depth layers, film grain and a lens vignette over everything.
 * Pictures get their print look from HyperFrames' own media treatments (data-color-grading on the <img>); this kit
 * does the layout, the line-art and the motion.
 *
 * Deterministic and seek-safe by construction:
 *   - no Math.random, no Date: build-time geometry comes from a seeded generator, the live grain from a hash of the
 *     QUANTIZED timeline time (a pure function of time: the same frame on every pass);
 *   - sizes and coordinates are authored numbers (data-ed-size, data-ed-path): no layout measurement;
 *   - every move is a tween on the frame's ONE paused timeline; nothing autoplays;
 *   - no CSS clip-path, no CSS blur filter and no CSS radial-gradient (HyperFrames' heavy-overlay hazard): shapes,
 *     text fills and the spotlight are inline SVG; the vignette is an image;
 *   - pieces are hidden with opacity, never visibility (HyperFrames' media treatments skip a picture that is
 *     visibility-hidden when the page loads).
 *
 * The transform stack; each level is moved by ONE helper only, so tweens never fight:
 *   .ed-camera (Editorial.push scale / Editorial.camera) > .ed-layer (Editorial.push parallax, by data-ed-depth)
 *   > .ed-in pieces (rise / pop / grow / out / cut) > their content (static, or its own count / draw)
 */
(function (root) {
  "use strict";
  if (root.Editorial) return;

  var A = "assets/editorial/";
  var NS = "http://www.w3.org/2000/svg";

  var CSS = [
    /* ground, camera rig, layers */
    ".ed-ground{position:absolute;inset:0;background:var(--ed-ground,#F2EFE8)}",
    ".ed-camera,.ed-layer{position:absolute;inset:0}",
    ".ed-camera{transform-origin:50% 45%}",
    ".ed-grid{position:absolute;inset:-120px;background:url(" + A + "grid.svg) 0 0/60px 60px;pointer-events:none}",
    /* pieces: transparent until their entrance; .ed-shown = there from t=0. Opacity only, never visibility: a
       treated picture (data-color-grading) inside a piece hidden with visibility at load is never treated */
    ".ed-pos{position:absolute}",
    ".ed-in{opacity:0}",
    ".ed-in.ed-shown{opacity:1}",
    /* a picture cut-out: soft contact shadow; .ed-edge adds the white printed-cut-out rim */
    ".ed-cutout{position:absolute;filter:drop-shadow(0 14px 18px rgba(var(--ed-shadow,0,0,0),.28))}",
    ".ed-cutout.ed-edge{filter:drop-shadow(3px 0 0 #fff) drop-shadow(-3px 0 0 #fff) drop-shadow(0 3px 0 #fff) drop-shadow(0 -3px 0 #fff) drop-shadow(0 14px 18px rgba(var(--ed-shadow,0,0,0),.3))}",
    ".ed-cutout.ed-flat{filter:none}",
    ".ed-cutout>img{display:block;width:100%;height:100%}",
    /* flat colour fields and shapes (the SVG is drawn by Editorial.build behind the content) */
    ".ed-field{position:absolute;isolation:isolate}",
    ".ed-field:not([data-ed-shape]){background:var(--ed-field,#D9412E)}",
    ".ed-field>svg.ed-shape{position:absolute;left:0;top:0;z-index:-1;overflow:visible;pointer-events:none}",
    ".ed-bar{position:absolute;background:var(--ed-field,#D9412E);transform-origin:50% 100%}",
    /* type */
    ".ed-display{font-family:var(--ed-display,Inter,sans-serif);font-weight:800;letter-spacing:-.035em;line-height:.95}",
    ".ed-giant{font-family:var(--ed-display,Inter,sans-serif);font-weight:800;letter-spacing:-.055em;line-height:.8;white-space:nowrap;color:var(--ed-giant,var(--ed-field,#D9412E))}",
    ".ed-serif{font-family:var(--ed-serif,Georgia,serif)}",
    ".ed-mono{font-family:var(--ed-mono,'IBM Plex Mono',monospace)}",
    ".ed-label{font-family:var(--ed-mono,'IBM Plex Mono',monospace);font-size:24px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--ed-muted,#6F6C66)}",
    ".ed-greek{background:repeating-linear-gradient(to bottom,rgba(var(--ed-shadow,0,0,0),.2) 0 6px,transparent 6px 15px)}",
    /* highlighter behind one word: the band is BEFORE the word in the DOM; both positioned (no z-index) */
    ".ed-hl-word{position:relative;display:inline-block}",
    ".ed-hl-word>.ed-hl{position:absolute;left:-.08em;right:-.1em;top:.12em;bottom:.04em;background:var(--ed-mark,#FFE135);transform-origin:left center;transform:scaleX(0)}",
    ".ed-hl-word>.ed-hl-text{position:relative}",
    /* documentary callouts: the slash name tag, connector dots, line-art */
    ".ed-tag{position:absolute;display:inline-flex;align-items:center;gap:.32em;white-space:nowrap;font-family:var(--ed-display,Inter,sans-serif);font-weight:800;letter-spacing:-.02em;line-height:1;color:var(--ed-paper,#fff)}",
    ".ed-tag>.ed-slash{display:inline-block;width:.16em;height:.92em;background:var(--ed-line,#D9412E);transform:skewX(-20deg)}",
    ".ed-dot{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:var(--ed-line,#D9412E)}",
    ".ed-lines{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}",
    ".ed-lines path{fill:none;stroke:var(--ed-line,#D9412E);stroke-width:var(--ed-stroke,4px);stroke-linecap:round;stroke-linejoin:round}",
    ".ed-lines path.ed-thin{stroke-width:2px}",
    ".ed-lines path.ed-ink{stroke:var(--ed-ink,#1B1B18)}",
    ".ed-lines path.ed-paper{stroke:var(--ed-paper,#fff)}",
    ".ed-lines path.ed-fill{fill:var(--ed-line,#D9412E);stroke:none}",
    ".ed-spot{position:absolute;left:0;top:0;pointer-events:none;opacity:0}",
    /* the film finish over everything: vignette + grain (Editorial.build adds the two layers) */
    ".ed-finish{position:absolute;inset:0;pointer-events:none}",
    ".ed-finish>.ed-vignette{position:absolute;inset:0;background:url(" + A + "vignette.svg) center/100% 100% no-repeat;mix-blend-mode:multiply;opacity:var(--ed-vignette,.55)}",
    ".ed-finish>.ed-grain{position:absolute;inset:0;background:url(" + A + "film-grain.svg) 0 0/360px 360px;mix-blend-mode:multiply;opacity:var(--ed-grain,.3)}",
    ".ed-finish.ed-dark>.ed-grain{background-image:url(" + A + "film-grain-light.svg);mix-blend-mode:screen;opacity:var(--ed-grain-light,.2)}",
  ].join("\n");

  function install() {
    var d = root.document;
    if (!d || d.getElementById("ed-kit-css")) return;
    var s = d.createElement("style");
    s.id = "ed-kit-css";
    s.textContent = CSS;
    (d.head || d.documentElement).appendChild(s);
  }

  /** Sin-fold hash of integers to [0, 1). */
  function hash(a, b) {
    var x = Math.sin(a * 127.1 + (b || 0) * 311.7 + 0.5) * 43758.5453;
    return x - Math.floor(x);
  }

  /** Seeded generator for build-time geometry: same seed, same shape. */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function f1(v) {
    return (Math.round(v * 10) / 10).toString();
  }

  /** Catmull-Rom through the points as cubic Béziers (closed: wraps around). */
  function smooth(pts, closed) {
    var n = pts.length;
    var at = function (i) {
      return closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    };
    var d = "M" + f1(pts[0][0]) + " " + f1(pts[0][1]);
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = at(i - 1),
        p1 = at(i),
        p2 = at(i + 1),
        p3 = at(i + 2);
      d +=
        "C" + f1(p1[0] + (p2[0] - p0[0]) / 6) + " " + f1(p1[1] + (p2[1] - p0[1]) / 6) +
        " " + f1(p2[0] - (p3[0] - p1[0]) / 6) + " " + f1(p2[1] - (p3[1] - p1[1]) / 6) +
        " " + f1(p2[0]) + " " + f1(p2[1]);
    }
    return closed ? d + "Z" : d;
  }

  // ── shapes (w×h, local px, origin top-left) ──────────────────────────────────

  /**
   * A flat shape as an SVG path: "rect", "round [r]", "circle" (an ellipse filling w×h), "arch" (a rectangle with a
   * semicircular top: the portrait niche), "slant [deg]" (a parallelogram), "blob [seed]" (an organic silhouette).
   */
  function shapePath(kind, w, h, arg) {
    var k = kind || "rect";
    if (k === "round") {
      var r = Math.min(arg == null || isNaN(arg) ? 28 : arg, w / 2, h / 2);
      return "M" + r + " 0H" + f1(w - r) + "A" + r + " " + r + " 0 0 1 " + f1(w) + " " + r + "V" + f1(h - r) + "A" + r + " " + r + " 0 0 1 " + f1(w - r) + " " + f1(h) +
        "H" + r + "A" + r + " " + r + " 0 0 1 0 " + f1(h - r) + "V" + r + "A" + r + " " + r + " 0 0 1 " + r + " 0Z";
    }
    if (k === "circle") {
      var rx = w / 2, ry = h / 2;
      return "M0 " + f1(ry) + "A" + f1(rx) + " " + f1(ry) + " 0 1 1 " + f1(w) + " " + f1(ry) + "A" + f1(rx) + " " + f1(ry) + " 0 1 1 0 " + f1(ry) + "Z";
    }
    if (k === "arch") {
      var a = w / 2;
      return "M0 " + f1(h) + "V" + f1(a) + "A" + f1(a) + " " + f1(a) + " 0 0 1 " + f1(w) + " " + f1(a) + "V" + f1(h) + "Z";
    }
    if (k === "slant") {
      var deg = arg == null || isNaN(arg) ? 12 : arg;
      var dx = Math.tan((deg * Math.PI) / 180) * h;
      return "M" + f1(Math.max(0, dx)) + " 0H" + f1(w) + "L" + f1(w - Math.max(0, dx)) + " " + f1(h) + "H0Z";
    }
    if (k === "blob") return blobPath(w, h, arg);
    return "M0 0H" + f1(w) + "V" + f1(h) + "H0Z";
  }

  /** An organic silhouette filling w×h (seeded): soft bulges, no spikes. */
  function blobPath(w, h, seed) {
    var r = rng(seed || 3);
    var n = 9;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2;
      var k = 0.78 + r() * 0.22;
      pts.push([w / 2 + Math.cos(t) * (w / 2) * k, h / 2 + Math.sin(t) * (h / 2) * k]);
    }
    return smooth(pts, true);
  }

  // ── line-art (coordinates are px in an unscaled svg) ─────────────────────────

  /** A clean circle from 12 o'clock, clockwise (draws on from the top). */
  function ringPath(cx, cy, r) {
    return "M" + f1(cx) + " " + f1(cy - r) + "A" + f1(r) + " " + f1(r) + " 0 1 1 " + f1(cx) + " " + f1(cy + r) + "A" + f1(r) + " " + f1(r) + " 0 1 1 " + f1(cx) + " " + f1(cy - r);
  }

  /** An ellipse (an orbit) from its left point, clockwise. */
  function ellipsePath(cx, cy, rx, ry) {
    return "M" + f1(cx - rx) + " " + f1(cy) + "A" + f1(rx) + " " + f1(ry) + " 0 1 1 " + f1(cx + rx) + " " + f1(cy) + "A" + f1(rx) + " " + f1(ry) + " 0 1 1 " + f1(cx - rx) + " " + f1(cy);
  }

  /** An arc of a circle from angle a0 to a1 (degrees, 0 = 12 o'clock, clockwise): gauges, progress, a partial ring. */
  function arcPath(cx, cy, r, a0, a1) {
    var p = function (a) {
      var t = ((a - 90) * Math.PI) / 180;
      return [cx + Math.cos(t) * r, cy + Math.sin(t) * r];
    };
    var s = p(a0), e = p(a1);
    var large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    var sweep = a1 >= a0 ? 1 : 0;
    return "M" + f1(s[0]) + " " + f1(s[1]) + "A" + f1(r) + " " + f1(r) + " 0 " + large + " " + sweep + " " + f1(e[0]) + " " + f1(e[1]);
  }

  /**
   * A route through the points with rounded corners (radius r): the documentary connector ("down from the name, along,
   * up to the label"). pts = [x1, y1, x2, y2, …].
   */
  function routePath(r, pts) {
    var P = [];
    for (var i = 0; i + 1 < pts.length; i += 2) P.push([pts[i], pts[i + 1]]);
    if (P.length < 2) return "";
    var d = "M" + f1(P[0][0]) + " " + f1(P[0][1]);
    for (var j = 1; j < P.length - 1; j++) {
      var a = P[j - 1], b = P[j], c = P[j + 1];
      var l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      var l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
      var rr = Math.min(r, l1 / 2, l2 / 2);
      var p1 = [b[0] - ((b[0] - a[0]) / l1) * rr, b[1] - ((b[1] - a[1]) / l1) * rr];
      var p2 = [b[0] + ((c[0] - b[0]) / l2) * rr, b[1] + ((c[1] - b[1]) / l2) * rr];
      d += "L" + f1(p1[0]) + " " + f1(p1[1]) + "Q" + f1(b[0]) + " " + f1(b[1]) + " " + f1(p2[0]) + " " + f1(p2[1]);
    }
    var z = P[P.length - 1];
    return d + "L" + f1(z[0]) + " " + f1(z[1]);
  }

  /** n straight rays from radius r1 to r2 around (cx, cy), between angles a0 and a1 (degrees; default a full turn). */
  function raysPath(cx, cy, r1, r2, n, a0, a1) {
    var from = a0 == null || isNaN(a0) ? 0 : a0;
    var to = a1 == null || isNaN(a1) ? 360 : a1;
    var full = Math.abs(to - from) >= 360;
    var d = "";
    for (var i = 0; i < n; i++) {
      var a = from + ((to - from) * i) / (full ? n : Math.max(1, n - 1));
      var t = ((a - 90) * Math.PI) / 180;
      d += "M" + f1(cx + Math.cos(t) * r1) + " " + f1(cy + Math.sin(t) * r1) + "L" + f1(cx + Math.cos(t) * r2) + " " + f1(cy + Math.sin(t) * r2);
    }
    return d;
  }

  /** A stack of n coins (flat ellipses) w wide, rising from the base line at y, `gap` px apart: the money/amount pile. */
  function stackPath(x, y, w, n, gap) {
    var ry = w * 0.16;
    var d = "";
    for (var i = 0; i < n; i++) d += ellipsePath(x + w / 2, y - i * gap, w / 2, ry);
    return d;
  }

  /** A horizontal wave from (x, y), w wide: amplitude amp, `periods` crests (a signal, a pulse, a market). */
  function wavePath(x, y, w, amp, periods, seed) {
    var r = rng(seed || 2);
    var n = Math.max(8, Math.round(periods * 8));
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      pts.push([x + w * t, y - Math.sin(t * periods * Math.PI * 2) * amp * (0.75 + r() * 0.25)]);
    }
    return smooth(pts, false);
  }

  /** "kind numbers…" → a path d. Kinds: line, route, ring, ellipse, arc, rays, stack, wave. */
  function pathFrom(spec) {
    var parts = String(spec).trim().split(/\s+/);
    var kind = parts.shift();
    var n = parts.map(parseFloat);
    switch (kind) {
      case "line":
        return "M" + f1(n[0]) + " " + f1(n[1]) + "L" + f1(n[2]) + " " + f1(n[3]);
      case "route":
        return routePath(n[0], n.slice(1));
      case "ring":
        return ringPath(n[0], n[1], n[2]);
      case "ellipse":
        return ellipsePath(n[0], n[1], n[2], n[3]);
      case "arc":
        return arcPath(n[0], n[1], n[2], n[3], n[4]);
      case "rays":
        return raysPath(n[0], n[1], n[2], n[3], n[4], n[5], n[6]);
      case "stack":
        return stackPath(n[0], n[1], n[2], n[3], n[4]);
      case "wave":
        return wavePath(n[0], n[1], n[2], n[3], n[4], n[5]);
      default:
        return null;
    }
  }

  var uid = 0;
  function svgEl(name, attrs) {
    var e = root.document.createElementNS(NS, name);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  function size(v, dw, dh) {
    var m = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/.exec(v || "");
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [dw, dh];
  }

  function shapeOf(el, w, h) {
    var spec = String(el.getAttribute("data-ed-shape") || "rect").trim().split(/\s+/);
    return shapePath(spec[0], w, h, spec[1] == null ? undefined : parseFloat(spec[1]));
  }

  /**
   * Draw a field's shape behind its content: an SVG w×h as the element's first child, filled with data-ed-fill (default
   * var(--ed-field)). With data-ed-textfill="<words>", the shape is instead a page of those words in rows, cut to the
   * shape (paper fill, ink type): the text-filled silhouette.
   */
  function drawField(el) {
    var sz = size(el.getAttribute("data-ed-size"), 400, 400);
    var w = sz[0], h = sz[1];
    el.style.width = w + "px";
    el.style.height = h + "px";
    var old = el.querySelector(":scope > svg.ed-shape");
    if (old) old.parentNode.removeChild(old);
    var svg = svgEl("svg", { class: "ed-shape", width: w, height: h, viewBox: "0 0 " + w + " " + h, "aria-hidden": "true" });
    var d = shapeOf(el, w, h);
    var words = el.getAttribute("data-ed-textfill");
    if (words == null) {
      var p = svgEl("path", { d: d });
      p.style.fill = el.getAttribute("data-ed-fill") || "var(--ed-field, #D9412E)";
      svg.appendChild(p);
    } else {
      var id = "ed-clip-" + ++uid;
      var defs = svgEl("defs", {});
      var cp = svgEl("clipPath", { id: id });
      cp.appendChild(svgEl("path", { d: d }));
      defs.appendChild(cp);
      svg.appendChild(defs);
      var g = svgEl("g", { "clip-path": "url(#" + id + ")" });
      var bg = svgEl("path", { d: d });
      bg.style.fill = el.getAttribute("data-ed-fill") || "var(--ed-paper, #FFFFFF)";
      g.appendChild(bg);
      var fs = parseFloat(el.getAttribute("data-ed-font-size") || "22");
      var angle = parseFloat(el.getAttribute("data-ed-angle") || "-8");
      var phrase = String(words || "").replace(/\s+/g, " ").trim() || "—";
      var perRow = Math.ceil((Math.hypot(w, h) * 1.2) / Math.max(1, phrase.length * fs * 0.5)) + 1;
      var row = new Array(perRow + 1).join(phrase + "  ");
      var rows = svgEl("g", { transform: "rotate(" + angle + " " + f1(w / 2) + " " + f1(h / 2) + ")" });
      var lh = fs * 1.36;
      var span = Math.hypot(w, h);
      for (var y = h / 2 - span / 2, i = 0; y < h / 2 + span / 2 + lh; y += lh, i++) {
        var t = svgEl("text", { x: f1(w / 2 - span / 2 - (i % 3) * fs * 1.7), y: f1(y) });
        t.textContent = row;
        t.style.fill = el.getAttribute("data-ed-ink") || "var(--ed-ink, #1B1B18)";
        t.style.fontFamily = "var(--ed-serif, Georgia, serif)";
        t.style.fontSize = fs + "px";
        rows.appendChild(t);
      }
      g.appendChild(rows);
      svg.appendChild(g);
    }
    el.insertBefore(svg, el.firstChild);
    return svg;
  }

  /**
   * The spotlight: an SVG over the frame (w×h = the composition) darkening everything but a circle at (cx, cy) with
   * radius r. data-ed-spot="cx cy r" on an empty <div class="ed-spot" id="…">; Editorial.focus fades it in.
   */
  function drawSpot(el, w, h) {
    var spec = String(el.getAttribute("data-ed-spot")).trim().split(/\s+/).map(parseFloat);
    var id = "ed-spot-" + ++uid;
    el.innerHTML = "";
    var svg = svgEl("svg", { width: w, height: h, viewBox: "0 0 " + w + " " + h, "aria-hidden": "true" });
    var defs = svgEl("defs", {});
    var mask = svgEl("mask", { id: id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: w, height: h });
    mask.appendChild(svgEl("rect", { width: w, height: h, fill: "#fff" }));
    var hole = svgEl("circle", { class: "ed-hole", cx: spec[0], cy: spec[1], r: spec[2], fill: "#000" });
    mask.appendChild(hole);
    defs.appendChild(mask);
    svg.appendChild(defs);
    var shade = svgEl("rect", { width: w, height: h, mask: "url(#" + id + ")" });
    shade.style.fill = el.getAttribute("data-ed-fill") || "var(--ed-ink, #111111)";
    svg.appendChild(shade);
    el.appendChild(svg);
    el.style.width = w + "px";
    el.style.height = h + "px";
    return svg;
  }

  function rootSize(scope) {
    var host = scope.matches && scope.matches("[data-composition-id]") ? scope : scope.querySelector("[data-composition-id]") || scope;
    return [parseFloat(host.getAttribute("data-width")) || 1080, parseFloat(host.getAttribute("data-height")) || 1350];
  }

  /**
   * Declarative set-up for everything inside scope (the frame root), once, before the timeline is built:
   *   .ed-field[data-ed-shape]   a flat shape (data-ed-size, data-ed-fill; data-ed-textfill for a page of words)
   *   path[data-ed-path]         line-art from a generator (see pathFrom)
   *   g[data-ed-rings]           "cx cy r0 step n [ratio]": n concentric rings (ratio < 1 = orbits), one path each
   *   .ed-spot[data-ed-spot]     the spotlight ("cx cy r")
   *   .ed-finish                 the film finish: a vignette and a grain layer
   */
  function build(scope) {
    var i;
    var fields = scope.querySelectorAll(".ed-field[data-ed-shape]");
    for (i = 0; i < fields.length; i++) drawField(fields[i]);
    var paths = scope.querySelectorAll("path[data-ed-path]");
    for (i = 0; i < paths.length; i++) {
      var d = pathFrom(paths[i].getAttribute("data-ed-path"));
      if (d) paths[i].setAttribute("d", d);
    }
    var groups = scope.querySelectorAll("g[data-ed-rings]");
    for (i = 0; i < groups.length; i++) {
      var g = groups[i];
      var n = String(g.getAttribute("data-ed-rings")).trim().split(/\s+/).map(parseFloat);
      while (g.firstChild) g.removeChild(g.firstChild);
      var ratio = isNaN(n[5]) ? 1 : n[5];
      for (var k = 0; k < n[4]; k++) {
        var r = n[2] + k * n[3];
        g.appendChild(svgEl("path", { d: ratio === 1 ? ringPath(n[0], n[1], r) : ellipsePath(n[0], n[1], r, r * ratio), class: g.getAttribute("data-ed-class") || "" }));
      }
    }
    var wh = rootSize(scope);
    var spots = scope.querySelectorAll(".ed-spot[data-ed-spot]");
    for (i = 0; i < spots.length; i++) drawSpot(spots[i], wh[0], wh[1]);
    var finishes = scope.querySelectorAll(".ed-finish");
    for (i = 0; i < finishes.length; i++) {
      var f = finishes[i];
      if (f.querySelector(":scope > .ed-grain")) continue;
      var v = root.document.createElement("div");
      v.className = "ed-vignette";
      var gr = root.document.createElement("div");
      gr.className = "ed-grain";
      f.appendChild(v);
      f.appendChild(gr);
    }
  }

  // ── motion ────────────────────────────────────────────────────────────────────

  function list(els) {
    if (!els) return [];
    if (els.length != null && !els.tagName) return Array.prototype.slice.call(els);
    return [els];
  }

  function offset(dir, dist) {
    return [dir === "left" ? -dist : dir === "right" ? dist : 0, dir === "top" ? -dist : dir === "bottom" ? dist : 0];
  }

  /**
   * The camera for a single-shot frame: a slow push on .ed-camera (scale 1 → 1 + push) and parallax on every
   * .ed-layer inside it, each moved by its data-ed-depth (0 = still, 1 = full pan; back layers small, front large).
   * opts: { duration, push = 0.05, pan = [x, y] px at depth 1 (default [0, -26]), ease = "sine.inOut", from = 0,
   * camera = the .ed-camera to push (default: the first in scope; pass the inner one when an outer rig reframes) }.
   */
  function push(tl, scope, opts) {
    var o = opts || {};
    var d = o.duration;
    var at = o.from || 0;
    var cam = o.camera || scope.querySelector(".ed-camera");
    var amount = o.push == null ? 0.05 : o.push;
    var pan = o.pan || [0, -26];
    var ease = o.ease || "sine.inOut";
    if (cam && amount) tl.fromTo(cam, { scale: 1 }, { scale: 1 + amount, duration: d, ease: ease, immediateRender: false }, at);
    var layers = (o.camera || scope).querySelectorAll(".ed-layer");
    for (var i = 0; i < layers.length; i++) {
      var depth = parseFloat(layers[i].getAttribute("data-ed-depth") || "0");
      if (!depth) continue;
      tl.fromTo(layers[i], { x: 0, y: 0 }, { x: pan[0] * depth, y: pan[1] * depth, duration: d, ease: ease, immediateRender: false }, at);
    }
  }

  /**
   * The camera between framings: moves .ed-camera from key to key. keys: [{ x, y, scale }, { at, duration, x, y,
   * scale, ease }, …]; the first key is the opening framing. A key with a big scale on a point is a zoom-through:
   * end the frame there and cut to a frame whose ground is the colour you zoomed into.
   */
  function camera(tl, el, keys) {
    var prev = keys[0];
    gsap.set(el, { x: prev.x || 0, y: prev.y || 0, scale: prev.scale || 1 });
    for (var i = 1; i < keys.length; i++) {
      var k = keys[i];
      tl.fromTo(
        el,
        { x: prev.x || 0, y: prev.y || 0, scale: prev.scale || 1 },
        { x: k.x || 0, y: k.y || 0, scale: k.scale || 1, duration: k.duration || 1, ease: k.ease || "power3.inOut", immediateRender: false },
        k.at,
      );
      prev = k;
    }
  }

  /**
   * Rise: a piece slides in a short way and fades up (the default entrance for cut-outs, type and panels).
   * opts: from "bottom" | "top" | "left" | "right" (bottom), distance px (60), duration (0.8), ease ("expo.out"),
   * scale (start scale, 1), stagger (s between several pieces, 0.08). Returns the time the last one has landed.
   */
  function rise(tl, els, at, opts) {
    var o = opts || {};
    var dur = o.duration || 0.8;
    var gap = o.stagger == null ? 0.08 : o.stagger;
    var xy = offset(o.from || "bottom", o.distance == null ? 60 : o.distance);
    var items = list(els);
    items.forEach(function (el, i) {
      var t = at + i * gap;
      tl.fromTo(el, { x: xy[0], y: xy[1], opacity: 0, scale: o.scale || 1 }, { x: 0, y: 0, opacity: 1, scale: 1, duration: dur, ease: o.ease || "expo.out", immediateRender: false }, t);
    });
    return at + Math.max(0, items.length - 1) * gap + dur;
  }

  /** Pop: a small piece scales in with a little overshoot (dots, labels, stickers, rays). Returns the end time. */
  function pop(tl, els, at, opts) {
    var o = opts || {};
    var dur = o.duration || 0.5;
    var gap = o.stagger == null ? 0.06 : o.stagger;
    var items = list(els);
    items.forEach(function (el, i) {
      var t = at + i * gap;
      tl.fromTo(el, { scale: o.scale == null ? 0.4 : o.scale, opacity: 0 }, { scale: 1, opacity: 1, duration: dur, ease: o.ease || "back.out(2)", immediateRender: false }, t);
    });
    return at + Math.max(0, items.length - 1) * gap + dur;
  }

  /**
   * Grow: a field, band, bar, rule or highlight wipes in by scaling from one edge ("left", "right", "top", "bottom")
   * or from its centre ("center": an iris for a circle field). opts: from, duration (0.7), ease ("expo.inOut"),
   * stagger (0.08). Returns the end time.
   */
  function grow(tl, els, at, opts) {
    var o = opts || {};
    var dur = o.duration || 0.7;
    var gap = o.stagger == null ? 0.08 : o.stagger;
    var from = o.from || "left";
    var origin = { left: "0% 50%", right: "100% 50%", top: "50% 0%", bottom: "50% 100%", center: "50% 50%" }[from] || "0% 50%";
    var start = from === "left" || from === "right" ? { scaleX: 0 } : from === "center" ? { scale: 0 } : { scaleY: 0 };
    var end = from === "left" || from === "right" ? { scaleX: 1 } : from === "center" ? { scale: 1 } : { scaleY: 1 };
    var items = list(els);
    items.forEach(function (el, i) {
      var t = at + i * gap;
      gsap.set(el, { transformOrigin: origin });
      tl.set(el, { opacity: 1 }, t);
      tl.fromTo(el, start, Object.assign({ duration: dur, ease: o.ease || "expo.inOut", immediateRender: false }, end), t);
    });
    return at + Math.max(0, items.length - 1) * gap + dur;
  }

  /** Out: a piece leaves (slides a little and fades out). opts: to, distance (40), duration (0.45). Returns the end time. */
  function out(tl, els, at, opts) {
    var o = opts || {};
    var dur = o.duration || 0.45;
    var xy = offset(o.to || "top", o.distance == null ? 40 : o.distance);
    var items = list(els);
    items.forEach(function (el) {
      tl.fromTo(el, { x: 0, y: 0, opacity: 1 }, { x: xy[0], y: xy[1], opacity: 0, duration: dur, ease: o.ease || "power2.in", immediateRender: false }, at);
    });
    return at + dur;
  }

  /** Cut: a hard cut-in on the beat (no move): visible from `at`. */
  function cut(tl, els, at) {
    list(els).forEach(function (el) {
      tl.set(el, { opacity: 1 }, at);
    });
    return at;
  }

  /**
   * Draw: line-art draws on (rings, orbits, connectors, arcs, waves). Nothing is measured: each path is normalised
   * with pathLength="1". Draw in an UNSCALED svg (width/height attributes in px, no viewBox stretch, no vector-effect).
   * opts: a number (duration) or { duration (0.9), ease ("power2.inOut"), stagger (0.1) }. Returns the end time.
   */
  function draw(tl, paths, at, opts) {
    var o = typeof opts === "number" ? { duration: opts } : opts || {};
    var dur = o.duration || 0.9;
    var gap = o.stagger == null ? 0.1 : o.stagger;
    var items = list(paths);
    items.forEach(function (p, i) {
      p.setAttribute("pathLength", "1");
      p.style.strokeDasharray = "1 2";
      p.style.strokeDashoffset = "1.002";
      tl.fromTo(p, { strokeDashoffset: 1.002 }, { strokeDashoffset: 0, duration: dur, ease: o.ease || "power2.inOut", immediateRender: false }, at + i * gap);
    });
    return at + Math.max(0, items.length - 1) * gap + dur;
  }

  /** Highlighter: the .ed-hl band sweeps in behind its word. Returns the end time. */
  function highlight(tl, el, at, duration) {
    var d = duration || 0.5;
    tl.fromTo(el, { scaleX: 0 }, { scaleX: 1, duration: d, ease: "power2.inOut", immediateRender: false }, at);
    return at + d;
  }

  /**
   * Focus: the spotlight (.ed-spot) fades in to `dim` while its hole closes from `from`× its radius to the
   * radius: everything but the subject sinks into shadow. opts: dim (0.7), duration (0.8), from (2.4).
   * Returns the end time.
   */
  function focus(tl, spot, at, opts) {
    var o = opts || {};
    var d = o.duration || 0.8;
    var hole = spot.querySelector(".ed-hole");
    var r = hole ? parseFloat(hole.getAttribute("r")) : 0;
    tl.fromTo(spot, { opacity: 0 }, { opacity: o.dim == null ? 0.7 : o.dim, duration: d, ease: "power2.inOut", immediateRender: false }, at);
    if (hole) tl.fromTo(hole, { attr: { r: r * (o.from || 2.4) } }, { attr: { r: r }, duration: d, ease: "power3.inOut", immediateRender: false }, at);
    return at + d;
  }

  /** Unfocus: the spotlight lifts again. Returns the end time. */
  function unfocus(tl, spot, at, duration) {
    var d = duration || 0.6;
    tl.to(spot, { opacity: 0, duration: d, ease: "power2.inOut" }, at);
    return at + d;
  }

  /**
   * Connect: the documentary callout. The first dot pops, the connector draws, the second dot pops, the label
   * rises. c: { from: dot, path: svg path, to: dot, label: el } (any may be left out). opts.duration: the draw (0.9).
   * Returns the end time.
   */
  function connect(tl, c, at, opts) {
    var o = opts || {};
    var t = at;
    if (c.from) t = pop(tl, c.from, t, { duration: 0.35 }) - 0.15;
    if (c.path) t = draw(tl, c.path, t, { duration: o.duration || 0.9, ease: "power2.inOut" });
    if (c.to) t = pop(tl, c.to, t - 0.1, { duration: 0.35 });
    if (c.label) t = rise(tl, c.label, t - 0.15, { distance: 24, duration: 0.6 });
    return t;
  }

  function formatNumber(v, decimals, sep) {
    var s = Math.abs(v).toFixed(decimals || 0);
    var parts = s.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep == null ? "," : sep);
    return (v < 0 ? "−" : "") + parts.join(".");
  }

  /**
   * Count: a number counts up (or down) to its value as the tween plays; the text is a pure function of the
   * tween's progress, so seeking shows the right digits. opts: from (0), to (required), duration (1.2), decimals (0),
   * prefix, suffix, separator (","), ease ("power2.out"). Returns the end time.
   */
  function count(tl, el, at, opts) {
    var o = opts || {};
    var d = o.duration || 1.2;
    var from = o.from || 0;
    var to = o.to;
    var write = function (v) {
      el.textContent = (o.prefix || "") + formatNumber(v, o.decimals, o.separator) + (o.suffix || "");
    };
    var proxy = { v: from };
    write(from);
    tl.fromTo(proxy, { v: from }, { v: to, duration: d, ease: o.ease || "power2.out", immediateRender: false, onUpdate: function () { write(proxy.v); } }, at);
    return at + d;
  }

  /**
   * Live grain: the film grain jumps to a new position 12 times a second, like projected film. A pure function of
   * the quantized time (seek-safe). Call once per frame: Editorial.grain(tl, R, duration).
   */
  function grain(tl, scope, duration, opts) {
    var o = opts || {};
    var fps = o.fps || 12;
    var layers = list(scope.querySelectorAll(".ed-finish > .ed-grain"));
    if (!layers.length) return;
    function pose(t) {
      var k = Math.floor(t * fps + 1e-6);
      var x = Math.round(hash(k, 3) * 360) + "px " + Math.round(hash(k, 11) * 360) + "px";
      for (var i = 0; i < layers.length; i++) layers[i].style.backgroundPosition = x;
    }
    var proxy = { t: 0 };
    tl.fromTo(proxy, { t: 0 }, { t: duration, duration: duration, ease: "none", immediateRender: false, onUpdate: function () { pose(proxy.t); } }, 0);
    pose(0);
  }

  install();

  root.Editorial = {
    css: CSS,
    install: install,
    hash: hash,
    rng: rng,
    smooth: smooth,
    shapePath: shapePath,
    blobPath: blobPath,
    ringPath: ringPath,
    ellipsePath: ellipsePath,
    arcPath: arcPath,
    routePath: routePath,
    raysPath: raysPath,
    stackPath: stackPath,
    wavePath: wavePath,
    pathFrom: pathFrom,
    formatNumber: formatNumber,
    build: build,
    push: push,
    camera: camera,
    rise: rise,
    pop: pop,
    grow: grow,
    out: out,
    cut: cut,
    draw: draw,
    highlight: highlight,
    focus: focus,
    unfocus: unfocus,
    connect: connect,
    count: count,
    grain: grain,
  };
})(window);
