// Minimal line icons (24×24, 1.6 stroke) used as CSS masks so they take the
// current text colour. Use in slides as: <i class="icon icon--growth"></i>

const s = (body: string, filled = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${filled ? "#000" : "none"}" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS: Record<string, string> = {
  // three ascending bars with a rising trend arrow (as on the reference cover)
  growth: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="17" width="5" height="5" rx=".6"/><rect x="9.5" y="14" width="5" height="8" rx=".6"/><rect x="17" y="11" width="5" height="11" rx=".6"/><path d="M2.5 13.5 8 8.5l3.5 3 7-7" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 3.5h5v5" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  decline: s(`<path d="M3 6l6 6 4-4 8 8"/><path d="M15 16h6v-6"/>`),
  "arrow-up": s(`<path d="M12 20V4"/><path d="M5 11l7-7 7 7"/>`),
  "arrow-down": s(`<path d="M12 4v16"/><path d="M5 13l7 7 7-7"/>`),
  "arrow-right": s(`<path d="M4 12h16"/><path d="M13 5l7 7-7 7"/>`),
  target: s(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="#000"/>`),
  people: s(`<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20c.6-3.6 3.1-5.6 6.2-5.6s5.6 2 6.2 5.6"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.4c2.6.2 4.3 2 4.8 4.9"/>`),
  person: s(`<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c.8-4 3.7-6.2 7.5-6.2s6.7 2.2 7.5 6.2"/>`),
  clock: s(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`),
  globe: s(`<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>`),
  chart: s(`<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>`),
  bars: s(`<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>`),
  check: s(`<circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/>`),
  layers: s(`<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".6"/>`),
  shield: s(`<path d="M12 3l8 3v6c0 4.6-3.3 8-8 9-4.7-1-8-4.4-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>`),
  bolt: s(`<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>`),
  leaf: s(`<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19c3-4 6-7 10-9"/>`),
  coin: s(`<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.5-1-1.6-1.6-2.8-1.6-1.6 0-2.8.9-2.8 2.2 0 3 5.8 1.6 5.8 4.5 0 1.3-1.3 2.2-3 2.2-1.3 0-2.5-.6-3-1.7"/><path d="M12 6v1.6M12 16.5V18"/>`),
  gear: s(`<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>`),
  bulb: s(`<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>`),
  building: s(`<path d="M4 21V5l8-2v18"/><path d="M12 8h8v13"/><path d="M2 21h20"/><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"/>`),
  cart: s(`<path d="M3 4h2.5l2.2 11h10.6l2-8H6.4"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>`),
  rocket: s(`<path d="M12 15l-3-3c1.5-5 4.5-8.5 11-9-.5 6.5-4 9.5-9 11z"/><path d="M9 12l-4.5.5L3 16l4-.5M12 15l-.5 4.5L8 21l.5-4"/><circle cx="15" cy="9" r="1.5"/>`),
  ai: s(`<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2.5v2.5M15 2.5v2.5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5"/><path d="M9.2 15l1.8-6h2l1.8 6M9.8 13h4.4"/>`),
  link: s(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`),
  search: s(`<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16"/>`),
  heart: s(`<path d="M12 20s-8-4.6-8-10.4A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.6C20 15.4 12 20 12 20z"/>`),
  flag: s(`<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>`),
  calendar: s(`<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>`),
  hourglass: s(`<path d="M6.5 3h11M6.5 21h11"/><path d="M7.5 3c0 4.5 4.5 6 4.5 9s-4.5 4.5-4.5 9M16.5 3c0 4.5-4.5 6-4.5 9s4.5 4.5 4.5 9"/>`),
  monitor: s(`<rect x="2.5" y="4" width="19" height="12.5" rx="1.6"/><path d="M8.5 20.5h7M12 16.5v4"/>`),
  laptop: s(`<rect x="4.5" y="5" width="15" height="10.5" rx="1.4"/><path d="M2 18.5h20l-1.4-3H3.4z"/>`),
  phone: s(`<rect x="6.5" y="2.5" width="11" height="19" rx="2.4"/><path d="M10.5 18.5h3"/>`),
  pin: s(`<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>`),
  ticket: s(`<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 1 0-4V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2.2"/>`),
  mic: s(`<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>`),
  video: s(`<rect x="2.5" y="6" width="13.5" height="12" rx="2"/><path d="M16 10.5l5.5-3v9l-5.5-3"/>`),
  chat: s(`<path d="M4 5h16v10.5H9.5L5 19.5v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>`),
  star: s(`<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>`),
  sparkle: s(`<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M19 16.5c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2z"/>`),
  code: s(`<path d="M8.5 7l-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>`),
  terminal: s(`<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="M6.5 9l3 3-3 3M12 15.5h5.5"/>`),
  doc: s(`<path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5V7h4.5M9 12h6.5M9 15.5h6.5"/>`),
  mail: s(`<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M3 6.5l9 6.5 9-6.5"/>`),
  play: s(`<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>`),
  lock: s(`<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>`),
  puzzle: s(`<path d="M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H4v-4a2 2 0 1 0 0-4z"/>`),
  compass: s(`<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>`),
  pen: s(`<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>`),
  megaphone: s(`<path d="M3.5 10v4h3l9 5V5l-9 5z"/><path d="M6.5 14l1.5 6h2.5l-1.4-5.4M19 9.5a3.5 3.5 0 0 1 0 5"/>`),
  trophy: s(`<path d="M7.5 3.5h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 5.5H4a3 3 0 0 0 3.5 4M16.5 5.5H20a3 3 0 0 1-3.5 4M12 13v4M8.5 20.5h7l-1-3.5h-5z"/>`),
  database: s(`<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>`),
  plus: s(`<path d="M12 5v14M5 12h14"/>`),
  x: s(`<path d="M6 6l12 12M18 6L6 18"/>`),
  question: s(`<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.5v.7"/><circle cx="12" cy="17" r=".9" fill="#000"/>`),
  chevrons: s(`<path d="M5 6l6 6-6 6M13 6l6 6-6 6"/>`),
};

/** Big geometric shapes for `.shape--NAME` (masks; the fill comes from --shape). */
export const SHAPES: Record<string, string> = {
  chevron: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0 0h46l54 50-54 50H0l54-50z"/></svg>`,
  arrow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0 34h56V8l44 42-44 42V66H0z"/></svg>`,
  step: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M100 0v100H0V58h40L100 0z"/></svg>`,
  slash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M62 0h38L38 100H0z"/></svg>`,
  circle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"/></svg>`,
  ring: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M50 0a50 50 0 1 1 0 100A50 50 0 0 1 50 0zm0 22a28 28 0 1 0 0 56 28 28 0 0 0 0-56z"/></svg>`,
  half: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" preserveAspectRatio="none"><path d="M0 50a50 50 0 0 1 100 0z"/></svg>`,
  quarter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0 0h100v100A100 100 0 0 1 0 0z"/></svg>`,
  burst: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${burst(12, 50, 36)}"/></svg>`,
  asterisk: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(50 50)">${[0, 60, 120].map((a) => `<rect x="-8" y="-50" width="16" height="100" rx="3" transform="rotate(${a})"/>`).join("")}</g></svg>`,
};

function burst(points: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let k = 0; k < points * 2; k++) {
    const r = k % 2 ? inner : outer;
    const a = (Math.PI * k) / points - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}z`;
}

const CHEVRONS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 66 34" fill="none" stroke="#000" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l14 14L4 31"/><path d="M26 3l14 14-14 14"/><path d="M48 3l14 14-14 14"/></svg>`;

const ARROW_THIN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48" fill="none" stroke="#000" stroke-width="3.4" stroke-linecap="square"><path d="M2 24h56M38 4l20 20-20 20"/></svg>`;
const ARROW_LONG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 40" preserveAspectRatio="xMaxYMid meet" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h144M128 3l18 17-18 17"/></svg>`;
const FLAG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 26"><path d="M0 0h30l-9 13 9 13H0z"/></svg>`;
const SPECKLE = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="340"><filter id="s"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.2  0 0 0 0 0.15  0 0 0 9 -6.3"/></filter><rect width="100%" height="100%" filter="url(#s)"/></svg>`;
const NOISE_COARSE = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="c"><feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="1" seed="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 2.4 -0.7"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 1"/><feFuncG type="discrete" tableValues="0 1"/><feFuncB type="discrete" tableValues="0 1"/></feComponentTransfer></filter><rect width="100%" height="100%" filter="url(#c)"/></svg>`;

const NOISE = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.4 -0.2"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;

export const svgUrl = (svg: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

/** CSS that registers every icon as `.icon--<name>`, every shape as `.shape--<name>`, plus shared mask variables. */
export function iconCss(): string {
  const icons = Object.entries(ICONS).map(([name, svg]) => `.icon--${name}{--i:${svgUrl(svg)}}`);
  const shapes = Object.entries(SHAPES).map(([name, svg]) => `.shape--${name}{--m:${svgUrl(svg)}}`);
  const vars = {
    "--chevrons": CHEVRONS,
    "--arrow-right": ICONS["arrow-right"],
    "--arrow-thin": ARROW_THIN,
    "--arrow-long": ARROW_LONG,
    "--flag": FLAG,
    "--noise": NOISE,
    "--noise-coarse": NOISE_COARSE,
    "--speckle": SPECKLE,
  };
  const root = Object.entries(vars).map(([k, svg]) => `${k}:${svgUrl(svg)};`).join("");
  return `:root{${root}}\n${[...icons, ...shapes].join("\n")}`;
}

export const ICON_NAMES = Object.keys(ICONS);
export const SHAPE_NAMES = Object.keys(SHAPES);
