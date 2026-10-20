---
name: campaign
description: Coordinate several agents for one launch or campaign (landing page + LinkedIn carousel + collage post + deck, optionally a product change via dev-agent) from one master brief with consistent facts, CTA and brand. Use when a request spans more than one output type, e.g. "launch X", "promote the new course", "campaign for…".
---

# Multi-agent campaigns

Every agent already reads the product folder, `workspace/product/` (brand, voice, verified facts, offers, the main action). The campaign's job is
what's specific to this launch, kept identical across outputs. Start from `workspace/product/BRIEF.md`,
`brand/messaging.md`, `knowledge/facts.md` and, for launches, `gtm/launches/README.md` in the same folder.

## 1. Scope it with the user (one short round)
- Which outputs:
  - landing page;
  - LinkedIn carousel or single graphic post (carousel agent; fix one `--style` across the campaign's posts) and/or
    collage post (cut-paper editorial look);
  - deck or report (pitch, partner, internal);
  - a product change (dev-agent).
- Audience, the one CTA (and its URL; default: the product's primary action), language(s), deadline.
- Spend: give a rough total (about $5 to $10 per content run, plus images) and confirm before starting.

## 2. Write the master brief: `workspace/briefs/<YYYY-MM-DD>-<campaign>/brief.md`
```markdown
# <campaign>
Goal: <the one outcome>
Audience: <who, their problem in their words>
CTA: <action> → <URL>
Core message: <one sentence>  ·  Supporting points: <3-5>
Facts we can publish (with source): <new facts for this launch; product facts are in workspace/product/knowledge/facts.md>
Unknown → [X] (never invent customers, metrics, quotes)
Tone & language: <only if it differs from workspace/product/brand/voice.md>
Brand: the product's (workspace/product/). Name another brand only for client work, and pass it to every agent the same way.
Assets: <files in ./assets>
Outputs: <list with formats>
```
Then derive one brief per agent in the same folder (`landing.md`, `carousel.md`, `collage.md`, `deck.md`). Use each
agent skill's template and the same facts. Don't paraphrase numbers.

## 3. Run in this order
1. **Landing page** first. It forces the full message structure, and its PLAN.md and copy become the reference.
2. **Carousel and collage post** in parallel: different agents and processes. Reuse the landing page's headline
   claims and CTA. Carousel takes `--asset` for product shots.
3. **Deck** last, if needed. Use `-i` for data files; `exhibits/*.png` from the deck can also feed posts.
4. **dev-agent** only if the product itself must change, e.g. "add the course page to our site repo". Run it with
   `--relay` and relay its questions.

Run at most about 3 at once. Start each in the background, poll, and relay questions as they come.

## 4. Check consistency before reporting
- The same CTA and URL everywhere, and the same numbers and names.
- The brand applied: colours, wordmark, fonts. Each agent prints (and records in its run file) which product it used;
  they must all say the same.
- Placeholders collected from all outputs into one list.
- Captions (`post.md`, `caption.md`) read well and fit LinkedIn (hook in the first 2 lines; about 1,300 characters
  is plenty).

## 5. Record and hand over
Write `workspace/briefs/<campaign>/README.md` with:
- each output and its path;
- the spend per run and the total;
- open placeholders and decisions;
- suggested posting order and copy.

When the launch is real (dates, prices, new offer), add it to the product folder too: a plan in
`workspace/product/gtm/launches/YYYY-MM-DD-<name>.md` (template in that folder's README), new facts in
`workspace/product/knowledge/facts.md` with their source, and the offer in `workspace/product/offerings/`. Then the next run of any agent
knows about it.

Don't publish or deploy anything yourself.
