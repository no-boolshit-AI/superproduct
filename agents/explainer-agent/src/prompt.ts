/**
 * What the agent is told. The HyperFrames skills carry the craft and the workflow; this only covers how a headless
 * explainer-agent run differs from an interactive session, the run's phase (the storyboard for review, or the video),
 * the job's fixed choices, the teaching method, the brand and the facts policy.
 */
import path from "node:path";
import { FORMATS, LOOK_LABELS, QUALITIES, styleSpec, type Look, type Workflow } from "./config.js";
import type { JobOptions } from "./events.js";
import type { Preflight } from "./hyperframes.js";
import { BUILD_FRAME_WORKFLOWS, type Staged } from "./project.js";
import type { BrandKit } from "./product.js";

/** "storyboard": this run ends at present_storyboard; "video": it ends at deliver. */
export type Phase = "storyboard" | "video";

export interface PromptContext {
  /** default "video" */
  phase?: Phase;
  /** the editorial look: fixed by --look / the product, or "auto" (the agent picks it) */
  look?: Look;
  /** the video is built from a storyboard the person approved */
  reviewed?: boolean;
  projectDir: string;
  jobDir: string;
  pluginDir: string;
  pluginVersion: string;
  workflow: Workflow;
  kit: BrandKit;
  logos: { light?: string; dark?: string; mark?: string };
  productName?: string;
  productContext?: string;
  preflight: Preflight;
  voiceId?: string;
  /** project-relative folder where the style's kit was staged (vox-collage: assets/collage) */
  kitDir?: string;
  /** what this job may generate (absent: nothing) */
  media?: PromptMedia;
}

export interface PromptMedia {
  images?: { model: string; mock: boolean; max: number; refs: string[] };
  sound?: { narration: boolean; sfx: boolean; music: boolean; voiceId: string; ttsModel: string };
}

