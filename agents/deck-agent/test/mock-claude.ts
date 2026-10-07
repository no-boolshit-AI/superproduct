/**
 * Mock Anthropic Messages API playing a scripted consultant, so the real Agent SDK + Claude Code CLI + MCP tools
 * + hooks + export can be tested end to end at zero cost.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface ToolResultLog { id: string; isError: boolean; text: string; images: number }
export const toolResults: ToolResultLog[] = [];
export let mainToolNames: string[] = [];
export let systemPromptSeen = "";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
let n = 0;
const tu = (name: string, input: unknown): Block => ({ type: "tool_use", id: `toolu_${++n}`, name, input });
const D = (t: string) => `mcp__deck__${t}`;

const SCRIPT: Block[][] = [
  [tu(D("inspect_data"), { path: "inputs/sales.csv" })],
  [tu(D("setup_document"), { format: "deck", theme: "strategy", title: "Regional sales review", subtitle: "FY2025", date: "October 2026" })],
  [tu(D("plan_storyline"), { governing_thought: "North and West carry growth; South needs a reset", pages: [
    { layout: "cover", title: "Regional sales review" },
    { layout: "exhibit", title: "North and West drove all of the growth since 2023 while South stalled" },
    { layout: "chart-takeaways", title: "West grew fastest at 11% a year and is now within reach of South" } ] })],
  [tu(D("create_chart"), { id: "sales-2025", type: "bar", categories: ["North", "South", "West, incl. islands", "East"], series: [{ name: "2025", values: [140.8, 99.7, 91.6, 63.1] }], number: { decimals: 1 }, highlight: [0] }),
   tu(D("create_chart"), { id: "sales-trend", type: "line", categories: ["2023", "2024", "2025"], series: [{ name: "North", values: [120.5, 131.2, 140.8] }, { name: "South", values: [98.1, 101.4, 99.7] }, { name: "West", values: [75, 82.3, 91.6] }], number: { decimals: 0 } })],
  [tu(D("write_page"), { index: 1, layout: "cover", slots: { kicker: "Sales leadership", date: "October 2026" } }),
   tu(D("write_page"), { index: 2, layout: "exhibit", title: "North and West drove all of the growth since 2023 while South stalled", subtitle: "Sales 2025, € m", slots: { element: "sales-2025" }, source: "sales.csv" }),
   tu(D("write_page"), { index: 3, layout: "chart-takeaways", title: "West grew fastest at 11% a year and is now within reach of South", subtitle: "Sales, € m", slots: { element: "sales-trend", takeaways: "- **West +11% p.a.** fastest growth\n- **South flat** since 2023" }, source: "sales.csv" })],
  [tu("Read", { file_path: "/etc/hostname" }), tu("Read", { file_path: "inputs/sales.csv" })],
  [tu(D("review_document"), {})],
  [tu(D("export_document"), {})],
  [{ type: "text", text: "Done: 3 pages, presentation.pdf. No placeholders." }],
];

const REVISION: Block[][] = [
  [tu(D("write_page"), { index: 2, layout: "exhibit", title: "North alone delivered half of the growth since 2023 while South stalled", subtitle: "Sales 2025, € m", slots: { element: "sales-2025", takeaway: "South needs a commercial reset" }, source: "sales.csv" })],
  [tu(D("export_document"), {})],
  [{ type: "text", text: "Updated page 2 title and added a takeaway." }],
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

export async function startMockClaude() {
  const seen = new Set<string>();
  const server = http.createServer(async (req, res) => {
    const j = await readBody(req);
    if (!req.url?.startsWith("/v1/messages") || req.url.includes("count_tokens")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ input_tokens: 100 }));
    }
    const names: string[] = (j.tools ?? []).map((t: { name: string }) => t.name);
    const isMain = names.includes(D("write_page"));
    let step: Block[] = [{ type: "text", text: "Deck" }];
    if (isMain) {
      mainToolNames = names;
      const sys = Array.isArray(j.system) ? j.system.map((s: { text?: string }) => s.text ?? "").join("\n") : String(j.system ?? "");
      if (sys.includes("consulting method")) systemPromptSeen = sys;
      const msgs = (j.messages ?? []) as { role: string; content: unknown }[];
      const results = msgs.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((c: { type?: string }) => c.type === "tool_result") as { tool_use_id: string; is_error?: boolean; content: unknown }[];
      for (const r of results) {
        if (seen.has(r.tool_use_id)) continue;
        seen.add(r.tool_use_id);
        const parts = (Array.isArray(r.content) ? r.content : [{ type: "text", text: String(r.content) }]) as { type: string; text?: string }[];
        toolResults.push({ id: r.tool_use_id, isError: !!r.is_error, text: parts.filter((p) => p.type === "text").map((p) => p.text).join("\n"), images: parts.filter((p) => p.type === "image").length });
      }
      const lastUser = JSON.stringify(msgs.filter((m) => m.role === "user").map((m) => m.content));
      const script = /reviewed the document and asks for these changes/.test(lastUser) ? REVISION : SCRIPT;
      const done = new Set(results.map((r) => r.tool_use_id));
      let i = 0;
      while (i < script.length - 1) {
        const ids = script[i].filter((b) => b.type === "tool_use").map((b) => (b as { id: string }).id);
        if (ids.length && ids.every((x) => done.has(x))) i++;
        else break;
      }
      step = script[i];
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
  delete process.env.OPENAI_API_KEY;
  delete process.env.IMAGE_MOCK;
  process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  process.env.NO_PROXY = [process.env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(",");
  for (const k of Object.keys(process.env)) if (/^(CLAUDE_CODE_REMOTE|SESSION_INGRESS|CCR_|CLAUDE_CODE_SESSION)/.test(k)) delete process.env[k];
  return { close: () => server.close() };
}
