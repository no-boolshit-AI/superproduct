---
name: carousel
description: Make a LinkedIn document carousel (4-6 slides, PDF + PNGs + caption) in the top-consulting-firm look with agents/carousel-agent. Use for LinkedIn carousels, case-study or data-story posts, launch announcements and "swipeable PDF" posts.
---

# carousel-agent

**Folder:** `agents/carousel-agent`. **Command:** `npm run generate -- …`. **Time:** about 3 to 10 minutes.
**Spend:** Claude about $1 to $3 (`MAX_BUDGET_USD`), plus OpenAI image calls.

It writes every slide as HTML on a fixed design system (a saturated or dark canvas, light type, hero numbers, hairline
rules, a frosted-glass cover over a monochrome 3D render). OpenAI images are only background material, never text.
It checks the layout itself, then exports PNGs and a swipeable PDF.

**Product folder.** The agent reads the product folder (`workspace/product/`) by itself: the canvas, accent, glass, fonts and logo come from the
product's design tokens (`product.json → agents.carousel` overrides them), and the product context (brief, voice,
messaging, facts) is in its system prompt. So don't restate the brand in the brief, and don't pass `--brand` unless the
user wants a different brand (e.g. a client's) for this post. `--product none` gives the classic electric-blue look.

## Readiness
- Check with `node scripts/agents.mjs status carousel`.
- Claude auth is the Claude Code login on your computer, or `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` in its `.env`.
- `OPENAI_API_KEY` is optional. Without it, or with `IMAGE_MOCK=1`, the art is placeholder art; tell the user.

## Brief (`workspace/briefs/YYYY-MM-DD-<slug>.md`)
```markdown
# <working title>
Audience: <who scrolls past this on LinkedIn>
Goal / CTA: <what they should do or think; link if any>
Story: <the one idea; 3-5 points in order>
Numbers (verified): <hero numbers with source: the user, workspace/product/knowledge/facts.md, a file>; anything unknown → [X]
Tone: <e.g. plain, confident, no hype>
Language: <en/ro/…>
```
The agent writes the copy in the product's voice; you supply the facts for this post. Finished copy is used verbatim
if you say so. The product context includes the product's main action (`workspace/product/BRIEF.md`, "The one action"); name the
CTA in the brief when this post needs a different one.

## Run
```bash
cd agents/carousel-agent
npm run generate -- --file ../../workspace/briefs/<brief>.md --slides 5 --format portrait
```

| Option | |
|---|---|
| `-f, --file` | brief file (inline text is appended) |
| `-n, --slides` | exact slide count (default: the agent picks 4 to 6) |
| `--format` | `square` (1080², default) or `portrait` (1080×1350, more screen space on mobile) |
| `-a, --asset <img>` | the user's own photos/product shots (repeatable) |
| `--product <dir\|id\|none>` | product folder, or the id of one in `workspace/products/` (default: `$PRODUCT_DIR`, else `workspace/product/`); `none` = classic look, no product context |
| `--brand <file>` | brand JSON that overrides the product's brand (e.g. a client); the product context still applies |
| `-o, --out <dir>`, `-m, --model`, `--budget <usd>`, `-q` | output root, model, spend cap, quiet |

## Output: `workspace/out/carousel/<timestamp>-<slug>/`
- `carousel.pdf`: upload to LinkedIn as a document post.
- `png/slide-NN.png`: 2160px slides.
- `post.md`: caption and alt text per slide. Give the user the caption.
- `slides/*.html`: the editable fragments.
- `run.json` (which brand and product were used), `product-context.md`.

## Check, then report
Look at 1 or 2 PNGs, or the contact sheet in `preview/`. Read `post.md`. Check that no `[X]` placeholders are left,
or list them for the user.

## Revise
- **Small copy fixes:** edit `workspace/out/carousel/<run>/slides/slide-NN.html`, then run `npm run render -- <run>`. No
  Claude cost.
- **Bigger changes:** run again with an updated brief.

## Pitfalls
- The style is emulated. Never put another firm's name or logo on slides.
- The startup line says which brand and product the run uses ("Brand: … · product context: …"). Check it before
  waiting ten minutes on the wrong brand.
- No real faces from the image model. Use `--asset` for real people or products.
