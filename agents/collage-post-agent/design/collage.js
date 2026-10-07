/* Collage runtime.
 * 1. Builds SVG duotone/tritone + outline filters from the palette's CSS variables,
 *    so <img class="img duo-cut"> is re-coloured in the browser (and in the PNG export).
 * 2. Shrinks [data-fit] text until it fits its box (width + max-height).
 * 3. Runs layout checks and exposes them as window.__collage for the renderer.
 * 4. Scales the 1080x1350 canvas to fit the window when opened in a normal browser.
 */
(function () {
  "use strict";
  var DUOS = ["hero", "cut", "pale", "loud", "mono", "ghost", "shade", "t1", "t2", "t3", "t4", "t5", "t6"];
  var NS = "http://www.w3.org/2000/svg";
  var root = document.documentElement;

  function hexToRgb(h) {
    h = h.trim().replace("#", "");
    if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
    return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; });
  }
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function cssVar(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }

  function buildFilters() {
    var old = document.getElementById("collage-filters");
    if (old) old.remove();
    var svg = el("svg", { id: "collage-filters", width: "0", height: "0", "aria-hidden": "true",
      style: "position:absolute;width:0;height:0;overflow:hidden" });
    var defs = el("defs", {}, svg);
    DUOS.forEach(function (name) {
      var raw = cssVar("--duo-" + name);
      if (!raw) return;
      var stops = raw.split(/\s+/).filter(Boolean).map(hexToRgb);
      var f = el("filter", { id: "duo-" + name, "color-interpolation-filters": "sRGB", x: "0", y: "0", width: "100%", height: "100%" }, defs);
      el("feColorMatrix", { type: "matrix", values: ".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0" }, f);
      var ct = el("feComponentTransfer", {}, f);
      ["R", "G", "B"].forEach(function (ch, i) {
        el("feFunc" + ch, { type: "table", tableValues: stops.map(function (s) { return s[i].toFixed(4); }).join(" ") }, ct);
      });
    });
    [["ink", "--ink"], ["loud", "--loud"], ["bg", "--bg"]].forEach(function (pair) {
      var color = cssVar(pair[1]) || "#000";
      var f = el("filter", { id: "edge-" + pair[0], x: "-5%", y: "-5%", width: "110%", height: "110%", "color-interpolation-filters": "sRGB" }, defs);
      el("feMorphology", { in: "SourceAlpha", operator: "dilate", radius: "3", result: "d" }, f);
      el("feFlood", { "flood-color": color, result: "c" }, f);
      el("feComposite", { in: "c", in2: "d", operator: "in", result: "s" }, f);
      var m = el("feMerge", {}, f);
      el("feMergeNode", { in: "s" }, m);
      el("feMergeNode", { in: "SourceGraphic" }, m);
    });
    document.body.insertBefore(svg, document.body.firstChild);
  }

  function fitText() {
    var nodes = document.querySelectorAll("[data-fit]");
    nodes.forEach(function (n) {
      var cs = getComputedStyle(n);
      var size = parseFloat(cs.fontSize);
      var min = parseFloat(n.getAttribute("data-min")) || Math.round(size * 0.45);
      var guard = 200;
      var lines = n.querySelectorAll("br").length + 1;
      // Height budget: max-height if set, else a fixed height, else unlimited (width-only fit).
      var maxH = cs.maxHeight !== "none" ? parseFloat(cs.maxHeight) : (n.style.height || cs.height !== "auto" ? n.clientHeight : Infinity);
      function over() {
        // glyphs overshoot tight line-heights; allow ~15% of the font size
        // data-fit="height": rotated words may poke out sideways by design, only fit the height
        var wide = n.getAttribute("data-fit") === "height" ? false : n.scrollWidth > n.clientWidth + 2;
        // explicit <br> breaks are a promise: shrink until no line wraps on its own
        var wraps = false;
        if (lines > 1 && n.getAttribute("data-fit") !== "height") {
          var lh = parseFloat(getComputedStyle(n).lineHeight) || size;
          wraps = n.scrollHeight > lines * lh + lh * 0.45;
        }
        return n.scrollHeight > maxH + size * 0.15 || wide || wraps;
      }
      while (over() && size > min && guard-- > 0) {
        size -= 2;
        n.style.fontSize = size + "px";
      }
      n.setAttribute("data-fitted", String(size));
      if (over()) n.setAttribute("data-overflow", "1");
    });
  }

  function rect(n, canvas) {
    var r = n.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    var s = c.width / 1080;
    return { x: (r.left - c.left) / s, y: (r.top - c.top) / s, w: r.width / s, h: r.height / s };
  }
  function label(n) {
    var t = (n.textContent || "").replace(/\s+/g, " ").trim();
    return (n.className && typeof n.className === "string" ? "." + n.className.split(" ").join(".") + " " : "") + JSON.stringify(t.slice(0, 48));
  }

  function check() {
    var canvas = document.querySelector(".canvas");
    var warnings = [];
    if (!canvas) { warnings.push("No .canvas element found"); return warnings; }
    document.querySelectorAll("img").forEach(function (img) {
      if (!img.complete || img.naturalWidth === 0) warnings.push("Image failed to load: " + img.getAttribute("src"));
      if (!img.classList.contains("img")) warnings.push("Image without class 'img' (no duotone/effects): " + img.getAttribute("src"));
    });
    document.querySelectorAll("[data-overflow]").forEach(function (n) {
      warnings.push("Text still overflows its box at minimum size — shorten the copy: " + label(n));
    });
    var texts = Array.prototype.slice.call(canvas.querySelectorAll(".txt, .box, .mast"));
    texts.forEach(function (n) {
      if (n.hasAttribute("data-bleed")) return;
      var r = rect(n, canvas);
      var fs = parseFloat(getComputedStyle(n).fontSize) || 16;
      var inner = n.scrollHeight > n.clientHeight + fs * 0.2 && !n.hasAttribute("data-fit") ? " (content taller than its box)" : "";
      if (r.x < 24 || r.y < 20 || r.x + r.w > 1056 || r.y + r.h > 1330) {
        warnings.push("Text box touches/exceeds the canvas edge: " + label(n) + " at x=" + Math.round(r.x) + " y=" + Math.round(r.y) + " w=" + Math.round(r.w) + " h=" + Math.round(r.h) + inner);
      } else if (inner) warnings.push("Text overflows its box" + inner + ": " + label(n));
    });
    // text-on-text collisions (ignore nested elements)
    for (var i = 0; i < texts.length; i++) {
      for (var j = i + 1; j < texts.length; j++) {
        var a = texts[i], b = texts[j];
        if (a.contains(b) || b.contains(a)) continue;
        var ra = rect(a, canvas), rb = rect(b, canvas);
        var ix = Math.max(0, Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x));
        var iy = Math.max(0, Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y));
        var area = ix * iy, small = Math.min(ra.w * ra.h, rb.w * rb.h) || 1;
        if (area / small > 0.06) warnings.push("Text blocks overlap: " + label(a) + " ↔ " + label(b));
      }
    }
    // the headline face is whatever --serif names first (Roboto Serif, or a brand serif from the product folder)
    var serifFace = (getComputedStyle(document.documentElement).getPropertyValue("--serif").split(",")[0] || '"Roboto Serif"').trim();
    if (document.fonts && !document.fonts.check("300 100px " + serifFace)) warnings.push(serifFace.replace(/"/g, "") + " did not load");
    if (!root.getAttribute("data-palette")) warnings.push("<html> has no data-palette attribute");
    return warnings;
  }

  function previewScale() {
    if (navigator.webdriver) return; // exact pixels when rendered by the exporter
    var canvas = document.querySelector(".canvas");
    if (!canvas) return;
    var s = Math.min(1, (window.innerWidth - 32) / 1080, (window.innerHeight - 32) / 1350);
    canvas.style.transform = s < 1 ? "scale(" + s + ")" : "";
    canvas.style.marginTop = "16px";
    canvas.style.marginBottom = s < 1 ? (-(1350 * (1 - s)) + 16) + "px" : "16px";
  }

  function whenImagesReady() {
    var imgs = Array.prototype.slice.call(document.images);
    return Promise.all(imgs.map(function (img) {
      if (img.complete) return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
      return new Promise(function (res) { img.addEventListener("load", res); img.addEventListener("error", res); });
    }));
  }

  function run() {
    buildFilters();
    Promise.all([document.fonts ? document.fonts.ready : Promise.resolve(), whenImagesReady()]).then(function () {
      fitText();
      previewScale();
      window.addEventListener("resize", previewScale);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          window.__collage = { warnings: check() };
          root.setAttribute("data-ready", "1");
        });
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
