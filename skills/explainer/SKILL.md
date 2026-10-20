---
name: explainer
description: Make an explainer or short motion-graphics video (MP4) with agents/explainer-agent, which runs HyperFrames' explainer workflow with every HyperFrames skill bundled and teaches like a TED-Ed lesson (one question, at most three main points, plain words, a recap). Storyboard first — the first run stops at a storyboard you show the user; --revise changes it, --approve builds the video. Use for "make a video / animation / explainer / reel / motion graphic about X", LinkedIn or Instagram feed videos, concept explainers, how-tos, product teasers and launch announcements from a brief. Default style editorial (cinematic: B&W halftone cut-outs on brand-colour fields, type behind the subject, spotlight and connector callouts, camera push with parallax, film grain; look picked from the brand or --look); Vox-style paper collage with --style vox-collage. Default 4:5 portrait, silent with on-screen text; generated pictures (OpenAI) when OPENAI_API_KEY is set; narration, composed music and sound effects with ElevenLabs on request.
---

# explainer-agent

Brief in, storyboard for review, then MP4. Claude runs HyperFrames (HTML compositions animated with GSAP, rendered to
video by headless Chrome) headless, in two steps:

1. **Storyboard** (the first run): story written to teach a newcomer → design system from a frame preset remixed
   onto the product's brand → `STORYBOARD.md` → a sketch sheet (one static cell per frame, real words, real fonts and
   colours, grey placeholders for pictures) → `storyboard.md` + `storyboard.jpg` in the job folder. Nothing is
   generated or built yet; the run ends with status `storyboard`.
2. **Video** (after `--approve`): pictures and sound → one frame-worker subagent per frame, each keeping its approved
   sketch → assembly, transitions → lint, check, contact sheet → render → caption and alt text.

All 21 HyperFrames skills (`hyperframes:*`) are bundled in `vendor/hyperframes`, pinned to the CLI, plus the agent's
own `hyperframes:clear-explainer` (the teaching method + the storyboard sheet), `hyperframes:editorial` (the default
style) and `hyperframes:vox-collage` (kept in `extensions/hyperframes`, laid over the bundle by `npm run setup`).

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

## Brief template (`workspace/briefs/YYYY-MM-DD-<slug>.md`)

```markdown
# <Title: what the video explains>

Audience: <who watches, what they know already — "new to the subject" unless they're experts>
The question: <the one question the viewer would ask, which the video answers>
The one message: <the answer, in one sentence a newcomer understands>
What they should do afterwards: <only if different from the product's CTA>

Beats (optional; the agent designs the story if you leave them out):
- Hook: <a question, a surprising fact, a tension>
- <beat>
- <beat>
- Close: <the takeaway + CTA>

Facts and numbers to use (with sources): <…>
Length: <30–90> seconds. Narration: <none | yes, voice: …>
```

Facts: only what the brief, the attached files and `workspace/product/knowledge/facts.md` say. Missing facts become visible
placeholders (`[X]`) listed in `storyboard.md` and `post.md`. The agent keeps the explanation simple on its own (≤ 3
main points, every term defined, an everyday analogy, a recap frame); give it the facts and the audience, not a script,
unless the user has one.

## Running it

```bash
cd agents/explainer-agent
npm run video -- --file ../../workspace/briefs/<brief>.md [--format portrait|vertical|square|landscape] [--length 45] \
  [--style editorial|vox-collage|default] [--look auto|colour-field|paper-data|documentary|duotone] [--no-images] \
  [--voice [--voice-id <id>]] [--music bed.mp3|auto|"<mood>"] [--sfx] [-i image.png -i notes.pdf …] \
  [--audience "…"] [--lang ro] [--quality draft|standard|high] [--budget 15]
# → status "storyboard": show it to the user, then one of
npm run video -- --revise <job-id> "frame 02: use a kitchen analogy; drop frame 05"   # a new storyboard version
npm run video -- --approve <job-id> ["a last small note"]                           # build the video
```

## The storyboard checkpoint (your job as the orchestrator)

1. The first run takes ~3–8 minutes and stops with status `storyboard`. Read `workspace/out/explainer/<job>/storyboard.md`
   and look at `storyboard.jpg` (stage it in Cowork).
