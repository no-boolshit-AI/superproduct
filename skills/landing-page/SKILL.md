---
name: landing-page
description: Build a branded marketing landing page (Next.js + Tailwind, tested, static export) from a brief with agents/landing-page-agent. Use for landing pages, product/launch/course pages, one-page sites, and redesigns of a page from a written brief.
---

# landing-page-agent (Corporate Landing)

**Folder:** `agents/landing-page-agent`. **Command:** `npm run page -- …`. **Time:** about 10 to 30 minutes.
**Spend:** Claude about $3 to $8 (`LPA_MAX_BUDGET_USD`, default 8).

It copies a Next.js 16 / Tailwind 4 template and plans the page from buyer questions (one section per question).
Then it:
- applies the brand: colour scale, fonts, roundness;
- composes sections from a library of 40, adapted or new (at least two must be new or adapted);
- lints, builds, clicks through every interactive element, screenshots the page and fixes what it sees.

**Product folder.** The agent reads `product/` by itself: the scaffold writes `PRODUCT.md` into the site (the
`set_brand` values, logo files, the main actions from `product.json → cta`, the brand guidelines, voice and verified
facts) and copies the logos into `public/assets/brand/` (the mark becomes the favicon). The agent uses those brand
values unless the brief has its own Brand section, and the brief wins where the two disagree. `-p none` turns it off.

## Readiness
- Check with `node scripts/agents.mjs status landing-page`.
- Claude auth is the Claude Code login on your computer, or `ANTHROPIC_API_KEY` in its `.env`.
- Zero-cost smoke test: `npm run page -- --dry-run`.

## Brief (`briefs/YYYY-MM-DD-<slug>.md`, assets in `briefs/YYYY-MM-DD-<slug>/assets/`)
With the product folder, the brief is about **this page**: what it is for (one offer, a launch, an event), the
audience, the single main action and its URL if it differs from the product's, the 3 to 6 points it must make, and any
publishable numbers, customers, quotes or integrations that aren't in `product/knowledge/facts.md`. The product name,
brand, voice and general facts come from `PRODUCT.md`.

For a page about something else (a client's product, without a product folder), the brief needs everything: the product
name and a one-line description, the audience, the **single main action and its URL**, 3 to 6 features or benefits,
publishable proof, the tone, and a Brand section:
```
Brand:
- Primary colour: #3052F7
- Secondary colour (optional): #7A5CFF
- Dark colour (optional): #101E21
- Background (optional, very light): #F2F2F2
- Fonts: Inter Tight for headings, Inter for text (or describe the feel)
- Corners: sharp | soft | round
```
Run that one with `-p none` (or `-p <the client's product folder>`). Anything missing becomes a visible
`[Placeholder]`, never invented content.

## Run
```bash
cd agents/landing-page-agent
npm run page -- -f ../../briefs/<brief>.md -s <slug> -a ../../briefs/<brief>/assets
npm run page -- -f ../../briefs/<brief>.md -s <slug> --replace     # rebuild the same site (overwrites!)
npm run check -- <slug>                                          # re-verify after hand edits (no model)
```

| Option | |
|---|---|
| `-s, --slug` | folder under `sites/` |
| `--replace` | overwrite `sites/<slug>`; confirm with the user first |
| `-a, --assets <path>` | screenshots, photos, extra logos, copied to `public/assets` (repeatable) |
| `-p, --product <dir\|none>` | product folder (default: `$PRODUCT_DIR`, else `product/`) |
| `-m, --model`, `--budget`, `--max-turns`, `-q` | model, spend cap, turn cap, quiet |

## Output: `sites/<slug>/`
- `out/`: the static site, ready for any static host;
- `.lpa/screens/`: the screenshots the agent reviewed;
- `.lpa/result.json`: lint, build and interaction results;
- `PLAN.md`: the section plan;
- `PRODUCT.md`: what the agent got from the product folder;
- the editable Next.js source.

Preview: `npx serve sites/<slug>/out`, or open `out/index.html`. Show the user a screenshot from `.lpa/screens/`.

## Check, then report
A run counts as success only if lint, build and the interaction test all pass (see `result.json`). List the
`[Placeholder]`s and the "Assumptions" (brand choices made without a Brand section, conflicts between the brief and
`PRODUCT.md`). Check in a screenshot that the logo, colours and CTA labels match the product.

## Pitfalls
- Don't deploy it yourself. Hand over `out/`, or offer dev-agent to integrate it into a repo.
- One slug, one site. Reusing a slug needs `--replace`, and that deletes the previous version.
