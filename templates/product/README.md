---
title: The product folder
status: verified
owner: 
updated: {{date}}
review: quarterly
---
# product/: the single source of truth for the product

Everything that is specific to the product lives here: what it is, who it is for, what it sells, how it sounds and
looks, what we may claim, how we take it to market and how it is built. The agents in `agents/` are generic. They read
this folder at run time, so swapping this folder swaps the brand of every carousel, collage post, deck, landing page
and PRD they produce.

Currently: **{{name}}** ({{website}}).

## Layout

```
product/
├─ README.md               this file: the spec, how agents use it, how to update or swap it, the file index
├─ BRIEF.md                the product brief: one page every agent reads first
├─ product.json            machine-readable manifest: identity, links, CTA, offers, brand files, context profiles, per-agent choices
│
├─ strategy/               why and for whom (changes rarely)
│  ├─ vision.md            mission, vision, beliefs, product vision board
│  ├─ positioning.md       alternatives, unique attributes, value, best-fit customers, category
│  ├─ audiences.md         ideal customer profile → personas → jobs to be done, triggers, objections
│  ├─ competitors.md       competitive alternatives and how we differ
│  └─ business-model.md    revenue, pricing logic, costs, channels, key metrics (lean canvas)
├─ brand/                  how it looks and sounds
│  ├─ guidelines.md        logo, colour, type, layout, imagery, icons, do/don't, how each agent applies the brand
│  ├─ voice.md             voice principles, tone by context, vocabulary, mechanics, annotated examples
│  ├─ messaging.md         message house, proof points, boilerplates, CTA library, headline bank
│  ├─ design.tokens.json   design tokens (W3C DTCG 2025.10): colours with semantic roles, type, radii, layout
│  └─ tokens.css           CSS custom properties generated from the tokens (don't edit)
├─ offerings/              one file per thing we sell or give away
├─ gtm/                    how we reach people: strategy, channels, sales pitch, launches/
├─ knowledge/              reference: facts (claims register), FAQ, glossary, company, open questions, sources/
├─ development/            how the product is built and evolves: architecture, roadmap, metrics, research, specs/
├─ decisions/              decision log (one numbered file per decision)
└─ assets/                 files agents can use: logo/, fonts/, images/, manifest.json (alt text, source, rights)
```

## Conventions

**Frontmatter on every markdown file.** Agents use it to decide how much to trust a file.

```yaml
---
title: Positioning
status: draft            # verified | draft | template
owner: jane@example.com
updated: {{date}}
review: quarterly        # weekly | monthly | quarterly | yearly; check flags files past their review date
sources: [https://example.com/]
---
```

- `verified`: every statement can be traced to a source (the live site, a signed document, the owner). Agents may
  state it as fact.
- `draft`: inferred or proposed; useful for direction and tone. Agents are told never to present it as fact.
- `template`: not filled in yet. Agents ignore it.

**Facts discipline.** `knowledge/facts.md` is the claims register: each publishable fact or number with its source and
the date it was checked. An agent may state a fact only if it is in the register, in another verified file, or in the
brief it was given. Missing facts become visible placeholders (`[X]`, `[Placeholder: …]`), never inventions.

**Copy taken from a source** is quoted exactly and marked as such ("verbatim from the site"), so nobody "improves" it
by accident.

**Design tokens** follow the W3C Design Tokens Community Group format (2025.10): `$value`, `$type`, groups with
inherited types, `{alias}` references and colour objects with a `hex` fallback. Every product defines the same
semantic roles under `color.role.*`: `primary`, `on-primary`, `secondary`, `accent`, `on-accent`, `accent-text`,
`background`, `surface`, `text`, `text-muted`, `text-subtle`, `inverse`, `on-inverse`, `border`; plus
`font.family.sans` / `serif` / `mono`. Agents read roles, never raw palette names, which is what makes the folder
swappable. After editing the tokens, run `node scripts/product.mjs tokens`.

**Assets** are listed in `assets/manifest.json` with their use, alt text, source and rights. Fonts carry their licence
file.

**Decisions** that change how the product is presented get a numbered file in `decisions/` (context, decision,
consequences), so the next person knows why.

## How the agents use it

`lib/product.mjs` finds the folder (`--product <dir>` → `PRODUCT_DIR` → the nearest `product/` above the agent),
validates it and compiles a context for each agent: `BRIEF.md` plus the files of the agent's profiles in
`product.json → context`, each tagged with its status, within a size budget.

| Agent | Brand it takes from here | Context profiles | Product choices in `product.json → agents` |
|---|---|---|---|
| carousel | canvas, glass, glows, accent, fonts, logo (inverse on dark slides), image style, derived from the colour roles | content | `brand` (explicit colour mapping incl. `glassTint`), `wordmark`, `imageStyle` |
| collage-post | masthead, a `brand` palette (the default), brand fonts | content | `palette`, `brandPalette`, `fonts` |
| deck | every theme's colours (a light accent stays a fill; text and lines use `accent-text`; ==highlights== get a marker), dark-theme palette from `inverse`, fonts from the typography tokens, logo (inverse on dark pages), confidentiality line, house theme | content, sales | `theme`, `colors`, `darkColors`, `fonts`, `highlightStyle`, `vars`, `confidentiality`, `imageStyle`, `wordmark` |
| landing-page | `PRODUCT.md` in the site folder (`set_brand` values, logos, actions, context); logos in `public/assets/brand/`, the mark as favicon | content, design | `brand` (set_brand values), `assets` (extra files to copy) |
| dev | product context and the brand's CSS variables in the PRD, plan, implementation and review sessions | development, design | `profiles`; only for repositories listed in `repos` (or a project profile's `product`, or `--product`) |

