---
name: collage-post
description: Make collage-style social posts (single post or 2-10 slide carousel, 1080x1350 PNGs + caption) with agents/collage-post-agent. Use for editorial/opinion/culture/history posts, posts about real people, Instagram-style carousels, or when the user wants a cut-and-paste collage look.
---

# collage-post-agent

**Folder:** `agents/collage-post-agent`. **Command:** `npm run post -- …`. **Web UI:** `npm run web` →
http://localhost:4747. **Time:** about 4 to 12 minutes. **Spend:** Claude about $2 to $6 (`MAX_BUDGET_USD`), plus up
to `MAX_IMAGES` GPT Image calls.

It writes slides as HTML: type, duotones, torn edges, tilts and grain. GPT Image makes the ingredients (cutouts,
textures, objects). For real, named people it uses public-domain photos from Wikimedia Commons and never generates
their faces.

**Product folder.** The agent reads `product/` by itself: a `brand` palette built from the product's colours (or
`product.json → agents.collage-post.brandPalette`) is the default, the product's fonts replace the collage fonts, the
masthead is the product's wordmark, and `PRODUCT.md` (brief, voice, messaging, facts) goes into the job folder. These
beat `PALETTE` and `BRAND_NAME` in `.env`; flags beat everything. `--product none` gives the stock palettes and masthead.

## Readiness
- Check with `node scripts/agents.mjs status collage-post`.
- It needs both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in its `.env`. Its CLI doesn't use the subscription login.

## Brief
The brief is a topic plus an angle (the agent writes the copy), or finished copy (used verbatim, only split across
slides). Name the people, works and facts to include, the language, and the slide count if it matters. Romanian
diacritics are fine.

## Run
```bash
cd agents/collage-post-agent
npm run post -- --file ../../briefs/<brief>.md --slides 5
npm run post -- --revise <job-id> "slide 3: shorter headline; use the newsprint palette"
```

| Option | |
|---|---|
| `-f, --file` | brief file |
| `--slides <n\|auto>` | auto: 1 for a single post, 5 to 7 for a carousel |
| `--palette` | `brand` (the product's; the default with a product folder), `auto`, or one of the palettes below |
| `--brand <text>` | masthead text (default: the product's wordmark) |
| `--product <dir\|none>` | product folder (default: `$PRODUCT_DIR`, else `product/`) |
| `--cc-by` | also allow CC BY / BY-SA photos (credits go to CREDITS.md) |
| `--scale 2` | 2160×2700 export |
| `--budget`, `--model`, `--max-images`, `--quality`, `--image-model` | spend cap, model and image settings |

Palettes:
- `brand`: the product's own (only with a product folder); use it unless the user asks for another look;
- `orchid`: the templates' own look, only on request;
- `cobalt`: tech, data;
- `acid`: urgent;
- `ember`: activist;
- `ultraviolet`: philosophy, art;
- `verdigris`: nature, health;
- `saffron`: history, books;
- `newsprint`: journalistic;
- `graphite`: serious.

## Output: `output/<job-id>/`
- `png/slide-NN.png`;
- `slide-NN.html`;
- `caption.md` (caption, alt text, sources);
- `CREDITS.md` (Wikimedia credits; must go with the post);
- `index.html` (gallery);
- `<job-id>.zip`.

## Check, then report
Look at the PNGs and `caption.md`. Make sure `CREDITS.md` is mentioned if it exists. Revisions resume the same
session (`--revise <job-id> "…"`) and only regenerate the images that changed.

## Pitfalls
- Generated people are anonymous archetypes. Named people must come from Wikimedia, so check that the agent found
  them.
- No text or logos in generated images; that's by design.
