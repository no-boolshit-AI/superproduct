/**
 * Visual styles. Each is a CSS file (src/design/styles/<id>.css) over the shared base (src/design/base.css), plus what
 * the agent needs to use it well: when it fits, its visual rules, which layouts suit it, its fonts and image palette.
 * Layouts (src/design/layouts/) work in every style; a style changes canvases, type, colours and component skins.
 */
import type { StyleId } from "./config.js";

export interface FontSpec {
  family: string;
  /** fontsource package and file prefix */
  pkg: string;
  prefix: string;
  weights: string[];
  italic?: string[];
}

export interface Style {
  id: StyleId;
  label: string;
  /** One line: what it looks like. */
  look: string;
  bestFor: string;
  /** The visual rules the agent follows in this style (markdown bullets). */
  guide: string;
  /** Layouts that suit it best (src/design/layouts/<id>.html); others work too. */
  layouts: string[];
  /** A short sample carousel for `npm run demo` (layout ids in order). */
  sample: string[];
  /**
   * Bundled faces per role. A brand face replaces each role it has (unless the product sets agents.carousel.fonts:
   * "style"): the display role takes the brand's face of the same kind (display/sans, serif or condensed).
   */
  fonts: { display: FontSpec & { kind: "sans" | "serif" | "condensed" }; body: FontSpec; mono: FontSpec; serif: FontSpec; condensed?: FontSpec };
  /** Palette words for image prompts when the brand doesn't set one. */
  imagePalette: string;
  /**
   * The tallest empty horizontal band the layout QA accepts, as a share of the canvas height. Loud styles fill the
   * canvas; the minimal style lives on whitespace.
   */
  maxBand: number;
}

const interTight = (weights: string[]): FontSpec => ({ family: "Inter Tight", pkg: "@fontsource/inter-tight", prefix: "inter-tight", weights });
const sourceSerif = (weights: string[], italic?: string[]): FontSpec => ({ family: "Source Serif 4", pkg: "@fontsource/source-serif-4", prefix: "source-serif-4", weights, italic });
const mono = (weights: string[]): FontSpec => ({ family: "JetBrains Mono", pkg: "@fontsource/jetbrains-mono", prefix: "jetbrains-mono", weights });
const condensed = (weights: string[]): FontSpec => ({ family: "Barlow Condensed", pkg: "@fontsource/barlow-condensed", prefix: "barlow-condensed", weights });

