/** Pure functions: workflow milestones, ids, the skills check, BRIEF.md fields and what the prompts say. */
import assert from "node:assert/strict";
import path from "node:path";
import { newJobId, refuseBeforeApproval, refuseToolBeforeApproval, refuseWorkflowTts, stepsFor } from "../src/agent.js";
import { DEFAULT_STYLE, FORMATS, REQUIRED_SKILLS, ROOT, isStyle, lookOf, pluginInfo, skillProblems, slugify } from "../src/config.js";
import { STEPS, type JobOptions } from "../src/events.js";
import type { Preflight } from "../src/hyperframes.js";
import { brandKit, resolveProduct } from "../src/product.js";
import { briefTitle, lockedBriefFields } from "../src/project.js";
import { FRAME_WORKER_PROMPT, approvalPrompt, initialPrompt, revisionPrompt, storyboardRevisionPrompt, systemAppend, type PromptContext } from "../src/prompt.js";

// milestones from tool calls
const st = (name: string, input: Record<string, unknown>) => stepsFor(name, input).join(",");
assert.equal(st("Write", { file_path: "/x/out/j/project/BRIEF.md" }), "brief");
assert.equal(st("Write", { file_path: "STORYBOARD.md" }), "storyboard");
assert.equal(st("Write", { file_path: "/p/compositions/frames/01-hook.html" }), "frames");
assert.equal(st("Bash", { command: 'node "/v/skills/faceless-explainer/scripts/build-frame.mjs" --preset x --hyperframes .' }), "design");
assert.equal(st("Bash", { command: "node /v/audio.mjs --script ./SCRIPT.md" }), "audio");
assert.equal(st("Bash", { command: "node /v/assemble-index.mjs --storyboard ./STORYBOARD.md" }), "assemble");
assert.equal(st("Bash", { command: "npx hyperframes render --output renders/video.mp4" }), "render");
assert.equal(st("Bash", { command: "npx --yes hyperframes@0.8.140 snapshot --at 1,2" }), "snapshot");
assert.equal(st("Bash", { command: "hyperframes lint" }), "checks");
assert.equal(st("Bash", { command: "npm run check" }), "checks");
assert.equal(st("Bash", { command: 'node "/v/skills/hyperframes/scripts/plugin-cli.mjs" render -o renders/video.mp4' }), "render");
assert.equal(st("Bash", { command: "hyperframes render -o renders/v.mp4 && hyperframes lint && hyperframes snapshot --at 1" }), "checks,snapshot,render", "one command, several milestones, in workflow order");
assert.equal(st("mcp__explainer__deliver", {}), "deliver");
assert.equal(st("mcp__explainer__generate_images", { images: [] }), "images");
assert.equal(st("mcp__explainer__generate_narration", {}), "audio");
assert.equal(st("mcp__explainer__generate_sfx", { sounds: [] }), "audio");
assert.equal(st("mcp__explainer__generate_music", {}), "audio");
assert.equal(st("mcp__explainer__find_voices", {}), "");
assert.equal(st("mcp__explainer__present_storyboard", { frames: [] }), "review");
assert.equal(st("Write", { file_path: "/p/storyboard.html" }), "storyboard", "the sketch sheet is part of the storyboard");
assert.deepEqual(STEPS.map((x) => x.id).slice(3, 6), ["storyboard", "review", "approved"]);
assert.equal(st("Read", { file_path: "STORYBOARD.md" }), "");
assert.equal(st("Bash", { command: "ls renders" }), "");
assert.equal(st("Bash", { command: 'ls "/v/skills/faceless-explainer/scripts/"; grep -n duration /v/skills/faceless-explainer/scripts/assemble-index.mjs' }), "", "reading a script isn't running it");
assert.equal(st("Bash", { command: "cat /v/skills/faceless-explainer/scripts/audio.mjs | head -40" }), "");
assert.equal(st("Bash", { command: 'node "/v/skills/hyperframes/scripts/plugin-cli.mjs" --script "/v/skills/faceless-explainer/scripts/frame-packets.mjs" --project .' }), "frames", "through the plugin launcher");

// ids and titles
assert.match(newJobId("# What is RAG?\n\nbody"), /^\d{8}-\d{6}-what-is-rag$/);
assert.equal(slugify("Ça va? Déjà vu!"), "ca-va-deja-vu");
assert.equal(briefTitle("\n# Why sourdough takes time\n\nbody"), "Why sourdough takes time");
assert.equal(briefTitle("Topic: agents for finance teams"), "agents for finance teams");

