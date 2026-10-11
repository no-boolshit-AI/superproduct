# Corporate Landing agent

A Claude Agent SDK agent that turns a written brief into a Next.js + Tailwind CSS landing page with the **Corporate Landing** design system, dressed in the product's own brand: its colours, fonts and corner style.

Each run copies the template, has Claude plan the page from the brief, apply the brand, compose sections (from a reference library of 40, adapted, or designed new for the product), then lint, build, click through every interactive element, screenshot and fix what it sees. You get a static site in `sites/<slug>/out` and the editable source in `sites/<slug>`, in the workspace (`../../workspace/sites/`, see [`lib/workspace.mjs`](../../lib/workspace.mjs)).

- **Brand per site.** `set_brand` turns the brand's primary colour into an 11-step OKLCH scale with contrast-checked button, link and dark colours, and sets fonts and roundness. There is no house colour; the agent never falls back to blue unless the brand is blue.
- **Centred layout.** Every section's content sits in a centred container (1216px by default, 1376px wide, 768px narrow). Only backgrounds run edge to edge.
- **Reference library, not a template.** 10 hero types and 30 section types, all working. The agent may use them as-is, adapt a copy, or design new sections — new sections are encouraged, and every page must have at least two that are new or adapted.
- **Everything works.** Tabs, carousels, steppers, toggles, filters, accordions, dialogs, sliders and email forms are real, keyboard-accessible, and tested in a headless browser on every run.

```
landing-page-agent/
├─ styleguide/
│  ├─ STYLEGUIDE.md     visual language: layout, brand & colour, type, shape, tones, interaction, voice
│  ├─ COMPONENTS.md     primitives, interactive primitives, conventions for custom sections
│  ├─ LIBRARY.md        catalogue of the 10 heroes and 30 sections
│  ├─ tokens.css        Tailwind v4 @theme, the single source of truth
│  └─ tokens.json       same tokens for other tools (Figma, Style Dictionary…)
├─ template/            Next.js 16 + React 19 + Tailwind 4 starter
│  ├─ components/ui/       primitives (+ interactive/)
│  ├─ components/site/     Nav, Footer
│  └─ components/library/  heroes/ and sections/
├─ gallery/             sample content for every library component (npm run gallery)
├─ docs/library/        screenshots of each library component
├─ src/
│  ├─ agent.ts          scaffold → Claude (Agent SDK) → independent lint + build + interaction test
│  ├─ tools.ts          MCP tools: set_brand, check_styleguide, build_site, screenshot_site, test_interactions
│  ├─ brand.ts          colour scales, contrast, fonts, roundness → styles/brand.css
│  ├─ interactions.ts   Playwright click-through of every interactive element
│  ├─ prompt.ts         system prompt (inlines STYLEGUIDE.md, COMPONENTS.md, LIBRARY.md)
│  ├─ lint.ts           style checker
│  ├─ gallery.ts        builds the library gallery and screenshots
│  ├─ cli.ts            command line
│  └─ server.ts         HTTP API (+ jobs.ts queue)
├─ briefs/example.md
└─ sites/package.json   the packages every site builds with (installed next to the sites, in the workspace)
```

## Setup

Requires Node 20.9 or newer.

```bash
npm install
npm run setup                 # installs Next/Tailwind/fonts into the workspace's sites/ and Chromium for screenshots
cp .env.example .env          # optional: model, budget; auth is below
npm run page -- --dry-run     # builds, tests and screenshots the starter page; no model call
npm run gallery               # optional: builds the library gallery, tests it, refreshes docs/library/
```

## Authentication

**Claude subscription (Pro, Max, Team, Enterprise).** If Claude Code is installed and you're logged in on this machine, there's nothing to configure: the SDK uses that login. Otherwise install Claude Code, run `claude`, and type `/login`. For a machine without a browser, run `claude setup-token` and put the token in `.env` as `CLAUDE_CODE_OAUTH_TOKEN`. Runs count against your plan's usage limits. Use this for your own runs only: serving the agent to other people (for example through the HTTP API) needs an API key.

**API key.** Set `ANTHROPIC_API_KEY` in `.env` for pay-as-you-go billing from platform.claude.com. If both are present, the API key wins.

## Build a page

