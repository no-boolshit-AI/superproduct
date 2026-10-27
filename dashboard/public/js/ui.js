// Small building blocks for the dashboard page: escaped HTML templates, icons, the agents' mascots, formatting.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** Trusted markup: what `html` returns, and what it inserts without escaping. */
export class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}
export const raw = (s) => new Raw(String(s ?? ""));
const part = (v) => (v == null || v === false ? "" : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join("") : esc(v));

/** html`<p>${text}</p>`: every value is escaped unless it is itself html`…` or raw(…). */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => (out += part(v) + strings[i + 1]));
  return new Raw(out);
}

// ---------------------------------------------------------------- icons (24×24, stroked)

const ICONS = {
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/>',
  sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  wave: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9c0 5-7 4-11 9"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  external: '<path d="M7 17L17 7M8 7h9v9"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9l3 3-3 3M13 15h4"/>',
  eye: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10l5-3v10l-5-3"/>',
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 14h9"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  message: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h11v4"/><rect x="4" y="9" width="16" height="11" rx="2"/><circle cx="16" cy="14.5" r="1.2"/>',
};
export const icon = (name, size = 20, cls = "") =>
  raw(`<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.doc}</svg>`);

// ---------------------------------------------------------------- mascots: one soft creature per agent

const PALETTES = {
  "landing-page": { tile: ["#EDF6E0", "#DCEDC6"], body: ["#B4DC78", "#77B043"] },
  carousel: { tile: ["#FDF5D6", "#FAE7A9"], body: ["#FFDD73", "#F0AF36"] },
  explainer: { tile: ["#FDE8EF", "#F8D2DF"], body: ["#F79AB6", "#E5628B"] },
  deck: { tile: ["#FDEAEE", "#F9D6DF"], body: ["#F48BA3", "#DB4E74"] },
  "collage-post": { tile: ["#F0EBFD", "#E1D8FB"], body: ["#C4B3F7", "#8E74E4"] },
  dev: { tile: ["#E3F3FA", "#CDE8F5"], body: ["#97D4F0", "#4AA5D6"] },
  default: { tile: ["#F3F0E8", "#E7E1D4"], body: ["#D6CCB8", "#A99D86"] },
};
export const palette = (id) => PALETTES[id] ?? PALETTES.default;

const face = (x, y, { closed = true, scale = 1 } = {}) => {
  const s = scale;
  const eye = (cx) =>
    closed
      ? `<path d="M${cx - 3.4 * s} ${y + 1 * s}q${3.4 * s} ${-4 * s} ${6.8 * s} 0" fill="none" stroke="#2A2622" stroke-width="${2.1 * s}" stroke-linecap="round"/>`
      : `<ellipse cx="${cx}" cy="${y}" rx="${2.2 * s}" ry="${2.8 * s}" fill="#2A2622"/><circle cx="${cx + 0.8 * s}" cy="${y - 1 * s}" r="${0.8 * s}" fill="#fff"/>`;
  return `${eye(x - 7 * s)}${eye(x + 7 * s)}
    <path d="M${x - 3 * s} ${y + 6 * s}q${3 * s} ${3.2 * s} ${6 * s} 0" fill="none" stroke="#2A2622" stroke-width="${1.9 * s}" stroke-linecap="round"/>
    <ellipse cx="${x - 12 * s}" cy="${y + 5 * s}" rx="${3 * s}" ry="${1.9 * s}" fill="#FF7FA0" opacity=".45"/>
    <ellipse cx="${x + 12 * s}" cy="${y + 5 * s}" rx="${3 * s}" ry="${1.9 * s}" fill="#FF7FA0" opacity=".45"/>`;
};

