# superproduct

**One product folder, five AI agents.** superproduct is an open-source set of
[Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) agents that make marketing and product
work for *your* product: LinkedIn carousels, editorial collage posts, decks and reports, landing pages, and features on
your GitHub repositories. Every agent reads the same **product folder** (brand tokens, logo, fonts, voice, verified
facts, offers, go-to-market and development notes), so what they make is on-brand and on-message. Swap the folder and
the same agents work for another brand.

You don't drive the agents one by one. You talk to one Claude ([Claude Code](https://github.com/anthropics/claude-code),
or Cowork in the Claude desktop app) opened in this folder. Following [`CLAUDE.md`](CLAUDE.md), it routes each request to
the right agent, writes the brief, runs it with a budget, relays the agent's questions, checks the result and reports
back.

## The agents

| Agent | Makes | Needs |
|---|---|---|
| [**carousel**](agents/carousel-agent) | LinkedIn document carousels in a consulting look (hero numbers, frosted-glass cover): PDF, PNGs, caption | Claude; OpenAI for imagery (optional) |
| [**collage-post**](agents/collage-post-agent) | Editorial collage posts and carousels, 1080×1350 (cutouts, duotones, torn paper, loud type): PNGs, caption | Claude, OpenAI |
| [**deck**](agents/deck-agent) | 16:9 decks and A4 reports from a brief and your data, with charts, tables and diagrams: searchable PDF | Claude; OpenAI for images (optional) |
| [**landing-page**](agents/landing-page-agent) | Next.js + Tailwind landing pages, linted, built, click-tested and screenshotted: static site | Claude |
| [**dev**](agents/dev-agent) | Features on an existing GitHub repository: PRD, milestone plan, tested commits in Docker, review, branch and draft PR | Claude, GitHub token, Docker |

They run on your computer and spend your own Claude credit (an API key or your Claude subscription); every run has a
budget cap. Each agent is self-contained, with its own README, `.env.example` and zero-cost tests.

## How it works

```
you ──► Claude in this folder (CLAUDE.md + skills/)
          │  picks the agent, writes briefs/<date>-<slug>.md, runs it, relays questions, checks the output
          ▼
        agents/<agent> ──reads──► product/   brand tokens · logo · fonts · voice · facts · offers · GTM
          │
          ▼
        PDFs, PNGs, static sites, branches and pull requests (in each agent's output folder)
```

### The product folder

`product/` is the single source of truth. The agents never hard-code a brand: they load the folder at run time through
[`lib/product.mjs`](lib/product.mjs), a zero-dependency loader.

```
product/
├─ BRIEF.md          one page every agent reads first
├─ product.json      identity, links, main action, offers, brand files, repositories, per-agent settings
├─ brand/            design.tokens.json (W3C DTCG, semantic colour roles), tokens.css, guidelines, voice, messaging
├─ offerings/        one file per offer
├─ knowledge/        facts register with sources, FAQ, glossary, open questions, captured sources
├─ strategy/ gtm/    positioning, audiences, competitors, channels, launches
├─ development/      architecture, roadmap, specs, research, metrics
├─ decisions/        decision records
└─ assets/           logos, fonts (open licences only), images with rights notes
```

- **Trust levels.** Every document is `verified`, `draft` or `template`. Agents state only verified facts, treat drafts
  as direction, and turn unknowns into visible placeholders such as `[X]` instead of inventing numbers.
- **Precedence.** Command-line flags (`--product`, `--brand`, `--palette`, …), then the product folder, then each
  agent's `.env`, then built-in defaults. `--product none` runs an agent without it.
- **Several products.** Keep one folder per product or client (`products/<id>/`) and pass `--product`, or switch
  `product/` over with `init --archive`.

The full spec, with the reasons behind the layout, is [`templates/product/README.md`](templates/product/README.md). A
complete fictional example is in [`lib/fixtures/acme`](lib/fixtures/acme).

## Quick start

You need Node 20.12+, git and Claude Code (or the Claude desktop app with Cowork); Docker for the dev agent.

```bash
git clone https://github.com/no-boolshit-AI/superproduct.git
cd superproduct
node scripts/agents.mjs init            # links skills/ into .claude/skills and adds .claude/settings.json
node scripts/agents.mjs install all     # npm install, Chromium and setup steps for every agent
node scripts/agents.mjs test all        # zero-cost self-tests against a mock Claude API
```

Fill in each agent's `.env` from its `.env.example` (see [Keys](#keys)), then check that everything is ready:

