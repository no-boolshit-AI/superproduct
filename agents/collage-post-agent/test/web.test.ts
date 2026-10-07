/** Web server: bad URLs don't crash it, cross-origin POSTs are refused, static serving is confined. */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.PRODUCT_DIR = "none"; // hermetic: product folders are covered by test/product.test.ts
process.env.OUTPUT_DIR = mkdtempSync(path.join(os.tmpdir(), "collage-web-"));
process.env.PORT = "4791";
process.env.OPENAI_API_KEY ||= "sk-test";
process.env.ANTHROPIC_API_KEY ||= "sk-ant-test";
const { server } = await import("../src/web/server.js");
const base = "http://127.0.0.1:4791";
await new Promise((r) => setTimeout(r, 300));
try {
  assert.equal((await fetch(base + "/design/%ff")).status, 400);
  assert.equal((await fetch(base + "/design/../package.json")).status, 404);
  assert.equal((await fetch(base + "/design/%2e%2e/package.json")).status, 404);
  assert.equal((await fetch(base + "/design/fonts/inter-latin-wght-normal.woff2")).status, 200);
  const evil = await fetch(base + "/api/jobs", { method: "POST", headers: { "content-type": "text/plain" }, body: '{"brief":"x"}' });
  assert.equal(evil.status, 403);
  const cross = await fetch(base + "/api/jobs", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: '{"brief":"x"}' });
  assert.equal(cross.status, 403);
  const empty = await fetch(base + "/api/jobs", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: '{"brief":""}' });
  assert.equal(empty.status, 400);
  assert.equal((await fetch(base + "/api/meta")).status, 200);
  assert.equal((await fetch(base + "/")).status, 200, "server still alive");
  console.log("✓ web server OK");
} finally {
  server.close();
}
process.exit(0);
