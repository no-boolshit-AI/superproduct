// Zero-cost tests for the dashboard (server, run reader):   node --test dashboard/server.test.mjs
// A throwaway agent and workspace in a temporary folder; nothing in the kit or your workspace is read or written.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeStatus, prettify } from "./runs.mjs";
import { createDashboard } from "./server.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = realpathSync(mkdtempSync(path.join(os.tmpdir(), "dashboard-test-")));
const ws = path.join(base, "workspace");
const agentDir = path.join(base, "agents", "fake-agent");
const put = (file, text = "x") => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

const fake = {
  id: "fake",
  dir: agentDir,
  title: "A fake agent",
  summary: "Makes nothing.",
  command: "npm run make --",
  web: null,
  install: [],
  test: "true",
  claudeAuth: "key",
  env: { required: ["ANTHROPIC_API_KEY"], optional: ["OPENAI_API_KEY"] },
  needs: [],
  outputs: { dir: "out/fake", env: "OUTPUT_DIR", depth: 1, record: "job.json", files: ["video.mp4", "png", "post.md"] },
  skill: "skills/fake/SKILL.md",
};

const SECRET = "sk-ant-api03-test-value-never-shown";
let dash;
let port;
let token;

before(async () => {
  put(path.join(agentDir, ".env.example"), "# --- required ---\nANTHROPIC_API_KEY=\nOPENAI_API_KEY=\n# --- optional ---\n# Spend cap (USD)\nMAX_BUDGET_USD=5\n");
  mkdirSync(path.join(agentDir, "node_modules"), { recursive: true });
  const done = path.join(ws, "out", "fake", "20261001-120000-a-finished-video");
  put(path.join(done, "job.json"), JSON.stringify({ status: "done", title: "A finished video", costUsd: 1.25, createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:05:00Z", summary: "All good.", placeholders: ["[X] customers"] }));
  put(path.join(done, "video.mp4"), "0123456789".repeat(100));
  put(path.join(done, "png", "slide-01.png"), "png");
  put(path.join(done, "post.md"), "# Caption\n\nHello.");
  put(path.join(done, "index.html"), "<script>alert(1)</script>");
  put(path.join(done, ".env"), "LEAKED=1");
  const board = path.join(ws, "out", "fake", "20261002-120000-waiting-for-review");
  put(path.join(board, "job.json"), JSON.stringify({ status: "storyboard", brief: "# Waiting for review\n\nmore", createdAt: "2026-10-02T10:00:00Z" }));
  put(path.join(board, "storyboard.jpg"), "jpg");
  const stale = path.join(ws, "out", "fake", "20261003-120000-stopped-run");
  put(path.join(stale, "job.json"), JSON.stringify({ status: "running", createdAt: "2026-10-03T10:00:00Z" }));
  const old = new Date(Date.now() - 3 * 3600e3);
  for (const f of [stale, path.join(stale, "job.json")]) utimesSync(f, old, old);
  put(path.join(ws, "dev", "ask", "q1.pending.json"), JSON.stringify({ id: "q1", kind: "questions", scope: "shop", createdAt: "2026-10-03T10:00:00Z", questions: [{ id: "db", question: "Which database?", options: [{ label: "Postgres" }] }, { id: "key", question: "Stripe key?", secretEnv: "STRIPE_KEY" }], secretsFile: "secrets.env" }));
  const env = { SUPERPRODUCT_WORKSPACE: ws, PRODUCT_DIR: path.join(KIT, "lib", "fixtures", "acme") };
  dash = createDashboard({ registry: [fake], env, token: "test-token", probe: async () => ({ docker: false, ffmpeg: false, claude: false, chromium: false, claudeCode: "missing" }) });
  token = dash.token;
  await new Promise((r) => dash.server.listen(0, "127.0.0.1", r));
  await new Promise((r) => dash.sites.listen(0, "127.0.0.1", r));
  port = dash.server.address().port;
});
after(() => {
  dash.server.close();
  dash.sites.close();
});

/** A request with full control of the headers (fetch can't set Host). */
function request(p, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          /* not JSON */
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.end(typeof body === "string" ? body : JSON.stringify(body));
    else req.end();
  });
}
const post = (p, body, headers = {}) => request(p, { method: "POST", body, headers: { "content-type": "application/json", "x-dashboard-token": token, ...headers } });

test("statuses: every agent's vocabulary becomes one; prettify drops timestamps", () => {
  assert.equal(normalizeStatus("done"), "ready");
  assert.equal(normalizeStatus("success"), "ready");
  assert.equal(normalizeStatus("storyboard"), "question");
  assert.equal(normalizeStatus("waiting"), "question");
  assert.equal(normalizeStatus("running", { fresh: true }), "working");
  assert.equal(normalizeStatus("running", { fresh: false }), "stopped");
  assert.equal(normalizeStatus("verification_failed"), "failed");
  assert.equal(normalizeStatus(undefined, { hasResult: true }), "ready");
  assert.equal(prettify("20261008-123538-ai-in-romanian-business-2026"), "Ai in romanian business 2026");
  assert.equal(prettify("2026-10-06-14-48-launch-announcement"), "Launch announcement");
});

test("the page: served with its token and a strict content security policy", async () => {
  const r = await request("/");
  assert.equal(r.status, 200);
  assert.match(r.text, /<meta name="dashboard-token" content="test-token">/);
  assert.match(r.headers["content-security-policy"], /script-src 'self'/);
});

test("state: runs with one status each, titles, thumbnails, spend; the dev-agent's questions", async () => {
  const { json: s } = await request("/api/state");
  const byTitle = Object.fromEntries(s.runs.map((r) => [r.title, r]));
  assert.equal(byTitle["A finished video"].status, "ready");
  assert.equal(byTitle["A finished video"].costUsd, 1.25);
  assert.equal(byTitle["Waiting for review"].status, "question", "a storyboard waits for the person");
  assert.equal(byTitle["Waiting for review"].thumb, "/f/ws/out/fake/20261002-120000-waiting-for-review/storyboard.jpg");
  assert.equal(byTitle["Stopped run"].status, "stopped", "marked running, but untouched for hours");
  assert.equal(s.pending.length, 1);
  assert.equal(s.product.name, "Acme Bread");
  assert.ok(s.product.docs.length > 0);
  const a = s.agents[0];
  assert.equal(a.ready, false);
  assert.deepEqual(
    a.keys.map((k) => [k.name, k.set]),
    [
      ["ANTHROPIC_API_KEY", false],
      ["OPENAI_API_KEY", false],
    ],
  );
  assert.equal(s.connections.find((c) => c.id === "claude").state, "missing");
});

test("one run: record fields, key files first, picture folders, what to show big; never .env", async () => {
  const { json: run } = await request("/api/run?agent=fake&id=20261001-120000-a-finished-video");
  assert.equal(run.primary.kind, "video");
  assert.equal(run.record.summary, "All good.");
  assert.deepEqual(run.record.placeholders, ["[X] customers"]);
  assert.deepEqual(run.galleries.map((g) => g.name), ["png"]);
  assert.ok(run.files[0].key, "key files first");
  assert.ok(!run.files.some((f) => f.name === ".env"));
  assert.deepEqual(run.docs.map((d) => d.name), ["post.md"]);
  const missing = await request("/api/run?agent=fake&id=nope");
  assert.equal(missing.status, 404);
});

test("files: byte ranges for video, a sandbox for HTML, nothing outside the roots, no .env", async () => {
  const dir = "/f/ws/out/fake/20261001-120000-a-finished-video";
  const range = await request(`${dir}/video.mp4`, { headers: { range: "bytes=10-19" } });
  assert.equal(range.status, 206);
  assert.equal(range.text, "0123456789");
  assert.equal(range.headers["content-range"], "bytes 10-19/1000");
  const page = await request(`${dir}/index.html`);
  assert.match(page.headers["content-security-policy"], /^sandbox/);
  assert.equal((await request(`${dir}/.env`)).status, 404);
  assert.equal((await request("/f/ws/..%2F..%2Fagents%2Ffake-agent%2F.env.example")).status, 404);
  assert.equal((await request("/f/nope/x")).status, 404);
  const doc = await request("/f/product/BRIEF.md");
  assert.equal(doc.status, 200, "the product folder outside the workspace has its own root");
  const all = (await request("/api/files")).json;
  assert.ok(all.some((f) => f.name === "slide-01.png" && f.group === "png"));
  assert.ok(!all.some((f) => f.name === "job.json"), "bookkeeping stays out of Files");
});

test("requests for another host are refused (no DNS rebinding)", async () => {
  const r = await request("/api/state", { headers: { host: "evil.example:80" } });
  assert.equal(r.status, 421);
});

test("changes need the page's token, and the dashboard's own origin", async () => {
  assert.equal((await post("/api/keys", { name: "OPENAI_API_KEY", value: "x", agents: ["fake"] }, { "x-dashboard-token": "wrong" })).status, 403);
  assert.equal((await post("/api/keys", { name: "OPENAI_API_KEY", value: "x", agents: ["fake"] }, { origin: "http://evil.example" })).status, 403);
  assert.ok(!existsSync(path.join(agentDir, ".env")));
});

test("keys: written to the agent's .env (from .env.example), reported as set, never sent back", async () => {
  const r = await post("/api/keys", { name: "ANTHROPIC_API_KEY", value: SECRET, agents: ["fake"] });
  assert.equal(r.status, 200, r.text);
  const env = readFileSync(path.join(agentDir, ".env"), "utf8");
  assert.match(env, new RegExp(`^ANTHROPIC_API_KEY=${SECRET}$`, "m"));
  assert.match(env, /# Spend cap \(USD\)/, "started as a copy of .env.example");
  const state = await request("/api/state");
  assert.ok(!state.text.includes(SECRET), "the state never contains the key");
  assert.equal(state.json.agents[0].keys.find((k) => k.name === "ANTHROPIC_API_KEY").set, true);
  const settings = await request("/api/agents/fake/settings");
  assert.ok(!settings.text.includes(SECRET), "nor do the settings");
  assert.equal(settings.json.items.find((i) => i.name === "ANTHROPIC_API_KEY").set, true);
  assert.equal((await post("/api/keys", { name: "GITHUB_TOKEN", value: "x", agents: ["fake"] })).status, 400, "an agent that doesn't use the key");
  assert.equal((await post("/api/keys", { name: "PATH", value: "x", agents: ["fake"] })).status, 400, "not a key the dashboard manages");
  assert.equal((await post("/api/keys", { name: "OPENAI_API_KEY", value: "two words", agents: ["fake"] })).status, 400);
});

test("settings: only the names .env.example offers; values written as given", async () => {
  assert.equal((await post("/api/agents/fake/settings", { values: { MAX_BUDGET_USD: "7" } })).status, 200);
  assert.match(readFileSync(path.join(agentDir, ".env"), "utf8"), /^MAX_BUDGET_USD=7$/m);
  assert.equal((await post("/api/agents/fake/settings", { values: { NODE_OPTIONS: "--inspect" } })).status, 400);
  const s = (await request("/api/agents/fake/settings")).json;
  assert.equal(s.items.find((i) => i.name === "MAX_BUDGET_USD").current, "7");
});

test("relay: answers questions, refuses secrets in answers", async () => {
  const bad = await post("/api/relay/q1", { answers: { db: "Postgres", key: "sk_live_123" } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /secret/i);
  const ok = await post("/api/relay/q1", { answers: { db: "Postgres", key: "__in_secrets_file__" } });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual(JSON.parse(readFileSync(path.join(ws, "dev", "ask", "q1.answer.json"), "utf8")), { answers: { db: "Postgres", key: "__in_secrets_file__" } });
  assert.equal((await request("/api/state")).json.pending.length, 0);
});

test("tasks: run the kit's CLI for an agent and keep its log", async () => {
  const r = await post("/api/tasks", { action: "test", agent: "fake" });
  assert.equal(r.status, 200, r.text);
  let task;
  for (let i = 0; i < 50; i++) {
    task = (await request("/api/state")).json.tasks.find((t) => t.id === r.json.id);
    if (task.status !== "running") break;
    await new Promise((res) => setTimeout(res, 100));
  }
  // the kit's registry doesn't know the fake agent, so the CLI says so: what matters is the round trip
  assert.equal(task.status, "failed");
  assert.match(task.log.join("\n"), /Unknown agent "fake"/);
  assert.equal((await post("/api/tasks", { action: "rm", agent: "fake" })).status, 400);
});
