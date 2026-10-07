/**
 * End to end at zero cost (RUNTIME=local, or docker with DEVAGENT_E2E_RUNTIME=docker): the real Agent SDK +
 * Claude Code CLI, our MCP tools, hooks, git and workspace, driven by the scripted mock API.
 * Setup (interview, skills, workspace test, profile) → run (PRD, plan, 2 milestones with a failed verify, review +
 * fix milestone, final verify, push to a bare "remote") → revision → approval pause.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { calcRemote, sh, skillsRepo } from "./fixtures.js";

const runtime = (process.env.DEVAGENT_E2E_RUNTIME ?? "local") as "local" | "docker";
process.env.DEVAGENT_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "devagent-home-"));
process.env.PRODUCT_DIR = "none"; // hermetic: no product folder (test/product.test.ts covers it)
process.env.RUNTIME = runtime;
process.env.GITHUB_TOKEN = "";
const { remote } = calcRemote();
process.env.TEST_SKILLS_REPO = skillsRepo();

const m = await import("./mock-claude.js");
// a real container reaches the mock through host.docker.internal, so listen on all interfaces then
const mock = await m.startMockClaude({ host: runtime === "docker" && (!process.env.TEST_CUSTOM_IMAGE || process.env.TEST_BRIDGE === "1") ? "0.0.0.0" : "127.0.0.1" });
if (process.env.DEVAGENT_E2E_SETUP_HOOK) await (await import(path.resolve(process.env.DEVAGENT_E2E_SETUP_HOOK))).default(process.env.DEVAGENT_HOME);
const { setupProject } = await import("../src/setup.js");
const { executeRun } = await import("../src/run.js");
const { loadProfile, readSecrets } = await import("../src/profile.js");
const { projectPaths, runPaths } = await import("../src/paths.js");

const events: string[] = [];
try {
  // ---------------------------------------------------------------- setup
  const profile = await setupProject({ repo: remote, slug: "calc", interaction: m.scriptedInteraction as never, emit: (e) => events.push(e.type), runtime });
  assert.equal(profile.slug, "calc");
  assert.equal(profile.publish.pullRequest, "draft");
  assert.deepEqual(profile.verify, [{ name: "tests", command: "npm test" }]);
  assert.deepEqual(profile.tooling.skills, ["tdd-lite"]);
  assert.equal((await readSecrets("calc")).STRIPE_SECRET, "sk_test_123", "secret stored");
  const setupResults = m.toolResults.filter((r) => r.phase === "setup");
  assert.ok(!setupResults.some((r) => r.text.includes("sk_test_123")), "secret value never reaches the model");
  assert.match(setupResults.find((r) => r.text.includes("(stored as STRIPE_SECRET)"))?.text ?? "", /stored as STRIPE_SECRET/);
  assert.match(setupResults.find((r) => r.text.includes("no SKILL.md"))?.text ?? "", /no-skill/);
  const wsTest = setupResults.find((r) => r.text.includes("All steps passed"));
  assert.ok(wsTest, `workspace test passed: ${setupResults.map((r) => r.text.slice(0, 300)).join("\n---\n")}`);
  assert.match(wsTest!.text, /\?\? \.claude\/|\?\? AGENTS\.md/, "tooling changes reported");
  const exec = setupResults.find((r) => r.text.includes("exit 0"));
  assert.match(exec?.text ?? "", /test:secret-length-11/, "env + secrets reach the workspace");
  assert.match(exec?.text ?? "", runtime === "docker" ? /IN_CONTAINER/ : /ON_HOST/);
  assert.deepEqual([...m.toolsByPhase.setup].filter((t) => !t.startsWith("mcp__")).sort(), ["Glob", "Grep", "Read", "WebFetch", "WebSearch"]);
  assert.ok(fs.existsSync(path.join(projectPaths("calc").plugin, "skills", "tdd-lite", "reference.md")));
  assert.match(fs.readFileSync(projectPaths("calc").knowledge, "utf8"), /node --test/);
  assert.ok((await loadProfile("calc"))!.createdAt);

  // ---------------------------------------------------------------- run
  const run = await executeRun({ project: "calc", request: "Add multiply and divide to the calculator", emit: (e) => events.push(e.type) });
  assert.equal(run.status, "done", run.error ?? "");
  assert.equal(run.branch, "feature/math-ops", "branch renamed from the plan's slug");
  assert.deepEqual(run.milestones.map((x) => `${x.id}:${x.status}`), ["M1:done", "M2:done", "F1:done"]);
  assert.equal(run.review?.verdict, "changes_requested");
  assert.ok(run.verification?.ok, JSON.stringify(run.verification));
  const p = runPaths("calc", run.id);
  for (const f of [p.prd, p.plan, p.notes, path.join(p.logs, "bootstrap.log")]) assert.ok(fs.existsSync(f), f);
  assert.match(fs.readFileSync(p.plan, "utf8"), /\[x\] M1: Multiply/);
  assert.match(fs.readFileSync(p.notes, "utf8"), /multiply lives in src\/math\.js/);

  // plan phase is read-only; the implement phase has the coding tools and no ask_user when unattended
  assert.ok(!m.toolsByPhase.plan.includes("Write") && !m.toolsByPhase.plan.includes("Edit"));
  assert.ok(m.toolsByPhase.plan.includes("mcp__devagent__save_prd") && !m.toolsByPhase.plan.includes("mcp__devagent__ask_user"));
  for (const t of ["Write", "Edit", "Bash", "Skill", "mcp__devagent__complete_milestone", "mcp__devagent__report_blocker"]) assert.ok(m.toolsByPhase.M1.includes(t), t);
  assert.match(m.systemByPhase.M1, /implement ONE milestone/);
  assert.match(m.systemByPhase.M1, /Keep functions pure/);
  assert.match(m.firstPromptByPhase.M1, /Implement milestone M1 \(1 of 2\)/);
  const planBash = m.toolResults.find((r) => r.phase === "plan" && /IN_CONTAINER|ON_HOST/.test(r.text));
  assert.match(planBash?.text ?? "", runtime === "docker" ? /IN_CONTAINER/ : /ON_HOST/);
  assert.match(planBash?.text ?? "", /local-tool/, "repo tooling present in the run workspace");
  assert.ok(m.toolResults.some((r) => r.phase === "plan" && r.isError && /No such tool|not available|Write/i.test(r.text)), "Write unavailable while planning");

  const m1 = m.toolResults.filter((r) => r.phase === "M1");
  assert.ok(m1.some((r) => r.isError && /git push.*handled by dev-agent/s.test(r.text)), "git push blocked");
  assert.ok(m1.some((r) => r.isError && /only change files inside/.test(r.text)), "write outside repo blocked");
  assert.ok(m1.some((r) => r.isError && /switch branches/.test(r.text)), "branch switch blocked");
  assert.ok(m1.some((r) => r.isError && /Verification failed \(attempt 1\)/.test(r.text)), "failing verify reported back");
  assert.ok(m1.some((r) => /Committed [0-9a-f]{7}/.test(r.text)), "milestone committed after the fix");

  if (runtime === "docker") {
    assert.ok(m.toolResults.some((r) => r.phase === "M2" && r.text.includes("SNEAKY_BLOCKED")), "read-only git dir blocks commits from inside the container");
    assert.match(m.toolResults.find((r) => r.phase === "review")?.text ?? "", /feat\(math\): add divide/, "git log works inside the container");
  }

  // the remote got exactly the feature commits; tooling + bootstrap artifacts stayed local
  const log = sh(remote, "git", ["log", "--format=%s", `main..feature/math-ops`]).trim().split("\n");
  assert.deepEqual(log, ["fix(math): reject division by zero", "feat(math): add divide", "feat(math): add multiply"]);
  const files = sh(remote, "git", ["diff", "--name-only", "main", "feature/math-ops"]).trim().split("\n").sort();
  assert.deepEqual(files, ["src/math.js", "test/divide-zero.test.js", "test/divide.test.js", "test/multiply.test.js"]);
  const body = sh(remote, "git", ["log", "-1", "--format=%B", "feature/math-ops~2"]);
  assert.match(body, /Milestone M1 of "Add multiply and divide"/);
  assert.equal(run.publish?.prUrl, undefined, "no PR for a non-GitHub remote");
  assert.ok(events.includes("milestone") && events.includes("publish") && events.at(-1) === "done");

  // ---------------------------------------------------------------- revision on the same branch
  const rev = await executeRun({ project: "calc", runId: run.id, revise: "Add a subtract function" });
  assert.equal(rev.status, "done", rev.error ?? "");
  assert.equal(rev.revisions.length, 1);
  assert.equal(sh(remote, "git", ["log", "-1", "--format=%s", "feature/math-ops"]).trim(), "feat(math): add subtract");

  // ---------------------------------------------------------------- approval pause (unattended)
  const waiting = await executeRun({ project: "calc", request: "Add multiply and divide again", approvePlan: true });
  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.step, "approval");
  assert.equal(waiting.branch, "feature/math-ops-2", "branch names don't collide");
  const stopped = await executeRun({ project: "calc", runId: waiting.id, approval: { decision: "cancel" } });
  assert.equal(stopped.status, "cancelled");

  console.log(`✓ e2e (${runtime}) OK: setup + run ${run.id} → ${run.milestones.length} milestones, $${run.costUsd.toFixed(2)} (mock)`);
} finally {
  mock.close();
}
