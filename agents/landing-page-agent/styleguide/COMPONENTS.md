# Primitives and conventions

The template is a design system plus a reference library, not a page. It ships site chrome (`Nav`, `Footer`), styling primitives, working interactive primitives, and 40 reference sections (see LIBRARY.md). Sections you design or adapt live in `components/custom/<section>.tsx`.

Stack: Next.js 16 (App Router, static export), React 19, Tailwind CSS v4 with the Corporate Landing tokens, self-hosted variable fonts, lucide-react through the `Icon` set.

```tsx
import { site } from "@/site.config";
import { Nav, Footer } from "@/components/site";
import {
  Section, SectionIntro, Display, Title, Heading, Subheading, Lead, Body, Small, Label, Kicker, Figure, QuoteText,
  Button, CtaGroup, Card, Badge, Stat, IconTile, Icon, CheckList, Accordion, Placeholder, Wordmark,
  BrowserFrame, DocSheet, ChatBubble, Avatar, Media, KeyValues,
  Tabs, Carousel, Segmented, Filterable, Dialog, RangeField, EmailCapture,
  type Cta, type SectionTone, type StatItem, type IconName,
} from "@/components/ui";
import { HeroSplit, PricingTiers /* … */ } from "@/components/library";
import { cn } from "@/lib/cn";
```

Types: `Cta = { label: string; href: string }`, `StatItem = { value: string; label: string; detail?: string }`, `SectionTone = "canvas" | "surface" | "brand-fade" | "brand-soft" | "brand-mesh" | "grid" | "dots" | "inverse" | "inverse-glow" | "brand-deep" | "accent"`.

---

## Layout and type (`@/components/ui`)

| Primitive | Props | Notes |
|---|---|---|
| `Section` | `id?`, `tone?: SectionTone`, `width?: "page" \| "wide" \| "narrow"`, `spacing?: "default" \| "tight" \| "none"`, `divider?`, `className?`, `containerClassName?` | Full-width band with its content in a centred container. Use it for every section. |
| `SectionIntro` | `title`, `kicker?`, `lead?`, `align?: "left" \| "center" \| "split"`, `actions?` | Kicker → H2 → lead. Optional: many sections read better with the title placed inside a custom layout. |
| `Display` | `children`, `size?: "xl" \| "lg"` | The page's only `<h1>`. Library heroes already render it. |
| `Title` / `Heading` / `Subheading` | `children` (`Heading`/`Subheading` take `as?`) | H2 40px / H3 28px / item title 20px. |
| `Lead` / `Body` / `Small` / `Label` | `children` (`Body strong?`) | Paragraph and label styles. |
| `Kicker` | `children` | Uppercase label above a title, in the brand text colour. |
| `Figure` | `children`, `accent?` | A number or price at title scale. |
| `QuoteText` | `children` | Quotation in the accent face. |

## Content

| Primitive | Props | Notes |
|---|---|---|
| `Button` | `href`, `children`, `variant?: "primary" \| "secondary" \| "ghost" \| "link" \| "contrast"`, `size?: "md" \| "lg"`, `icon?: IconName \| null` | Links styled as buttons. `contrast` is for accent-coloured bands. |
| `CtaGroup` | `primary: Cta`, `secondary?: Cta`, `size?` | Primary + secondary side by side. |
| `Card` | `variant?: "outline" \| "soft" \| "raised" \| "brand"`, `padding?: "none" \| "sm" \| "md" \| "lg"`, `radius?: "md" \| "lg" \| "xl"` | Container. `brand` = tinted card for the one thing to notice. |
| `Badge` | `children`, `variant?: "neutral" \| "accent" \| "solid" \| "success" \| "warning" \| "outline"` | Status or category chip. |
| `Stat` | `value`, `label`, `detail?` | A figure from the brief with its caption. |
| `Icon` / `IconTile` | `name: IconName`; tile: `size?: "sm" \| "md" \| "lg"`, `variant?: "soft" \| "solid" \| "outline"` | Curated Lucide set, addressed by name. |
| `CheckList` | `items`, `mark?: "check" \| "cross" \| "dot"` | Included / excluded lists. |
| `Accordion` | `items: { q, a }[]`, `defaultOpen?` | Native `<details>`; works without JS. |
| `Placeholder` | `label`, `block?` | Visible stand-in for missing material. |
| `Wordmark` | `name`, `logoSrc?` | Brand logo or name. |

Icon names: activity, arrow-right, arrow-up-right, badge-check, bar-chart, bell, book, bot, boxes, briefcase, building, calendar, check, chevron-down, chevron-left, chevron-right, dollar, clock, cloud, code, cog, compass, cpu, credit-card, database, download, file, filter, flag, git, gauge, gift, globe, graduation, handshake, headphones, heart, home, inbox, layers, grid, leaf, lifebuoy, lightbulb, line-chart, link, lock, mail, map, pin, megaphone, message, mic, minus, monitor, package, pen, phone, play, plug, plus, puzzle, quote, receipt, recycle, repeat, rocket, route, scale, search, send, server, settings, share, shield, shield-check, bag, sparkles, star, store, target, timer, trending-up, truck, upload, user, users, wallet, wand, workflow, wrench, x, zap.