const BODIES = {
  "landing-page": (g) => `
    <rect x="31" y="24" width="34" height="56" rx="17" fill="url(#${g})"/>
    <circle cx="40" cy="38" r="2.2" fill="#fff" opacity=".35"/><circle cx="56" cy="62" r="2.6" fill="#000" opacity=".06"/><circle cx="42" cy="68" r="2" fill="#000" opacity=".06"/>
    <circle cx="66" cy="24" r="7.5" fill="#F592B6"/><circle cx="64" cy="21.5" r="2.2" fill="#fff" opacity=".5"/>
    ${face(48, 44, { scale: 0.85 })}`,
  carousel: (g) => `
    <circle cx="48" cy="50" r="25" fill="url(#${g})"/>
    <ellipse cx="39" cy="38" rx="7" ry="4.5" fill="#fff" opacity=".35" transform="rotate(-25 39 38)"/>
    ${face(48, 50)}`,
  explainer: (g) => `
    <circle cx="30" cy="33" r="8" fill="url(#${g})"/><circle cx="66" cy="33" r="8" fill="url(#${g})"/>
    <circle cx="30" cy="33" r="3.6" fill="#F8CD58"/><circle cx="66" cy="33" r="3.6" fill="#F8CD58"/>
    <ellipse cx="48" cy="76" rx="20" ry="5" fill="#F8CD58"/>
    <ellipse cx="48" cy="55" rx="26" ry="21" fill="url(#${g})"/>
    <ellipse cx="38" cy="44" rx="6" ry="3.5" fill="#fff" opacity=".3" transform="rotate(-20 38 44)"/>
    ${face(48, 54)}`,
  deck: (g) => `
    <path d="M49 25c14 0 24 10 23.5 24.5C72 64 62 75 47.5 74.5 33 74 24 64 24.5 50 25 35.5 35 25 49 25z" fill="url(#${g})"/>
    <ellipse cx="38" cy="37" rx="6" ry="3.5" fill="#fff" opacity=".35" transform="rotate(-30 38 37)"/>
    ${face(48, 50, { closed: false })}`,
  "collage-post": (g) => `
    <rect x="25" y="28" width="46" height="46" rx="16" fill="url(#${g})" transform="rotate(-6 48 51)"/>
    <path d="M27 31l17-3 1 4 3-1 1 7-4 1 1 4-17 3z" fill="#FFFDF7" transform="rotate(-6 36 34)" opacity=".95"/>
    <path d="M30 34l10-2" stroke="#E5628B" stroke-width="1.6" stroke-linecap="round" transform="rotate(-6 36 34)"/>
    ${face(50, 54)}`,
  dev: (g) => `
    <path d="M48 32v-8" stroke="#2A2622" stroke-width="2" stroke-linecap="round"/><circle cx="48" cy="21" r="4.5" fill="#F8CD58"/>
    <rect x="25" y="32" width="46" height="40" rx="15" fill="url(#${g})"/>
    <ellipse cx="35" cy="40" rx="6" ry="3" fill="#fff" opacity=".35" transform="rotate(-20 35 40)"/>
    ${face(48, 52, { closed: false })}`,
  default: (g) => `<circle cx="48" cy="50" r="24" fill="url(#${g})"/>${face(48, 50)}`,
};

let mascotSeq = 0;
/** The agent's mascot on its pastel tile, `size` px square. `bare` leaves the tile out. */
export function mascot(id, size = 96, { bare = false } = {}) {
  const p = palette(id);
  const n = ++mascotSeq;
  const g = `mb${n}`;
  const t = `mt${n}`;
  const body = (BODIES[id] ?? BODIES.default)(g);
  return raw(`<svg class="mascot" width="${size}" height="${size}" viewBox="0 0 96 96" aria-hidden="true">
    <defs>
      <linearGradient id="${g}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${p.body[0]}"/><stop offset="1" stop-color="${p.body[1]}"/></linearGradient>
      <radialGradient id="${t}" cx="0.3" cy="0.2" r="1"><stop offset="0" stop-color="${p.tile[0]}"/><stop offset="1" stop-color="${p.tile[1]}"/></radialGradient>
    </defs>
    ${bare ? "" : `<rect width="96" height="96" rx="22" fill="url(#${t})"/><circle cx="82" cy="12" r="16" fill="#fff" opacity=".35"/>`}
    <ellipse cx="48" cy="84" rx="18" ry="3" fill="#2A2622" opacity=".08"/>
    ${body}
    ${bare ? "" : `<rect width="96" height="96" rx="22" filter="url(#sp-grain)" opacity=".5"/>`}
  </svg>`);
}

// ---------------------------------------------------------------- formatting

const NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export const words = (n) => (n >= 0 && n <= 10 ? NUMBERS[n] : String(n));
export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${plural(m, "minute")} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${plural(h, "hour")} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  return when(iso, { short: true });
}

export function when(iso, { short = false } = {}) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, short ? { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) } : { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), hour: "2-digit", minute: "2-digit" });
}

export const money = (n) => (typeof n === "number" ? `$${n < 10 ? n.toFixed(2) : n.toFixed(n < 1000 ? 2 : 0)}` : "");

export function bytes(n) {
  if (typeof n !== "number") return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function duration(sec) {
  if (typeof sec !== "number") return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m} min ${s ? `${s} s` : ""}`.trim() : `${s} s`;
}
