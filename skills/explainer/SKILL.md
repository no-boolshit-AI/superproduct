---
name: explainer
description: Make an explainer or short motion-graphics video (MP4) with agents/explainer-agent, which runs HyperFrames' explainer workflow with every HyperFrames skill bundled. Use for "make a video / animation / explainer / reel / motion graphic about X", LinkedIn or Instagram feed videos, concept explainers, how-tos, product teasers and launch announcements from a brief, including Vox-style paper-collage videos (--style vox-collage). Default 4:5 portrait, silent with on-screen text; generated pictures in the product's illustration style (OpenAI) when OPENAI_API_KEY is set; narration, composed music and sound effects with ElevenLabs on request.
---

# explainer-agent

Brief in, MP4 out. Claude runs HyperFrames (HTML compositions animated with GSAP, rendered to video by headless
Chrome) headless: story → design system from a HyperFrames frame preset remixed onto the product's brand → storyboard
→ one frame-worker subagent per frame → assembly, transitions → lint, check, contact sheet → render → caption and
alt text. All 21 HyperFrames skills (`hyperframes:*`) are bundled in `vendor/hyperframes`, pinned to the CLI, plus
the agent's own `hyperframes:vox-collage` (kept in `extensions/hyperframes`, laid over the bundle by `npm run setup`).

Claude also has the agent's own media tools (the keys stay in the agent's process):
- `generate_images` (`OPENAI_API_KEY`): characters, props, illustrated interface elements and scenes with OpenAI
  `gpt-image-2.5-flare`, in the product's illustration style (`product.json → agents.explainer.images`: a style
  description plus reference illustrations sent with every request), as transparent cut-outs for the motion layers.
  On by default when the key is set; `--no-images` turns it off.
- `generate_narration` + `find_voices` (`--voice`), `generate_music` (`--music auto|"<mood>"`), `generate_sfx`
  (`--sfx`), with `ELEVENLABS_API_KEY`: narration with exact word timings, a composed bed, effects placed per frame.

## When to use it

- "Make a video / explainer / animation / reel / motion graphic about …", "a 45-second LinkedIn video", "explain X
  in a short video", "a teaser for the launch".
- Not for editing existing footage (talking heads, interviews), long-form video, or anything needing filmed people.
  For a slideshow as a PDF use deck; for a static post use carousel or collage-post.

## Before the first run (Mac)

`node scripts/agents.mjs status explainer`. Install is `npm install && npm run setup` (needs Node 22+ and FFmpeg,
`brew install ffmpeg`; setup downloads the Chrome HyperFrames renders with; the first launch of that Chrome can be
slow, so if setup reports a Chrome timeout, run it once more). Optional keys in the agent's `.env`: `OPENAI_API_KEY`
(pictures), `ELEVENLABS_API_KEY` (narration, music, effects); without ElevenLabs, narration uses `HEYGEN_API_KEY` or
the free local voice (`npm run setup:voice`). `npm run setup` reports which are set up.

## Brief template (`briefs/YYYY-MM-DD-<slug>.md`)

```markdown
# <Title: what the video explains>

Audience: <who watches, what they know already>
The one message: <the single thing they must remember>
What they should do afterwards: <only if different from the product's CTA>

Beats (optional; the agent designs the story if you leave them out):
- Hook: <a question, a surprising fact, a tension>
- <beat>
- <beat>
- Close: <the takeaway + CTA>

Facts and numbers to use (with sources): <…>
Length: <30–90> seconds. Narration: <none | yes, voice: …>
```

Facts: only what the brief, the attached files and `product/knowledge/facts.md` say. Missing facts become visible
placeholders (`[X]`) listed in `post.md`.

## Running it

```bash
cd agents/explainer-agent
npm run video -- --file ../../briefs/<brief>.md [--format portrait|vertical|square|landscape] [--length 45] \
  [--style default|vox-collage] [--no-images] \
  [--voice [--voice-id <id>]] [--music bed.mp3|auto|"<mood>"] [--sfx] [-i image.png -i notes.pdf …] \
  [--audience "…"] [--lang ro] [--quality draft|standard|high] [--budget 15]
```

