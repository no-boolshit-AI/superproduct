/**
 * Brand palette for the styles other than consulting.
 *
 * Every style (src/design/styles/<id>.css) has its own designed colours and reads the brand through `--c-*` CSS
 * variables with those colours as fallbacks. This module computes the variables from colour roles, doing the contrast
 * work CSS can't: which colour reads as text on paper, which dark colour carries a dark canvas, which text colour sits
 * on each highlight fill.
 */
import { contrast, darken, hexToRgb, luminance, mix, readableOn, withContrast } from "../../../lib/product.mjs";
import type { Brand } from "./config.js";

export interface Palette {
  primary: string;
  onPrimary: string;
  /** The primary as text or thin lines on paper (darkened when it doesn't read there). */
  primaryOnPaper: string;
  /** Call-to-action fill and its text. */
  accent: string;
  onAccent: string;
  /** The accent as text on paper. */
  accentText: string;
  paper: string;
  surface: string;
  ink: string;
  inkMuted: string;
  line: string;
  /** A near-black for dark canvases, and the type on it. */
  dark: string;
  onDark: string;
  /** Three bright fills (stickers, marker, ticker, tags) with readable text: the brand's highlight colours first. */
  highlights: { bg: string; fg: string }[];
  /** Button and tag corner radius from the brand's shape (sharp | soft | round). */
  radius?: string;
}

export interface PaletteInput {
  primary: string;
  onPrimary?: string;
  accent: string;
  onAccent?: string;
  accentText?: string;
  background: string;
  surface?: string;
  text: string;
  textMuted?: string;
  border?: string;
  /** Dark colours to try for dark canvases, in order (e.g. the inverse role, then the text colour). */
  darkCandidates?: string[];
  /** Bright highlight fills (lime, yellow…), in order of preference. */
  highlights?: string[];
  shape?: "sharp" | "soft" | "round";
}

const RADIUS = { sharp: "6px", soft: "18px", round: "999px" } as const;

export function buildPalette(i: PaletteInput): Palette {
  const paper = i.background;
  const ink = i.text;
  const dark = [...(i.darkCandidates ?? []), ink].find((c) => luminance(c) < 0.03) ?? mix(darken(i.primary, 0.82), "#000000", 0.4);
  const fill = (bg: string) => ({ bg, fg: readableOn(bg, [ink, "#ffffff", "#111111"]) });
  // Brand highlights first; then the accent, the ink and the paper fill the three slots.
  const fills = [...(i.highlights ?? []), i.accent, ink, paper]
    .filter((c, n, all) => all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === n)
    .slice(0, 3)
    .map(fill);
  return {
    primary: i.primary,
    onPrimary: i.onPrimary ?? readableOn(i.primary, ["#ffffff", ink]),
    primaryOnPaper: withContrast(i.primary, paper, 3),
    accent: i.accent,
    onAccent: i.onAccent ?? readableOn(i.accent, ["#ffffff", ink]),
    accentText: i.accentText ?? withContrast(i.accent, paper, 4.5),
    paper,
    surface: i.surface ?? mix(paper, ink, 0.04),
    ink,
    inkMuted: i.textMuted ?? mix(ink, paper, 0.35),
    line: i.border ?? mix(ink, paper, 0.85),
    dark,
    onDark: readableOn(dark, ["#ffffff", paper]),
    highlights: fills,
    radius: i.shape ? RADIUS[i.shape] : undefined,
  };
}

/** A brand file's colours (brand.json format) → palette. */
export function paletteFromBrandColors(c: Brand["colors"]): Palette {
  const ink = c.ink;
  return buildPalette({
    primary: c.primary,
    onPrimary: c.onPrimary,
    accent: c.accent ?? c.primary,
    onAccent: c.onAccent,
    accentText: c.accentOnLight,
    background: c.surface,
    surface: "#ffffff",
    text: ink,
    darkCandidates: [c.primaryDeep],
    highlights: c.accent && contrast(c.accent, "#000000") > 9 ? [c.accent] : [],
  });
}

/** The palette as CSS custom properties (`--c-*`), read by the style files. */
export function paletteVars(p: Palette): string {
  const vars: Record<string, string> = {
    "--c-primary": p.primary,
    "--c-on-primary": p.onPrimary,
    "--c-primary-on-paper": p.primaryOnPaper,
    "--c-accent": p.accent,
    "--c-on-accent": p.onAccent,
    "--c-accent-text": p.accentText,
    "--c-paper": p.paper,
    "--c-surface": p.surface,
    "--c-ink": p.ink,
    "--c-ink-muted": p.inkMuted,
    "--c-line": p.line,
    "--c-dark": p.dark,
    "--c-on-dark": p.onDark,
    "--c-shade-rgb": hexToRgb(mix(p.dark, "#000000", 0.3)).join(" "),
  };
  p.highlights.forEach((h, n) => {
    vars[`--c-hl-${n + 1}`] = h.bg;
    vars[`--c-on-hl-${n + 1}`] = h.fg;
  });
  if (p.radius) vars["--c-radius"] = p.radius;
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
}