```bash
node scripts/agents.mjs status          # installed? keys set (names only)? Chromium? Docker?
```

### Set up your product

```bash
node scripts/product.mjs init --name "Acme" --website https://acme.example
```

This creates `product/` from the template. Open Claude in this folder and ask it to fill the folder in:

> Set up the product folder from acme.example, our pitch deck and our LinkedIn page.

Claude captures the sources, measures the brand from your site into design tokens, writes the brief, facts, offers and
voice, marks inferences as drafts and lists open questions (skill [`product`](skills/product/SKILL.md)). Then:

```bash
node scripts/product.mjs check          # files, tokens, contrast, frontmatter, review dates
node scripts/product.mjs show           # what the agents will use
node scripts/product.mjs context deck   # exactly what one agent receives
```

To try the agents before your own product is ready, point them at the fictional fixture:
`export PRODUCT_DIR="$PWD/lib/fixtures/acme"` (from the repository root).

### Ask for work

> Make a LinkedIn carousel about our spring offer, portrait, 5 slides.
>
> Build a landing page for the new plan and a collage post announcing it.
>
> A board deck on Q3 from these two spreadsheets.
>
> Add CSV export to the invoices page in acme/shop.
>
> We changed our prices: \<link\>. Update the product folder.

Every agent also runs by hand from its folder; its README lists the commands, for example
`cd agents/deck-agent && npm run deck -- --file ../../briefs/2026-10-07-board.md`.

## Keys

| Agent | Claude | Other |
|---|---|---|
| carousel, deck, landing-page | the Claude Code login on your computer, or `ANTHROPIC_API_KEY` | `OPENAI_API_KEY` for images (carousel, deck; optional) |
| collage-post | `ANTHROPIC_API_KEY` | `OPENAI_API_KEY` |
| dev | `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) | `GITHUB_TOKEN`, Docker |

Keys go in each agent's own `.env`, which is git-ignored. `status` reports which names are set, never their values.

## Running in Cowork

Cowork's shell is a Linux VM that sees this folder but not your computer's Chromium, Docker or `node_modules`, so the
agents always run on your computer. In Cowork, Claude writes the briefs, gives you the command to paste into a
terminal, and follows the run through its output files. `status`, `outputs`, the dev-agent relay (`pending`, `answer`)
and `scripts/product.mjs` work from the VM.

## Repository layout

```
├─ CLAUDE.md             instructions for the main Claude: routing, briefs, budgets, review, rules
├─ agents.json           registry: commands, install and test steps, required keys, outputs
├─ agents/               the five agents
├─ skills/               one skill per agent, plus product and campaign (multi-agent work)
├─ lib/product.mjs       product folder loader: find, validate, tokens to colours and fonts, compiled context
├─ lib/fixtures/acme/    fictional example product, used by the tests
├─ schemas/              JSON Schema for product.json
├─ scripts/agents.mjs    init · list · status · outputs · install · test · run · web · pending · answer
├─ scripts/product.mjs   init · show · check · context · tokens · index · fetch
├─ templates/product/    blank product folder and its spec
├─ briefs/               briefs the main Claude writes (git-ignored)
└─ product/              your product (created by init, git-ignored)
```

## Your data stays out of this repository

`product/`, `products/`, `briefs/`, the agents' outputs and every `.env` are git-ignored, so your brand, facts, strategy
and work never end up in a public fork by accident. To version your product, keep a private copy (a private repository
cloned from this one) and delete the `/product/` and `/briefs/*` lines from its `.gitignore`. Don't open pull requests
against this repository from a branch that contains them.

## Adding an agent

New agents follow the conventions of the existing ones: TypeScript on the Claude Agent SDK, a CLI with `--file`,
`--budget` and `--product`, the product folder through `lib/product.mjs`, one output folder per run, and zero-cost tests
against a mock Claude API. The checklist is at the end of [`CLAUDE.md`](CLAUDE.md#adding-or-changing-an-agent).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Copyright (C) 2026 The superproduct authors.

superproduct is free software: you can redistribute it and/or modify it under the terms of the
[GNU Affero General Public License](LICENSE) as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; see the license for details. If you offer a modified version to others over a network (an agent's web UI or
HTTP API, for example), the AGPL requires you to offer them its source code too.

Bundled third-party files keep their own licences: the fonts are under the SIL Open Font License (licence files next to
them), the collage agent's sample photos are credited in
[`design/samples/CREDITS.txt`](agents/collage-post-agent/design/samples/CREDITS.txt), and npm dependencies come under
their own terms.
