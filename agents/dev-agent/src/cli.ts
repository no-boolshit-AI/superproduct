#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { checkClaudeAuth, defaults } from "./config.js";
import type { DevEvent, Interaction } from "./events.js";
import { githubToken, parseRepo } from "./github.js";
import { cliInteraction } from "./interaction-cli.js";
import { defaultAskDir, fileInteraction, listPending, writeAnswer, type PendingItem } from "./interaction-file.js";
import { projectPaths, runPaths, sdkVersion, slugify } from "./paths.js";
import { exec } from "./proc.js";
import { resolveProductFor } from "./product.js";
import { listProjects, loadProfile, saveProfile, type Profile } from "./profile.js";
import { findRun, isStale, listRuns, saveRun, type RunRecord } from "./run-record.js";
import { executeRun, type RunOptions } from "./run.js";
import { setupProject } from "./setup.js";
import { imageExists, imageSpec } from "./workspace/image.js";
import { composeProjectName } from "./workspace/docker.js";

const HELP = `
dev-agent: turns feature requests into a PRD, a milestone plan, tested commits and a pushed branch.

First run for a repository (interview + dev skills + workspace check):
  npm run agent -- setup <github-repo>            e.g. acme/shop or https://github.com/acme/shop
  npm run agent -- setup --project shop --reconfigure

Features:
  npm run agent -- "Add CSV export to the invoices page"      (one project configured: uses it)
  npm run agent -- --project shop --file feature.md
  npm run agent -- --project shop --issue 123                 (a GitHub issue as the request)
  npm run agent -- --repo acme/shop "…"                       (runs setup first if needed)

Runs:
  npm run agent -- list [--project shop]          runs and their status
  npm run agent -- show <run-id>                  details, PRD/plan paths, milestones
  npm run agent -- resume <run-id>                continue a stopped run (raise --budget if it ran out)
  npm run agent -- approve <run-id> [--feedback "…"]   decide on a run waiting for plan approval
  npm run agent -- reject <run-id>
  npm run agent -- revise <run-id> "also handle …"     follow-up change on the same branch / PR
  npm run agent -- publish <run-id>               push (and open/update the PR) again
  npm run agent -- clean <run-id> | --finished    delete the clone and container home of runs
  npm run agent -- projects | doctor

Relay mode (for an orchestrating agent; no terminal needed):
  npm run agent -- setup acme/shop --relay        questions/approvals go to ask/*.pending.json
  npm run agent -- pending                        list open questions (JSON)
  npm run agent -- answer <id> --json '{"pr": "Draft PR"}'
  npm run agent -- answer <id> --decision approve | revise --feedback "…" | cancel

Options
  -p, --project <slug>   configured project       --repo <url>      repository (setup if new)
  -f, --file <path>      request from a file      --issue <n|url>   GitHub issue as the request
  --approve              pause for plan approval  --no-approve      don't pause, even if the project does
  --no-pr                push the branch only     --keep-workspace  leave the container running afterwards
  --budget <usd>         max Claude spend         --model <name>    opus | sonnet | full model id
  --runtime <r>          docker | local           --unattended      never ask questions (approval pauses)
  --relay                relay questions/approvals through files (--ask-dir <dir>, default ./ask)
  --product <dir|none>   product folder (context: terms, voice, design tokens); with setup it is saved in the
                         profile. Default: the profile's, else a product folder whose product.json lists the repo
  -h, --help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: "string", short: "p" },
    repo: { type: "string" },
    file: { type: "string", short: "f" },
    issue: { type: "string" },
    approve: { type: "boolean" },
    "no-approve": { type: "boolean" },
    "no-pr": { type: "boolean" },
    "keep-workspace": { type: "boolean" },
    budget: { type: "string" },
    model: { type: "string" },
    runtime: { type: "string" },
    unattended: { type: "boolean" },
    relay: { type: "boolean" },
    "ask-dir": { type: "string" },
    json: { type: "string" },
    decision: { type: "string" },
    reconfigure: { type: "boolean" },
    feedback: { type: "string" },
    finished: { type: "boolean" },
    product: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function log(e: DevEvent) {
  switch (e.type) {
    case "status":
      console.log(bold(`▸ ${e.message}`));
      break;
    case "step":
      console.log(`\n${bold(`── ${e.step} ──`)}`);
      break;
    case "text":
      console.log(`\n${e.label === "developer" ? dim(e.text) : e.text}\n`);
      break;
    case "tool":
      console.log(dim(`  · ${e.summary}`));
      break;
    case "exec":
      if (e.ok === undefined) console.log(dim(`  $ ${e.command}`));
      else console.log(`  ${e.ok ? green("✓") : red("✗")} ${dim(`${e.phase ? `[${e.phase}] ` : ""}${e.command}`)}`);
      if (e.ok === false && e.tail) console.log(dim(e.tail.split("\n").slice(-12).map((l) => `      ${l}`).join("\n")));
      break;
    case "milestone":
      console.log(bold(`◆ ${e.id} ${e.title}: ${e.status}${e.commit ? ` (${e.commit.slice(0, 7)})` : ""}`));
      break;
    case "cost":
      console.log(dim(`  $${e.usd.toFixed(2)} this session, $${e.total.toFixed(2)} total`));
      break;
    case "publish":
      console.log(green(`✓ Pushed ${e.branch}${e.prUrl ? `\n  PR: ${e.prUrl}` : e.branchUrl ? `\n  ${e.branchUrl}` : ""}`));
      break;
    case "error":
      console.error(red(`✗ ${e.message}`));
      break;
    case "approval":
    case "question":
    case "answered":
    case "done":
      break;
  }
}

function summary(run: RunRecord) {
  const p = runPaths(run.project, run.id);
  const color = run.status === "done" ? green : run.status === "waiting" ? yellow : red;
  console.log(`\n${bold("Run")} ${run.id}  ${color(run.status)}${run.error ? `  ${run.error}` : ""}`);
  console.log(`  project   ${run.project}   step ${run.step}   spend $${run.costUsd.toFixed(2)} of $${run.budgetUsd}`);
  console.log(`  branch    ${run.branch}${run.publish?.prUrl ? `\n  PR        ${run.publish.prUrl}` : run.publish?.branchUrl ? `\n  pushed    ${run.publish.branchUrl}` : ""}`);
  console.log(`  folder    ${p.dir}`);
  if (run.product) console.log(`  product   ${run.product.name} (${run.product.source}): ${path.join(p.dir, "product-context.md")}`);
  if (existsSync(p.prd)) console.log(`  PRD       ${p.prd}`);
  if (existsSync(p.plan)) console.log(`  plan      ${p.plan}`);
  for (const m of run.milestones) console.log(dim(`  ${m.status === "done" ? "✓" : m.status === "done_with_issues" ? "!" : "·"} ${m.id} ${m.title}${m.commit ? ` ${m.commit.slice(0, 7)}` : ""}`));
  if (run.verification) console.log(dim(`  checks    ${run.verification.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}`).join("  ") || "none"}`));
  if (run.status === "waiting") console.log(`\n  Approve: npm run agent -- approve ${run.id}   (or --feedback "…" / reject)`);
  else if (run.status !== "done") console.log(`\n  Continue: npm run agent -- resume ${run.id}`);
  else console.log(dim(`\n  Follow-up: npm run agent -- revise ${run.id} "…"`));
}

