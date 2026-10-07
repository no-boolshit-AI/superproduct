/**
 * Relay mode through the real CLI, the way an orchestrating agent drives dev-agent: setup and a run start in the
 * background with --relay; questions and the plan approval are read with `pending` and answered with `answer`.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { calcRemote, skillsRepo } from "./fixtures.js";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "devagent-relay-"));
process.env.DEVAGENT_HOME = HOME;
process.env.PRODUCT_DIR = "none"; // hermetic: no product folder (test/product.test.ts covers it)
process.env.RUNTIME = "local";
process.env.GITHUB_TOKEN = "";
const { remote } = calcRemote();
process.env.TEST_SKILLS_REPO = skillsRepo();
const m = await import("./mock-claude.js");
const mock = await m.startMockClaude();

const env = { ...process.env, DEVAGENT_HOME: HOME, RUNTIME: "local" };
const cli = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { env, encoding: "utf8" });

function background(args: string[]) {
  const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const exited = new Promise<number>((r) => child.on("close", (c) => r(c ?? 1)));
  return { child, exited, output: () => out };
}

async function nextPending(kind: string, timeoutMs = 120_000): Promise<any> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const r = cli(["pending"]);
    assert.equal(r.status, 0, r.stderr);
    const items = JSON.parse(r.stdout);
    const it = items.find((x: { kind: string }) => x.kind === kind);
    if (it) return it;
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`no pending ${kind}`);
}

try {
  // ---- setup in the background, interview relayed
  const setup = background(["setup", remote, "--project", "calc", "--relay"]);
  const q = await nextPending("questions");
  assert.deepEqual(q.questions.map((x: { id: string }) => x.id), ["pr", "stripe"]);
  assert.equal(q.questions[1].secretEnv, "STRIPE_SECRET");
  assert.match(q.howToAnswer, /answer .* --json/);
  assert.ok(q.secretsFile.endsWith(path.join("projects", "calc", "secrets.env")));

  const leak = cli(["answer", q.id, "--json", JSON.stringify({ pr: "Draft PR", stripe: "sk_relay_1" })]);
  assert.notEqual(leak.status, 0, "secret values are refused in answers");
  assert.match(leak.stderr, /Don't pass secret values/);
  const partial = cli(["answer", q.id, "--json", JSON.stringify({ pr: "Draft PR" })]);
  assert.match(partial.stderr, /Missing answers for: stripe/);

  fs.writeFileSync(q.secretsFile, "STRIPE_SECRET=sk_relay_1\n", { mode: 0o600 }); // what the user does
  const ok = cli(["answer", q.id.slice(0, 5), "--json", JSON.stringify({ pr: "Draft PR", stripe: "__in_secrets_file__" })]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(await setup.exited, 0, setup.output());
  assert.match(setup.output(), /DEVAGENT_PENDING \{"id":"[0-9a-f]{8}","kind":"questions"/);
  assert.ok(m.toolResults.some((r) => r.phase === "setup" && r.text.includes("(stored as STRIPE_SECRET)")));
  const history = fs.readFileSync(path.join(HOME, "ask", "history.jsonl"), "utf8");
  assert.ok(history.includes('"stripe":"(secret)"') && !history.includes("sk_relay_1"));
  assert.deepEqual(JSON.parse(cli(["pending"]).stdout), [], "nothing left open");

  // ---- a run with plan approval, approved through the relay
  const run = background(["Add multiply and divide to the calculator", "--project", "calc", "--relay", "--approve"]);
  const a = await nextPending("approval");
  assert.ok(fs.existsSync(a.prd) && fs.existsSync(a.plan));
  assert.match(cli(["answer", a.id, "--decision", "revise"]).stderr, /needs --feedback/);
  assert.equal(cli(["answer", a.id, "--decision", "approve"]).status, 0);
  assert.equal(await run.exited, 0, run.output());
  const runs = fs.readdirSync(path.join(HOME, "runs", "calc"));
  const rec = JSON.parse(fs.readFileSync(path.join(HOME, "runs", "calc", runs[0], "run.json"), "utf8"));
  assert.equal(rec.status, "done");
  assert.equal(rec.milestones.length, 3);
  console.log("✓ relay OK: setup interview + plan approval answered through pending/answer");
} finally {
  mock.close();
}