## Product visuals

| Primitive | Props | Notes |
|---|---|---|
| `BrowserFrame` | `url?`, `src?` + `alt?`, or `children` | Window frame for a screenshot or a UI built from primitives. Stays light on dark bands. |
| `DocSheet` | `title`, `meta?`, `sections: { heading, lines[] }[]` | A document preview: reports, briefs, plans, contracts. |
| `ChatBubble` | `from`, `children`, `align?` | One message in a conversation visual. |
| `Avatar` | `name`, `src?`, `size?` | Initials or a supplied photo. |
| `Media` | `src?`, `alt?`, `label?` | Image, or a labelled placeholder. |
| `KeyValues` | `rows: { key, value }[]` | Specs, terms, data handling. |

Build visuals from these plus cards, tables and lists, with content from the brief. Give a visual a definite size (`aspect-[4/3]`, `min-h-80`) when it has no intrinsic height.

## Interactive primitives (client components)

| Primitive | Props | Notes |
|---|---|---|
| `Tabs` | `items: { id, label, description?, icon?, content }[]`, `label`, `variant?: "pills" \| "underline" \| "cards"`, `orientation?`, `defaultId?`, `align?` | WAI-ARIA tabs; arrow keys, Home/End. |
| `Carousel` | `children` (one per slide), `label`, `perView?: 1 \| 2 \| 3`, `arrows?`, `dots?`, `autoplay?: ms` | Scroll-snap with arrows, dots and swipe. Autoplay pauses on hover, focus and reduced motion. |
| `Segmented` | `options: { value, label, note? }[]`, `value`, `onChange`, `label` | Radio group (billing period, audience switch). Controlled. |
| `Filterable` | `filters: string[]`, `items: { id, tags, content }[]`, `label`, `allLabel?`, `columns?` | Chips that really filter a grid. |
| `Dialog` | `trigger`, `title`, `children`, `size?` | Native `<dialog>`; Escape, backdrop and close button. |
| `RangeField` | `label`, `value`, `onChange`, `min`, `max`, `step?`, `format?` | Slider with its live value. Controlled. |
| `EmailCapture` | `action` (`mailto:` or `https://` from the brief), `buttonLabel`, `placeholder?`, `subject?`, `note?` | Validates, then opens the mail app or posts the form. |

### Conventions for interactive sections you write yourself

`test_interactions` finds and exercises interactive elements by these conventions. Follow them for anything custom, and put `"use client"` at the top of any file with state or event handlers.

| Pattern | Markup the test expects | Behaviour checked |
|---|---|---|
| Tabs / stepper | `role="tablist"` > `button[role="tab"][aria-selected][aria-controls]` → `[role="tabpanel"][id]` | Clicking each tab selects it and shows its panel; arrow keys move selection. |
| Carousel | wrapper `[data-carousel][data-active-index]`, buttons `[data-carousel-next]` / `[data-carousel-prev]` | Next/prev change the active index. |
| Toggle | `role="radiogroup"` > `[role="radio"][aria-checked]` | Clicking an option checks it. |
| Filter | chips `button[data-filter][aria-pressed]` inside `[data-filter-group]`; items `[data-filter-item]` (hidden when filtered out) | Each chip changes the visible items. |
| Disclosure | `button[aria-expanded]` (+ `aria-controls`) or `<details><summary>` | Opens on click. |
| Dialog | trigger `[data-dialog-trigger]` opening a `<dialog>` | Opens, then closes on Escape. |
| Slider / calculator | `input[type="range"]` with a `[data-range-output]` next to it; computed result in `[data-calculator-result]` | Changing the value updates the output and the result. |
| Email form | `<form>` with `input[type="email"]` and `button[type="submit"]` | Invalid input sets `aria-invalid="true"` instead of submitting. |
| In-page links | `href="#id"` | Every target id exists. |

The mobile menu (`Nav`) and console errors are checked too.

## Writing a section

```tsx
// components/custom/delivery-plan.tsx
import { Badge, Body, Section, SectionIntro, Subheading } from "@/components/ui";

export function DeliveryPlan() {
  return (
    <Section id="plan" tone="surface">
      <div className="grid gap-12 lg:grid-cols-12">
        <SectionIntro className="lg:col-span-4" kicker="The plan" title="Live in four weeks." />
        <ol className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:col-span-8">
          {/* items from the brief */}
        </ol>
      </div>
    </Section>
  );
}
```

- One file per section, named after its content (`delivery-plan.tsx`, not `feature-grid-2.tsx`).
- Use semantic colours (`text-fg`, `text-fg-muted`, `border-border`, `bg-card`, `text-link`) so the section works on any tone; brand colours (`bg-brand-100`, `text-accent-text`, `bg-accent`) for deliberate emphasis.
- To adapt a library section: Read its file in `components/library/`, copy it into `components/custom/` under a new name, and change the structure, not just the props.