const ac = new AbortController();
process.on("SIGINT", () => {
  console.log("\nStopping… (Ctrl+C again to force quit; the run can be resumed)");
  ac.abort();
  process.once("SIGINT", () => process.exit(130));
});

const askDir = values["ask-dir"] ? path.resolve(values["ask-dir"]) : defaultAskDir();
const relay = !!(values.relay || values["ask-dir"] || process.env.DEVAGENT_RELAY === "1");

function announce(item: PendingItem) {
  // one parseable line for the orchestrating agent, plus a readable hint
  console.log(`DEVAGENT_PENDING ${JSON.stringify({ id: item.id, kind: item.kind, file: path.join(askDir, `${item.id}.pending.json`) })}`);
  console.log(yellow(`? Waiting for an answer (${item.kind}): npm run agent -- pending, then npm run agent -- answer ${item.id} …`));
}

/** Who answers questions and approvals for this project: relay files, the terminal, or nobody (unattended). */
function interactionFor(slug: string): Interaction | undefined {
  if (relay) return fileInteraction({ dir: askDir, scope: slug, secretsFile: projectPaths(slug).secrets, onPending: announce });
  return values.unattended || !process.stdin.isTTY ? undefined : cliInteraction;
}
const interaction: Interaction | undefined = relay ? undefined : values.unattended || !process.stdin.isTTY ? undefined : cliInteraction;

