/**
 * Web UI server: static page, same-origin protection, validation, and the full browser flow driven over HTTP:
 * project setup with a question answered through /answer, then a run that pauses for plan approval and is
 * approved through /approve (RUNTIME=local, mock Claude API).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { calcRemote, skillsRepo } from "./fixtures.js";

process.env.DEVAGENT_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "devagent-web-"));
process.env.PRODUCT_DIR = "none"; // hermetic: no product folder (test/product.test.ts covers it)
process.env.RUNTIME = "local";
process.env.GITHUB_TOKEN = "";
const { remote } = calcRemote();
process.env.TEST_SKILLS_REPO = skillsRepo();
const m = await import("./mock-claude.js");
const mock = await m.startMockClaude();
const { server } = await import("../src/web/server.js");
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const get = async (p: string) => {
  const r = await fetch(base + p);
  return { status: r.status, json: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
};
const post = async (p: string, body: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

/** Reads an SSE stream, handing each event to `on`, until a "done" event. */
async function follow(p: string, on: (e: any) => Promise<void> | void) {
  const res = await fetch(base + p);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const e = JSON.parse(line.slice(6));
      await on(e);
      if (e.type === "done") {
        await reader.cancel();
        return;
      }
    }
  }
}

try {
  const page = await get("/");
  assert.equal(page.status, 200);
  assert.match(String(page.json), /<title>dev-agent<\/title>/);
  const meta = await get("/api/meta");
  assert.equal(meta.json.runtime, "local");
  assert.deepEqual(meta.json.missingAuth, []);
  assert.equal((await post("/api/runs", { project: "x" }, { Origin: "https://evil.example" })).status, 403, "cross-origin POST blocked");
  assert.equal((await post("/api/runs", { project: "nope", request: "x" })).status, 400);
  assert.equal((await post("/api/projects", {})).status, 400);

  // ---- setup in the browser: answer the question card
  const s = await post("/api/projects", { repo: remote, slug: "calc" });
  assert.equal(s.status, 202);
  let asked = 0;
  await follow("/api/projects/calc/events", async (e) => {
    if (e.type === "question") {
      asked++;
      assert.equal(e.questions.length, 2);
      const r = await post("/api/projects/calc/answer", { id: e.id, answers: { pr: "Draft PR", stripe: "sk_web_1" } });
      assert.equal(r.status, 200);
      assert.equal((await post("/api/projects/calc/answer", { id: e.id, answers: {} })).status, 404, "answered once");
    }
    if (e.type === "done") assert.equal(e.status, "done");
  });
  assert.equal(asked, 1);
  const proj = await get("/api/projects/calc");
  assert.equal(proj.json.profile.slug, "calc");
  assert.equal(proj.json.skills[0].name, "tdd-lite");
  assert.match(proj.json.knowledge, /calculator/);

  // ---- run with plan approval, approved from the browser
  const r = await post("/api/runs", { project: "calc", request: "Add multiply and divide to the calculator", approvePlan: true });
  assert.equal(r.status, 202);
  const id = r.json.id;
  let approvals = 0;
  const types = new Set<string>();
  await follow(`/api/runs/${id}/events`, async (e) => {
    types.add(e.type);
    if (process.env.DEBUG_WEB) console.log(JSON.stringify(e).slice(0, 200));
    if (e.type === "approval") {
      approvals++;
      const detail = await get(`/api/runs/${id}`);
      assert.match(detail.json.prd, /## Acceptance criteria/);
      assert.match(detail.json.plan, /M2: Divide/);
      assert.equal(detail.json.live, true);
      assert.equal((await post(`/api/runs/${id}/approve`, { decision: "approve" })).status, 200);
    }
  });
  assert.equal(approvals, 1);
  for (const t of ["step", "status", "tool", "exec", "milestone", "publish", "done"]) assert.ok(types.has(t), t);
  const done = await get(`/api/runs/${id}`);
  assert.equal(done.json.status, "done", done.json.error);
  assert.equal(done.json.milestones.length, 3);
  const list = await get("/api/runs?project=calc");
  assert.equal(list.json[0].id, id);
  assert.equal((await post(`/api/runs/${id}/approve`, { decision: "approve" })).status, 409, "no longer waiting");
  // a finished run replays its log
  let replayed = 0;
  await follow(`/api/runs/${id}/events`, () => void replayed++);
  assert.ok(replayed > 20);
  console.log(`✓ web OK (${base})`);
} finally {
  server.closeAllConnections();
  server.close();
  mock.close();
}
