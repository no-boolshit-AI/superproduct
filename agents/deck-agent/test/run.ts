/** Runs each test file in its own process (they set OUTPUT_DIR / API mocks at import time). */
import { spawnSync } from "node:child_process";
const files = ["test/tools.test.ts", "test/guard.test.ts", "test/product.test.ts", "test/e2e.test.ts", "test/web.test.ts"];
let failed = 0;
for (const f of files) {
  console.log(`\n▶ ${f}`);
  const r = spawnSync(process.execPath, ["--import", "tsx", f], { stdio: "inherit", env: process.env });
  if (r.status !== 0) failed++;
}
if (failed) { console.error(`\n${failed} test file(s) failed`); process.exit(1); }
console.log("\nAll tests passed.");