Order of precedence: command-line flags (`--product`, `--brand`, `--palette`, …) beat this folder; this folder beats an
agent's own `.env` defaults (`BRAND_FILE`, `PALETTE`, `BRAND_NAME`) and built-in looks. For landing pages, a brief's
own Brand section beats it too. `--product none` (or `PRODUCT_DIR=none`) turns it off for a run. Every agent prints
which product it uses at start-up and records it with its output (`run.json`, `job.json`, `.lpa/result.json`).

See what an agent will receive: `node scripts/product.mjs context carousel`.

## Keeping it current

```bash
node scripts/product.mjs show       # name, CTA, colour roles with contrast, fonts, offers, doc status
node scripts/product.mjs check      # broken references, missing files, contrast, stale or unsourced docs
node scripts/product.mjs tokens     # regenerate brand/tokens.css after editing the tokens
node scripts/product.mjs index      # refresh the file index at the end of this README
node scripts/product.mjs context <agent>   # the exact product context an agent gets
node scripts/product.mjs fetch      # download assets listed in assets/manifest.json that have a source URL
```

- Prices, offers, links or legal facts change: update `offerings/`, `knowledge/facts.md`, `product.json` and
  `BRIEF.md` together, then run `check`.
- A draft gets confirmed: change its status to `verified`, add the source, update the date.
- The main agent can do the refresh for you: "re-check the product folder against the site" (skill `product`).

## Swapping or starting a product

```bash
node scripts/product.mjs init --name "Acme" --website https://acme.example --archive
```

`--archive` moves the current folder to `products-archive/<id>-<date>/`. The new `product/` comes from
`templates/product/`. Then ask the main agent to fill it from the product's links and documents (skill `product`): it
captures the sources, extracts facts, offers, voice and design tokens, marks inferences as drafts and lists open
questions. Keeping several products side by side also works: put each in its own folder and point `PRODUCT_DIR` (or
`--product`) at the one you want.

## Why it is organised this way

- **One folder, swappable.** Product context in one place, separate from the agents, is the "shared business brain"
  pattern: write it once, inject the relevant parts into every task ([MindStudio](https://www.mindstudio.ai/blog/shared-business-brain-claude-code-skills)).
  Public handbooks such as [GitLab's](https://handbook.gitlab.com/handbook/marketing/brand-and-product-marketing/brand)
  show the same idea at company scale.
- **A short brief first, details on demand.** Context is a finite resource; agents do best with the smallest set of
  high-signal tokens plus file paths they can load just in time ([Anthropic, context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
  The same progressive disclosure is how [Agent Skills](https://agentskills.io/specification) are built, and
  [llms.txt](https://www.answer.ai/posts/2024-09-03-llmstxt.md) uses a summary followed by linked sections. Hence
  `BRIEF.md` plus profiles.
- **Machine-readable next to human-readable.** `product.json` and DTCG tokens for code; markdown for people and
  models. The DTCG format is the vendor-neutral standard for tokens and is supported by tools such as Style Dictionary
  ([DTCG 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/),
  [Style Dictionary](https://styledictionary.com/info/dtcg/)).
- **Separated by purpose.** Strategy explains why, brand and offerings are reference, GTM and development are plans:
  the same split by reader need as [Diátaxis](https://diataxis.fr/).
- **Positioning before messaging.** `strategy/positioning.md` follows April Dunford's components (alternatives, unique
  attributes, value, best-fit customers, category) and feeds `brand/messaging.md`
  ([summary](https://www.antoinebuteau.com/lessons-from-april-dunford.md)). The messaging file uses the message-house
  structure of value proposition, pillars and proof points ([Product Marketing Alliance](https://www.productmarketingalliance.com/messaging-framework/)).
- **ICP, then personas, then jobs.** Which companies, who decides inside them, and why each person cares
  ([ICP vs persona vs JTBD](https://davidhart.substack.com/p/icp-vs-persona-vs-jobs-to-be-done)).
- **A voice guide written for models.** Behavioural principles, tone by context, preferred and banned words,
  structural rules, proof standards and annotated good/bad examples ([Glean](https://www.glean.com/perspectives/how-to-create-a-brand-voice-guide-for-ai-tools),
  [Kaleigh Moore](https://www.kaleighmoore.com/blog/2026/2/16/what-to-include-in-ai-brand-kit)).
- **GTM as a decision document.** Context, ICP, buying group, positioning, channels, launch plan and measurement in one
  place ([Prose Media](https://www.prosemedia.com/blog/go-to-market-strategy-template-launch-plan)).
- **Freshness and ownership in every file.** Dated, owned context documents stay trustworthy
  ([10 context documents for agents](https://aatir.substack.com/p/10-context-documents-product-teams)); `check` turns
  the `review` field into warnings.
- **Decision records.** Short context/decision/consequences files, after Michael Nygard's architecture decision
  records.

## File index

<!-- index:start -->
<!-- index:end -->
