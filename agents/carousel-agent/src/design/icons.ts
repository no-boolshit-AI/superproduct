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
};

const CHEVRONS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 66 34" fill="none" stroke="#000" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l14 14L4 31"/><path d="M26 3l14 14-14 14"/><path d="M48 3l14 14-14 14"/></svg>`;

const NOISE = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.4 -0.2"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;

export const svgUrl = (svg: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

/** CSS that registers every icon as `.icon--<name>` plus shared mask variables. */
export function iconCss(): string {
  const rules = Object.entries(ICONS)
    .map(([name, svg]) => `.icon--${name}{--i:${svgUrl(svg)}}`)
    .join("\n");
  return `:root{--chevrons:${svgUrl(CHEVRONS)};--arrow-right:${svgUrl(ICONS["arrow-right"])};--noise:${svgUrl(NOISE)};}\n${rules}`;
}

export const ICON_NAMES = Object.keys(ICONS);
