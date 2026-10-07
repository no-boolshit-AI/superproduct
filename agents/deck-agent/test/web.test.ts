/** Web UI server: meta, cross-origin guard, job creation with an uploaded CSV, live events, file serving. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.OUTPUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "deck-web-"));
process.env.PRODUCT_DIR = "none"; // hermetic: ignore the repo's product/ folder (test/product.test.ts covers it)
process.env.EXPORT_DPI = "100";
const m = await import("./mock-claude.js");
const mock = await m.startMockClaude();
const { server } = await import("../src/web/server.js");
const { closeBrowser } = await import("../src/render/renderer.js");
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
try {
  const meta = await (await fetch(`${base}/api/meta`)).json();
  assert.equal(meta.themes.length, 5);
  const evil = await fetch(`${base}/api/jobs`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: "{}" });
  assert.equal(evil.status, 403, "cross-origin POST blocked");
  const form = await fetch(`${base}/api/jobs`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
  assert.equal(form.status, 403, "non-JSON POST blocked");
  const csv = fs.readFileSync("test/fixtures/sales.csv").toString("base64");
  const r = await fetch(`${base}/api/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: "Regional sales review", files: [{ name: "sales.csv", data: csv }] }) });
  assert.equal(r.status, 202);
  const { id } = await r.json();
  const res = await fetch(`${base}/api/jobs/${id}/events`);
  const text = await res.text(); // stream ends on "done"
  const events = text.split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));
  const done = events.at(-1);
  assert.equal(done.type, "done");
  assert.equal(done.job.status, "done", done.job.error);
  assert.ok(events.some((e) => e.type === "page"));
  const pdf = await fetch(`${base}/out/${id}/presentation.pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.ok(pdf.headers.get("content-security-policy"));
  const trav = await fetch(`${base}/out/${id}/..%2F..%2Fetc%2Fpasswd`);
  assert.equal(trav.status, 404, "path traversal blocked");
  const list = await (await fetch(`${base}/api/jobs`)).json();
  assert.equal(list[0].id, id);
  console.log(`✓ web OK: job ${id}`);
} finally {
  server.closeAllConnections();
  server.close();
  await closeBrowser();
  mock.close();
}
process.exit(process.exitCode ?? 0);
