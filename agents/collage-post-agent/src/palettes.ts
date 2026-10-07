/**
 * Palette system.
 *
 * The layout templates are drawn in ONE palette (`orchid`: hot orchid type on espresso,
 * signal-red loud slide). The collage *system* is palette-agnostic: every colour on a slide comes
 * from these tokens, and every image is re-coloured in HTML with duotone/tritone
 * filters built from the same tokens. So switching palette re-skins text, shapes AND
 * photos without regenerating anything.
 *
 * Source of truth for design/palettes.css (run `npm run build:design`).
 */

export type Mode = "dark" | "light";

export interface PaletteBase {
  name: string;
  label: string;
  /** When the agent should pick it. */
  mood: string;
  mode: Mode;
  /** Canvas background (near-black, tinted). */
  bg: string;
  /** Primary type + line colour (the bright accent). */
  ink: string;
  /** Pale tint of ink: body copy on the loud background. */
  ink2: string;
  /** Saturated background of the "loud" slide (lineage layout). */
  loud: string;
  /** Deep secondary for wedges / bars. */
  deep: string;
  /** Large angular slab behind cutouts (layered collage). */
  slab: string;
  /** Filmstrip frame colour. */
  frame: string;
  /** Text colour on an ink-filled band. */
  onInk: string;
}

export type Stops = [string, string] | [string, string, string] | [string, string, string, string];

export interface Palette extends PaletteBase {
  duo: Record<DuoName, Stops>;
}

export const DUO_NAMES = [
  "hero", // full-bleed cover image: dark, moody, low-key
  "cut", // main cutout portrait: saturated mid, pale highlights
  "pale", // secondary cutout: deep shadows, very pale highlights
  "loud", // filmstrip / loud frames: loud -> ink
  "mono", // neutral greyscale (cards on ink squares, multiply)
  "ghost", // background texture at low opacity
  "shade", // torn background fragments, almost-black
  "t1", "t2", "t3", "t4", "t5", "t6", // mosaic tile tints
] as const;
export type DuoName = (typeof DUO_NAMES)[number];

// ---------- colour helpers ----------
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
}
function hex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("");
}
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a), B = rgb(b);
  return hex(A.map((v, i) => v + (B[i] - v) * t));
}
export const darken = (c: string, t: number) => mix(c, "#000000", t);
export const lighten = (c: string, t: number) => mix(c, "#ffffff", t);