```bash
npm run page -- "Crumb is a sourdough subscription in Lisbon. Main action: order a weekly loaf. ..."
npm run page -- -f briefs/example.md
npm run page -- -f ../../workspace/briefs/acme.md -s acme-launch -a ../../workspace/briefs/acme/assets --budget 6
npm run page -- -f ../../workspace/briefs/acme.md -s acme-launch --replace   # rebuild into the same folder
```

`-a` copies logos, screenshots or photos into the site's `public/assets/`; the agent is told they exist and uses them. Anything a brief does not supply (customer logos, quotes, metrics) becomes a visible `[Placeholder]`, never invented content.

### The product folder

When there is a product folder (`-p/--product <dir|id>`, else `$PRODUCT_DIR`, else the workspace's `product/`; `none` turns it off; see [`templates/product/README.md`](../../templates/product/README.md)), every site is built for that product:

- **`PRODUCT.md`** in the site folder: the `set_brand` values (from `product.json → agents.landing-page.brand`, or derived from the design tokens: primary, inverse → dark, off-white background, the font roles matched to the font list, the heading weight and the corner style), the logo files, the main actions from `product.json → cta`, and the compiled product context (`BRIEF.md`, voice, messaging, facts, offers, brand guidelines; profiles `content` and `design`). The agent reads it after `BRIEF.md`, uses its brand values unless the brief has its own Brand section, writes in its voice and may use its verified facts (not the ones marked draft). Where the two disagree, the brief wins.
- **`public/assets/brand/`**: `logo.svg`, `logo-inverse.svg` and `mark.svg` from the product. The agent sets `site.config.ts → brand.logoSrc` to the logo, and `set_brand` uses the mark as the favicon.
- Both are read-only for the agent, and words that appear in `PRODUCT.md` are allowed by the denylist like words from the brief.

Product fonts that aren't in `set_brand`'s list get the nearest stand-in, and `PRODUCT.md` says so. `.lpa/result.json` records which product a page was built for. With a product folder, a brief only needs what is specific to the page: its purpose, audience and main points.

Preview: `npx serve ../../workspace/sites/<slug>/out`, or open `sites/<slug>/.lpa/screens/` in the workspace for the screenshots the agent reviewed. Re-check a site you edited by hand with `npm run check -- <slug>` (lint, build, interaction test, screenshots).

### What a good brief contains

Product name and one-line description, audience, the single main action (and its URL), 3–6 features or benefits, any real numbers, customers, quotes and integrations you can publish, the tone, and a **Brand** section:

```
Brand:
- Primary colour: #B4572E
- Secondary colour (optional): #…
- Dark colour (optional): #2B1D16
- Background (optional, very light): #F7F3EE
- Fonts: Fraunces for headings, DM Sans for text (or describe the feel)
- Corners: sharp | soft | round
```

Without a Brand section (and without a product folder) the agent picks a colour and fonts that fit the product and lists the choice under "Assumptions". `briefs/example.md` is a template.

## The library

`npm run gallery` builds every hero and section with sample content for a fictional company, runs the interaction test, and saves one screenshot per component to `docs/library/`. Try other brands to see the system re-theme:

```bash
npm run gallery -- --primary "#0F766E" --display space-grotesk --body inter --roundness round
npm run gallery -- --primary "#7c3aed" --display fraunces --body inter --roundness soft --no-shots
```

Fonts: inter, manrope, dm-sans, plus-jakarta-sans, space-grotesk, ibm-plex-sans, outfit, instrument-sans, fraunces, source-serif-4, crimson-pro.

## HTTP API

```bash
LPA_API_TOKEN=change-me npm run serve        # http://localhost:8787

curl -X POST localhost:8787/pages \
  -H "Authorization: Bearer change-me" -H "content-type: application/json" \
  -d '{"brief": "…", "slug": "acme-launch"}'
# → 202 {"id": "…", "statusUrl": "…/pages/<id>"}

curl -H "Authorization: Bearer change-me" localhost:8787/pages/<id>
# → status (queued|running|succeeded|failed|cancelled), recent events, result, previewUrl
```

| Method | Path | |
|---|---|---|
| POST | `/pages` | `{ brief, slug?, model?, maxBudgetUsd? }` → 202 with job id |
| GET | `/pages` | list jobs |
| GET | `/pages/:id` | status, last 50 events, result |
| DELETE | `/pages/:id` | cancel |
| GET | `/preview/:slug/` | the built static site |

Jobs run one at a time by default (`LPA_CONCURRENCY`). Each concurrent agent needs about 1 GiB RAM.

## How it works

1. **Scaffold** (`scaffold.ts`): copy `template/` to `sites/<slug>` (in the workspace), install the current `tokens.css`, write `BRIEF.md`, copy assets; the first run in a workspace also installs the packages the sites build with there (`site-deps.ts`).
2. **Agent** (`agent.ts`): `query()` from `@anthropic-ai/claude-agent-sdk` with
   - a system prompt containing the style guide, primitives and library catalogue, and a plan-first workflow: buyer questions → one section per question, each marked library / adapted / new;
   - built-in `Read`, `Write`, `Edit`, `Glob`, `Grep` only (no shell, no web);
   - five in-process MCP tools: `set_brand`, `check_styleguide`, `build_site` (`next build`, static export), `screenshot_site` (image slices the model looks at) and `test_interactions`;
   - `permissionMode: "dontAsk"` with an explicit allowlist, plus a `PreToolUse` hook that confines file access to the site folder, keeps the design system, library and generated brand files read-only, and enforces the order PLAN.md → set_brand → code;
   - `maxTurns` and `maxBudgetUsd` caps; auth/billing errors fail fast.
3. **Verify**: after the agent finishes, the orchestrator runs the checker, the build and the interaction test itself and records `sites/<slug>/.lpa/result.json`. A run is `success` only if all three pass.

The checker (`lint.ts`) enforces the guide mechanically: the brand must be set, no raw colours, no default Tailwind palette/sizes/radii/shadows (they are also removed from the theme), no arbitrary visual values or inline styles, hand-written `<section>`s must use a centred container, exactly one H1 (library heroes count), alt text on images, no leftover starter content, a `PLAN.md`, at least two custom sections, and an optional denylist (`LPA_DENYLIST`).

## Customising

- **Change the system look:** edit `styleguide/tokens.css` (neutrals, type scale, spacing, containers). Every new site picks it up; the template and checker read the same file.
- **Add fonts:** add an entry to `FONTS` in `src/brand.ts` and the matching `@fontsource-variable/*` package to `template/package.json` and `sites/package.json`.
- **Change the rules or voice:** edit `STYLEGUIDE.md`. It is inlined into the system prompt.
- **Add a library section:** add it under `template/components/library/sections/`, export it from `library/index.ts`, add sample content to `gallery/page.tsx`, document it in `LIBRARY.md`, and run `npm run gallery`.
- **Model:** `LPA_MODEL` (alias like `opus`/`sonnet` or a full model ID), per run with `-m`.

## Configuration

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | API key; leave unset to use your Claude subscription login |
| `CLAUDE_CODE_OAUTH_TOKEN` | — | subscription token from `claude setup-token` (only if you can't `/login`) |
| `LPA_MODEL` | `opus` | model alias or ID |
| `LPA_MAX_BUDGET_USD` | `8` | per-run spend cap |
| `LPA_MAX_TURNS` | `120` | per-run turn cap |
| `LPA_REVIEW_ROUNDS` | `2` | visual review rounds the agent is asked to do |
| `LPA_SITES_DIR` | the workspace's `sites/` | where pages are generated, with the packages they build with |
| `LPA_PORT` / `LPA_API_TOKEN` | `8787` / — | HTTP API; set a token before exposing it |
| `LPA_CONCURRENCY` | `1` | parallel jobs in the API |
| `LPA_CHROMIUM_PATH` | — | use an existing Chromium instead of Playwright's |
| `LPA_DENYLIST` | — | comma-separated terms that must never appear in copy |
| `PRODUCT_DIR` | the workspace's `product/` | product folder for brand, voice and facts; `none` turns it off (`-p` wins) |

## Deploying a generated page

`sites/<slug>/out` (in the workspace) is plain static HTML/CSS/JS: upload it to any static host (Vercel, Netlify, Cloudflare Pages, S3). To keep developing it outside this repo, copy `sites/<slug>` anywhere and run `npm install && npm run dev` inside it.
