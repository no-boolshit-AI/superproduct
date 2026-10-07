# Reference library: 10 heroes, 30 sections

Every component below is built from the primitives, follows the style guide, works with any brand, and passes `test_interactions`. Import from `@/components/library`; the source is in `components/library/heroes/` and `components/library/sections/` (Read it before adapting). Screenshots with sample content are in the agent's `docs/library/` folder.

How to use the library:

- **As-is** when the content fits its shape exactly. Utility sections (pricing, FAQ, closing CTA, signup) are the usual candidates.
- **Adapted** when it almost fits: copy it into `components/custom/`, rename it after its content, and change the structure — columns, the visual, the order, what is emphasised.
- **New** whenever the product has something the library doesn't present well: a schedule, a menu, a curriculum, a map, a configurator, a sample report. This is encouraged. Use the library as a reference for quality, spacing and conventions.

Every page needs at least two sections that are new or adapted for its product. Never use the same section type twice on a page.

All sections take `id?`, `kicker?`, `title`, `lead?` and `tone?: SectionTone` unless noted. Heroes render the page's single H1 and sit directly under `Nav`.

---

## Heroes

| # | Component | Look | Best for | Key props |
|---|---|---|---|---|
| 01 | `HeroCentered` | Centred headline, lead and actions; optional wide visual below; optional grid/dots/fade backdrop. | One clear promise plus a strong product visual. | `primary`, `secondary?`, `note?`, `visual?`, `backdrop?: "plain" \| "grid" \| "dots" \| "fade"` |
| 02 | `HeroSplit` | Copy on one side, the core visual on a brand-tinted panel on the other. | SaaS and services where seeing the output sells it. | `primary`, `secondary?`, `points?`, `visual`, `reverse?`, `panel?: "mesh" \| "soft" \| "none"` |
| 03 | `HeroEditorial` | Oversized headline across the container, lead and actions on a ruled line, short facts row. | Consultancies, studios, opinionated brands; no visual needed. | `primary`, `secondary?`, `meta?: string[]` |
| 04 | `HeroTabbedDemo` | Centred headline over a working tab set; each tab shows a different view. *Interactive.* | Products with 2–4 modes, roles or use cases. | `primary`, `secondary?`, `tabs: { id, label, icon?, content }[]` |
| 05 | `HeroLeadForm` | Promise and points on the left, a working email form in a raised card on the right. *Interactive.* | Waitlists, demos, downloads, consultations. | `points?`, `form: { title, action, buttonLabel, subject?, note?, footnote? }` |
| 06 | `HeroStats` | Headline and actions, then a ruled row of 3–4 real figures. | Established businesses with numbers in the brief. | `primary`, `secondary?`, `stats: StatItem[]` |
| 07 | `HeroBento` | Headline tile inside a bento grid with one visual tile and three capability tiles. | Platforms with several capabilities worth seeing at once. | `primary`, `secondary?`, `visual`, `tiles: { icon, title, body }[]` (3) |
| 08 | `HeroSpotlight` | Dark band with a brand glow, centred headline, a visual lifted on a shadow. | Launches, technical or premium products, dark brands. | `primary`, `secondary?`, `visual?` |
| 09 | `HeroDocumentStack` | Promise and outcomes on the left; a fanned stack of the documents the customer receives. | Services, audits, reports, training — output is a document. | `outcomes: string[]`, `primary`, `secondary?`, `documents: { title, meta?, sections }[]` (1–3) |
| 10 | `HeroCarousel` | Promise on the left; a working carousel of use cases, each with its own visual. *Interactive.* | Horizontal products with several audiences or scenarios. | `primary`, `secondary?`, `slides: { label, title, body, visual? }[]` |

## Capabilities and features