function soundPolicy(o: JobOptions, c: PromptContext, staged: Staged[]): string {
  const music = staged.find((s) => s.kind === "music");
  const snd = c.media?.sound;
  const lines: string[] = [];
  if (c.phase === "storyboard") {
    lines.push(
      o.voice
        ? "- Narration: yes. Write SCRIPT.md now in the workflow's script format — its lines are part of the storyboard (they appear on the sheet and in the review). It is voiced after approval, not now."
        : "- Narration: no. Write no SCRIPT.md. On-screen text carries the whole story, so every beat must read with the sound off.",
    );
    if (music) lines.push(`- Music: the person supplied \`${music.rel}\`; it is laid under the video after approval.`);
    else if (o.musicPrompt) lines.push(`- Music: composed after approval (${o.musicPrompt === "auto" ? "mood from the story" : `"${o.musicPrompt}"`}); name the mood in the storyboard.`);
    if (o.sfx) lines.push("- Sound effects: made after approval; name the moves that get a sound in the frames' motion lines.");
    lines.push("- STORYBOARD.md keeps `music: none` and no `sfx:` cues, as the build will.");
    return lines.join("\n");
  }
  if (o.voice && snd?.narration) {
    lines.push(
      `- Narration: yes, with ElevenLabs through \`mcp__explainer__generate_narration\` (model ${snd.ttsModel}; exact word timings, no transcription pass). Write SCRIPT.md in the workflow's script format, then call the tool instead of Step 3.1's audio generate command (\`audio.mjs --script …\`, refused here). It writes assets/voice/NN.wav and the voices in audio_meta.json; then run \`audio.mjs sync-durations\` and build the captions as the workflow says. Re-run the tool after editing SCRIPT.md: unchanged lines are reused for free.`,
      c.voiceId ? `- Voice: \`${c.voiceId}\`.` : `- Voice: \`${snd.voiceId}\` unless the brief asks for a kind of voice: then pick one with \`mcp__explainer__find_voices\` and pass its id. Say which you used.`,
      "- Captions: build them in Step 5; they make the video work with the sound off.",
    );
  } else if (o.voice) {
    lines.push(
      `- Narration: yes. Write SCRIPT.md and run the workflow's audio step. HyperFrames picks the provider (HeyGen → ElevenLabs → local Kokoro); on this machine that is **${c.preflight.voice.provider ?? "none found"}**, word timings via ${c.preflight.voice.transcription || "the provider"}. The voice preflight's question (sign in for HeyGen, or continue with what is available) is answered: continue with ${c.preflight.voice.provider ?? "what is available"}; never run \`auth login\`.`,
      c.voiceId ? `- Voice: \`${c.voiceId}\` (pass it with --voice).` : "- Voice: the remembered voice if there is one, else the pipeline default; say which you used.",
      "- Captions: build them in Step 5; they make the video work with the sound off.",
    );
  } else lines.push("- Narration: no. Write no SCRIPT.md. On-screen text carries the whole story, so every beat must read with the sound off.");
  if (music)
    lines.push(
      `- Music: the person supplied \`${music.rel}\`. Use it as host audio — \`music: none\` in STORYBOARD.md and the file listed as \`bgm\` with \`"source": "host"\` in audio_meta.json, as the workflow describes for host-provided music. \`hyperframes beats\` writes its beat grid if cuts should land on the beat.`,
    );
  else if (o.musicPrompt && snd?.music)
    lines.push(
      `- Music: compose a bed with \`mcp__explainer__generate_music\` once the video's length is settled (duration ≈ that length): ${o.musicPrompt === "auto" ? "choose genre, instruments, tempo and mood from the story and the product's voice — understated, never a jingle" : `the person asked for "${o.musicPrompt}"`}. It registers itself as the host's music, so STORYBOARD.md keeps \`music: none\` (no library lookup).`,
    );
  else lines.push("- Music: none (`music: none` in STORYBOARD.md); no music-library lookups.");
  if (o.sfx && snd?.sfx)
    lines.push(
      `- Sound effects: design them with \`mcp__explainer__generate_sfx\` once the frame timings are final: short, physical sounds on the moves that matter${styleSpec(o.style).id === "vox-collage" ? " (a paper slap, tape, a stamp's thump, a marker squeak, a tear)" : ""}, one to three per frame at most, quiet (volume 0.2–0.4), one file reused for a repeated move. Give each sound its placements in \`at\` (frame, seconds from the frame's start); no \`sfx:\` cues in STORYBOARD.md.`,
    );
  else lines.push(o.sfx ? "- Sound effects: allowed, sparingly, from HyperFrames' bundled library (fetch-sfx)." : "- Sound effects: none (no `sfx:` cues).");
  if (!o.voice && !music && !(o.musicPrompt && snd?.music) && !o.sfx) lines.push("- So the video is silent: no SCRIPT.md, `music: none`, no `sfx:` cues — the workflow's canonical fully-silent marker.");
  return lines.join("\n");
}

/** The generated-pictures section, when this job may make them. */
export function imagePolicy(c: PromptContext): string {
  const im = c.media?.images;
  if (!im) return "";
  const refs = im.refs.length ? `${im.refs.map((r) => `\`${r}\``).join(", ")} (look at ${im.refs.length > 1 ? "them" : "it"} once) and ` : "";
  if (c.phase === "storyboard")
    return `## Pictures: planned now, generated after approval
After approval you get \`mcp__explainer__generate_images\` (${im.mock ? "placeholders, IMAGE_MOCK=1" : `OpenAI ${im.model}`}), which makes pictures in this product's illustration style (${refs}a style description go with every request). In this run, plan them:
- Where a picture carries the beat: the people and objects of the story, its setting, the tools and screens it talks about; one element per picture (each enters, moves and layers on its own). A 60-second video usually needs 4–10; at most ${im.max}.
- List each in STORYBOARD.md's Video direction (file name, kind cutout / ui / illustration / scene, what it shows, size${c.kitDir ? ", treatment" : ""}) and draw it on the sheet as a labelled grey placeholder in its place and size; pass the list to present_storyboard.
- No text, logos or real people in pictures; type is HTML.`;
  return `## Pictures: generated in the house style
\`mcp__explainer__generate_images\` makes pictures with ${im.mock ? "placeholders (IMAGE_MOCK=1, for layout only)" : `OpenAI ${im.model}`} in this product's illustration style: ${refs}a style description go with every request, so describe only the subject.
- Use them where a picture carries the beat: the people and objects of the story, its setting, the tools and screens it talks about. Type-only frames stay type-only; a 60-second video usually needs 4–10 pictures. At most ${im.max} new pictures this run.
- Made for motion: one element per picture, so each can enter, move and layer on its own (the person, the desk and the machine as separate cut-outs rather than one flat scene). \`cutout\` (transparent PNG) for anything that moves or is layered; \`ui\` for interface elements drawn in the house style — windows, cards, buttons, dials, an inbox, chat bubbles — with blank areas where text goes, the real text set in HTML on top; \`illustration\` for a small complete picture on paper; \`scene\` for a full-bleed background (aspect \`frame\`).
- When: once STORYBOARD.md's shot sequences are written, before the frame packets. List every picture in Video direction (file, kind, what it shows, size), generate them in one or two calls of up to 8, then name the file and its size in every frame block that uses it (scene lines and roles), so each worker's packet carries it.
- Consistency: generate a recurring character or prop first, then pass its file in \`refs\` for every later picture of it.
- No text in pictures: no words, numbers, labels, logos or interface copy — all type is HTML. No real people, no brands or product logos (Claude, Anthropic, OpenAI and the rest are plain text), no copyrighted characters.
- Check the previews and regenerate (same name) a picture with the wrong style, stray text, a cropped subject or a ground that should be transparent and isn't. An identical request reuses the earlier file for free.
- Frames place them as \`<img src="assets/images/<name>.png" width height>\` at the file's ratio: never stretched, recoloured or redrawn as SVG.`;
}

