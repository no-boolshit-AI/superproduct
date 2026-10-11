---
name: deck
description: Build a corporate PDF presentation (16:9 deck) or A4 report from a brief and data files with agents/deck-agent, including McKinsey-style decks (action titles, storyline, sourced charts). Use for board/strategy/pitch/QBR decks, market studies, white papers and reports.
---

# deck-agent

**Folder:** `agents/deck-agent`. **Command:** `npm run deck -- …`. **Web UI:** `npm run web` → http://localhost:4848.
**Time:** about 5 to 20 minutes, depending on page count. **Spend:** Claude about $3 to $8 (`MAX_BUDGET_USD`, default
8).

It plans a storyline (answer first, action titles), turns data into specs for charts, diagrams, tables and KPI tiles,
composes pages from 15 deck or 14 report layouts, and QAs every page (cut-off text, overlaps, missing sources). The
result is a searchable PDF.

**Product folder.** The agent reads the product folder (`workspace/product/`) by itself: every theme takes the product's colours, fonts and logo
(light accents stay fills; text and lines use the product's accent-text colour), the house theme
(`product.json → agents.deck.theme`) is the default unless the brief asks for a style, the confidentiality line comes
from the product, and the product context (brief, voice, messaging, facts, offers, sales pitch) is in the system prompt.
Its verified facts count as sources for documents about the product. `--product none` gives the themes' own look.

## Readiness
- Check with `node scripts/agents.mjs status deck`.
- Not installed yet? Run `node scripts/agents.mjs install deck` on your computer.
- Claude auth is the Claude Code login on your computer or a key/token in `.env`.
- `OPENAI_API_KEY` is optional, for photos/illustrations.

## Brief (`workspace/briefs/YYYY-MM-DD-<slug>.md`, data in `workspace/briefs/YYYY-MM-DD-<slug>/`)
```markdown
# <deck title>
Purpose / decision needed: <what the audience must decide or believe>
Audience: <board, client CFO, team…>
Format: deck | report      Pages: <n>      Theme: (the product's house theme) | strategy | corporate | executive | swiss | editorial
Answer / governing thought (if known): <one sentence>
Key facts and sources: <bullets; numbers with sources; unknown → [X]>
Data files: <name → what's in it>
Must include / avoid: <…>
Language: <en/ro/de…>
```

## Run
```bash
cd agents/deck-agent
npm run deck -- --file ../../workspace/briefs/<brief>.md --format deck --pages 12 -i ../../workspace/briefs/<brief>/data.xlsx
npm run deck -- --file ../../workspace/briefs/<brief>.md --theme strategy          # McKinsey-style method and look, in the brand
npm run deck -- --revise <job-id> "Turn page 6 into a waterfall and add an appendix"
npm run rerender -- <job-id> --theme corporate --dpi 300      # restyle without Claude
```

| Option | |
|---|---|
| `-f, --file` | brief file |
| `--format` | `auto`, `deck` (16:9) or `report` (A4) |
| `-t, --theme` | `auto`, or one of the themes below |
| `-n, --pages` | target page count |
| `-i, --input <file>` | CSV/XLSX/JSON data, MD/TXT/PDF documents, images (repeatable; not `.docx`, convert to PDF/MD first) |
| `--product <dir\|id\|none>` | product folder, or the id of one in `workspace/products/` (default: `$PRODUCT_DIR`, else `workspace/product/`) |
| `--brand <brand.json>` | a brand file that overrides the product's brand (e.g. a client deck); the product context stays |
| `--audience`, `--lang`, `--model`, `--budget` | audience, language, model, spend cap |
| `--revise <job-id>` | change request on an existing job (the same session resumes) |

Themes (layout character; colours and fonts come from the product):
- `strategy`: McKinsey-style: hairlines, one accent, dark cover and dividers;
- `corporate`: bold, rounded cards, icons;
- `executive`: dark pages, big thin numbers (uses the product's dark colour);
- `swiss`: strict grid, heavy rules, accent-coloured dividers;
- `editorial`: paper, generous margins, pull quotes.

**Another brand** (a client deck): copy `brands/example-brand.json` to `brands/<client>.json`, fill in the name,
wordmark and colours, and pass `--brand brands/<client>.json`. If the client has a product folder, pass `--product
<its folder>` instead: that also switches the context.

## Output: `workspace/out/deck/<job-id>/`
- `presentation.pdf` or `report.pdf`;
- `png/page-NN.png`;
- `exhibits/` (single charts as PNG, handy for posts);
- `storyline.md` (title read-through and speaker notes);
- `product-context.md` and `job.json` (which product and brand were used).

## Check, then report
- Read `storyline.md`: the titles alone should tell the story.
- Look at 2 or 3 page PNGs.
- List the `[X]` placeholders. The agent lists them at the end, and the user must fill them in.

## Pitfalls
- Facts come only from the brief, the files and the product's verified facts. Thin input gives many `[X]`, so gather
  data first.
- The PDF isn't editable in PowerPoint; the editable source is in `pages/` and `elements/`.
- Never put McKinsey's or any other firm's name or logo on pages.
