/**
 * Mock Anthropic Messages API playing a scripted explainer job, so the real Agent SDK + Claude Code CLI + the bundled
 * HyperFrames plugin + hooks + frame-worker subagents + the agent's tools + a real HyperFrames render can be tested
 * end to end at zero cost. The job's runs, routed by the newest prompt in the conversation: the storyboard (ends at
 * present_storyboard), a change to it, the approval (the build, ends at deliver) and a revision of the video. The main
 * agent is recognised by our tools in its tool list (present_storyboard or deliver), a frame worker by its system
 * prompt; anything else (small housekeeping calls) gets a plain text answer.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { NEUTRAL, STORYBOARD, answerFrame, hookFrame, storyboardSheet } from "./fixtures.js";

export interface ToolResultLog {
  id: string;
  name: string;
  isError: boolean;
  text: string;
  images: number;
}
export const toolResults: ToolResultLog[] = [];
export type Route = "storyboard" | "storyboard-revision" | "build" | "revision";
/** What the main agent was shown in each run (its first request of that run). */
export const seen = {
  mainToolNames: [] as string[],
  mainRequestText: "",
  systemPrompt: "",
  runs: {} as Partial<Record<Route, { tools: string[]; system: string; prompt: string }>>,
  workerRequests: 0,
  workerSystem: "",
  workerToolNames: [] as string[],
  turnEndedMidJob: false,
};

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
let n = 0;
const tu = (name: string, input: Record<string, unknown>): Block => ({ type: "tool_use", id: `toolu_${String(++n).padStart(3, "0")}`, name, input });
const toolNameById = new Map<string, string>();

export const BRIEF_MD = `---
workflow: faceless-explainer
flow: automation
storyboard: yes
destination: linkedin-feed
aspect: 1080x1350
language: en
length: 4s
narration: no
message: Good sourdough takes time, so let someone else wait for it.
angle: concept
---

# Why sourdough takes time

A four-second explainer for home bakers.
`;

const PRESENT = {
  title: "Why sourdough takes time",
  question: "Why does sourdough take a whole day?",
  message: "Wild yeast is slow, so good bread needs time.",
  audience: "home bakers",
  main_points: ["Sourdough rises with wild yeast.", "Wild yeast is slow, so we wait for you."],
  look: "HyperFrames preset cobalt-grid: calm paper and one blue accent, plain for a four-second test.",
  frames: [
    { id: "01-hook", name: "Hook", seconds: 2, point: "Sourdough takes much longer than other bread.", on_screen: ["Why does sourdough take [X] hours?"], visual: "The question over one accent bar.", motion: "The question rises; the bar wipes in." },
    { id: "02-answer", name: "Answer", seconds: 2, point: "Slow yeast is the reason — and we wait for you.", on_screen: ["Wild yeast is slow. We wait, so you don't.", "Start a subscription"], visual: "The answer and the call to action.", motion: "Crossfade in; the CTA pops." },
  ],
  pictures: [{ name: "loaf", kind: "cutout", shows: "a crusty sourdough loaf", treatment: "print colour" }],
  placeholders: ["[X] hours — frame 01"],
  questions: ["Open on the question, or on the loaf?"],
};

const DELIVER = {
  video: "renders/video.mp4",
  contact_sheet: "snapshots/contact-sheet.jpg",
  title: "Why sourdough takes time",
  caption: "Good bread is slow bread.\n\nWild yeast needs [X] hours. We wait, so you don't.\n\nStart a subscription.",
  alt_text: "Big type asks why sourdough takes hours, then the answer and a subscription button.",
  placeholders: ["[X] hours — frame 1"],
};

/** The main agent's turn-ending line while the frame workers run. */
export const WAITING = "Both frame workers are running in the background; I'll continue when they report.";

interface Dirs {
  project: string;
  plugin: string;
}

/**
 * The project as Claude Code shows the model its working directory: symlinks resolved (on macOS the temp folder is
 * /private/var/…). The system prompt names it as OUTPUT_DIR spells it; the scripts use both.
 */
const realProject = (d: Dirs) => fs.realpathSync.native(d.project);

const S = (d: Dirs, file: string) => path.join(d.plugin, "skills", "faceless-explainer", "scripts", file);

