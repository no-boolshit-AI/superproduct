// Offline placeholder imagery so the whole pipeline runs without an OpenAI key
// (IMAGE_MOCK=1 or no OPENAI_API_KEY). Scenes are drawn with CSS and screenshotted.
import type { Brand } from "../config.js";
import type { ImageRequest } from "./generate.js";
import { renderHtmlString } from "../render/renderer.js";

function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

function shelves(brand: Brand, rnd: () => number) {
  const c = brand.colors;
  const bottle = (x: number, w: number, h: number, base: number, tone: number, cap: boolean) => {
    const shade = `linear-gradient(90deg,
      color-mix(in srgb,${c.primaryDeep} ${70 - tone}%, #050a40) 0%,
      color-mix(in srgb,${c.primary} 92%, #fff ${tone / 3}%) 38%,
      color-mix(in srgb,${c.primaryLight} 80%, ${c.violet}) 52%,
      ${c.primary} 66%, color-mix(in srgb,${c.primaryDeep} 85%, #000) 100%)`;
    return `<div style="position:absolute;left:${x}vw;bottom:${base}vh;width:${w}vw;height:${h}vh;border-radius:${w * 0.28}vw ${w * 0.28}vw ${w * 0.08}vw ${w * 0.08}vw;background:${shade};box-shadow:0 1vh 3vh rgba(0,0,40,.45)">
      ${cap ? `<div style="position:absolute;left:28%;right:28%;top:-${h * 0.09}vh;height:${h * 0.11}vh;border-radius:.6vw .6vw .2vw .2vw;background:${shade}"></div>` : ""}
    </div>`;
  };
  let html = "";
  for (const [base, hMin] of [[66, 24], [33, 22], [-2, 26]] as const) {
    html += `<div style="position:absolute;left:0;right:0;bottom:${base - 1.6}vh;height:1.8vh;background:linear-gradient(${c.primaryLight},${c.primaryDeep});opacity:.9"></div>`;
    let x = -4 + rnd() * 4;
    while (x < 100) {
      const w = 11 + rnd() * 8;
      html += bottle(x, w, hMin + rnd() * 10, base, Math.round(rnd() * 30), rnd() > 0.35);
      x += w + 2 + rnd() * 5;
    }
  }
  return `<div style="position:absolute;inset:0;background:radial-gradient(80% 60% at 60% 40%, ${c.primary}, ${c.primaryDeep} 70%, #0b1250)">${html}</div>`;
}