export const STYLES: Record<StyleId, Style> = {
  consulting: {
    id: "consulting",
    label: "Consulting",
    look: "Top-tier consulting post: saturated brand canvas, light-weight type, hero numbers, hairline rules, a frosted-glass cover over a monochrome 3D render.",
    bestFor: "case studies, results, transformations, data stories, reports",
    guide: `- One dominant brand canvas with light type (default \`slide\`; \`slide--deep\` darker; \`slide--light\`/\`slide--white\` for a data slide). Light cards and pills are the only other surfaces.
- Type is LIGHT (300) for headlines and hero numbers, regular (400) for body. Sentence case. Never bold whole sentences, never all caps.
- Numbers are the heroes: ">8%", "~250 bps", "3x", "€1.2bn", "5 → 3". Big and thin, with a short 2-line label next to or under them.
- Thin hairlines (\`rule\`) separate headline, content and takeaway. Generous whitespace, left-aligned on inner slides, centred inside the cover glass.
- Cover: a full-bleed generated image (a stylised 3D render of objects from the topic's world) with \`bg--duotone\`, \`fx-glow\`, \`fx-vignette\` and \`fx-grain\` under a frosted \`glass glass--cover\` panel. Inner slides are solid canvas, optionally with the cover image as a faint \`bg--ghost\` on one edge. A human slide may use a rounded photo card that bleeds off the bottom.
- Chrome: \`wordmark\` bottom-left and \`next\` bottom-right on the cover. The last slide ends with a \`cta\` pill.
- Story: cover (label pill, 2-line headline, the strongest number, a 1–2 sentence summary, all inside the glass) → framework (numbered steps + a takeaway row) → mechanism or proof (one bold claim, one paragraph, maybe a photo) → optional data (bars, donut, before→after) → impact (2–3 stat cards, one sentence, CTA).
- Images: usually ONE 3d-mono hero reused on the cover and as a ghost, plus at most one photo.`,
    layouts: ["glass-cover", "steps", "photo-bleed", "chart", "stats", "quote", "closing"],
    sample: ["glass-cover", "steps", "photo-bleed", "stats"],
    fonts: { display: { ...interTight(["300", "400", "500"]), kind: "sans" }, body: interTight(["300", "400", "500"]), mono: mono(["400", "500"]), serif: sourceSerif(["400", "500"]) },
    imagePalette: "monochrome electric cobalt blue with soft violet highlights",
    maxBand: 0.3,
  },
  bold: {
    id: "bold",
    label: "Bold",
    look: "Loud community poster: a saturated brand gradient, black-weight headlines, tilted stickers, a giant faint logo watermark, white rounded cards, bright CTA buttons, device mockups and avatar rows.",
    bestFor: "events, calls for participants or speakers, programmes, community news, launches with people in them",
    guide: `- Canvases: the default \`slide\` is a saturated brand gradient with white type; \`slide--light\` is a pale tinted gradient with ink type (cards, people); \`slide--dark\` for one contrast slide. Alternate brand and light slides.
- Type: the display face at black weight, tight, sentence case and big: \`hero\` for the 2–4 word hook, \`h1\`/\`h2\` elsewhere, a \`lead\` line under the hook. Body regular, short.
- Stickers are the signature: 1–3 short labels (1–3 words: the series, "Free", "Seats limited", "Mentors wanted") tilted between −6° and +4° (\`--tilt\`), stacked and slightly overlapping in \`stickers\`, in the highlight colours (\`sticker\`, \`sticker--2\`, \`sticker--3\`, \`sticker--ink\`, \`sticker--accent\`). Max 3 per slide, in one stack or one pinned to a block's corner (\`.anchor\` + \`sticker--float\`); never over text or UI content.
- A huge faint logo behind the content (\`watermark watermark--logo\`) on most slides, bleeding off an edge; or one letter in \`watermark\`.
- The logo top-left on every slide: \`wordmark wordmark--top\` on inner slides, or inline in a top row with stickers (\`row between row--top\` + \`wordmark wordmark--inline\`) on the cover and the last slide; both land on the same spot. Content starts below \`wordmark--top\` by itself.
- Inner slides: the headline under the logo, then ONE big block that fills the slide: option or feature cards (\`cards cards--list\` with \`card__icon\` tiles), a \`device\` with a full \`ui\` mock, an \`icon-list--rows\` list, or a \`panel\` with the facts; centre it with \`my-auto\`. A closing line or a sticker may sit at the bottom. Never a short list floating at the top of an empty slide.
- CTA: the accent button with an arrow (\`cta cta--arrow\`), bold; it may overlap the bottom edge of a \`panel\` (\`cta--overlap\`). One per slide.
- Event facts in a \`meta\` row with icons (date, duration, format) above the hook; programme contents as an \`icon-list\`; mentors or speakers as a \`people\` row (real photos only from the user's assets, else \`avatar--initials\`).
- Device mockups (\`device device--laptop device--tilt\`, \`device--phone\`) to show a session, a product or a community moment; a \`ui\` mock inside fills the screen (a \`ui-bar\`, then 4–6 rows).
- Images: the user's photos first; otherwise a generated \`photo\` or \`illustration\` inside a device screen or a panel. No 3D renders under glass.
- Avoid: thin weights, hairline rules, glass panels, more than one CTA per slide.`,
    layouts: ["poster", "device", "options", "card-people", "list", "quote", "closing"],
    sample: ["poster", "card-people", "options", "closing"],
    fonts: { display: { ...interTight(["700", "800", "900"]), kind: "sans" }, body: interTight(["400", "500", "600", "700"]), mono: mono(["500"]), serif: sourceSerif(["400"]) },
    imagePalette: "saturated ultramarine blue and violet with warm coral and lemon accents",
    maxBand: 0.24,
  },
  minimal: {
    id: "minimal",
    label: "Minimal",
    look: "Typographic statement: a paper canvas, oversized grotesk type in two colours (the brand colour for the question, ink for the answer), nothing else but a small logo mark.",
    bestFor: "opinions, questions, definitions, principles, quotes, single-statement posts",
    guide: `- Canvases: warm paper by default; \`slide--brand\` (brand colour, white type) for one emphasis slide; \`slide--dark\` sparingly.
- Type does all the work: \`hero\` (≈150px) for the question or claim in the brand colour (\`accent\`), then the answer in \`display\` or \`h1\` in ink. Medium weight, very tight tracking, sentence case. At most two type sizes per slide.
- The question block sits top-left; the answer anchors to the bottom (\`mt-auto\`). Generous margins (\`slide--roomy\`).
- No images, icons, rules, stickers or effects. A \`counter\` is fine on inner slides.
- Brand: \`logo-mark\` (a small square mark) bottom-right, or the \`wordmark\` bottom-left.
- One idea per slide, ≤ 25 words. A good arc: question → answer → proof → takeaway.
- Avoid: photos, glass, more than two colours on a slide.`,
    layouts: ["statement", "quote", "list", "closing"],
    sample: ["statement", "list", "quote", "closing"],
    fonts: { display: { ...interTight(["400", "500", "600"]), kind: "sans" }, body: interTight(["400", "500"]), mono: mono(["500"]), serif: sourceSerif(["400"]) },
    imagePalette: "soft neutral paper tones with a single cobalt blue accent",
    maxBand: 0.45,
  },
  editorial: {
    id: "editorial",
    label: "Editorial",
    look: "Magazine and newsletter look: serif headlines, photo-led splits, small uppercase tags, a highlighter mark on key words, mono labels; paper, deep-navy or near-black canvases; an optional grainy gradient poster.",
    bestFor: "articles, how-tos, author and creator posts, opinion pieces, hiring posts, thought leadership",
    guide: `- Canvases: paper (default \`slide\`), \`slide--dark\` (deep navy) or \`slide--deep\` (near black). One canvas for the post, perhaps one contrast slide.
- Type: serif \`h1\`/\`hero\` at regular weight, tight, sentence case; sans body; a \`tag\` (small uppercase pill) as the section label ("Article", "Guide", "Opinion"); \`kicker\` in mono for series names and labels; a \`mark\` highlighter on 2–5 key words of a headline (once per slide).
- Imagery: a full-bleed still life or editorial photo across the top of the cover (\`photo photo--bleed-top\`, about 45% of the height) or the user's portrait as a \`cutout\` bottom-right. Generated stills use the image style "still-life".
- Chrome: a \`topbar\` (author or brand left, series right) on the cover; the \`wordmark\` small (\`wordmark--top-right\`); the \`next\` arrow.
- Texture poster (hiring, a role, a place, a date): \`slide--brand\` with a duotone image, \`fx-stipple\` grain and \`frame frame--holo\`; the title top-left, the place or date bottom-right.
- Avoid: heavy weights, stickers, more than one highlight per slide.`,
    layouts: ["photo-top", "author", "texture", "quote", "steps", "list", "closing"],
    sample: ["photo-top", "steps", "quote", "closing"],
    fonts: {
      display: { ...sourceSerif(["300", "400", "500"], ["400"]), kind: "serif" },
      body: interTight(["400", "500", "600"]),
      mono: mono(["400", "500"]),
      serif: sourceSerif(["400", "500"]),
      condensed: condensed(["500", "600"]),
    },
    imagePalette: "natural, cinematic colour with deep navy shadows and warm sunset highlights",
    maxBand: 0.28,
  },
  tech: {
    id: "tech",
    label: "Tech",
    look: "Dark product-launch look: a near-black canvas with a fine grid, mono kickers in a neon highlight, a ticker band, condensed uppercase headlines or large light titles, UI cards and devices bleeding off the edge, big geometric shapes.",
    bestFor: "product updates and feature launches, AI and developer topics, changelogs, 'why it works', principles",
    guide: `- Canvases: near-black (default \`slide\`) with \`fx-grid fx-grid--full\`; \`slide--light\` (paper) for one contrast slide; \`slide--brand\` sparingly.
- Type: \`h1\`/\`hero\` are condensed uppercase bold, for punchy headings ("How we work"); \`display\`/\`lead\` are large light sans for product names and subtitles ("Meet Relay"); \`kicker\` is mono uppercase in the neon highlight. Body light grey.
- A \`ticker\` band across the top of the cover: a 1–2 word label ("What's new") repeated 6–8 times.
- Product proof: a \`window\` (app window) or \`device device--tablet\` with the user's screenshot, or a \`ui\` mock built in HTML (chat bubbles, cards), bleeding off the bottom or right edge (\`bleed\`). Never invent a real product's interface or data; use the user's screenshot or keep the mock generic.
- A big geometric \`shape\` (chevron, arrow, circle) in the accent, bleeding off one edge, on statement slides. \`next\` is a large thin arrow.
- Colour: the neon highlight for kickers, the ticker, the CTA and one key word; the accent for big shapes. No other colours.
- Avoid: serif type, stickers, soft gradients, photos of people.`,
    layouts: ["launch", "shape", "showcase", "steps", "chart", "list", "closing"],
    sample: ["launch", "shape", "chart", "closing"],
    fonts: {
      display: { ...condensed(["600", "700", "800"]), kind: "condensed" },
      body: interTight(["300", "400", "500"]),
      mono: mono(["400", "500", "600"]),
      serif: sourceSerif(["400"]),
      condensed: condensed(["600", "700"]),
    },
    imagePalette: "near-black charcoal with acid lime and orange highlights, low-key lighting",
    maxBand: 0.28,
  },
  paper: {
    id: "paper",
    label: "Paper",
    look: "Warm-paper tool showcase: off-white paper with a faint grid or speckle, app-icon tiles, browser-framed screenshots, letter-spaced coloured kickers, bold black headlines, soft shadows, a swipe progress bar.",
    bestFor: "tool and resource roundups, feature tours, how-to steps, listicles, comparisons",
    guide: `- Canvases: warm paper (default \`slide\`) with \`fx-grid fx-grid--full\` or \`fx-paper\` speckle; \`slide--white\` for variety; \`slide--dark\` (ink) only for the cover or the closing slide.
- Type: bold grotesk headlines, very tight; \`hero\` for the tool or feature name; \`kicker\` letter-spaced in the brand colour (the category); body in muted ink with 2–5 words in \`hl\` (brand colour, bold).
- One item per inner slide: an \`app-icon\` (or a \`chip\`: icon + name), kicker, name, one sentence, a \`window\` with the user's screenshot or a \`ui\` mock, then a \`tag\` + one line of detail.
- Swipe chrome: \`progress\` (\`--at\`, \`--of\`) bottom-centre on inner slides; \`swipe\` hint or the long \`next\` arrow top-right on the cover. Same placement on every slide.
- Avoid: dark slides in the middle, stickers, glass, effects other than grid/speckle.`,
    layouts: ["showcase", "tool", "list", "steps", "closing"],
    sample: ["showcase", "tool", "list", "closing"],
    fonts: { display: { ...interTight(["700", "800"]), kind: "sans" }, body: interTight(["400", "500", "600", "700"]), mono: mono(["500"]), serif: sourceSerif(["400"]) },
    imagePalette: "warm off-white paper tones, soft daylight, muted colours with one blue accent",
    maxBand: 0.26,
  },
};

export const styleList = () => Object.values(STYLES);