// the bundled skills
const info = pluginInfo();
assert.equal(info.skills.length, 24, info.skills.join(", ")); // the 21 HyperFrames skills + clear-explainer, editorial, vox-collage
for (const s of REQUIRED_SKILLS) assert.ok(info.skills.includes(s), s);
assert.deepEqual(skillProblems(info, info.version), []);
assert.match(skillProblems(info, "9.9.9")[0], /skills:update -- 9\.9\.9/);
assert.match(skillProblems({ ...info, skills: info.skills.filter((s) => s !== "faceless-explainer") }, info.version)[0], /missing HyperFrames skills: faceless-explainer/);
assert.match(skillProblems({ dir: path.join(ROOT, "nope"), version: null, skills: [] }, "1.0.0")[0], /not found/);

// BRIEF.md fields fixed by the job
const o: JobOptions = { brief: "# What is RAG\n\nFor finance.", format: "portrait" };
assert.deepEqual(lockedBriefFields(o, "faceless-explainer"), {
  workflow: "faceless-explainer",
  flow: "automation",
  storyboard: "yes",
  destination: "linkedin-feed",
  aspect: "1080x1350",
  language: "en",
  length: "45s",
  narration: "no",
});
const voiced = lockedBriefFields({ ...o, format: "vertical", voice: true, lengthSec: 30, audience: "CFOs: finance leads", language: "ro" }, "faceless-explainer", "am_michael");
assert.equal(voiced.aspect, "1080x1920");
assert.equal(voiced.narration, "yes");
assert.equal(voiced.voice, "am_michael");
assert.equal(voiced.language, "ro");
const prompt = initialPrompt(o, voiced, []);
assert.match(prompt, /<brief>\n# What is RAG/);
assert.match(prompt, /audience: "CFOs: finance leads"/, "values with a colon are quoted");
assert.match(prompt, /flow: automation\nstoryboard: yes/, "the storyboard is reviewed by default");
assert.equal(lockedBriefFields({ ...o, storyboard: false }, "faceless-explainer").storyboard, "no", "--no-storyboard: one go");
assert.match(prompt, /run the faceless-explainer workflow end to end and deliver/);
const sbPrompt = initialPrompt(o, lockedBriefFields(o, "faceless-explainer"), [], "storyboard");
assert.match(sbPrompt, /^Plan an explainer video from this brief and present its storyboard for review/);
assert.match(sbPrompt, /mcp__explainer__present_storyboard\. Stop there/);
assert.match(sbPrompt, /answer to the viewer's question, in one sentence a newcomer understands/);
assert.match(storyboardRevisionPrompt("Use a kitchen analogy", [], 2), /reviewed storyboard v1[\s\S]*kitchen analogy[\s\S]*Bump the sheet to v2[\s\S]*present_storyboard/);
const approval = approvalPrompt({ brief: "# What is RAG\n\nFor finance.", notes: "Shorter frame 3", staged: [], version: 1, workflow: "faceless-explainer", voice: true });
assert.match(approval, /^Storyboard v1 of this explainer video was approved with last notes: build the video now/);
assert.match(approval, /<brief>\n# What is RAG[\s\S]*SCRIPT\.md \(the narration\)[\s\S]*apply them first[\s\S]*Shorter frame 3[\s\S]*from Step 3\.1[\s\S]*mcp__explainer__deliver/, "a fresh session: the brief and the approved files");
assert.match(approvalPrompt({ brief: "x", notes: "", staged: [], version: 2, workflow: "faceless-explainer", voice: false }), /^Storyboard v2 of this explainer video was approved as it is/);
assert.match(revisionPrompt("Slower frame 3", [{ rel: "public/logo.png", kind: "image", source: "/x/logo.png" }]), /Slower frame 3[\s\S]*public\/logo\.png/);

// the system prompt: autonomous mode, sound, brand, facts
const pf: Preflight = { node: { ok: true, version: "22" }, ffmpeg: true, browser: { ok: true, detail: "" }, voice: { provider: "kokoro", engine: "hyperframes", transcription: "Parakeet", hints: [] }, problems: [] };
const ctx = (kit = brandKit(null), workflow: PromptContext["workflow"] = "faceless-explainer"): PromptContext => ({
  projectDir: "/out/j/project",
  jobDir: "/out/j",
  pluginDir: "/agent/vendor/hyperframes",
  pluginVersion: "0.8.140",
  workflow,
  kit,
  logos: {},
  preflight: pf,
});
const silent = systemAppend(o, ctx(), []);
assert.match(silent, /Mode: autonomous, rendering pre-approved/);
assert.match(silent, /## Teaching: clear, for a newcomer[\s\S]*hyperframes:clear-explainer[\s\S]*at most three main points[\s\S]*recap frame/);
assert.match(silent, /## Delivery/);
// the storyboard phase: plan, sketch, present; nothing generated or built; no delivery
const sbPhase = systemAppend(o, { ...ctx(), phase: "storyboard" }, []);
assert.match(sbPhase, /this run plans it and presents its storyboard for review/);
assert.match(sbPhase, /## Mode: storyboard first — this run stops at the storyboard/);
assert.match(sbPhase, /storyboard\.html[\s\S]*mcp__explainer__present_storyboard/);
assert.match(sbPhase, /Not in this run \(the harness refuses them until approval\)/);
assert.match(sbPhase, /## Presenting/);
assert.doesNotMatch(sbPhase, /## Delivery|Final render:/);
assert.match(systemAppend({ ...o, voice: true }, { ...ctx(), phase: "storyboard" }, []), /Write SCRIPT\.md now[\s\S]*voiced after approval/);
// building an approved storyboard: confirmed sketches, no more checkpoints
const built = systemAppend(o, { ...ctx(), reviewed: true }, []);
assert.match(built, /## Mode: build the approved storyboard, rendering pre-approved/);
assert.match(built, /confirmed sketch\*\* at `storyboard\.html#frame-NN`/);
assert.match(built, /Final render:/);
assert.match(silent, /HyperFrames project root: `\/out\/j\/project`/);
assert.match(silent, /is installed at `\/agent\/vendor\/hyperframes` \(PLUGIN_ROOT\)/);
assert.match(silent, /--quality delivery --output renders\/video\.mp4/);
assert.match(silent, /Canvas 1080x1350 \(4:5/);
assert.match(silent, /Narration: no/);
assert.match(silent, /canonical fully-silent marker/);
assert.match(silent, /No product folder/);
assert.match(silent, /Never invent customers, numbers, quotes/);
const voicedPrompt = systemAppend({ ...o, voice: true, quality: "draft", sfx: true }, ctx(), [{ rel: "assets/music/bed.mp3", kind: "music", source: "/x/bed.mp3" }]);
assert.match(voicedPrompt, /Narration: yes[\s\S]*\*\*kokoro\*\*[\s\S]*never run `auth login`/);
assert.match(voicedPrompt, /assets\/music\/bed\.mp3[\s\S]*"source": "host"/);
assert.match(voicedPrompt, /Sound effects: allowed/);
assert.match(voicedPrompt, /--quality draft/);
assert.doesNotMatch(voicedPrompt, /fully-silent/);
const acme = brandKit(resolveProduct(path.resolve(ROOT, "../../lib/fixtures/acme")));
const branded = systemAppend(o, { ...ctx(acme), productName: "Acme Bread", productContext: "Acme facts" }, []);
assert.match(branded, /Product: \*\*Acme Bread\*\*[\s\S]*build-frame\.mjs remixes/);
assert.match(branded, /Call to action: "Start a subscription" → acme\.example\/start/);
assert.match(branded, /# Product context\n\nAcme facts/);
assert.match(systemAppend(o, ctx(acme, "general-video"), []), /design\.md holds its brand kit/);
assert.match(systemAppend(o, ctx(acme, "product-launch-video"), []), /the product folder decides colours and type/);
assert.match(FRAME_WORKER_PROMPT, /Write only your own frame file/);
assert.match(FRAME_WORKER_PROMPT, /collage-kit[\s\S]*assets\/collage\/collage\.js/);

// the editorial style (the default): its preset, skill and kit; the look from the brand or fixed
assert.equal(DEFAULT_STYLE, "editorial");
assert.ok(isStyle("editorial"));
assert.equal(lookOf("color-field"), "colour-field");
assert.equal(lookOf("Documentary"), "documentary");
assert.equal(lookOf("neon"), undefined);
const editorial = systemAppend({ ...o, style: "editorial" }, { ...ctx(), kitDir: "assets/editorial", look: "auto" }, []);
assert.match(editorial, /## Style: editorial/);
assert.match(editorial, /Load `hyperframes:editorial` right after the workflow skill and `hyperframes:clear-explainer`/);
assert.match(editorial, /--preset editorial/);
assert.match(editorial, /choose ONE of colour-field \/ paper-data \/ documentary \/ duotone from the brand/);
assert.match(editorial, /<script src="assets\/editorial\/editorial\.js"><\/script>/);
assert.match(editorial, /starts with `editorial-kit`/);
assert.match(editorial, /--quality delivery --output renders\/video\.mp4/, "editorial renders at the default frame rate");
assert.match(systemAppend({ ...o, style: "editorial" }, { ...ctx(), kitDir: "assets/editorial", look: "documentary" }, []), /The look: \*\*documentary\*\*[\s\S]*fixed for this video/);
assert.equal(lockedBriefFields({ ...o, style: "editorial" }, "faceless-explainer").style_preset, "editorial");
assert.match(FRAME_WORKER_PROMPT, /editorial-kit[\s\S]*assets\/editorial\/editorial\.js[\s\S]*its own clip/);
assert.match(FRAME_WORKER_PROMPT, /confirmed sketch at `storyboard\.html#frame-NN`/);

// the vox-collage style: fixed preset, the skill, the kit, 24 fps
assert.ok(isStyle("vox-collage") && isStyle("default") && !isStyle("collage"));
const collage = systemAppend({ ...o, style: "vox-collage" }, { ...ctx(), kitDir: "assets/collage" }, []);
assert.match(collage, /## Style: Vox collage/);
assert.match(collage, /Load `hyperframes:vox-collage` right after the workflow skill and `hyperframes:clear-explainer`/);
assert.match(collage, /--preset vox-collage/);
assert.match(collage, /kit is already in the project at `assets\/collage\/`[\s\S]*<script src="assets\/collage\/collage\.js"><\/script>/);
assert.match(collage, /starts with `collage-kit`/);
assert.match(collage, /--quality delivery --fps 24 --output renders\/video\.mp4/);
assert.doesNotMatch(silent, /Style: Vox collage|--fps/, "the default style adds nothing");
assert.match(systemAppend({ ...o, style: "vox-collage" }, ctx(acme, "general-video"), []), /no build-frame: read the `vox-collage` preset's FRAME\.md/);
assert.equal(lockedBriefFields({ ...o, style: "vox-collage" }, "faceless-explainer").style_preset, "vox-collage");
assert.equal(Object.keys(FORMATS).length, 4);

// generated pictures: the section only when the job may make them; the collage uses them as cut-outs
assert.doesNotMatch(silent, /generate_images|Pictures: generated/, "no key, no picture section");
const media = { images: { model: "gpt-image-2.5-flare", mock: false, max: 24, refs: ["assets/style/univac-operator.png"] } };
const pictured = systemAppend(o, { ...ctx(), media }, []);
assert.match(pictured, /## Pictures: generated in the house style/);
assert.match(pictured, /OpenAI gpt-image-2\.5-flare[\s\S]*`assets\/style\/univac-operator\.png` \(look at it once\)/);
assert.match(pictured, /before the frame packets/);
assert.match(pictured, /pass its file in `refs`/);
assert.match(pictured, /At most 24 new pictures/);
assert.match(pictured, /No text in pictures/);
const planned = systemAppend(o, { ...ctx(), media, phase: "storyboard" }, []);
assert.match(planned, /## Pictures: planned now, generated after approval/);
assert.match(planned, /draw it on the sheet as a labelled grey placeholder/);
assert.match(planned, /Not in this run[^\n]*generating pictures, voices/);
const sketched = systemAppend(o, { ...ctx(), media, phase: "storyboard", storyboardImages: true }, []);
assert.match(sketched, /## Pictures: generated now, shown on the sheet/);
assert.match(sketched, /No grey placeholder for a picture that exists/);
assert.match(sketched, /Not in this run[^\n]*generating voices, music or effects/, "--storyboard-images: pictures are allowed before approval, sound isn't");
assert.doesNotMatch(sketched, /planned now, generated after approval/);
assert.match(systemAppend(o, { ...ctx(), media, storyboardImages: true }, []), /The storyboard's pictures are already in `assets\/images\/`/, "the build reuses the storyboard's pictures");
assert.doesNotMatch(pictured, /The storyboard's pictures are already/);
assert.match(systemAppend({ ...o, style: "vox-collage" }, { ...ctx(), kitDir: "assets/collage", media }, []), /Pictures: the generated house-style pictures, as printed cut-outs: the B&W halftone treatment/);
assert.match(systemAppend({ ...o, style: "editorial" }, { ...ctx(), kitDir: "assets/editorial", media }, []), /printed by HyperFrames' media treatments \(B&W halftone by default/);
assert.match(collage, /Pictures: drawings \(collage-halftone-figure\)/, "without pictures the collage draws");
assert.match(FRAME_WORKER_PROMPT, /assets\/images\/[\s\S]*never redraw, recolour or stretch/i);

// ElevenLabs: narration through the tool (the workflow's TTS refused), composed music, made-for-the-video effects
const eleven = { sound: { narration: true, sfx: true, music: true, voiceId: "JBFqnCBsd6RMkjVDRZzb", ttsModel: "eleven_multilingual_v2" } };
const sounded = systemAppend({ ...o, voice: true, sfx: true, musicPrompt: "auto", style: "vox-collage" }, { ...ctx(), kitDir: "assets/collage", media: eleven }, []);
assert.match(sounded, /Narration: yes, with ElevenLabs through `mcp__explainer__generate_narration`[\s\S]*sync-durations/);
assert.match(sounded, /Voice: `JBFqnCBsd6RMkjVDRZzb` unless the brief asks[\s\S]*find_voices/);
assert.match(sounded, /Music: compose a bed with `mcp__explainer__generate_music`[\s\S]*`music: none`/);
assert.match(sounded, /Sound effects: design them with `mcp__explainer__generate_sfx`[\s\S]*a paper slap/);
assert.doesNotMatch(sounded, /HeyGen → ElevenLabs|fully-silent/);
assert.match(systemAppend({ ...o, voice: true }, { ...ctx(), voiceId: "abc123", media: eleven }, []), /Voice: `abc123`\./, "an explicit voice is fixed");
assert.match(systemAppend({ ...o, musicPrompt: "dry upright piano" }, { ...ctx(), media: eleven }, []), /the person asked for "dry upright piano"/);
assert.match(systemAppend({ ...o, sfx: true }, ctx(), []), /bundled library \(fetch-sfx\)/, "no ElevenLabs: the library");
const S = "/v/skills/faceless-explainer/scripts/audio.mjs";
assert.match(refuseWorkflowTts(`node "${S}" --script ./SCRIPT.md --storyboard ./STORYBOARD.md --hyperframes . --out ./audio_meta.json`) ?? "", /generate_narration/);
assert.equal(refuseWorkflowTts(`node "${S}" sync-durations --audio-meta ./audio_meta.json --storyboard ./STORYBOARD.md`), null);
assert.equal(refuseWorkflowTts(`node ${S} fetch-sfx --storyboard ./STORYBOARD.md --hyperframes .`), null);
assert.match(refuseWorkflowTts("node /v/skills/media-use/audio/scripts/audio.mjs --request r.json") ?? "", /generate_narration/);
assert.equal(refuseWorkflowTts("hyperframes render --output renders/video.mp4"), null);
assert.match(refuseWorkflowTts("cd /v/skills/faceless-explainer/scripts && node audio.mjs --script /p/SCRIPT.md") ?? "", /generate_narration/, "from the script's own folder too");
assert.match(refuseWorkflowTts(`node "/v/skills/hyperframes/scripts/plugin-cli.mjs" --script "${S}" --script ./SCRIPT.md`) ?? "", /generate_narration/, "through the plugin launcher");
assert.equal(refuseWorkflowTts(`cat ${S}`), null, "reading the script is fine");
assert.equal(refuseWorkflowTts("ls audio_meta.json && node /v/skills/faceless-explainer/scripts/captions.mjs build"), null);

// before the storyboard is approved: the build steps and the frame workers are refused, the design is not
const FS = "/v/skills/faceless-explainer/scripts";
for (const c of [`node "${FS}/frame-packets.mjs" --project .`, `node ${FS}/audio.mjs --script ./SCRIPT.md`, `node ${FS}/assemble-index.mjs --storyboard ./STORYBOARD.md`, "hyperframes render --output renders/video.mp4", "npx hyperframes snapshot --at 1", `node "/v/skills/hyperframes/scripts/plugin-cli.mjs" --script "${FS}/transitions.mjs" inject`])
  assert.match(refuseBeforeApproval(c) ?? "", /isn't approved yet/, c);
for (const c of [`node "${FS}/build-frame.mjs" --preset editorial --hyperframes .`, "hyperframes lint", "cat STORYBOARD.md", "hyperframes catalog --query halftone --json"]) assert.equal(refuseBeforeApproval(c), null, c);
assert.match(refuseToolBeforeApproval("Agent") ?? "", /present_storyboard/);
assert.equal(refuseToolBeforeApproval("Write"), null);

console.log("✓ units OK");