- `--format`: portrait 1080×1350 (default; LinkedIn/Instagram feed), vertical 1080×1920 (Reels/Shorts/TikTok),
  square 1080×1080, landscape 1920×1080 (YouTube, website).
- `--style vox-collage`: a Vox-style paper collage — torn strips and cut-outs slapped on in stop-motion (on twos,
  rendered at 24 fps), one highlighter swipe and marker annotations per frame, tape, a rubber stamp, ink-and-halftone
  drawings instead of photos, film grain. Good for launches and explainers with an argument. A product can make it
  its default with `product.json → agents.explainer.style`.
- Silent by default: on-screen text carries the story. `--voice` adds narration and word-timed captions (ElevenLabs
  when its key is set). `--music auto` composes a bed from the story's mood, `--music "dry upright piano, 90 bpm"`
  one to a brief, `--music bed.mp3` lays your file; `--sfx` adds effects made for the video.
- Pictures: with `OPENAI_API_KEY`, Claude plans 4–10 pictures for a 60-second video in the storyboard, generates them
  before the frame workers start (previews let it regenerate what's off), and the workers animate them as layers.
  `MAX_IMAGES` (24) caps new ones per run; identical requests are free on revisions. `IMAGE_MOCK=1` makes
  placeholders (layout runs; `post.md` flags them). No text, logos or real people in pictures.
- `-i` files: images and clips are placed as real assets; md/txt/csv/pdf are source material; audio is a music bed.
- `--workflow general-video | motion-graphics` for non-explainer pieces (a title sting, a stat count-up, a logo
  sting); `--workflow product-launch-video --url <site>` captures a website.
- Web UI: `npm run web` → http://localhost:5050 (for the user).
- Time: expect 10–30 minutes for a 45-second video (more with narration). Cost grows with the number of frames and
  depends on the model; the cap is `--budget` / `MAX_BUDGET_USD` (15). A 13-frame, 100-second vox-collage video ran past
  the $15 cap and needed a `--revise` to finish: for long videos, raise `--budget` (ask first) or cut beats. Run it in the background
  and follow `out/<job>/events.jsonl`. OpenAI and ElevenLabs bill separately, outside `--budget`.

## Outputs (`out/<job-id>/`)

- `video.mp4`, `contact-sheet.jpg` (one still per frame), `post.md` (title, caption, alt text, frames, placeholders)
- `job.json` (status, product used, HyperFrames versions, steps, cost, warnings, `media`: every generated picture and
  sound with model and prompt), `events.jsonl`; `post.md → Generated media` says what was made with which model
- `project/`: the HyperFrames project (`STORYBOARD.md`, `frame.md`, `compositions/frames/*.html`; generated media in
  `assets/images|voice|sfx|music/`)

Check before reporting: look at the contact sheet (stage it in Cowork), skim `post.md`, list the placeholders and any
warnings in `job.json`.

## Revisions and other formats

- `npm run video -- --revise <job-id> "frame 03-…: slower; bigger CTA; darker ground"`: same session and project,
  only the changed frames are rebuilt. Frame ids are in `post.md` → Frames.
- `npm run render -- <job-id> --format mov`: ProRes 4444 with alpha for DaVinci Resolve / Premiere (no Claude).
  `--format webm`, `--quality draft|standard|high` also work.
- A different aspect ratio is a new run with `--format`, not a revision.

## Pitfalls

- "This machine isn't ready: Chrome for rendering" → `npm run setup` in the agent folder.
- "--voice needs a TTS provider" → a key in `.env`, or `npm run setup:voice`.
- "--music auto … composes the music with ElevenLabs" → `ELEVENLABS_API_KEY`, or a music file.
- No pictures: the CLI's first lines say `Images: off (no OPENAI_API_KEY)`; add the key to the agent's `.env`.
- Skills/CLI version mismatch → `npm run skills:update -- <version>` then `npm install`.
- The brand comes from `product/` (colours by role, the product's font files, logo, CTA, the illustration style for
  pictures); `--product none` uses a HyperFrames preset palette and a neutral illustration style. Per-product
  settings: `product.json → agents.explainer` (ground, colors, fonts, preset, style, voice, cta, notes, images
  {style, references}, profiles).
- Never publish the video yourself; hand over the files.
