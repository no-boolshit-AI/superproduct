# Explainer Agent

Brief in, explainer video out. A Claude Agent SDK agent that drives [HyperFrames](https://github.com/heygen-com/hyperframes) (HeyGen's open-source HTML → video framework) headless: Claude plans the story, designs every frame as an animated HTML composition, checks the result and renders an MP4, in the product folder's brand.

- **All HyperFrames skills bundled**: the whole HyperFrames Claude Code plugin (21 skills, `vendor/hyperframes`, pinned to the CLI version) is loaded into the agent, plus the agent's own **vox-collage** skill. It runs HyperFrames' own `faceless-explainer` workflow end to end, with one frame-worker subagent per frame.
- **Styles**: `--style vox-collage` makes a Vox-style paper collage — torn strips and cut-outs slapped on in stop-motion, highlighter and marker annotations, tape, a rubber stamp, halftone drawings, grain.
- **4:5 portrait by default** (1080×1350, the LinkedIn/Instagram feed); `--format vertical | square | landscape` for 9:16, 1:1 and 16:9.
- **Generated pictures in the house style**: with `OPENAI_API_KEY`, Claude has a tool that makes characters, props, illustrated interface elements and scenes with OpenAI `gpt-image-2.5-flare`, in the product's illustration style (a style description plus reference illustrations sent with every request), as transparent cut-outs ready to animate.
- **Silent by default**: the on-screen text carries the story. `--voice` adds narration and word-timed captions; with `ELEVENLABS_API_KEY` Claude voices it with ElevenLabs (exact word timings), composes a music bed (`--music auto`) and designs sound effects for the video (`--sfx`). Without it, HyperFrames' own chain narrates (HeyGen → the free local Kokoro voice).
- **Brand from the product folder**: colours, fonts, logo, call to action, voice and facts (the workspace's `product/`), like the other agents.
- **CLI and a local web UI** (http://localhost:5050) with live progress, the video, the contact sheet and the LinkedIn post text.

## Quick start (macOS)

```bash
cd agents/explainer-agent
npm install
npm run setup            # checks Node 22+ and FFmpeg, downloads the Chrome HyperFrames renders with
cp .env.example .env     # optional: OPENAI_API_KEY (pictures), ELEVENLABS_API_KEY (voice, music, effects), budget
npm run video -- --file briefs/example-what-is-an-agent.md
npm run web              # http://localhost:5050
```

Needs Node 22 or newer, FFmpeg (`brew install ffmpeg`) and Claude: your Claude Code login works as is, or set `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) or `ANTHROPIC_API_KEY` in `.env`.

## What a run produces

`workspace/out/explainer/<job-id>/` (`OUTPUT_DIR` to change it; see [`lib/workspace.mjs`](../../lib/workspace.mjs)):

| File | What it is |
|---|---|
| `video.mp4` | The explainer (H.264) |
| `contact-sheet.jpg` | One still per frame, for a quick look or a review |
| `post.md` | Title, LinkedIn caption, alt text, every placeholder left on screen (e.g. `[X] hours — frame 2`), and what was generated with which model (for an AI-content label where a platform asks for one) |
| `job.json` | The run record: options, product and brand used, HyperFrames versions, steps, cost, warnings, and `media`: every generated picture and sound with its model and prompt |
| `events.jsonl` | Everything that happened, line by line |
| `brief.md`, `product-context.md` | What Claude was given |
| `project/` | The HyperFrames project: `BRIEF.md`, `STORYBOARD.md`, `frame.md`, `compositions/frames/*.html`, `renders/`; generated media in `assets/images/`, `assets/voice/`, `assets/sfx/`, `assets/music/`, the style references in `assets/style/` |

The project is a normal HyperFrames project: open it in HyperFrames Studio (`npx hyperframes preview` in `project/`) to tweak a frame by hand, then `npm run render -- <job-id>`.

## Command line

```
npm run video -- [brief text] [options]

  -f, --file <path>        Brief from a file (combined with inline text if both are given)
      --format <f>         portrait (default, 1080×1350) | vertical (1080×1920) | square | landscape (1920×1080)
      --style <s>          default | vox-collage (paper collage, stop-motion, rendered at 24 fps)
  -l, --length <seconds>   Target length (default 45; explainers work best at 30–90)
      --voice              Narration + word-timed captions (ElevenLabs when its key is set)
      --voice-id <id>      Voice for --voice (ElevenLabs voice id, HeyGen voice id, or Kokoro e.g. am_michael)
      --music <m>          A music file laid under the video, or "auto" / a mood to compose one with ElevenLabs
      --sfx                Sound effects: designed for the video with ElevenLabs, else HyperFrames' bundled library
      --no-images          No generated pictures on this run
  -i, --input <path>       Images or clips to place, notes/markdown/PDF as source material (repeatable)
      --lang <code>        Language of the on-screen text and narration (default en)
      --audience <text>    Who will watch
      --quality <q>        draft | standard | high (default high)
      --workflow <w>       faceless-explainer (default) | general-video | motion-graphics | product-launch-video
      --url <url>          Website to capture (with --workflow product-launch-video)
      --product <dir|id>   Product folder, the id of one in workspace/products, or "none" (default: $PRODUCT_DIR,
                           then the workspace's product/)
  -m, --model <id>         Claude model
      --budget <usd>       Stop when Claude spend reaches this (default $MAX_BUDGET_USD)
      --revise <job-id>    Revise a job; the brief text is the change request
  -q, --quiet              Only milestones and the summary
```

Examples:

```bash
npm run video -- "Explain what RAG is to a finance team in 45 seconds" --audience "CFOs"
npm run video -- --file ../../workspace/briefs/launch.md -i screenshots/app.png -i notes.pdf --format vertical --voice
npm run video -- --file ../../workspace/briefs/launch.md --style vox-collage --length 30
npm run video -- --file ../../workspace/briefs/launch.md --voice --music "dry upright piano, brushed snare, 90 bpm" --sfx
npm run video -- --revise 20261007-141500-what-an-ai-agent-actually-is "Frame 3 is too fast; make the CTA bigger"
npm run render -- 20261007-141500-what-an-ai-agent-actually-is --format mov   # ProRes 4444 for DaVinci Resolve
```

A good brief says what the video should explain, to whom, the one message, and what the viewer should do afterwards. Facts come only from the brief, your files and the product folder: anything missing appears on screen as a visible placeholder and is listed in `post.md`.

## How it works

1. **Before Claude starts** (no cost if something is missing): the product folder, Node, FFmpeg, Chrome, the bundled skills against the CLI version, and the voice provider when `--voice` is on are checked. Then `hyperframes init` creates `<job>/project` in the output folder, and the brief, your files and the brand are put where the workflow expects them.
2. **Claude runs the HyperFrames workflow** (Agent SDK with the Claude Code preset, the HyperFrames plugin, the `faceless-explainer` workflow in autonomous mode):
   `BRIEF.md` → `build-frame.mjs` (a HyperFrames frame preset remixed onto the brand) → `STORYBOARD.md` (+ `SCRIPT.md` with `--voice`) → pictures (`generate_images`) → audio (`generate_narration`, music, effects) → frame packets → **one frame-worker subagent per frame, in parallel** → `assemble-index` → transitions → `hyperframes lint`, `check` and `snapshot` → Claude looks at the contact sheet and fixes what's broken → `hyperframes render` → `deliver` (video, contact sheet, caption, alt text, placeholders).
3. **The harness around it**: appends the Brand kit to `frame.md` after build-frame, serves GSAP from a local copy (renders work offline), maps `npx hyperframes@…` and the plugin launcher onto the installed CLI, keeps the session open while the frame workers run in the background (their completion notices start Claude's next turn; a turn that ends with nothing running and nothing delivered gets up to two nudges to carry on), records every step, and — if Claude stops early — renders and collects what exists.

## The HyperFrames skills

`vendor/hyperframes` is the HyperFrames plugin release that matches the CLI in `package.json` (Apache-2.0, from github.com/heygen-com/hyperframes), loaded with `plugins` in the Agent SDK. All of its skills are available to the agent as `hyperframes:<name>`:

- workflows: `faceless-explainer` (the default here), `general-video`, `motion-graphics`, `product-launch-video`, `music-to-video`, `pr-to-video`, `slideshow`, `embedded-captions`, `talking-head-recut`, `remotion-to-hyperframes`
- domain skills: `hyperframes` (the router), `hyperframes-core`, `hyperframes-animation`, `hyperframes-keyframes`, `hyperframes-creative` (frame presets, typography, design), `hyperframes-cli`, `hyperframes-audio`, `hyperframes-registry` (~400 blocks and components), `hyperframes-studio`, `media-use` (TTS, music, SFX, captions), `figma`

```bash
npm run skills:check              # list them (◆ = explainer-agent's own) and check them against the CLI
npm run skills:update             # move skills and CLI to the latest HyperFrames release (then npm install)
npm run skills:update -- 0.8.140  # or to a given release
```

The helper scripts inside the skills (`animation-map`, `contrast-report`) run on `@hyperframes/producer`, which is installed with the agent.

## Styles

`--style default` lets the workflow pick one of HyperFrames' frame presets for the topic. `--style vox-collage` fixes the look:

**vox-collage** — an explainer made of paper, in the manner of Vox's collage videos. Every frame is a paper board seen from above: torn headline strips, tags, tickets, clippings and ink-and-halftone "FIG." drawings are slapped on by hand, moving **on twos** (12 poses a second, rendered at 24 fps) and "boiling" while held, under a slow, smooth camera push; then a hand annotates them: one highlighter swipe on the verdict word, marker loops, arrows, strike-throughs and ticks, tape, a rubber stamp. Paper colours, ink and one accent (the brand accent as a highlighter fill).

What it adds to the bundled skills (`extensions/hyperframes/`, laid over `vendor/hyperframes/` by `npm run setup`, `npm run skills:update` and every job):

| | |
|---|---|
| `hyperframes:vox-collage` | the style's method: what to choose at each workflow step, the look and motion rules, pitfalls |
| `vox-collage/assets/` → `project/assets/collage/` | the collage kit: `collage.js` (seek-safe helpers: slap, slide, lift, ransom, tape, stamp, highlight, marker draw, boil, drift, camera, tear-away; torn paper as SVG) and the paper, grain, grid, halftone and stamp textures |
| `hyperframes-animation/rules/collage-*.md` | 7 motion rules (the kit, cut-out slap, paper tear, stop-motion boil, camera, marker and stationery, halftone figures), inlined into the frame workers' packets |
| `hyperframes-animation/blueprints/collage-*.md` | 6 shot blueprints: poster build, figure plate, clipping + highlight, board pan, checklist, stamp title card |
| `hyperframes-creative/frame-presets/vox-collage/` | the frame preset (remixed onto the brand by build-frame) and its paper-strip caption skin |

A product can make it its default: `"style": "vox-collage"` in `product.json → agents.explainer`.

## Brand

With a product folder (default: the workspace's `product/`), the video uses its design tokens:

- **Colours by role**: the background is the ground, text is the ink, the accent is the highlight. An accent that can't be read as text on the ground (a lime or yellow on paper) is used only as a fill, with the product's `accentText` colour for text and thin lines.
- **Fonts**: the product's font files, with their weight and unicode ranges, so accented characters render in the brand face too.
- **Logo** files (`brand.logo.primary | inverse | mark`), placed on the last frame with the call to action (`cta.primary`).
- **Facts and voice**: the product context (`BRIEF.md`, voice, messaging, facts, guidelines) goes into the system prompt.

Optional settings in `product.json`:

```json
"agents": {
  "explainer": {
    "ground": "light",
    "colors": { "accent": "{color.brand}" },
    "fonts": { "display": "sans", "accent": "serif" },
    "preset": "cobalt-grid",
    "style": "default",
    "voice": "am_michael",
    "cta": "primary",
    "notes": "The accent is a highlighter: never a full background.",
    "images": {
      "style": "1950s commercial illustration: ink outlines, gouache fills, print texture, muted blues and browns",
      "references": ["assets/images/hero-illustration.png"]
    },
    "profiles": ["content", "design"]
  }
}
```

`--product none` (or `PRODUCT_DIR=none`) uses a HyperFrames preset's own palette and type.

## Pictures

With `OPENAI_API_KEY` in `.env`, Claude gets `generate_images`: pictures for the motion layers, made with OpenAI `gpt-image-2.5-flare` (`OPENAI_IMAGE_MODEL`, e.g. `gpt-image-2.5-sunburst` for finer detail) in the product's illustration style.

- **The style** goes with every request twice: a prompt-ready description (`product.json → agents.explainer.images.style`, else `brand.imageStyle`) and the reference illustrations in `agents.explainer.images.references` (paths in the product folder), sent to the edit endpoint as "match this look, not this subject". Claude only describes the subject. The references are copied to `project/assets/style/`, so a revision keeps them.
- **Kinds**: `cutout` (one subject on a transparent ground: a character, a prop, anything that moves), `ui` (an interface element — a window, card, button, dial, inbox, chat bubble — drawn in the house style, transparent, with blank areas where HTML text goes), `illustration` (a small complete picture on paper white) and `scene` (a full-bleed background at the video's canvas). Sizes: `square`, `portrait`, `landscape`, `wide`, `tall`, `frame` or any `WIDTHxHEIGHT` in multiples of 16.
- **Consistency**: a picture can name earlier ones in `refs` (the same character in every frame).
- **No text in pictures**: words, numbers, labels and logos are set in HTML; the prompt rules out real people, brands and logos.
- Claude plans the pictures in the storyboard, generates them before the frame workers start (up to 8 per call, in parallel), sees a preview of each, and regenerates what's off. Workers place the PNGs and animate them like any layer; in `vox-collage` they become cut-out clippings on the paper board.
- `MAX_IMAGES` (24) caps new pictures per run; an identical request reuses the earlier file for free (also across revisions). `OPENAI_IMAGE_QUALITY`: `high` by default (`low` … `max`). `IMAGE_MOCK=1` makes placeholders instead (layout runs, tests), and `post.md` flags them. `--no-images` turns the tool off for one run.

For example, a product whose hero is a 1950s commercial illustration (ink and gouache with print texture, muted blues and browns) sets that style in `product.json → agents.explainer.images` with the hero image as its reference, and every picture follows it.

## Sound

With `ELEVENLABS_API_KEY` in `.env`, Claude calls ElevenLabs itself (no Python, no transcription pass):

- **Narration** (`--voice`): `generate_narration` voices each `SCRIPT.md` frame (`eleven_multilingual_v2`, `ELEVENLABS_TTS_MODEL` for `eleven_v4` and others) into `assets/voice/NN.wav`, with exact word timings from ElevenLabs' character alignment, written into `audio_meta.json` the way the workflow reads it (duration sync, captions, assembly). It replaces the workflow's own TTS step, which the harness refuses on these runs. Voice: `--voice-id`, else `agents.explainer.voice`, else `ELEVENLABS_VOICE_ID`, else George (`JBFqnCBsd6RMkjVDRZzb`); `find_voices` lets Claude pick one when the brief asks for a kind of voice. Unchanged lines are reused for free.
- **Music** (`--music auto` or `--music "<mood>"`): `generate_music` composes a bed for the video's length (`music_v2_5`, instrumental), registered as host music (`assets/music/`). `--music <file>` still lays your own file under the video.
- **Sound effects** (`--sfx`): `generate_sfx` makes short sounds for the moves that matter (`eleven_text_to_sound_v2`) and places them per frame (`assets/sfx/`, host entries in `audio_meta.json`).

The workflow's own audio passes keep all of it (host audio), and assembly places voice, bed and effects. `ELEVENLABS_BASE_URL` points at a regional server (e.g. EU data residency).

Without ElevenLabs, `--voice` uses HyperFrames' chain: **HeyGen** (`HEYGEN_API_KEY`, or `npx hyperframes auth login`; word timings included), else **Kokoro**, free and local (`npm run setup:voice` once: a Python `.venv` with the voice plus the on-device Parakeet model for word timings; `brew install espeak-ng` for languages other than English). `--sfx` then uses HyperFrames' bundled sound library. `VOICE_PROVIDER=hyperframes` forces that chain even with an ElevenLabs key.

## Revisions and re-renders

- `--revise <job-id> "what to change"` (or **Request changes** in the web UI) resumes the same Claude session on the same project: only the frames that change are rebuilt, then it renders and delivers again.
- `npm run render -- <job-id> [--format mp4|mov|webm] [--quality draft|standard|high]` renders again without Claude. `mov` is ProRes 4444 with alpha, ready for DaVinci Resolve.

## Safety

Claude works only inside the job's project folder. Its shell runs HyperFrames commands, the bundled skill scripts, FFmpeg and basic file tools; network tools, other interpreters and scripts, nested shells, `.env` files and anything outside the job are refused with a reason. The guard compares paths with symlinks resolved, as Claude Code reports them, so an `OUTPUT_DIR` behind a symlink works and a link out of the project doesn't. `hyperframes preview`, `publish`, `auth login`, `skills` and cloud rendering are off; nothing is uploaded or published. Frame workers can only read and write files. Spend stops at `--budget` / `MAX_BUDGET_USD`.

The picture and sound tools run inside the agent's own process: the OpenAI and ElevenLabs keys never reach Claude or its shell, the tools write only into the project's `assets/` folders, and a tool exists in a run only when its key is set and the job asked for that kind of media.

## Cost and time

Expect 10–30 minutes for a 45-second explainer (more with narration). Claude usage grows with the number of frames (the main agent plus one worker per frame) and depends on the model; `--budget` / `MAX_BUDGET_USD` stops a run at the cap, and `FRAME_WORKER_MODEL` can put the workers on a cheaper model. The render itself is local and free; `--quality draft` renders fastest.

Pictures and sound are billed by OpenAI and ElevenLabs on their own accounts, outside `--budget`: a typical 60-second video uses 4–10 pictures (capped by `MAX_IMAGES`), one narration line per frame, a music bed and a handful of effects. `job.json → media` and the CLI's summary say what was made.

## Tests

```bash
npm test
```

Zero cost: a mock Claude API plays the agent, everything else is real.

- `units`, `guard`, `product`: prompts, milestones, the shell and file policy (also on a job folder behind a symlink), the brand kit (on `lib/fixtures/acme`)
- `session`: the prompt stream that stays open while background workers run, closes on delivery or a run limit, and nudges a stalled agent
- `media`: the picture and sound tools against a mock of OpenAI's image API and ElevenLabs: the edit endpoint with the style and consistency references, sizes, transparency, the cache and the per-run limit, placeholders, narration with word timings, effects and music, and the workflow's own audio passes (`sync-durations`, `fetch-sfx`) keeping them
- `pipeline`: the real HyperFrames workflow scripts, lint, check, snapshot and a render in the acme brand, without Claude
- `collage`: the skill extensions (idempotent overlay), the collage kit, `--style vox-collage` setup, the vox-collage preset remix, frame packets with the collage rules, a collage frame through lint, check, snapshot and a 24 fps render
- `e2e`: the real Agent SDK and Claude Code with the bundled plugin, the picture tool (placeholders), both frame workers in the background with the main turn ending while they run, refusals, a render, delivery and a revision
- `web`: the UI server: guards, a job from the UI, video byte ranges, a revision

The render tests need `npm run setup` first (they skip with a warning when Chrome is missing).

## Troubleshooting

- **"This machine isn't ready: Chrome for rendering"**: `npm run setup`, or set `HYPERFRAMES_BROWSER_PATH` in `.env`.
- **"--voice needs a TTS provider"**: add `ELEVENLABS_API_KEY` or `HEYGEN_API_KEY` to `.env`, or `npm run setup:voice`.
- **"--music auto … composes the music with ElevenLabs"**: add `ELEVENLABS_API_KEY`, or pass a music file.
- **No pictures**: `OPENAI_API_KEY` isn't set (the CLI's first lines say `Images: off`), or the run used `--no-images`. A tool reply "OpenAI rejected OPENAI_API_KEY" or "safety system refused" is in `events.jsonl`; Claude rephrases or works without the picture.
- **"ElevenLabs 402/403"**: the plan doesn't include that feature, or its credits are used up.
- **"HyperFrames skills are X but the CLI is Y"**: `npm run skills:update -- Y`, or `npm install` after a `package.json` change.
- **A frame looks wrong**: `--revise <job-id> "frame 3: …"`; the frame ids are in `post.md` and the contact sheet.
- **The brand font doesn't show**: the product folder must ship the font files (`brand.fonts[].files` in `product.json`).