/** Run 1: the storyboard — brief, design system, STORYBOARD.md, the sketch sheet, present. Build steps are refused. */
function storyboardScript(d: Dirs): Block[][] {
  const R = (rel: string) => path.join(realProject(d), rel);
  return [
    [tu("Skill", { skill: "hyperframes:hyperframes" })],
    // reading outside the working directory: the plugin's own files and the job folder above the project
    [
      tu("Read", { file_path: path.join(d.plugin, "skills", "faceless-explainer", "SKILL.md") }),
      tu("Read", { file_path: path.join(path.dirname(realProject(d)), "brief.md") }),
      tu("Grep", { pattern: "frame-packets", path: path.join(d.plugin, "skills", "faceless-explainer"), output_mode: "files_with_matches" }),
      tu("Glob", { pattern: "*.md", path: path.join(d.plugin, "skills", "hyperframes-creative", "frame-presets", "cobalt-grid") }),
    ],
    [tu("Write", { file_path: R("BRIEF.md"), content: BRIEF_MD })],
    [tu("Bash", { command: `node "${S(d, "build-frame.mjs")}" --preset cobalt-grid --hyperframes .`, description: "Build frame.md from the cobalt-grid preset" })],
    [tu("Write", { file_path: path.join(d.project, "STORYBOARD.md"), content: STORYBOARD })],
    // too early: the build steps and the workers wait for approval
    [
      tu("Bash", { command: `node "${S(d, "frame-packets.mjs")}" --project . --storyboard ./STORYBOARD.md`, description: "Frame packets (too early)" }),
      tu("Agent", { description: "Frame 01-hook (too early)", subagent_type: "frame-worker", prompt: "Build frame 01-hook." }),
    ],
    [tu("Write", { file_path: R("storyboard.html"), content: storyboardSheet(1) })],
    [tu("mcp__explainer__present_storyboard", PRESENT)],
    [{ type: "text", text: "Storyboard v1 is ready for review." }],
  ];
}

/** Run 2: the person asks for a change to the storyboard. */
function storyboardRevisionScript(d: Dirs): Block[][] {
  const R = (rel: string) => path.join(realProject(d), rel);
  const hook = "Why does good sourdough take [X] hours?";
  return [
    [tu("Write", { file_path: R("storyboard.html"), content: storyboardSheet(2, hook) })],
    [tu("mcp__explainer__present_storyboard", { ...PRESENT, frames: [{ ...PRESENT.frames[0], on_screen: [hook] }, PRESENT.frames[1]] })],
    [{ type: "text", text: "Storyboard v2: the hook now says good sourdough." }],
  ];
}

/** Run 3: approved — pictures, audio, packets, workers, assembly, checks, the render, delivery. */
function buildScript(d: Dirs): Block[][] {
  const P = (rel: string) => path.join(d.project, rel);
  const R = (rel: string) => path.join(realProject(d), rel);
  const worker = (id: string) =>
    tu("Agent", {
      description: `Frame ${id}`,
      subagent_type: "frame-worker",
      prompt: `Build frame ${id}. Read ${P(".hyperframes/frame-packets/_role.md")} and ${P(`.hyperframes/frame-packets/${id}.md`)} first. PROJECT_DIR=${d.project}; canvas 1080x1350; this frame has a confirmed sketch at storyboard.html#frame-${id.slice(0, 2)}; captions off.`,
    });
  return [
    [tu("mcp__explainer__generate_images", { images: [{ name: "Loaf", prompt: "A crusty sourdough loaf on a wooden board, seen from the side", kind: "cutout", aspect: "square" }] })],
    [tu("Bash", { command: `node "${S(d, "audio.mjs")}" --script ./SCRIPT.md --storyboard ./STORYBOARD.md --hyperframes . --out ./audio_meta.json`, description: "Audio step (silent project)" })],
    [tu("Bash", { command: `node "${path.join(d.plugin, "skills", "hyperframes", "scripts", "plugin-cli.mjs")}" --script "${S(d, "frame-packets.mjs")}" --project "${realProject(d)}" --storyboard "${P("STORYBOARD.md")}"`, description: "Frame packets" })],
    [worker("01-hook"), worker("02-answer")],
    // the turn ends while the workers run in the background, as a real run does: their notices (or the harness's
    // nudge) start the next turn
    [{ type: "text", text: WAITING }],
    [
      tu("Bash", {
        command: `node "${S(d, "assemble-index.mjs")}" --storyboard ./STORYBOARD.md --hyperframes . && node "${S(d, "transitions.mjs")}" inject --storyboard ./STORYBOARD.md --hyperframes . && node "${S(d, "transitions.mjs")}" verify --storyboard ./STORYBOARD.md --index ./index.html`,
        description: "Assemble and add transitions",
      }),
    ],
    [tu("Bash", { command: "curl -s https://example.com", description: "Fetch" }), tu("Bash", { command: "npx hyperframes preview", description: "Preview" }), tu("Read", { file_path: "/etc/hosts" })],
    [tu("Bash", { command: "npx --yes hyperframes@0.0.0-not-published --version && npx hyperframes lint", description: "Lint" })],
    [tu("Bash", { command: "hyperframes snapshot --at 1.2,3.2", description: "Contact sheet" })],
    [tu("Read", { file_path: R("snapshots/contact-sheet.jpg") })],
    [tu("Bash", { command: "hyperframes render --skill=faceless-explainer --quality draft --output renders/video.mp4", description: "Render", timeout: 600000 })],
    [tu("mcp__explainer__deliver", DELIVER)],
    [{ type: "text", text: "Delivered a 4-second explainer; one placeholder to fill: [X] hours." }],
  ];
}