async function resolveProject(): Promise<Profile> {
  if (values.project) {
    const p = await loadProfile(values.project);
    if (p) return p;
    if (!values.repo) throw new Error(`Unknown project "${values.project}". Set it up with: npm run agent -- setup <repo> --project ${values.project}`);
  }
  if (values.repo) {
    const slug = values.project ?? slugify(parseRepo(values.repo).name, 40);
    return (await loadProfile(slug)) ?? setup(values.repo, slug);
  }
  const all = await listProjects();
  if (all.length === 1) return all[0];
  if (!all.length) {
    if (!interaction) throw new Error("No project is set up. Run: npm run agent -- setup <github-repo>" + (relay ? " --relay" : ""));
    const a = await cliInteraction.ask([{ id: "repo", question: "No project is set up yet. Which GitHub repository should I work on? (owner/name or URL)" }]);
    return setup(String(a.repo));
  }
  throw new Error(`Several projects are set up (${all.map((p) => p.slug).join(", ")}). Pick one with --project.`);
}

async function setup(repo: string, slug?: string, reconfigure = false): Promise<Profile> {
  const target = slug ?? slugify(parseRepo(repo).name, 40);
  const who = interactionFor(target);
  if (!who) throw new Error("Setup is an interview: run it in a terminal (without --unattended), with --relay, or from the web UI.");
  console.log(bold(`\nSetting up ${repo}. I'll look at the code, ask you a few questions, install dev skills and check the workspace.\n`));
  const profile = await setupProject({
    repo,
    slug: target,
    interaction: who,
    emit: log,
    signal: ac.signal,
    model: values.model,
    runtime: values.runtime === "local" ? "local" : values.runtime === "docker" ? "docker" : undefined,
    reconfigure,
  });
  if (values.product !== undefined) {
    profile.product = values.product;
    await saveProfile(profile);
  }
  const choice = resolveProductFor(profile);
  console.log(green(`\n✓ Project "${profile.slug}" is ready.`) + dim(` Profile: ${projectPaths(profile.slug).profile}`));
  console.log(dim(choice.product ? `  Product context: ${choice.product.name} (${choice.source})` : `  Product context: none${choice.note ? `. ${choice.note}` : ""}`));
  return profile;
}

function runOptions(project: string): Omit<RunOptions, "request"> {
  return {
    project,
    interaction: interactionFor(project),
    emit: log,
    signal: ac.signal,
    budgetUsd: values.budget ? positiveNumber(values.budget, "--budget") : undefined,
    model: values.model,
    runtime: values.runtime === "local" ? "local" : values.runtime === "docker" ? "docker" : undefined,
    approvePlan: values.approve ? true : values["no-approve"] ? false : undefined,
    noPr: values["no-pr"],
    keepWorkspace: values["keep-workspace"],
    product: values.product,
  };
}

