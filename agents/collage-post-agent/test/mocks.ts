/**
 * Mock Anthropic Messages API + mock OpenAI Images API.
 * The Anthropic mock plays a scripted "designer" that reads the style guide, generates two images,
 * writes two slides, renders them, tries three forbidden file operations, writes the caption and stops.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LAYOUTS_DIR, SAMPLES_DIR, STYLEGUIDE } from "../src/paths.js";

export interface ToolResultLog { id: string; isError: boolean; text: string; images: number }
export const toolResults: ToolResultLog[] = [];
export const imageRequests: any[] = [];
export let mainToolNames: string[] = [];

const tpl = (file: string, img: [string, string]) =>
  readFileSync(path.join(LAYOUTS_DIR, file), "utf8")
    .replace(/<!--[\s\S]*?-->\n/, "")
    .replace('data-palette="orchid"', 'data-palette="cobalt"')
    .replaceAll(img[0], img[1])
    .replace("Your Brand", "Test Brand");

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
let n = 0;
const tu = (name: string, input: unknown): Block => ({ type: "tool_use", id: `toolu_${++n}`, name, input });
const SCRIPT: Block[][] = [
  [tu("Read", { file_path: STYLEGUIDE }), tu("Write", { file_path: "plan.md", content: "| slide | layout |\n|---|---|\n| 1 | breakout |\n| 2 | strips |\n" })],
  [tu("mcp__collage__generate_image", { images: [
    { subject: "an anonymous Renaissance scholar with a long beard", kind: "scene", medium: "painting", aspect: "cover", filename: "cover-scholar" },
    { subject: "a man in round glasses looking down-left", kind: "cutout", filename: "figure" } ] })],
  [tu("Write", { file_path: "slide-01.html", content: tpl("01-breakout.html", ["assets/sample-cutout.png", "assets/figure.png"]) }),
   tu("Write", { file_path: "slide-02.html", content: tpl("02-strips.html", ["assets/sample-texture.jpg", "assets/cover-scholar.png"]) })],
  [tu("mcp__collage__render_slides", { inspect: "slide-01.html" })],
  [tu("Write", { file_path: "../escape.html", content: "<p>denied</p>" }), tu("Write", { file_path: "_design/collage.css", content: "x" }), tu("Read", { file_path: "/etc/hostname" }), tu("Write", { file_path: "slide-09.html", content: '<iframe src="/Users/me/.env"></iframe>' })],
  [tu("Write", { file_path: "caption.md", content: "Hook line.\n\n## Alt text\n1. Cover\n2. Question\n" })],
  [{ type: "text", text: "Done: cobalt palette, 2 slides." }],
];

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

export async function startMocks() {
  const png = readFileSync(path.join(SAMPLES_DIR, "sample-cutout.png")).toString("base64");
  const openai = http.createServer(async (req, res) => {
    imageRequests.push(await readBody(req));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ created: 1, data: [{ b64_json: png }] }));
  });
  const seen = new Set<string>();
  const anthropic = http.createServer(async (req, res) => {
    const j = await readBody(req);
    if (!req.url?.startsWith("/v1/messages") || req.url.includes("count_tokens")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ input_tokens: 100 }));
    }
    const names: string[] = (j.tools ?? []).map((t: any) => t.name);
    const isMain = names.includes("mcp__collage__render_slides");
    let step: Block[] = [{ type: "text", text: "Collage post" }];
    if (isMain) {
      mainToolNames = names;
      const results = (j.messages ?? []).flatMap((m: any) => (Array.isArray(m.content) ? m.content : [])).filter((c: any) => c.type === "tool_result");
      for (const r of results) {
        if (seen.has(r.tool_use_id)) continue;
        seen.add(r.tool_use_id);
        const parts = Array.isArray(r.content) ? r.content : [{ type: "text", text: String(r.content) }];
        toolResults.push({ id: r.tool_use_id, isError: !!r.is_error, text: parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n"), images: parts.filter((p: any) => p.type === "image").length });
      }
      const done = new Set(results.map((r: any) => r.tool_use_id));
      let i = 0;
      while (i < SCRIPT.length - 1) {
        const ids = SCRIPT[i].filter((b) => b.type === "tool_use").map((b: any) => b.id);
        if (ids.length && ids.every((x) => done.has(x))) i++;
        else break;
      }
      step = SCRIPT[i];
    }
    const stop = step.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
    if (j.stream) return sse(res, step, stop);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "msg_x", type: "message", role: "assistant", model: "claude-mock", content: step, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 3 } }));
  });
  await new Promise<void>((r) => openai.listen(0, "127.0.0.1", r));
  await new Promise<void>((r) => anthropic.listen(0, "127.0.0.1", r));
  const port = (s: http.Server) => (s.address() as AddressInfo).port;
  // Point both SDKs at the mocks; never touch real keys.
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port(openai)}/v1`;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port(anthropic)}`;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  process.env.NO_PROXY = [process.env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(",");
  for (const k of Object.keys(process.env)) if (/^(CLAUDE_CODE_REMOTE|SESSION_INGRESS|CCR_|CLAUDE_CODE_SESSION)/.test(k)) delete process.env[k];
  return { close: () => (openai.close(), anthropic.close()) };
}
