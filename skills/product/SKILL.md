---
name: product
description: Create, fill, update, check or swap the product folder (product/) that every agent reads for brand, voice, facts, offers, GTM and development context. Use when the user introduces a product, brand or client, shares links or documents about what they're building, asks to update prices/offers/facts/brand, says "set up the product" or "switch to product X", or when a request contradicts product/.
---

# The product folder

`product/` is the single source of truth for the product the agents work for. Every agent reads it at run time:
the brand (design tokens, logo, fonts), the voice, the verified facts, the offers and the main actions. The spec, the
layout and the reasons behind it are in `product/README.md` (a blank copy is `templates/product/README.md`); read it
before changing the structure.

```bash
node scripts/product.mjs show              # what the agents will use
node scripts/product.mjs check             # validate: files, tokens, contrast, frontmatter, review dates
node scripts/product.mjs context <agent>   # the exact context an agent receives (carousel, deck, landing-page, …)
node scripts/product.mjs tokens            # regenerate brand/tokens.css after editing brand/design.tokens.json
node scripts/product.mjs index             # refresh the file index in product/README.md
node scripts/product.mjs fetch             # download missing assets from the source URLs in assets/manifest.json
node scripts/product.mjs init --name "Acme" --website https://acme.example [--archive] [--product <dir>]
```

All of these work in the Cowork VM too (plain Node, no dependencies).

## Every request

- Read `product/BRIEF.md` before writing a brief. Check `knowledge/open-questions.md` when a fact looks shaky.
- Briefs carry only what is specific to the job. The agents already get the brand, voice and facts.
- **New facts go into the folder, not only into a brief.** When the user states a price, date, offer, customer or
  number that should outlive this job, add it to `knowledge/facts.md` (next ID, source, date checked) and to the files
  that depend on it (`offerings/`, `BRIEF.md`, `product.json → offerings/cta`). Then run `check`.
- When the user corrects the brand or voice, edit `brand/` (tokens through `design.tokens.json`, then `tokens`), not
  an agent's files.

## Starting a product from links (initialise)

Ask the user for links and documents first (site, socials, decks, repos), and which brand wins if they disagree.

1. `node scripts/product.mjs init --name "<Product>" --website <url>`. Use `--archive` to move the current product to
   `products-archive/`, or `--product products/<id>` to keep several products side by side.
2. **Capture sources** into `knowledge/sources/YYYY-MM-DD-<source>.md`: the copy verbatim, with the URL and date.
   Use WebFetch or the browser; if a site blocks fetching, say so and don't work around it.
3. **Facts.** `knowledge/facts.md`: one row per publishable fact (ID, fact, source, date). Only what a source says.
4. **Offers.** One file per offer in `offerings/`, the copy verbatim; name, audience, price "from", URL, status in
   `product.json → offerings`.
5. **Brand.** Measure, don't guess: computed styles from the live site (colours, font families and weights, sizes,
   radii). Write `brand/design.tokens.json` in the DTCG format with every semantic role (`color.role.*`,
   `font.family.*`; see `product/README.md`). If the accent is too light for text, add an `accent-text` that reaches
   4.5:1 on the background. Then `brand/guidelines.md` (rules, with "inferred" where it's an inference) and
   `node scripts/product.mjs tokens`.
6. **Logo and fonts.** SVG logos in `assets/logo/` (primary, inverse, mark), listed in `product.json → brand.logo`.
   Fonts only with an open licence (keep the licence file) in `assets/fonts/`, listed in `brand.fonts`.
7. **Images.** Download only with the user's permission. Record each file's use, alt text, source URL and rights in
   `assets/manifest.json` (unknown rights go under `rightsToConfirm`), then `node scripts/product.mjs fetch` downloads
   the missing ones. It needs a network that reaches the site: a terminal on your computer works; the Cowork VM may be
   blocked, in which case give the user the command.
8. **Voice and messaging** from the real copy: `brand/voice.md` (principles, words used and avoided, mechanics,
   examples) and `brand/messaging.md` (core message, pillars, proof, boilerplates, CTA library).
9. **BRIEF.md**, under about 1,000 words, verified statements only, with the one action and where to look next.
10. **Strategy and GTM** (`strategy/`, `gtm/`, `development/`): draft them from what you found, with `status: draft`
    and a DRAFT note at the top. Agents never treat drafts as facts.
11. **Open questions.** Every contradiction or gap in `knowledge/open-questions.md`. Ask the user the important ones.
12. `node scripts/product.mjs index`, then `check` until it reports no errors. Look at the result through the agents
    at zero cost: `cd agents/deck-agent && npm run demo -- --theme editorial --only deck --no-export`, and
    `cd agents/collage-post-agent && npm run preview -- brand` (on your computer).

## Tuning an agent for this product

`product.json → agents.<id>` holds per-agent choices; values may reference tokens like `"{color.lime}"`:

| Agent | Keys |
|---|---|
| `carousel` | `brand` (canvas, canvasDeep, glow, glow2, glassTint, accent, onAccent, accentOnLight, surface, ink, onCanvas), `wordmark: "logo" \| "text"`, `imageStyle`, `profiles` |
| `collage-post` | `palette` (`brand` or a stock name), `brandPalette` (bg, ink, ink2, loud, deep, slab, frame, onInk, mode, mood), `fonts: "brand"`, `profiles` |
| `deck` | `theme` (house theme), `colors`, `darkColors`, `fonts` (heading, body, numbers, accent), `highlightStyle`, `vars` (CSS variables), `confidentiality`, `imageStyle`, `wordmark`, `profiles` |
| `landing-page` | `brand` (set_brand values: primary, secondary, dark, background, displayFont, bodyFont, accentFont, headingWeight, roundness), `assets`, `profiles` |
| `dev` | `profiles`; `product.json → repos` lists the repositories that get this product's context |

After a change, check the look with the zero-cost previews above before spending on a real run.

## Rules

- Never invent facts, customers, quotes, logos or numbers. Unknowns are `[X]` in briefs and questions in
  `open-questions.md`.
- Every markdown file keeps its frontmatter (`status`, `owner`, `updated`, `review`); bump `updated` when you edit.
- No secrets in `product/`; it's meant to be shared with the team. The public superproduct repository git-ignores
  `product/` and `products/`; commit them only in a private copy (remove those lines from `.gitignore` there).
- Don't edit `knowledge/sources/` captures or `legacy/` files; add a new dated capture instead.
- A change to how the product is presented (a new colour, a renamed offer) gets a decision record in `decisions/`.