| # | Component | Look | Best for | Key props |
|---|---|---|---|---|
| 11 | `FeatureIconGrid` | Intro plus a 2–4 column grid of icon + title + text. | 4–9 parallel capabilities of similar weight. | `items: { icon, title, body }[]`, `columns?: 2 \| 3 \| 4` |
| 12 | `FeatureBento` | Tiles of different sizes; wide/tall tiles carry visuals; one tile can be brand-coloured. | 4–7 capabilities where one or two matter more. | `tiles: { title, body, icon?, visual?, size?: "wide" \| "tall" \| "normal", emphasis? }[]` |
| 13 | `FeatureAlternating` | Text and visual swap sides row by row. | 2–4 major capabilities that each deserve a visual. | `rows: { kicker?, title, body, points?, visual, link? }[]` |
| 14 | `FeatureTabs` | Vertical tab list on the left; the selected item's detail and visual on the right. *Interactive.* | 3–6 modules, roles or workflows compared one at a time. | `items: { id, label, description?, icon?, title, body, points?, visual? }[]` |
| 15 | `FeatureAccordionVisual` | Accordion on one side; opening an item swaps the visual beside it. *Interactive.* | 3–5 steps or capabilities, each with its own picture. | `items: { id, title, body, visual }[]` |
| 16 | `FeatureCarousel` | Horizontal carousel of cards with arrows and dots. *Interactive.* | 4–10 use cases, examples or modules. | `cards: { title, body, icon?, tag?, visual? }[]` |
| 17 | `FeatureStickyList` | Title and action pinned on the left while a numbered list scrolls past. | Principles, reasons, long benefit lists (5–8). | `cta?`, `items: { title, body }[]` |

## Process and comparison

| # | Component | Look | Best for | Key props |
|---|---|---|---|---|
| 18 | `ProcessTimeline` | Intro on the left; numbered steps on a connecting line with duration badges. | Onboarding, delivery, curriculum (3–7 steps). | `steps: { title, body, meta? }[]` |
| 19 | `ProcessStepper` | Row of step buttons with a progress bar; the selected step's detail and visual below. *Interactive.* | A 3–5 step method where each step has substance. | `steps: { id, label, title, body, points?, visual? }[]` |
| 20 | `ComparisonTable` | Two-column table: the product vs. the status quo, row by row. | Switching decisions. | `columns: [ours, theirs]`, `rows: { label, ours, theirs }[]` (cells: `boolean \| string`) |
| 30 | `BeforeAfter` | Two panels: today (crosses) and with the product (checks, brand-tinted). | Change-led products; value without metrics. | `before: { label, items }`, `after: { label, items }` |

## Pricing

| # | Component | Look | Best for | Key props |
|---|---|---|---|---|
| 21 | `PricingTiers` | 2–4 plan cards; a working monthly/yearly toggle when plans have both prices. *Interactive.* | Published prices (never invented). | `plans: { name, description, price: { amount, period? } \| { monthly, yearly }, prefix?, features, cta, highlighted?, badge? }[]`, `yearlyNote?`, `footnote?` |
| 22 | `PricingMatrix` | Plans as columns, grouped capabilities as rows. | Plans that differ in many specifics. | `plans: { name, price?, cta?, highlighted? }[]`, `groups: { name, rows: { label, values } }[]` |

## Proof

| # | Component | Look | Best for | Key props |
|---|---|---|---|---|
| 23 | `StatsBand` | Short statement and 3–4 large figures on a tinted or dark band. | Real, sourced numbers only. | `title?`, `stats: StatItem[]`, `source?` (no kicker/lead) |
| 24 | `LogoCloud` | Logos in a grid or a slow marquee; labelled placeholders when none. | Supplied customer or partner logos. | `label`, `logos?: { name, src? }[]`, `layout?: "grid" \| "marquee"`, `placeholders?` (no title) |
| 25 | `TestimonialCarousel` | One large quote per slide with arrows and dots. *Interactive.* | 2–6 strong quotes from named people. | `items: { quote, name, role, photo? }[]` |
| 26 | `TestimonialWall` | Masonry columns of short quote cards. | 6+ short, real quotes. | `items: { quote, name, role, photo? }[]` |
| 32 | `PullQuote` | One quote at full scale, centred, with attribution. | A single strong voice between denser sections. | `quote`, `name`, `role?`, `photo?` (no title) |
| 33 | `CaseStudy` | Challenge → approach → figures in a card, visual panel beside it. | One documented customer story. | `customer`, `challenge`, `approach`, `stats`, `visual?`, `link?` |
| 34 | `TeamGrid` | People with initials or photo, role and one line. | Services and trust-led businesses (real people only). | `people: { name, role, bio?, photo? }[]` |