function luminance(c: string): number {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---------- duotone derivation ----------
function deriveDuo(p: PaletteBase): Record<DuoName, Stops> {
  if (p.mode === "light") {
    // Light palettes: images print dark-on-paper.
    return {
      // faded print: keeps dark headline type readable on top of the image
      hero: [mix(p.ink, p.bg, 0.42), mix(p.bg, p.loud, 0.22), lighten(p.bg, 0.35)],
      cut: [p.ink, mix(p.ink, p.loud, 0.6), lighten(p.bg, 0.4)],
      pale: [p.deep, mix(p.deep, p.bg, 0.55), lighten(p.bg, 0.5)],
      loud: [darken(p.loud, 0.45), p.loud, lighten(p.ink2, 0.2)],
      mono: [p.ink, "#8a8580", "#f6f3ee"],
      ghost: [mix(p.bg, p.ink, 0.35), p.bg],
      shade: [mix(p.bg, p.deep, 0.35), p.bg],
      t1: [p.ink, p.bg],
      t2: [darken(p.loud, 0.5), lighten(p.loud, 0.55)],
      t3: [p.deep, mix(p.bg, "#ffffff", 0.4)],
      t4: [p.ink, p.loud],
      t5: [mix(p.ink, p.deep, 0.5), mix(p.bg, p.loud, 0.25)],
      t6: [p.ink, mix(p.bg, p.deep, 0.25)],
    };
  }
  return {
    // 4 stops, weighted to the dark end: covers stay low-key
    hero: [darken(mix(p.bg, p.loud, 0.1), 0.25), mix(p.bg, p.loud, 0.16), mix(p.bg, p.loud, 0.48), mix(p.loud, p.ink2, 0.3)],
    cut: [darken(mix(p.loud, p.deep, 0.5), 0.25), p.ink, lighten(mix(p.ink, p.ink2, 0.6), 0.35)],
    pale: [p.deep, mix(p.ink, p.ink2, 0.45), lighten(p.ink2, 0.55)],
    loud: [darken(p.loud, 0.4), p.loud, mix(p.ink, p.ink2, 0.35)],
    mono: [darken(p.bg, 0.3), "#8a8784", "#f4f1ee"],
    ghost: [p.bg, mix(p.bg, p.ink, 0.55)],
    shade: [darken(p.bg, 0.2), mix(p.bg, p.loud, 0.38)],
    t1: [mix(p.bg, p.ink, 0.12), p.ink],
    t2: [p.bg, mix(p.bg, "#ffffff", 0.6)],
    t3: [darken(p.loud, 0.6), p.loud],
    t4: [darken(p.deep, 0.35), mix(p.deep, p.ink2, 0.55)],
    t5: [darken(p.loud, 0.3), mix(p.loud, p.ink2, 0.6)],
    t6: [mix(p.bg, p.deep, 0.5), mix(p.ink, p.ink2, 0.5)],
  };
}

// ---------- palettes ----------
const BASES: PaletteBase[] = [
  {
    name: "orchid", label: "Orchid / Signal", mode: "dark",
    mood: "The templates' own look: hot orchid type on espresso, signal-red loud slide. Rebellious, editorial. Use only when asked.",
    bg: "#1F110D", ink: "#E95BCF", ink2: "#F4C3ED", loud: "#CB2B29", deep: "#691568", slab: "#821D23", frame: "#1D081E", onInk: "#1F110D",
  },
  {
    name: "cobalt", label: "Cobalt", mode: "dark",
    mood: "Cool, analytical. Science, data, technology, systems, privacy.",
    bg: "#0B0E1C", ink: "#8DA6FF", ink2: "#DCE4FF", loud: "#2B44E6", deep: "#1A2380", slab: "#23339C", frame: "#070915", onInk: "#0B0E1C",
  },
  {
    name: "acid", label: "Acid", mode: "dark",
    mood: "Urgent, provocative, future-facing. Calls to action, warnings, manifestos.",
    bg: "#0F1209", ink: "#C9F23A", ink2: "#EEFBC4", loud: "#2D7A2E", deep: "#355410", slab: "#24611F", frame: "#0A0D05", onInk: "#0F1209",
  },
  {
    name: "ember", label: "Ember", mode: "dark",
    mood: "Warm, activist, energetic. Labour, protest, creativity, making.",
    bg: "#180C06", ink: "#FF8F45", ink2: "#FFDCC2", loud: "#D63A1C", deep: "#6E2410", slab: "#8A2D14", frame: "#120804", onInk: "#180C06",
  },
  {
    name: "ultraviolet", label: "Ultraviolet", mode: "dark",
    mood: "Dreamy, speculative. Philosophy, consciousness, art, the inner life.",
    bg: "#0F0B1D", ink: "#B9A2FF", ink2: "#E8E0FF", loud: "#6930E8", deep: "#2F1680", slab: "#3B1C9C", frame: "#0A0716", onInk: "#0F0B1D",
  },
  {
    name: "verdigris", label: "Verdigris", mode: "dark",
    mood: "Calm, ecological, restorative. Nature, health, slowness, care.",
    bg: "#071311", ink: "#63E6C3", ink2: "#CFF7EC", loud: "#0D7C6C", deep: "#0F4D4A", slab: "#10625A", frame: "#040D0B", onInk: "#071311",
  },
  {
    name: "saffron", label: "Saffron / Bottle", mode: "dark",
    mood: "Scholarly, historical, warm gold against bottle green. History, books, education, heritage.",
    bg: "#15110A", ink: "#F3C24F", ink2: "#FCEBC2", loud: "#23655A", deep: "#6B4A0E", slab: "#2B5B52", frame: "#0F0B06", onInk: "#15110A",
  },
  {
    name: "newsprint", label: "Newsprint", mode: "light",
    mood: "Light paper, black ink, one red. Sober, journalistic, explanatory. Good contrast break in a feed of dark posts.",
    bg: "#EEE7D9", ink: "#1C1814", ink2: "#FFF4E6", loud: "#E2412C", deep: "#3A332B", slab: "#CDBFA6", frame: "#1C1814", onInk: "#EEE7D9",
  },
  {
    name: "graphite", label: "Graphite", mode: "dark",
    mood: "Monochrome, serious. Grief, ethics, law, hard news. No colour accent at all.",
    bg: "#121212", ink: "#EDEAE4", ink2: "#FFFFFF", loud: "#4A4744", deep: "#2B2A28", slab: "#3A3836", frame: "#0A0A0A", onInk: "#121212",
  },
];

/** Hand-tuned overrides on top of the derived duotones. */
const OVERRIDES: Partial<Record<string, Partial<Record<DuoName, Stops>>>> = {
  orchid: {
    // hand-tuned for the template look
    hero: ["#120100", "#260403", "#521009", "#cf412c"],
    cut: ["#7d1238", "#d955c4", "#ffd8f7"],
    pale: ["#3d0f4a", "#b45ac8", "#f7e0f6"],
    loud: ["#9a1420", "#e3405f", "#ff8fe6"],
  },
  graphite: {
    hero: ["#050505", "#1c1c1c", "#4a4a4a", "#d8d6d2"],
    cut: ["#141414", "#8c8a86", "#f7f5f1"],
    pale: ["#202020", "#a9a6a1", "#ffffff"],
    loud: ["#1a1a1a", "#6b6863", "#e9e6e0"],
  },
};

export const PALETTES: Palette[] = BASES.map((b) => ({
  ...b,
  duo: { ...deriveDuo(b), ...(OVERRIDES[b.name] ?? {}) } as Record<DuoName, Stops>,
}));

export const PALETTE_NAMES = PALETTES.map((p) => p.name);

/** Add (or replace) a palette at run time, e.g. the `brand` palette derived from the product folder. */
export function registerPalette(base: PaletteBase, overrides: Partial<Record<DuoName, Stops>> = {}): Palette {
  const palette = { ...base, duo: { ...deriveDuo(base), ...overrides } as Record<DuoName, Stops> };
  const i = PALETTES.findIndex((p) => p.name === base.name);
  if (i >= 0) PALETTES[i] = palette;
  else PALETTES.push(palette);
  if (!PALETTE_NAMES.includes(base.name)) PALETTE_NAMES.push(base.name);
  return palette;
}

export function getPalette(name: string): Palette | undefined {
  return PALETTES.find((p) => p.name === name);
}

/** CSS for every palette, scoped to [data-palette="name"]. */
export function palettesCss(): string {
  const blocks = PALETTES.map((p) => {
    const vars: string[] = [
      `--bg:${p.bg}`, `--ink:${p.ink}`, `--ink2:${p.ink2}`, `--loud:${p.loud}`, `--deep:${p.deep}`,
      `--slab:${p.slab}`, `--frame:${p.frame}`, `--on-ink:${p.onInk}`,
      `--ink-dim:${mix(p.bg, p.ink, 0.5)}`,
      `--vignette:${p.mode === "light" ? "rgba(28,24,20,.10)" : "rgba(0,0,0,.72)"}`,
      `--card:${p.mode === "light" ? p.bg : p.ink}`,
      `--grain-blend:${p.mode === "light" ? "multiply" : "overlay"}`,
      ...DUO_NAMES.map((d) => `--duo-${d}:${p.duo[d].join(" ")}`),
    ];
    return `[data-palette="${p.name}"]{\n  ${vars.join(";\n  ")};\n  color-scheme:${p.mode};\n}`;
  });
  return `/* GENERATED by scripts/build-design.ts from src/palettes.ts. Do not edit by hand. */\n${blocks.join("\n")}\n`;
}

/** Compact description for the agent's system prompt. */
export function palettesForPrompt(): string {
  return PALETTES.map(
    (p) => `- \`${p.name}\` (${p.mode}): ${p.mood} [bg ${p.bg}, ink ${p.ink}, loud ${p.loud}]`,
  ).join("\n");
}