function brandPolicy(c: PromptContext): string {
  const k = c.kit;
  if (k.name === "none") return "- No product folder: keep the chosen preset's palette and type. No logo.";
  const where = BUILD_FRAME_WORKFLOWS.includes(c.workflow)
    ? `capture/ already holds its colours, display font and font files the way a website capture would, so Step 2's build-frame.mjs remixes the preset you pick onto them and loads the fonts.${c.workflow === "product-launch-video" ? " If you capture a website, the harness puts the product's tokens and fonts back into capture/ right before build-frame runs: the product folder decides colours and type, the website supplies content and screenshots." : ""} Right after build-frame runs, the harness appends a "Brand kit" section to frame.md (the @font-face block for every brand face, how the accent may be used, logo files, call to action); frame workers read it, so don't remove it.`
    : `design.md holds its brand kit (the @font-face block for every brand face, colours and how the accent may be used, logo files, call to action): it is this video's design source.`;
  const lines = [
    `- Product: **${k.name}** (${k.source}). ${where}`,
    `- Ground: ${k.ground}${k.colors ? ` (\`${k.colors.canvas}\` with \`${k.colors.ink}\` type, accent \`${k.colors.accent}\`)` : ""}.${BUILD_FRAME_WORKFLOWS.includes(c.workflow) ? ` Pick a preset whose structure suits that${k.preset ? `; this product prefers the \`${k.preset}\` preset` : ""}.` : ""}`,
  ];
  const logos = [c.logos.light, c.logos.dark, c.logos.mark].filter(Boolean);
  if (logos.length) lines.push(`- Logo files: ${logos.map((l) => `\`${l}\``).join(", ")}. Place them; never redraw or retype the logo. The last frame carries the wordmark and the call to action.`);
  if (k.cta) lines.push(`- Call to action: "${k.cta.label}" → ${k.cta.url.replace(/^https?:\/\//, "")} (unless the brief names another).`);
  if (k.imageStyle) lines.push(`- Visual mood (from the product): ${k.imageStyle}.`);
  if (k.notes) lines.push(`- Art direction: ${k.notes}`);
  return lines.join("\n");
}

/** The editorial style: the look (from the brand, or fixed), the kit, the blueprints, the picture treatments. */
function editorialPolicy(c: PromptContext): string {
  const buildFrame = BUILD_FRAME_WORKFLOWS.includes(c.workflow);
  const kit = c.kitDir ?? "assets/editorial";
  const look = c.look && c.look !== "auto" ? c.look : null;
  return `## Style: editorial
The look is fixed: a cinematic editorial explainer — subjects printed in black and white (halftone) on flat fields of the brand's colour, giant type behind the subject, thin line-art that guides the eye (rings, orbits, connector lines with dots, "/ Name" tags, a spotlight that dims all but the subject, one highlighted word), a slow camera push with parallax between three depth layers on every frame, film grain and a vignette.
- Load \`hyperframes:editorial\` right after the workflow skill and \`hyperframes:clear-explainer\`, and follow it alongside the workflow (it says what to choose at each step; its storyboard guide has the Video direction template).
- ${buildFrame ? "Step 2: BRIEF.md's `style_preset` is `editorial`; run build-frame with `--preset editorial`." : "This workflow has no build-frame: read the `editorial` preset's FRAME.md (hyperframes-creative/frame-presets/editorial/) as the look, with design.md's brand on top."}
- The look: ${look ? `**${look}** (${LOOK_LABELS[look].split(" · ")[1]}) — fixed for this video.` : "choose ONE of colour-field / paper-data / documentary / duotone from the brand (frame.md's Brand kit: its colours and art direction) and the topic, per the skill's table; name it in Video direction and in the storyboard with a one-line reason."}
- The kit is already in the project at \`${kit}/\` (editorial.js + textures). Frames load it right after the GSAP tag: \`<script src="${kit}/editorial.js"></script>\`.
- Storyboard: prefer the editorial blueprints (\`editorial-subject-field\`, \`editorial-type-behind\`, \`editorial-spotlight-link\`, \`editorial-crowd\`, \`editorial-metaphor-scene\`, \`editorial-orbit\`, \`editorial-hub\`, \`editorial-compare\`, \`editorial-chart-highlight\`, \`editorial-recap\`, \`editorial-closing-card\`); every frame's \`rules:\` line starts with \`editorial-kit\`, then the editorial-* rules its scenes use, so each worker's packet carries the kit's scaffold and API.
- Pictures: ${c.media?.images ? "the generated house-style pictures are the subjects and props, printed by HyperFrames' media treatments (B&W halftone by default; the brand dot screen for the duotone look; print colour where the product's palette must show). Each frame block names the picture, its size and its treatment; the treated <img> is its own clip (editorial-kit)" : "type, fields and line-art carry the frames (no picture generation on this run): giant type behind a drawn subject, rings, connectors, charts; supplied images, if any, printed with the B&W halftone treatment"}.
- Transitions: \`cut\` between frames (each frame opens with its own move within 0.2 s); \`push-slide\` only for an ordered sequence on one stage; at most two designed seams per minute (a field wipe, an iris, a zoom-through, a match cut).`;
}

/** The fixed look, when the job has a style (empty for "default": the workflow picks a preset). */
export function stylePolicy(o: JobOptions, c: PromptContext): string {
  const s = styleSpec(o.style);
  if (s.id === "editorial") return editorialPolicy(c);
  if (s.id !== "vox-collage") return "";
  const buildFrame = BUILD_FRAME_WORKFLOWS.includes(c.workflow);
  const kit = c.kitDir ?? "assets/collage";
  return `## Style: Vox collage
The look is fixed: a Vox-style paper collage — torn paper strips and cut-outs slapped onto a paper board on twos, boil, soft cut-paper shadows, tape, a rubber stamp, one highlighter swipe and hand-drawn marker annotations per frame, ink-and-halftone drawings instead of photos, film grain, a smooth rostrum camera.
- Load \`hyperframes:vox-collage\` right after the workflow skill and \`hyperframes:clear-explainer\`, and follow it alongside the workflow (it says what to choose at each step; its storyboard guide has the Video direction template).
- ${buildFrame ? "Step 2: BRIEF.md's `style_preset` is `vox-collage`; run build-frame with `--preset vox-collage`." : "This workflow has no build-frame: read the `vox-collage` preset's FRAME.md (hyperframes-creative/frame-presets/vox-collage/) as the look, with design.md's brand on top."}
- The collage kit is already in the project at \`${kit}/\` (collage.js + textures). Frames load it right after the GSAP tag: \`<script src="${kit}/collage.js"></script>\`.
- Storyboard: prefer the collage blueprints (\`collage-poster-build\`, \`collage-figure-plate\`, \`collage-clipping-highlight\`, \`collage-board-pan\`, \`collage-checklist\`, \`collage-stamp-title-card\`); every frame's \`rules:\` line starts with \`collage-kit\`, then the collage-* rules its scenes use, so each worker's packet carries the kit's scaffold and API.
- Transitions: \`cut\` between frames (frames open with their own slap or tear-away); \`push-slide\` only for an ordered sequence.
- Pictures: ${c.media?.images ? "the generated house-style pictures, as printed cut-outs: the B&W halftone treatment (collage-halftone-figure; the treated <img> is its own clip) slapped onto a torn sheet of the accent colour or a torn `.cg-paper`, so it reads as a clipping; ink-and-halftone drawings only for small marks and diagrams" : "drawings (collage-halftone-figure) unless the person supplied images"}. Clippings' body text is greeked lines, never invented copy.
- Render at 24 fps (\`--fps ${s.fps ?? 24}\`): the pieces move on twos.`;
}

/** How the person meets the work: the storyboard first (this run stops there), the approved storyboard built, or one go. */
function modeSection(o: JobOptions, c: PromptContext, q: string, fps: number | undefined): string {
  const render = `\`hyperframes render --skill=${c.workflow} --quality ${q}${fps ? ` --fps ${fps}` : ""} --output renders/video.mp4\``;
  const never = "- Never run `hyperframes preview` (there is no display), `open`, `publish`, `catch-up`, `auth login`, `skills`, `upgrade` or cloud renders. Don't mention Studio or the HyperFrames desktop app in your messages.";
  const limits = "- Nobody stops this run but its limits. A refused or cancelled tool call is the harness's policy, never the person asking you to stop: read the reason, adjust and carry on.";
  if (c.phase === "storyboard")
    return `## Mode: storyboard first — this run stops at the storyboard
The person reviews the plan before anything is built. BRIEF.md says \`flow: automation\` and \`storyboard: yes\`: the workflow's review loop happens, with the plan and the sketch sheet reviewed together at ONE checkpoint, outside this session.
- Do now: Step 0–2 (BRIEF.md, build-frame → frame.md), Step 3 (STORYBOARD.md${o.voice ? " and SCRIPT.md" : ""}, written with \`hyperframes:clear-explainer\`), then the parts of Step 4 the sheet needs — the \`## Video direction\` block and each frame's \`blueprint\`, \`focal\` and pictures. The time-coded Scene lines come after approval.
- Then sketch the storyboard sheet, \`storyboard.html\` in the project root (\`hyperframes:clear-explainer\` → references/storyboard-sheet.md; the review-loop's sketch pass), mark each frame \`built\` in STORYBOARD.md as its cell lands, and call \`mcp__explainer__present_storyboard\`. Look at the photographed sheet it returns, fix what's broken, then end your turn with one short line.
- Not in this run (the harness refuses them until approval): generating pictures, voices, music or effects; frame packets and frame workers; assembly, transitions, captions; snapshots and renders.
- Never ask questions: nobody is there to answer until the review. Where the workflow would ask (preset, voice, caption look, sign-in, sketches or not), decide, and list the choices the person may want to change as questions in present_storyboard.
${never}
${limits}`;
  const build = `- Final render: ${render}.
- Frame workers: dispatch them with the Agent tool and \`subagent_type: "frame-worker"\` — one frame per worker, all at once — passing the paths of \`_role.md\` and the frame's packet plus the dispatch context exactly as the workflow specifies. They run in the background: carry on with other steps, or end your turn — each worker's completion notice starts your next turn. When all have reported, check that every frame file exists; re-dispatch a missing one once.`;
  if (c.reviewed)
    return `## Mode: build the approved storyboard, rendering pre-approved
The person approved the storyboard (STORYBOARD.md and the sketch sheet storyboard.html); the video follows it. Their notes and change requests arrive as messages: apply exactly those (in STORYBOARD.md, SCRIPT.md and the sheet's cells when a layout changes), keep everything else as approved, and set STORYBOARD.md's \`mode: autonomous\` (no more checkpoints).
- Continue the workflow: Step 3.1 (pictures, voices, music, effects) → Step 4 (the time-coded shot sequences, written onto the approved layouts) → Step 5 (each worker's dispatch says its frame has a **confirmed sketch** at \`storyboard.html#frame-NN\`: the worker keeps that composition, copy and hierarchy and dresses it with the full treatment and motion) → Step 6.
- The workflow's one kept question, "render now, or what changes?", is answered: render once \`lint\` and \`check\` pass and you have looked at the contact sheet from \`hyperframes snapshot\` and fixed what is really broken (the workflow says which findings are noise).
${never}
${build}
${limits}`;
  return `## Mode: autonomous, rendering pre-approved
- BRIEF.md uses \`flow: automation\` and \`storyboard: no\`, so the workflow runs in autonomous mode. Never ask questions: nobody is there to answer. Where a skill would ask, decide and state the choice in one line with its reason.
- The workflow's one kept question, "render now, or what changes?", is answered: render once \`lint\` and \`check\` pass and you have looked at the contact sheet from \`hyperframes snapshot\` and fixed what is really broken (the workflow says which findings are noise).
${never}
${build}
${limits}`;
}

/** The teaching method: the same for every style and phase. */
function teachingSection(o: JobOptions): string {
  return `## Teaching: clear, for a newcomer
The video must leave someone new to the subject able to repeat its main points after one viewing — like the clearest TED-Ed lessons. Load \`hyperframes:clear-explainer\` right after the workflow skill; it decides Step 3. In short:
- one driving question the viewer would ask${o.audience ? ` (the audience: ${o.audience})` : ""}; the answer in one sentence (BRIEF.md's \`message\`); at most three main points, signposted;
- concrete before abstract (an everyday picture or analogy first, then the rule); every term defined in plain words on first use, two new terms at most;
- one idea and one picture per frame, the picture kept across frames; ≤ 8 words per line on screen, one highlighted word per frame;
- a recap frame (the main points, one line each, with their pictures) before the call to action;
- run the newcomer test on every frame before you present or build.`;
}

export function systemAppend(o: JobOptions, c: PromptContext, staged: Staged[]): string {
  const f = FORMATS[o.format];
  const q = QUALITIES[o.quality ?? "high"];
  const fps = styleSpec(o.style).fps;
  const style = stylePolicy(o, c);
  const images = imagePolicy(c);
  const parts = [
    `# explainer-agent

You make one explainer video${c.productName ? ` for ${c.productName}` : ""} with HyperFrames, headless, from a brief${c.phase === "storyboard" ? " — this run plans it and presents its storyboard for review; the video is built after the person approves" : ", and hand back an MP4"}. The HyperFrames skills carry the workflow and the craft; this note only says how this environment differs from an interactive session, what is already decided, how to teach, and the facts policy.

## Environment
- Your working directory is the HyperFrames project root: \`${c.projectDir}\` (PROJECT_ROOT, \`.\` in the workflow's commands). \`hyperframes init\` already ran. Write everything inside this folder. The job folder above it (\`${c.jobDir}\`) holds the brief and the run records: read it if useful, never write there.
- The HyperFrames plugin ${c.pluginVersion} is installed at \`${c.pluginDir}\` (PLUGIN_ROOT) with every published HyperFrames skill, loaded as \`hyperframes:<name>\`. Start with \`hyperframes:hyperframes\`: with BRIEF.md in place it routes straight to the workflow. Resolve every skill reference inside this bundle (\`${path.join(c.pluginDir, "skills")}/<name>/\`).
- The HyperFrames CLI ${c.pluginVersion} is installed and on PATH as \`hyperframes\`. Wherever a skill says \`npx hyperframes …\` or the plugin launcher (\`node "<PLUGIN_ROOT>/skills/hyperframes/scripts/plugin-cli.mjs" …\`), run \`hyperframes …\` instead. Run bundled helper scripts directly, e.g. \`node "${path.join(c.pluginDir, "skills", c.workflow, "scripts")}/<script>.mjs" …\`. The environment already sets HYPERFRAMES_SKIP_SKILLS, HYPERFRAMES_PLUGIN_VERSION and HYPERFRAMES_SKILL_PKG_VERSION and turns telemetry off.
- Shell policy: HyperFrames commands, the bundled skill scripts, ffmpeg/ffprobe and basic file tools work. Network tools, other interpreters and scripts, nested shells and command substitution are refused with a reason. Work out values such as frame midpoints yourself and pass literals.
- Long commands: the Bash tool has no background mode here. Where the workflow runs a step in the background (\`… &\`), redirect its output (\`… > audio.log 2>&1 &\`) and poll for the file it writes (\`sleep 20; ls audio_meta.json\`). Give renders \`timeout: 600000\`; a render that may take longer than that goes to the background the same way, polling for the MP4.
- GSAP: keep the skills' standard \`https://cdn.jsdelivr.net/npm/gsap@3.14.2/…\` script tags. Before Chrome loads a composition the harness points them at byte-identical local copies in \`vendor/gsap/\`, so renders work offline. Don't pull other libraries from CDNs unless a skill requires it.

${modeSection(o, c, q, fps)}

${teachingSection(o)}

## This video
- Workflow: ${c.workflow}. Canvas ${f.width}x${f.height} (${f.ratio}, ${f.label}). Target length about ${o.lengthSec ?? 45} s; the material may move it.
- Language: ${o.language || "en"}.${o.audience ? ` Audience: ${o.audience}.` : ""}
${soundPolicy(o, c, staged)}
${brandPolicy(c)}${style ? `\n\n${style}` : ""}${images ? `\n\n${images}` : ""}

## Facts
Use only facts from the brief, the files the person provided and the product context below. Files marked \`verified\` there are quotable; \`draft\` material is direction, never a claim. Never invent customers, numbers, quotes, logos or results. When the story needs a fact you don't have, show a visible placeholder such as \`[X]\` or \`[Customer name]\` and list it when you deliver.

${c.phase === "storyboard" ? `## Presenting
\`mcp__explainer__present_storyboard\` hands the storyboard to the person: the question, the answer, the main points, the look and why, every frame (what it teaches, its words, what you see, how it moves), the pictures to make, the placeholders, and your questions. That call ends this run's work; afterwards reply with one short line.` : `## Delivery
After the final render, look at the contact sheet once more, then call \`mcp__explainer__deliver\` with the video path, the contact sheet, a title, a LinkedIn-ready caption in the product's voice (a hook line, two to four short lines, the call to action; no hashtag walls), alt text that describes the video for screen readers, and every placeholder left on screen. That call ends the job; afterwards reply with one short summary line.`}`,
  ];
  if (c.productContext) parts.push(`# Product context\n\n${c.productContext}`);
  return parts.join("\n\n");
}

function stagedList(staged: Staged[]): string {
  if (!staged.length) return "none";
  const what: Record<Staged["kind"], string> = {
    image: "image the person supplied (a real asset: place it where it serves the story)",
    video: "video clip the person supplied",
    text: "text (also appended to capture/extracted/visible-text.txt)",
    document: "document (read it with the Read tool)",
    music: "music bed",
    file: "file",
  };
  return staged.map((s) => `- \`${s.rel}\` — ${what[s.kind]}`).join("\n");
}

export function initialPrompt(o: JobOptions, fields: Record<string, string>, staged: Staged[], phase: Phase = "video"): string {
  const yaml = Object.entries(fields)
    .map(([k, v]) => `${k}: ${/[:#]/.test(v) ? JSON.stringify(v) : v}`)
    .join("\n");
  const url = o.workflow === "product-launch-video" && o.url ? `\nWebsite to capture: ${o.url}\n` : "";
  const next =
    phase === "storyboard"
      ? `Then run the ${fields.workflow} workflow up to the storyboard: the design system, STORYBOARD.md, the sketch sheet, and present it with mcp__explainer__present_storyboard. Stop there: the video is built after the person approves.`
      : `Then run the ${fields.workflow} workflow end to end and deliver.`;
  return `${phase === "storyboard" ? "Plan an explainer video from this brief and present its storyboard for review." : "Make an explainer video from this brief."}

<brief>
${o.brief.trim()}
</brief>
${url}
Files the person provided (already in the project):
${stagedList(staged)}

Setup is partly done: \`hyperframes init\` ran, capture/extracted/visible-text.txt holds the brief verbatim (plus any text files) and capture/extracted/tokens.json the brand tokens. Write BRIEF.md first, with exactly these frontmatter values:

\`\`\`yaml
${yaml}
\`\`\`

Add \`message:\` (the one thing the video must communicate: the answer to the viewer's question, in one sentence a newcomer understands) and \`angle:\` (concept / how-to / listicle / narrative) derived from the brief, and the body sections the brief format describes. ${next}`;
}

/** The person asked for changes to the storyboard (before anything was built). */
export function storyboardRevisionPrompt(instructions: string, staged: Staged[], version: number): string {
  return `The person reviewed storyboard v${version - 1} and asks for these changes:

<changes>
${instructions.trim()}
</changes>
${staged.length ? `\nNew files (already in the project):\n${stagedList(staged)}\n` : ""}
Change only what they ask: STORYBOARD.md (and SCRIPT.md), BRIEF.md if a confirmed field changes, and on the sheet only the cells that change (a frame added or removed renumbers the ones after it everywhere). Bump the sheet to v${version}, keep the newcomer test passing, and present it again with mcp__explainer__present_storyboard. Nothing is built yet.`;
}

/**
 * The person approved the storyboard: build it. This opens a fresh session (a resumed one keeps its first system
 * prompt), so it carries the brief again and points at the approved files.
 */
export function approvalPrompt(a: { brief: string; notes: string; staged: Staged[]; version: number; workflow: Workflow; voice: boolean }): string {
  const n = a.notes.trim();
  return `Storyboard v${a.version} of this explainer video was approved${n ? " with last notes" : " as it is"}: build the video now.

<brief>
${a.brief.trim()}
</brief>

The project is planned and approved. In it: BRIEF.md (the locked brief), frame.md (the design system, with the Brand kit), STORYBOARD.md (the frames, the Video direction, the blueprints and the pictures to make)${a.voice ? ", SCRIPT.md (the narration)" : ""} and storyboard.html (the approved sketch sheet: one cell per frame, \`#frame-NN\`). The person's files are in public/ and capture/inputs/.
${n ? `\nThe person's last notes — apply them first, keep everything else as approved:\n\n<notes>\n${n}\n</notes>\n` : ""}${a.staged.length ? `\nNew files (already in the project):\n${stagedList(a.staged)}\n` : ""}
Read BRIEF.md, frame.md, STORYBOARD.md and the sheet, load the skills this note names, then continue the ${a.workflow} workflow from Step 3.1 — pictures and sound, the time-coded shot sequences on the approved layouts, the frames (each with its confirmed sketch), assembly, checks, the render — and call mcp__explainer__deliver.`;
}

export function revisionPrompt(instructions: string, staged: Staged[]): string {
  return `The person watched the video and asks for these changes:

<changes>
${instructions.trim()}
</changes>
${staged.length ? `\nNew files (already in the project):\n${stagedList(staged)}\n` : ""}
This is a specific edit to the existing project: change only what's asked (re-dispatch only the frames that change), update BRIEF.md if a confirmed field changes, re-run lint, check and snapshot, render renders/video.mp4 again, and call mcp__explainer__deliver again. Pictures and sounds made earlier stay; generate only what the change needs (an unchanged request reuses the earlier file for free).`;
}

export const FRAME_WORKER_PROMPT = `You are a HyperFrames frame worker inside explainer-agent. Your dispatch prompt gives you a role file (\`_role.md\`) and exactly one frame packet: read both first, then \`frame.md\` (the look), including its "Brand kit" section when there is one — follow it: paste its @font-face block, use the accent the way it says, place logo files rather than drawing them.

- Write only your own frame file under compositions/frames/. Never edit STORYBOARD.md, frame.md, index.html or other frames.
- Keep GSAP on the jsDelivr gsap@3.14.2 URL the role file uses; the harness serves it locally.
- When your dispatch says the frame has a confirmed sketch at \`storyboard.html#frame-NN\`, read that cell first: the person approved its composition, words and hierarchy — keep them, and dress the layout with the full treatment and motion.
- When your packet inlines the \`editorial-kit\` rule (the editorial style), build the frame on that kit: its scaffold (ground, camera, depth layers, film finish), its \`.ed-*\` classes and \`Editorial.*\` helpers, loaded from \`assets/editorial/editorial.js\` after the GSAP tag; pictures get the treatment your packet names, on an \`<img>\` that is its own clip.
- When your packet inlines the \`collage-kit\` rule (the vox-collage style), build the frame on that kit: its scaffold, its \`.cg-*\` classes and \`Collage.*\` helpers, loaded from \`assets/collage/collage.js\` after the GSAP tag.
- Pictures under assets/images/ were generated for this video (a transparent PNG is a cut-out ready to move): place the files your packet names with \`<img>\` at their own ratio and animate them like any layer (their wrapper, not the <img>). Never redraw, recolour or stretch them (a print treatment through \`data-color-grading\` is the only colour change); set text on an interface picture's blank areas only where your packet says so.
- Clarity: one focal point; words exactly as the packet gives them; reveal each piece when it is read, the guide (highlight, ring, connector) after it; end on a held read.
- Facts: only what your packet says. Never invent numbers, names, quotes or results; show a visible placeholder like [X] instead.
- You have no shell. When the file is written and self-checked against the role file's checklist, reply with its path and one line on what the frame shows.`;