## Catalogues and content

| # | Component | Look | Best for | Key props |
|---|---|---|---|---|
| 27 | `FaqSplit` | Title and contact nudge on the left; a working accordion on the right. *Interactive.* | Real objections and practical questions. | `items: { q, a }[]`, `contact?: { text, cta }` |
| 28 | `DirectoryFilter` | Filter chips that really filter a grid of entries. *Interactive.* | Catalogues of 6+ items across 2–6 categories. | `filters`, `entries: { title, body, tags, icon?, status?, href? }[]`, `more?` |
| 29 | `IntegrationsGrid` | Intro on the left; grid of named tiles (logos or icons) on the right. | Tools the brief names. | `items: { name, category?, src?, icon? }[]`, `note?` |
| 31 | `Manifesto` | Large numbered statements split by rules, usually on a dark band. | Beliefs, principles, "how we work". | `statements: { statement, detail? }[]` (no title) |
| 38 | `ResourceCards` | Article/guide cards with tag, status and read time. | Content libraries, guides, docs. | `items: { title, excerpt, tag, status?, meta?, href?, icon? }[]`, `more?` |
| 39 | `SpecSheet` | Pinned intro; grouped key/value rows with icons. | Security, data handling, terms, specs. | `groups: { icon?, name, rows: { key, value }[] }[]` |
| 40 | `VideoFeature` | Poster with a play button that opens a working modal player. *Interactive.* | A product video from the brief (placeholder poster otherwise). | `poster?`, `posterAlt?`, `video?` (.mp4 or embed URL), `videoTitle` |

## Conversion

| # | Component | Look | Best for | Key props |
|---|---|---|---|---|
| 35 | `RoiCalculator` | Working sliders; the result is the product of the inputs × a factor, with the assumption stated. *Interactive.* | Time or money saved, sizing — only with a formula the brief supports. | `inputs: { id, label, min, max, step?, defaultValue, unit? }[]`, `factor?`, `result: { label, prefix?, suffix?, decimals? }`, `assumption`, `cta?` |
| 36 | `CtaBanner` | The main action again on a brand, deep or soft panel inside the container. | The last section before the footer. | `title`, `lead?`, `primary`, `secondary?`, `note?`, `style?: "accent" \| "deep" \| "soft"` (no kicker/tone) |
| 37 | `NewsletterSignup` | Short promise beside a working email form. *Interactive.* | Newsletter, waitlist, lessons by email. | `action` (`mailto:` or endpoint from the brief), `buttonLabel`, `subject?`, `note?` |

---

## Ideas for new sections

When the content has a shape the library doesn't cover, design for it. Examples of sections worth building new:

- A **schedule or agenda** (events, courses, retreats): day tabs with time-slotted rows.
- A **menu or catalogue with prices** (restaurants, shops): grouped lists with dotted leaders.
- A **sample deliverable** (agencies, audits): a full-width document preview with annotated callouts.
- A **configurator** (hardware, plans by seat): segmented options that update a summary card.
- A **coverage map or locations list** (logistics, clinics): a region list with counts beside a simple schematic.
- A **curriculum** (training): modules as an expandable outline with durations.
- An **interactive checklist or quiz** (lead magnets): steps with a live score.
- A **changelog or roadmap** (developer tools): dated entries on a vertical rule.
- A **"day in the life"** (services): a timeline of one customer's day with and without the product.

Follow the conventions in COMPONENTS.md for anything interactive so it works and passes `test_interactions`.