/** Run 4: the person watched the video and asks for a change. */
function revisionScript(d: Dirs): Block[][] {
  return [
    [tu("Write", { file_path: path.join(realProject(d), "compositions/frames/02-answer.html"), content: answerFrame(NEUTRAL, "Slow yeast, better bread. We wait for you.") })],
    [tu("Bash", { command: "hyperframes lint && hyperframes render --skill=faceless-explainer --quality draft --output renders/video.mp4", description: "Re-render", timeout: 600000 })],
    [tu("mcp__explainer__deliver", { ...DELIVER, title: "Why sourdough takes time (v2)", placeholders: [] })],
    [{ type: "text", text: "Rewrote frame 2's line and rendered again." }],
  ];
}

function sse(res: http.ServerResponse, blocks: Block[], stop: string) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const w = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  w("message_start", { type: "message_start", message: { id: `msg_${Date.now()}`, type: "message", role: "assistant", model: "claude-mock", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } } });
  blocks.forEach((b, i) => {
    if (b.type === "text") {
      w("content_block_start", { type: "content_block_start", index: i, content_block: { type: "text", text: "" } });
      w("content_block_delta", { type: "content_block_delta", index: i, delta: { type: "text_delta", text: b.text } });
    } else {
      w("content_block_start", { type: "content_block_start", index: i, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
      w("content_block_delta", { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    }
    w("content_block_stop", { type: "content_block_stop", index: i });
  });
  w("message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 50 } });
  w("message_stop", { type: "message_stop" });
  res.end();
}

async function readBody(req: http.IncomingMessage) {
  let body = "";
  for await (const c of req) body += c;
  return body ? JSON.parse(body) : {};
}

type Msg = { role: string; content: unknown };
type ToolResult = { type: "tool_result"; tool_use_id: string; is_error?: boolean; content: unknown };
const resultsIn = (msgs: Msg[]) => msgs.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((c: { type?: string }) => c.type === "tool_result") as ToolResult[];
const systemText = (j: { system?: unknown }) => (Array.isArray(j.system) ? j.system.map((s: { text?: string }) => s.text ?? "").join("\n") : String(j.system ?? ""));

/** The run a request belongs to: the newest prompt in the conversation (skipping nudges and worker notices). */
function routeOf(msgs: Msg[]): Route {
  const texts = msgs
    .filter((m) => m.role === "user")
    .map((m) => (typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((c: { type?: string; text?: string }) => (c.type === "text" ? c.text ?? "" : "")).join("\n") : ""));
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    if (/watched the video and asks for these changes/.test(t)) return "revision";
    if (/reviewed storyboard v\d+ and asks for these changes/.test(t)) return "storyboard-revision";
    if (/Storyboard v\d+ of this explainer video was approved/.test(t)) return "build";
    if (/Plan an explainer video from this brief/.test(t)) return "storyboard";
  }
  return "storyboard";
}

export async function startMockClaude() {
  const logged = new Set<string>();
  let dirs: Dirs | null = null;
  let scripts: Record<Route, Block[][]> | null = null;
  const server = http.createServer(async (req, res) => {
    const j = await readBody(req);
    if (!req.url?.startsWith("/v1/messages") || req.url.includes("count_tokens")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ input_tokens: 100 }));
    }
    const names: string[] = (j.tools ?? []).map((t: { name: string }) => t.name);
    const sys = systemText(j);
    const msgs = (j.messages ?? []) as Msg[];
    const results = resultsIn(msgs);
    let step: Block[] = [{ type: "text", text: "OK" }];
    if (names.includes("mcp__explainer__deliver") || names.includes("mcp__explainer__present_storyboard")) {
      const route = routeOf(msgs);
      if (!seen.mainRequestText) {
        seen.mainToolNames = names;
        seen.systemPrompt = sys;
        seen.mainRequestText = JSON.stringify(j);
      }
      seen.runs[route] ??= { tools: names, system: sys, prompt: JSON.stringify(msgs.filter((m) => m.role === "user").at(-1)?.content ?? "") };
      const project = sys.match(/HyperFrames project root: `([^`]+)`/)?.[1];
      const plugin = sys.match(/is installed at `([^`]+)` \(PLUGIN_ROOT\)/)?.[1];
      if (!dirs && project && plugin) dirs = { project, plugin };
      if (!dirs) throw new Error("mock: no project/plugin path in the system prompt");
      scripts ??= { storyboard: storyboardScript(dirs), "storyboard-revision": storyboardRevisionScript(dirs), build: buildScript(dirs), revision: revisionScript(dirs) };
      for (const block of Object.values(scripts).flat(2)) if (block.type === "tool_use") toolNameById.set(block.id, block.name);
      for (const r of results) {
        if (logged.has(r.tool_use_id)) continue;
        logged.add(r.tool_use_id);
        const parts = (Array.isArray(r.content) ? r.content : [{ type: "text", text: String(r.content) }]) as { type: string; text?: string }[];
        toolResults.push({
          id: r.tool_use_id,
          name: toolNameById.get(r.tool_use_id) ?? "?",
          isError: !!r.is_error,
          text: parts.filter((p) => p.type === "text").map((p) => p.text).join("\n"),
          images: parts.filter((p) => p.type === "image").length,
        });
      }
      const script = scripts[route];
      const done = new Set(results.map((r) => r.tool_use_id));
      // a text-only step is done once the conversation has moved past it (a later user message: a notice, a nudge)
      const said = (t: string) => msgs.some((x, k) => x.role === "assistant" && k < msgs.length - 1 && JSON.stringify(x.content).includes(JSON.stringify(t).slice(1, -1)));
      if (said(WAITING)) seen.turnEndedMidJob = true;
      let i = 0;
      while (i < script.length - 1) {
        const ids = script[i].filter((b) => b.type === "tool_use").map((b) => (b as { id: string }).id);
        const text = script[i].find((b) => b.type === "text") as { text: string } | undefined;
        if (ids.length ? ids.every((x) => done.has(x)) : !!text && said(text.text)) i++;
        else break;
      }
      step = script[i];
    } else if (/HyperFrames frame worker/.test(sys)) {
      seen.workerRequests++;
      seen.workerSystem = sys;
      seen.workerToolNames = names;
      const ask = JSON.stringify(msgs[0]?.content ?? "");
      const id = ask.match(/Build frame (\d\d-[a-z-]+)/)?.[1] ?? "01-hook";
      const file = path.join(dirs?.project ?? "", "compositions", "frames", `${id}.html`);
      step = results.length
        ? [{ type: "text", text: `${file} — ${id === "01-hook" ? "the question over an accent bar" : "the answer and the call to action"}` }]
        : [tu("Write", { file_path: file, content: id === "01-hook" ? hookFrame(NEUTRAL) : answerFrame(NEUTRAL) })];
    }
    const stop = step.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
    if (j.stream) return sse(res, step, stop);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "msg_x", type: "message", role: "assistant", model: "claude-mock", content: step, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 3 } }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  delete process.env.CLAUDE_MODEL;
  process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  process.env.NO_PROXY = [process.env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(",");
  for (const k of Object.keys(process.env)) if (/^(CLAUDE_CODE_REMOTE|SESSION_INGRESS|CCR_|CLAUDE_CODE_SESSION)/.test(k)) delete process.env[k];
  return { close: () => server.close() };
}
