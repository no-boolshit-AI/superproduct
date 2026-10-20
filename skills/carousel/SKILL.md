---
name: carousel
description: Make a LinkedIn document carousel (4-6 slides, PDF + PNGs + caption) or a single graphic post (one PNG + caption) with agents/carousel-agent, in one of six styles - consulting (hero numbers, frosted glass), bold (community poster, stickers), minimal (typographic statement), editorial (magazine), tech (dark product launch), paper (tool showcase). Use for LinkedIn carousels, case-study or data-story posts, launch and event announcements, single image posts, "swipeable PDF" posts.
---

# carousel-agent

**Folder:** `agents/carousel-agent`. **Command:** `npm run generate -- …`. **Time:** about 3 to 10 minutes.
**Spend:** Claude about $1 to $3 (`MAX_BUDGET_USD`), plus OpenAI image calls.

It writes every slide as HTML on a fixed design system, from a library of 20 layouts, in one style per post. OpenAI
images are only raw material, never text. It checks the layout itself, then exports PNGs and a swipeable PDF (a single
post: one PNG).

| Style (`--style`) | Look | Pick it for |
|---|---|---|
| `consulting` | saturated brand canvas, light type, hero numbers, hairlines, frosted glass over a 3D render | case studies, results, data stories |
| `bold` | brand gradient, black-weight headlines, tilted stickers, faint logo watermark, white panels and option cards, bright CTA, device mockups, avatars | events, calls for speakers/participants, programmes, community news |
| `minimal` | paper, oversized type in two colours, nothing else | a question, an opinion, a principle, a quote |
| `editorial` | serif headlines, photo-led splits, tags, highlighter marks, mono labels; grainy gradient posters | articles, how-tos, author posts, hiring |
| `tech` | near-black with a grid, neon mono kickers, ticker band, condensed caps, UI windows, big shapes | product updates, feature launches, AI/dev topics |
| `paper` | warm paper, app icons, browser-framed screenshots, bold black headlines, progress bar | tool roundups, feature tours, how-to steps |

`auto` (the default) lets the agent pick from the brief, preferring the product's house style
(`product.json → agents.carousel.style`). Fix the style when the user names a look or when several posts in a campaign
must match. `docs/styles.jpg` and `docs/layouts.jpg` in the agent folder show every style and layout.

**Product folder.** The agent reads `workspace/product/` by itself: colours (the consulting mapping, plus a palette with
the product's bright highlight colours for stickers and markers), fonts by role and logos come from the design tokens,
and the product context (brief, voice, messaging, facts) is in its system prompt. So don't restate the brand in the
brief, and don't pass `--brand` unless the user wants a different brand (e.g. a client's). `--product none` gives each
style its own neutral palette.

## Readiness
- Check with `node scripts/agents.mjs status carousel`.
- Claude auth is the Claude Code login on your computer, or `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` in its `.env`.
- `OPENAI_API_KEY` is optional. Without it, or with `IMAGE_MOCK=1`, the art is placeholder art; tell the user.

## Brief (`workspace/briefs/YYYY-MM-DD-<slug>.md`)
```markdown
# <working title>
Post: carousel (n slides) | single graphic
Style: <auto, or a style and why; "like our call-for-trainers poster" is fine>
Audience: <who scrolls past this on LinkedIn>
Goal / CTA: <what they should do or think; link if any>
Story: <the one idea; 3-5 points in order (single post: the one message + the key fact)>
Numbers (verified): <hero numbers with source: the user, workspace/product/knowledge/facts.md, a file>; anything unknown → [X]
People / screenshots: <the files passed with --asset and who/what each is>; none → initials avatars, generic UI mocks
Tone: <e.g. plain, confident, no hype>
Language: <en/ro/…>
```
The agent writes the copy in the product's voice; you supply the facts for this post. Finished copy is used verbatim
if you say so. The product context includes the product's main action (`workspace/product/BRIEF.md`, "The one action");
name the CTA in the brief when this post needs a different one.

## Run
```bash
cd agents/carousel-agent
npm run generate -- --file ../../workspace/briefs/<brief>.md --slides 5 --format portrait
npm run generate -- --file ../../workspace/briefs/<brief>.md --single --style bold -a ../../workspace/briefs/<slug>/team.jpg
```

| Option | |
|---|---|
| `-f, --file` | brief file (inline text is appended) |
| `-n, --slides` | exact slide count (default: the agent picks 4 to 6; `1` = a single post) |
| `-s, --style` | `auto` (default), `consulting`, `bold`, `minimal`, `editorial`, `tech`, `paper` |
| `--single` | one graphic post instead of a carousel |
| `--format` | `square` (1080²) or `portrait` (1080×1350). Default: square for carousels, portrait for single posts |
| `-a, --asset <img>` | the user's photos, portraits (cut-out PNGs for the `author` layout), screenshots, logos (repeatable) |
| `--product <dir\|id\|none>` | product folder, or the id of one in `workspace/products/` (default: `$PRODUCT_DIR`, else `workspace/product/`); `none` = each style's own palette, no product context |
| `--brand <file>` | brand JSON that overrides the product's brand (e.g. a client); the product context still applies |
| `-o, --out <dir>`, `-m, --model`, `--budget <usd>`, `-q` | output root, model, spend cap, quiet |

## Output: `workspace/out/carousel/<timestamp>-<slug>/`
- `carousel.pdf`: upload to LinkedIn as a document post (carousels only).
- `png/slide-NN.png`: 2160px slides; a single post is `png/slide-01.png`, uploaded as an image post.
- `post.md`: caption and alt text per slide. Give the user the caption.
- `slides/*.html`: the editable fragments.
- `run.json` (kind, style, format, brand and product used), `product-context.md`.

## Check, then report
Look at 1 or 2 PNGs, or the contact sheet in `preview/`. Read `post.md`. Check that no `[X]` placeholders are left,
or list them for the user. Say which style the agent chose (the startup line and `run.json`).

## Revise
- **Small copy fixes:** edit `workspace/out/carousel/<run>/slides/slide-NN.html`, then run `npm run render -- <run>`. No
  Claude cost; it keeps the run's style.
- **Another style or bigger changes:** run again with an updated brief and `--style`.

## Pitfalls
- Styles are emulated. Never put another company's name or logo on slides.
- Real people (avatars, speakers, the author portrait) and real product screenshots must come from the user's files
  (`--asset`); the agent never generates them. Without them it uses initials and generic UI mocks.
- The startup lines say which brand, product, post type and style the run uses. Check them before waiting ten minutes
  on the wrong one.
