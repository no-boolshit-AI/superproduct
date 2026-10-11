/**
 * Mock Anthropic Messages API playing a scripted explainer run, so the real Agent SDK + Claude Code CLI + the bundled
 * HyperFrames plugin + hooks + frame-worker subagents + the deliver tool + a real HyperFrames render can be tested
 * end to end at zero cost. The main agent is recognised by the deliver tool in its tool list, a frame worker by its
 * system prompt; anything else (small housekeeping calls) gets a plain text answer.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { NEUTRAL, STORYBOARD, answerFrame, hookFrame } from "./fixtures.js";

export interface ToolResultLog {
  id: string;
  name: string;
  isError: boolean;
  text: string;
  images: number;
}
export const toolResults: ToolResultLog[] = [];
export const seen = { mainToolNames: [] as string[], mainRequestText: "", systemPrompt: "", workerRequests: 0, workerSystem: "", workerToolNames: [] as string[], turnEndedMidJob: false };

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
let n = 0;
const tu = (name: string, input: Record<string, unknown>): Block => ({ type: "tool_use", id: `toolu_${String(++n).padStart(3, "0")}`, name, input });
const toolNameById = new Map<string, string>();

export const BRIEF_MD = `---
workflow: faceless-explainer
flow: automation
storyboard: no
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

function mainScript(d: Dirs): Block[][] {
  const S = (file: string) => path.join(d.plugin, "skills", "faceless-explainer", "scripts", file);
  const P = (rel: string) => path.join(d.project, rel);
  const worker = (id: string) =>
    tu("Agent", {
      description: `Frame ${id}`,
      subagent_type: "frame-worker",
      prompt: `Build frame ${id}. Read ${P(".hyperframes/frame-packets/_role.md")} and ${P(`.hyperframes/frame-packets/${id}.md`)} first. PROJECT_DIR=${d.project}; canvas 1080x1350; no confirmed sketch; captions off.`,
    });
  return [
    [tu("Skill", { skill: "hyperframes:hyperframes" })],
    // reading outside the working directory: the plugin's own files and the job folder above the project
    [
      tu("Read", { file_path: path.join(d.plugin, "skills", "faceless-explainer", "SKILL.md") }),
      tu("Read", { file_path: path.join(path.dirname(d.project), "brief.md") }),
      tu("Grep", { pattern: "frame-packets", path: path.join(d.plugin, "skills", "faceless-explainer"), output_mode: "files_with_matches" }),
      tu("Glob", { pattern: "*.md", path: path.join(d.plugin, "skills", "hyperframes-creative", "frame-presets", "cobalt-grid") }),
    ],
    [tu("Write", { file_path: P("BRIEF.md"), content: BRIEF_MD })],
    [tu("Bash", { command: `node "${S("build-frame.mjs")}" --preset cobalt-grid --hyperframes .`, description: "Build frame.md from the cobalt-grid preset" })],
    [tu("Write", { file_path: P("STORYBOARD.md"), content: STORYBOARD })],
    [tu("mcp__explainer__generate_images", { images: [{ name: "Loaf", prompt: "A crusty sourdough loaf on a wooden board, seen from the side", kind: "cutout", aspect: "square" }] })],
    [tu("Bash", { command: `node "${S("audio.mjs")}" --script ./SCRIPT.md --storyboard ./STORYBOARD.md --hyperframes . --out ./audio_meta.json`, description: "Audio step (silent project)" })],
    [tu("Bash", { command: `node "${path.join(d.plugin, "skills", "hyperframes", "scripts", "plugin-cli.mjs")}" --script "${S("frame-packets.mjs")}" --project "${d.project}" --storyboard "${P("STORYBOARD.md")}"`, description: "Frame packets" })],
    [worker("01-hook"), worker("02-answer")],
    // the turn ends while the workers run in the background, as a real run does: their notices (or the harness's
    // nudge) start the next turn
    [{ type: "text", text: WAITING }],
    [
      tu("Bash", {
        command: `node "${S("assemble-index.mjs")}" --storyboard ./STORYBOARD.md --hyperframes . && node "${S("transitions.mjs")}" inject --storyboard ./STORYBOARD.md --hyperframes . && node "${S("transitions.mjs")}" verify --storyboard ./STORYBOARD.md --index ./index.html`,
        description: "Assemble and add transitions",
      }),
    ],
    [tu("Bash", { command: "curl -s https://example.com", description: "Fetch" }), tu("Bash", { command: "npx hyperframes preview", description: "Preview" }), tu("Read", { file_path: "/etc/hosts" })],
    [tu("Bash", { command: "npx --yes hyperframes@0.0.0-not-published --version && npx hyperframes lint", description: "Lint" })],
    [tu("Bash", { command: "hyperframes snapshot --at 1.2,3.2", description: "Contact sheet" })],
    [tu("Read", { file_path: P("snapshots/contact-sheet.jpg") })],
    [tu("Bash", { command: "hyperframes render --skill=faceless-explainer --quality draft --output renders/video.mp4", description: "Render", timeout: 600000 })],
    [tu("mcp__explainer__deliver", DELIVER)],
    [{ type: "text", text: "Delivered a 4-second explainer; one placeholder to fill: [X] hours." }],
  ];
}

function revisionScript(d: Dirs): Block[][] {
  return [
    [tu("Write", { file_path: path.join(d.project, "compositions/frames/02-answer.html"), content: answerFrame(NEUTRAL, "Slow yeast, better bread. We wait for you.") })],
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

export async function startMockClaude() {
  const logged = new Set<string>();
  let dirs: Dirs | null = null;
  let main: Block[][] | null = null;
  let revision: Block[][] | null = null;
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
    if (names.includes("mcp__explainer__deliver")) {
      if (!seen.mainRequestText) {
        seen.mainToolNames = names;
        seen.systemPrompt = sys;
        seen.mainRequestText = JSON.stringify(j);
      }
      const project = sys.match(/HyperFrames project root: `([^`]+)`/)?.[1];
      const plugin = sys.match(/is installed at `([^`]+)` \(PLUGIN_ROOT\)/)?.[1];
      if (!dirs && project && plugin) dirs = { project, plugin };
      if (!dirs) throw new Error("mock: no project/plugin path in the system prompt");
      main ??= mainScript(dirs);
      revision ??= revisionScript(dirs);
      for (const block of [...main, ...revision].flat()) if (block.type === "tool_use") toolNameById.set(block.id, block.name);
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
      const users = JSON.stringify(msgs.filter((m) => m.role === "user").map((m) => m.content));
      const script = /asks for these changes/.test(users) ? revision : main;
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