function positiveNumber(v: string, flag: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag} needs a positive number (got "${v}")`);
  return n;
}

async function needRun(id?: string): Promise<RunRecord> {
  if (!id) throw new Error("Give a run id (see: npm run agent -- list).");
  const r = await findRun(id);
  if (!r) throw new Error(`Run not found: ${id}`);
  return r;
}

async function doctor() {
  const ok = (b: boolean, msg: string, hint = "") => console.log(`${b ? green("✓") : red("✗")} ${msg}${!b && hint ? dim(`  ${hint}`) : ""}`);
  const d = defaults();
  ok(Number(process.versions.node.split(".")[0]) >= 20, `Node ${process.versions.node}`, "Node 20.12+ required");
  ok((await exec("git", ["--version"])).code === 0, "git");
  const docker = await exec("docker", ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 15_000 });
  ok(docker.code === 0 || d.runtime === "local", `Docker ${docker.code === 0 ? docker.stdout.trim() : "not reachable"} (RUNTIME=${d.runtime})`, "Start Docker Desktop, or set RUNTIME=local");
  if (docker.code === 0) {
    ok((await exec("docker", ["compose", "version"])).code === 0, "docker compose");
    ok((await exec("docker", ["buildx", "version"])).code === 0, "docker buildx (BuildKit)", "Install the buildx plugin (included in Docker Desktop)");
  }
  const auth = checkClaudeAuth();
  ok(!auth.length, auth.length ? `Claude auth: missing ${auth[0]}` : "Claude auth", "Set ANTHROPIC_API_KEY, or CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`");
  ok(!!githubToken(), "GitHub token (GITHUB_TOKEN or gh auth)", "Needed for private repos and pull requests");
  console.log(dim(`  Agent SDK ${sdkVersion()} · model ${d.model} · budget $${d.maxBudgetUsd}/run`));
  for (const p of await listProjects()) {
    const spec = p.workspace.customImage ? null : imageSpec(p.slug, p.workspace);
    const built = spec ? docker.code === 0 && (await imageExists(spec.tag)) : true;
    console.log(`  project ${bold(p.slug)}: ${p.repo.owner}/${p.repo.name} · ${p.stack.primary} · image ${spec ? (built ? "built" : "will build on first run") : p.workspace.customImage}`);
  }
}