function photo(brand: Brand) {
  const c = brand.colors;
  const person = (x: number, skin: string, hair: string, top: string, scale: number, flip = false) => `
    <div style="position:absolute;left:${x}vw;bottom:-6vh;width:${34 * scale}vw;height:${86 * scale}vh;${flip ? "transform:scaleX(-1)" : ""}">
      <div style="position:absolute;left:18%;right:18%;bottom:0;height:52%;border-radius:45% 45% 0 0;background:${top};box-shadow:inset -2vw 0 4vw rgba(0,0,0,.08)"></div>
      <div style="position:absolute;left:39%;width:22%;bottom:48%;height:10%;background:${skin}"></div>
      <div style="position:absolute;left:30%;width:40%;top:6%;height:38%;border-radius:46% 46% 44% 44%;background:${skin}"></div>
      <div style="position:absolute;left:26%;width:48%;top:2%;height:30%;border-radius:50% 50% 30% 30%;background:${hair}"></div>
    </div>`;
  return `<div style="position:absolute;inset:0;background:linear-gradient(100deg,#e9e6f4 0%,#f6f3ef 40%,#dcd6ee 100%)">
    ${[6, 20, 64, 80].map((x, i) => `<div style="position:absolute;left:${x}vw;top:0;bottom:0;width:${6 + i * 2}vw;background:${i % 2 ? "#c8bfe8" : "#fff"};filter:blur(2.4vw);opacity:.85"></div>`).join("")}
    <div style="position:absolute;left:0;top:18vh;width:12vw;height:42vh;background:${c.primary};opacity:.35;filter:blur(1.6vw)"></div>
    <div style="position:absolute;inset:0;filter:blur(0.25vw)">
      ${person(16, "#d9a990", "#2c211c", "#f4efe6", 1)}
      ${person(58, "#c58f6e", "#16120f", "#f1ece2", 1.04, true)}
    </div>
  </div>`;
}

function abstract(brand: Brand) {
  const c = brand.colors;
  const sphere = (x: number, y: number, d: number) =>
    `<div style="position:absolute;left:${x}vw;top:${y}vh;width:${d}vw;height:${d}vw;border-radius:50%;background:radial-gradient(circle at 32% 28%, ${c.primaryLight}, ${c.primary} 45%, ${c.primaryDeep} 100%);box-shadow:0 3vh 6vh rgba(0,0,50,.4)"></div>`;
  const arch = (x: number, w: number, h: number) =>
    `<div style="position:absolute;left:${x}vw;bottom:0;width:${w}vw;height:${h}vh;border-radius:${w / 2}vw ${w / 2}vw 0 0;background:linear-gradient(90deg, ${c.primaryDeep}, ${c.primary} 45%, ${c.primaryLight} 60%, ${c.primaryDeep})"></div>`;
  return `<div style="position:absolute;inset:0;background:linear-gradient(160deg, ${c.primary}, ${c.primaryDeep} 70%, #0b1250)">
    ${arch(-6, 30, 62)}${arch(70, 34, 74)}${arch(28, 22, 34)}${sphere(60, 10, 18)}${sphere(8, 12, 10)}${sphere(46, 66, 9)}
  </div>`;
}

function cutout(brand: Brand) {
  const c = brand.colors;
  return `<div style="position:absolute;left:34vw;right:34vw;top:14vh;bottom:8vh;border-radius:12vw 12vw 3vw 3vw;
    background:linear-gradient(90deg, ${c.primaryDeep}, ${c.primary} 40%, ${c.primaryLight} 55%, ${c.primary} 70%, ${c.primaryDeep})"></div>
    <div style="position:absolute;left:43vw;right:43vw;top:6vh;height:10vh;border-radius:1vw;background:${c.primaryDeep}"></div>`;
}

function stillLife(brand: Brand) {
  const c = brand.colors;
  return `<div style="position:absolute;inset:0;background:linear-gradient(180deg,#1b2350 0%,#3a3f8f 45%,#c86a4a 78%,#f0a060 100%)">
    <div style="position:absolute;left:-10vw;top:22vh;width:34vw;height:46vh;border-radius:50%;background:radial-gradient(circle,#ffb27a,#ff6a3d 40%,transparent 70%);filter:blur(3vw);opacity:.85"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:34vh;background:linear-gradient(180deg,#3b2b3a,#140f1c)"></div>
    <div style="position:absolute;left:30vw;right:30vw;bottom:24vh;height:42vh;border-radius:2.4vw;background:linear-gradient(180deg,#0e1020,#1c2244);box-shadow:0 0 0 .5vw #2a2e44,0 4vh 8vh rgba(0,0,0,.6)">
      <div style="position:absolute;inset:1.2vw 1.2vw 9vh;border-radius:1.2vw;background:linear-gradient(180deg,${c.primaryLight},#ffb07a 70%,#ff7a4a);opacity:.95"></div>
    </div>
    <div style="position:absolute;left:24vw;right:24vw;bottom:20vh;height:5vh;border-radius:1vw;background:linear-gradient(180deg,#2a2e44,#0a0b14)"></div>
  </div>`;
}

function illustration(brand: Brand, rnd: () => number) {
  const c = brand.colors;
  const blobs = [0, 1, 2, 3, 4]
    .map((i) => `<div style="position:absolute;left:${8 + i * 18 + rnd() * 6}vw;bottom:${-8 + rnd() * 6}vh;width:${16 + rnd() * 6}vw;height:${44 + rnd() * 18}vh;border-radius:9vw 9vw 2vw 2vw;background:${["#ff8a5c", "#ffe066", "#ffffff", c.primaryLight, "#a6f0c6"][i]}"></div>
      <div style="position:absolute;left:${11.5 + i * 18 + rnd() * 4}vw;bottom:${40 + rnd() * 12}vh;width:9vw;height:9vw;border-radius:50%;background:#f3c9a8"></div>`)
    .join("");
  return `<div style="position:absolute;inset:0;background:${c.primary}">${blobs}</div>`;
}

const SKIN = ["#e8b896", "#c68e6c", "#8d5a3b", "#f1c7a4"];
const HAIR = ["#2b1d16", "#5a3a22", "#141414", "#a8683a"];

function headshot(rnd: () => number) {
  const k = Math.floor(rnd() * 4);
  return `<div style="position:absolute;inset:0;background:linear-gradient(160deg,${["#d9dce8", "#e9e0d6", "#cfe3df", "#e6d8e8"][k]},#b9bccb)">
    <div style="position:absolute;left:18vw;right:18vw;bottom:-6vh;height:42vh;border-radius:40vw 40vw 0 0;background:${["#2f3a55", "#e8e2d6", "#6b3f3a", "#3c5a4c"][k]}"></div>
    <div style="position:absolute;left:41vw;width:18vw;bottom:30vh;height:12vh;background:${SKIN[k]}"></div>
    <div style="position:absolute;left:32vw;width:36vw;top:16vh;height:46vh;border-radius:48% 48% 44% 44%;background:${SKIN[k]}"></div>
    <div style="position:absolute;left:29vw;width:42vw;top:10vh;height:${26 + rnd() * 14}vh;border-radius:50% 50% 34% 34%;background:${HAIR[k]}"></div>
  </div>`;
}

function personCutout(rnd: () => number) {
  const k = Math.floor(rnd() * 4);
  return `<div style="position:absolute;left:14vw;right:14vw;bottom:0;height:46vh;border-radius:30vw 30vw 0 0;background:${["#22252b", "#2f3a55", "#3c3c3c", "#4a3b5c"][k]}"></div>
    <div style="position:absolute;left:41vw;width:18vw;bottom:42vh;height:10vh;background:${SKIN[k]}"></div>
    <div style="position:absolute;left:31vw;width:38vw;top:8vh;height:44vh;border-radius:48% 48% 44% 44%;background:${SKIN[k]}"></div>
    <div style="position:absolute;left:29vw;width:42vw;top:4vh;height:22vh;border-radius:50% 50% 30% 30%;background:${HAIR[k]}"></div>`;
}

/** A generic web page screenshot (bars for text, no words), for galleries and tests. */
export function mockScreenHtml(brand: Brand) {
  const c = brand.colors;
  const bar = (w: number, h = 1.6, col = "#d9d9df") => `<div style="width:${w}vw;height:${h}vh;border-radius:1vh;background:${col}"></div>`;
  return `<html><body style="margin:0;width:100vw;height:100vh;overflow:hidden;background:#fff;font-family:system-ui">
    <div style="display:flex;align-items:center;gap:3vw;padding:2.4vh 4vw;border-bottom:1px solid #eee">
      <div style="width:3vw;height:3vw;border-radius:.8vw;background:${c.primary}"></div>${bar(8, 1.4)}${bar(6, 1.4)}${bar(6, 1.4)}${bar(6, 1.4)}
      <div style="margin-left:auto;display:flex;gap:1.4vw">${bar(7, 4.4, "#eee")}${bar(9, 4.4, c.primary)}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:2.6vh;padding:9vh 0 0">
      ${bar(46, 6, "#1d1d22")}${bar(38, 6, "#1d1d22")}${bar(52, 1.8)}${bar(44, 1.8)}
      <div style="display:flex;gap:1.6vw;margin-top:3vh">${bar(22, 6, "#f1f1f4")}${bar(12, 6, c.primary)}</div>
      <div style="display:flex;gap:2vw;margin-top:6vh">${[0, 1, 2].map(() => `<div style="width:26vw;height:30vh;border-radius:1.4vw;background:linear-gradient(160deg,#f3f3f7,#e3e5ef)"></div>`).join("")}</div>
    </div></body></html>`;
}

export async function mockImage(req: ImageRequest, size: string, brand: Brand): Promise<Buffer> {
  const [w, h] = size.split("x").map(Number);
  // Render at ≤1280px on the long edge to keep mock runs fast.
  const k = Math.min(1, 1280 / Math.max(w, h));
  const width = Math.round(w * k), height = Math.round(h * k);
  const rnd = seeded(req.name + req.prompt);
  const person = /\b(person|portrait|headshot|face|speaker|author|man|woman)\b/i.test(req.prompt);
  const scene =
    req.style === "photo" ? (person && req.aspect === "square" ? headshot(rnd) : photo(brand))
    : req.style === "still-life" ? stillLife(brand)
    : req.style === "illustration" ? illustration(brand, rnd)
    : req.style === "abstract" ? abstract(brand)
    : req.style === "cutout" ? (person ? personCutout(rnd) : cutout(brand))
    : shelves(brand, rnd);
  const html = `<html><body style="margin:0;width:100vw;height:100vh;overflow:hidden;position:relative;${req.style === "cutout" ? "background:transparent" : ""}">${scene}</body></html>`;
  return renderHtmlString(html, {
    width, height,
    type: req.style === "cutout" ? "png" : "jpeg",
    quality: 90,
    transparent: req.style === "cutout",
  });
}
