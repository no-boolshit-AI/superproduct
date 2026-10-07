// Line icons (24×24, 1.6 stroke) registered as CSS masks so they take the current colour.
// Use in slots as: <i class="icon icon--growth"></i>  (sizes: icon--sm, icon--lg, icon--xl; colour: icon--ink, icon--muted)

const s = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS: Record<string, string> = {
  growth: s(`<path d="M3 20h18"/><path d="M6 16v-3M11 16V9M16 16v-5"/><path d="M4 9.5 9 5l4 3 6-5"/><path d="M15 3h4v4"/>`),
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
  pie: s(`<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>`),
  check: s(`<circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/>`),
  cross: s(`<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>`),
  warning: s(`<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.4" r=".6" fill="#000"/>`),
  layers: s(`<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".6"/>`),
  shield: s(`<path d="M12 3l8 3v6c0 4.6-3.3 8-8 9-4.7-1-8-4.4-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>`),
  lock: s(`<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>`),
  bolt: s(`<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>`),
  leaf: s(`<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19c3-4 6-7 10-9"/>`),
  coin: s(`<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.5-1-1.6-1.6-2.8-1.6-1.6 0-2.8.9-2.8 2.2 0 3 5.8 1.6 5.8 4.5 0 1.3-1.3 2.2-3 2.2-1.3 0-2.5-.6-3-1.7"/><path d="M12 6v1.6M12 16.5V18"/>`),
  euro: s(`<circle cx="12" cy="12" r="9"/><path d="M15.5 8.4a4 4 0 1 0 0 7.2"/><path d="M7.5 11h6M7.5 13.4h6"/>`),
  wallet: s(`<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7z"/><path d="M4 7l11-3v3"/><circle cx="16" cy="13.5" r="1.2"/>`),
  gear: s(`<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>`),
  bulb: s(`<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>`),
  building: s(`<path d="M4 21V5l8-2v18"/><path d="M12 8h8v13"/><path d="M2 21h20"/><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"/>`),
  factory: s(`<path d="M3 21V11l5 3V11l5 3V8l8 4v9z"/><path d="M3 21h18"/><path d="M7 17h2M12 17h2M17 17h1"/>`),
  truck: s(`<path d="M2.5 6h11v10h-11z"/><path d="M13.5 9.5h4l3 3.5V16h-7"/><circle cx="6.5" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>`),
  cart: s(`<path d="M3 4h2.5l2.2 11h10.6l2-8H6.4"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>`),
  store: s(`<path d="M4 10v10h16V10"/><path d="M3 10l2-6h14l2 6"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M10 20v-5h4v5"/>`),
  rocket: s(`<path d="M12 15l-3-3c1.5-5 4.5-8.5 11-9-.5 6.5-4 9.5-9 11z"/><path d="M9 12l-4.5.5L3 16l4-.5M12 15l-.5 4.5L8 21l.5-4"/><circle cx="15" cy="9" r="1.5"/>`),
  ai: s(`<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2.5v2.5M15 2.5v2.5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5"/><path d="M9.2 15l1.8-6h2l1.8 6M9.8 13h4.4"/>`),
  cloud: s(`<path d="M7 18h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18z"/>`),
  database: s(`<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>`),
  code: s(`<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>`),
  device: s(`<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>`),
  phone: s(`<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>`),
  link: s(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`),
  search: s(`<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16"/>`),
  heart: s(`<path d="M12 20s-8-4.6-8-10.4A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.6C20 15.4 12 20 12 20z"/>`),
  health: s(`<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 8v8M8 12h8"/>`),
  flag: s(`<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>`),
  calendar: s(`<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>`),
  handshake: s(`<path d="M2.5 11l4-4 4 2 2-1.5 3.5.5 5.5 4"/><path d="M6.5 7l-4 6 5 5 2-1"/><path d="M9.5 14.5l2 2M12 12.5l3 3M14.5 11l3 3.5M21.5 11.5l-3.5 4-2.5 1"/>`),
  scale: s(`<path d="M12 3v18M7 21h10"/><path d="M4 7h16"/><path d="M6.5 7l-3 6a3 3 0 0 0 6 0zM17.5 7l-3 6a3 3 0 0 0 6 0z"/>`),
  puzzle: s(`<path d="M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H4v-4a2 2 0 1 0 0-4z"/>`),
  star: s(`<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z"/>`),
  compass: s(`<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>`),
  map: s(`<path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>`),
  document: s(`<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15.5h6M9 9h3"/>`),
  mail: s(`<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/>`),
  chat: s(`<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>`),
  education: s(`<path d="M2.5 9L12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c1.5 1.5 3.4 2.2 5.5 2.2s4-.7 5.5-2.2V11"/><path d="M21.5 9v5"/>`),
  recycle: s(`<path d="M7.5 9.5L10 5h4l2 3.5"/><path d="M17.5 10l2.5 4.5-2 3.5h-4"/><path d="M9.5 18H5.5l-2-3.5L5.5 11"/><path d="M14.5 8.5l2 0 .2-2.2M12.5 18l-1.6 1.5 1.6 1.5M6.8 11.3L5.5 11l-.9 1.8"/>`),
  water: s(`<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>`),
  sun: s(`<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>`),
  speed: s(`<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><path d="M4 17h2M18 17h2M12 9V7.5"/>`),
  filter: s(`<path d="M3.5 5h17l-6.5 8v6l-4 1.5V13z"/>`),
  refresh: s(`<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>`),
  plus: s(`<path d="M12 5v14M5 12h14"/>`),
  minus: s(`<path d="M5 12h14"/>`),
};

const PLAIN_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>`;
const PLAIN_CROSS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const ARROW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h17"/><path d="M13 5l7 7-7 7"/></svg>`;

export const svgUrl = (svg: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

/** CSS that registers every icon as `.icon--<name>` plus shared mask variables. */
export function iconCss(): string {
  const rules = Object.entries(ICONS)
    .map(([name, svg]) => `.icon--${name}{--i:${svgUrl(svg)}}`)
    .join("\n");
  return `:root{--i-check-plain:${svgUrl(PLAIN_CHECK)};--i-cross-plain:${svgUrl(PLAIN_CROSS)};--i-arrow-right:${svgUrl(ARROW)};}\n${rules}`;
}

export const ICON_NAMES = Object.keys(ICONS);
