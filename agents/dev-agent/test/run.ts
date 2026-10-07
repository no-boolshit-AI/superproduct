/** Runs each test file in its own process (they set DEVAGENT_HOME / API mocks at import time). */
import { spawnSync } from "node:child_process";

const files = ["test/unit.test.ts", "test/product.test.ts", "test/e2e.test.ts", "test/web.test.ts", "test/relay.test.ts"];
let failed = 0;
for (const f of files) {
  console.log(`\n▶ ${f}`);
  const r = spawnSync(process.execPath, ["--import", "tsx", f], { stdio: "inherit", env: process.env });
  if (r.status !== 0) failed++;
}
// The docker variant of the e2e test builds real workspace images; opt in with DEVAGENT_TEST_DOCKER=1.
if (process.env.DEVAGENT_TEST_DOCKER === "1") {
  console.log(`\n▶ test/e2e.test.ts (docker)`);
  const r = spawnSync(process.execPath, ["--import", "tsx", "test/e2e.test.ts"], { stdio: "inherit", env: { ...process.env, DEVAGENT_E2E_RUNTIME: "docker" } });
  if (r.status !== 0) failed++;
}
if (failed) {
  console.error(`\n${failed} test file(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed.");