async function main() {
  if (values.help) return console.log(HELP);
  const [cmd, ...rest] = positionals;
  const needsClaude = !["list", "projects", "show", "doctor", "clean", "pending", "answer"].includes(cmd ?? "");
  if (needsClaude && cmd !== "publish" && checkClaudeAuth().length) {
    console.error(red(`Missing Claude credentials: set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in .env (see .env.example).`));
    process.exitCode = 1;
    return;
  }

  switch (cmd) {
    case "doctor":
      return doctor();
    case "pending":
      return console.log(JSON.stringify(await listPending(askDir), null, 2));
    case "answer": {
      const id = rest[0];
      if (!id) throw new Error("npm run agent -- answer <id> --json '{…}' | --decision approve|revise|cancel [--feedback …]");
      let answers;
      if (values.json) {
        try {
          answers = JSON.parse(values.json);
        } catch (e) {
          throw new Error(`--json isn't valid JSON: ${(e as Error).message}`);
        }
      }
      const decision = values.decision as "approve" | "revise" | "cancel" | undefined;
      if (decision && !["approve", "revise", "cancel"].includes(decision)) throw new Error("--decision must be approve, revise or cancel");
      const item = await writeAnswer(id, { answers, decision, feedback: values.feedback }, askDir);
      return console.log(green(`✓ Answered ${item.id} (${item.kind}, ${item.scope})`));
    }
    case "projects": {
      const all = await listProjects();
      if (!all.length) console.log("No projects yet. npm run agent -- setup <github-repo>");
      for (const p of all)
        console.log(`${bold(p.slug)}  ${p.repo.owner}/${p.repo.name}  ${p.stack.primary}  base ${p.git.baseBranch}  PR ${p.publish.pullRequest}  tooling ${p.tooling.policy}: ${p.tooling.recipes.join(", ") || "-"}  skills: ${p.tooling.skills.length}`);
      return;
    }
    case "setup": {
      const repoArg = rest[0] ?? values.repo ?? (values.project ? (await loadProfile(values.project))?.repo.url : undefined);
      if (!repoArg) throw new Error("Which repository? npm run agent -- setup owner/name");
      const slug = values.project ?? slugify(parseRepo(repoArg).name, 40);
      // running setup again on a configured project means: reconfigure it
      await setup(repoArg, slug, values.reconfigure || !!(await loadProfile(slug)));
      return;
    }
    case "list": {
      const runs = await listRuns(values.project);
      if (!runs.length) console.log("No runs yet.");
      for (const r of runs) {
        const st = isStale(r) ? "stopped" : r.status;
        console.log(`${r.id}  ${st.padEnd(9)} ${r.step.padEnd(9)} $${r.costUsd.toFixed(2).padStart(6)}  ${dim(r.project)}  ${r.publish?.prUrl ?? r.branch}`);
      }
      return;
    }
    case "show":
      return summary(await needRun(rest[0]));
    case "resume": {
      const r = await needRun(rest[0]);
      return summary(await executeRun({ ...runOptions(r.project), runId: r.id }));
    }
    case "approve":
    case "reject": {
      const r = await needRun(rest[0]);
      if (r.step !== "approval") throw new Error(`Run ${r.id} isn't waiting for approval (step: ${r.step}).`);
      const approval = cmd === "reject" ? { decision: "cancel" as const } : values.feedback ? { decision: "revise" as const, feedback: values.feedback } : { decision: "approve" as const };
      return summary(await executeRun({ ...runOptions(r.project), runId: r.id, approval }));
    }
    case "revise": {
      const r = await needRun(rest[0]);
      const text = rest.slice(1).join(" ").trim() || (values.file ? await readFile(path.resolve(values.file), "utf8") : "");
      if (!text) throw new Error('What should change? npm run agent -- revise <run-id> "…"');
      return summary(await executeRun({ ...runOptions(r.project), runId: r.id, revise: text }));
    }
    case "publish": {
      const r = await needRun(rest[0]);
      if (!r.milestones.some((m) => m.commit)) throw new Error("This run has no commits yet.");
      r.step = "publish";
      if (r.status !== "running" || isStale(r)) r.status = "error";
      await saveRun(r);
      return summary(await executeRun({ ...runOptions(r.project), runId: r.id }));
    }
    case "clean": {
      const runs = values.finished ? (await listRuns(values.project)).filter((r) => ["done", "cancelled"].includes(r.status)) : [await needRun(rest[0])];
      for (const r of runs) {
        if (r.status === "running" && !isStale(r)) {
          console.log(yellow(`skip ${r.id} (running)`));
          continue;
        }
        const p = runPaths(r.project, r.id);
        if (existsSync(p.compose)) await exec("docker", ["compose", "-p", composeProjectName(r.id), "-f", p.compose, "down", "-v", "--remove-orphans"], { timeoutMs: 120_000 });
        for (const d of [p.repo, p.gitDir, p.home]) await rm(d, { recursive: true, force: true });
        console.log(`cleaned ${r.id} (kept run.json, PRD, plan, notes and logs)${r.publish ? "" : " · its branch was never pushed"}`);
      }
      return;
    }
  }

  // a feature request
  let text = positionals.join(" ").trim();
  if (values.file) text = (await readFile(path.resolve(values.file), "utf8")).trim() + (text ? `\n\n${text}` : "");
  if (!text && !values.issue) {
    console.log(HELP);
    process.exitCode = 1;
    return;
  }
  const profile = await resolveProject();
  const run = await executeRun({ ...runOptions(profile.slug), request: text, issue: values.issue });
  summary(run);
  process.exitCode = run.status === "done" || run.status === "waiting" ? 0 : 1;
}

main().catch((e) => {
  console.error(red(`✗ ${(e as Error).message}`));
  process.exitCode = 1;
});