2. Show the user the sheet image path and a short summary: the question and answer, the main points, the frames
   (one line each: what it teaches and what's on screen), the look and why, the agent's questions, the placeholders.
   Ask: approve, or what to change? (with AskUserQuestion where you have it; offer the agent's questions as options).
3. Changes → `--revise <job-id> "<their words>"` (a new version, same flow; changes cost little). Approval →
   `--approve <job-id>` with any last small notes in quotes. Approve on your own only when the user said so up front
   ("just make it", "no need to show me") — or run with `--no-storyboard` in that case.
4. The approved run builds the video (10–30 min more); check and report it as below. A delivered video is changed with
   `--revise` again (now it changes the video).

- `--format`: portrait 1080×1350 (default; LinkedIn/Instagram feed), vertical 1080×1920 (Reels/Shorts/TikTok),
  square 1080×1080, landscape 1920×1080 (YouTube, website).
- `--style editorial` (the default): cinematic editorial — subjects printed as black-and-white halftone cut-outs on
  flat fields of the brand's colour, giant type behind the subject, line-art callouts (rings, orbits, connector lines
  with dots, "/ Name" tags, a spotlight that dims all but the subject), a slow camera push with parallax on every
  frame, film grain and a vignette. Its **look** comes from the brand unless `--look` (or `product.json →
  agents.explainer.look`) pins it: `colour-field` (bold accent as big fields), `paper-data` (calm brands: paper,
  grid, colour as accents), `documentary` (dark ground, spotlight, connectors), `duotone` (all in one brand hue).
- `--style vox-collage`: a Vox-style paper collage — torn strips and cut-outs slapped on in stop-motion (on twos,
  rendered at 24 fps), the generated pictures printed as B&W halftone cut-outs on torn colour fields, one highlighter
  swipe and marker annotations per frame, tape, a rubber stamp, film grain. Good for launches and explainers with an
  argument. `--style default` lets HyperFrames pick one of its own presets. A product sets its default with
  `product.json → agents.explainer.style`.
- `--no-storyboard` (or `STORYBOARD=off` in the agent's `.env`): one run straight to the video, no review.
- `--storyboard-images` (on the first run or a `--revise`): the pictures are generated with the storyboard and shown
  on the sheet instead of grey shapes; the build reuses them. OpenAI then bills before approval. Use it when the user
  wants to judge the pictures before approving.
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
- Time: the storyboard takes ~3–8 minutes; the build 10–30 more for a 45-second video (more with narration). Cost
  grows with the number of frames and depends on the model; `--budget` / `MAX_BUDGET_USD` (15) caps each run (the
  storyboard is a small part; the build starts a fresh session from the approved files). A 13-frame, 100-second
  vox-collage video ran past the $15 cap and needed a `--revise` to finish: for long videos, raise `--budget` (ask
  first) or cut beats. Run it in the background and follow `workspace/out/explainer/<job>/events.jsonl`. OpenAI and
  ElevenLabs bill separately, outside `--budget`, and only after approval (OpenAI before it with `--storyboard-images`).

## Outputs (`workspace/out/explainer/<job-id>/`)

- before approval: `storyboard.md` (the question, the answer, the main points, every frame — point, words on screen,
  what you see, how it moves —, pictures to make, placeholders, the agent's questions) and `storyboard.jpg` (the sketch
  sheet; the HTML is `project/storyboard.html`); `job.json → status: "storyboard"`, `storyboard.version`
- after approval: `video.mp4`, `contact-sheet.jpg` (one still per frame), `post.md` (title, caption, alt text, frames, placeholders)
- `job.json` (status, product used, HyperFrames versions, steps, cost, warnings, `media`: every generated picture and
  sound with model and prompt), `events.jsonl`; `post.md → Generated media` says what was made with which model
- `project/`: the HyperFrames project (`STORYBOARD.md`, `frame.md`, `compositions/frames/*.html`; generated media in
  `assets/images|voice|sfx|music/`)

Check before reporting: look at the contact sheet (stage it in Cowork), skim `post.md`, list the placeholders and any
warnings in `job.json`.

## Revisions and other formats

- Before approval, `--revise <job-id> "…"` changes the storyboard (a new version); `--approve <job-id>` builds it.
- After delivery, `npm run video -- --revise <job-id> "frame 03-…: slower; bigger CTA; darker ground"`: same session
  and project, only the changed frames are rebuilt. Frame ids are in `post.md` → Frames.
- `npm run render -- <job-id> --format mov`: ProRes 4444 with alpha for DaVinci Resolve / Premiere (no Claude).
  `--format webm`, `--quality draft|standard|high` also work.
- A different aspect ratio is a new run with `--format`, not a revision.

## Pitfalls

- "This machine isn't ready: Chrome for rendering" → `npm run setup` in the agent folder.
- "--voice needs a TTS provider" → a key in `.env`, or `npm run setup:voice`.
- "--music auto … composes the music with ElevenLabs" → `ELEVENLABS_API_KEY`, or a music file.
- No pictures: the CLI's first lines say `Images: off (no OPENAI_API_KEY)`; add the key to the agent's `.env`.
- Skills/CLI version mismatch → `npm run skills:update -- <version>` then `npm install`.
- The brand comes from the product folder, `workspace/product/` (colours by role, the product's font files, logo, CTA, the illustration style for
  pictures); `--product none` uses a HyperFrames preset palette and a neutral illustration style. Per-product
  settings: `product.json → agents.explainer` (ground, colors, fonts, preset, style, look, voice, cta, notes, images
  {style, references}, profiles). The art-direction `notes` steer the editorial look (e.g. "orange only as small
  accents" → paper-data, not colour-field).
- "has no storyboard waiting for approval" → the job was built already (use `--revise`) or made with `--no-storyboard`.
- No `storyboard.jpg` → HyperFrames' Chrome is missing (`npm run setup`); `storyboard.md` still lists everything and
  `project/storyboard.html` opens in a browser.
- Never publish the video yourself; hand over the files. Never approve a storyboard the user hasn't seen unless they
  told you to skip the review.
