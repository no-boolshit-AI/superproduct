/**
 * One feature run: clone → workspace → PRD + plan → (approval) → milestones → review → verify → publish.
 * State lives in runs/<project>/<run-id>/run.json, so a stopped run resumes where it left off.
 */
import { createSdkMcpServer, tool, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { askUserTool } from "./agent/ask.js";
import {
  implementPrompt,
  implementSystem,
  planPrompt,
  planSystem,
  projectContext,
  reviewPrompt,
  reviewSystem,
  revisePlanPrompt,
} from "./agent/prompts.js";
import { CODING_TOOLS, describeStop, READONLY_TOOLS, runSession, type SessionResult, type SessionSpec } from "./agent/session.js";
import { catalogMcp, toolingCommands } from "./catalog.js";
import { defaults as envDefaults, type RuntimeKind } from "./config.js";
import { detect, type Facts } from "./detect.js";
import type { ApprovalDecision, DevEvent, Emit, Interaction } from "./events.js";
import {
  applyLocalPolicy,
  cloneFromMirror,
  commitAll,
  configureIdentity,
  currentBranch,
  diffStat,
  fetchBranch,
  fileHash,
  git,
  gitOk,
  head,
  logSince,
  pushBranch,
  registerGitDir,
  status,
  updateMirror,
} from "./git.js";
import { branchUrl, fetchIssue, openOrUpdatePullRequest, type RepoRef } from "./github.js";
import { projectPaths, runPaths, slugify } from "./paths.js";
import { MilestoneInput, PlanInput, renderPlan } from "./plan.js";
import { tail } from "./proc.js";
import { budgetFor, loadProfile, modelFor, readKnowledge, readSecrets, secretsFile, writeSecret, type McpServer, type Profile } from "./profile.js";
import { commitSubject, prBody, prTitle } from "./publish.js";
import { productContextFor, resolveProductFor } from "./product.js";
import { newRunId, pidAlive, readRun, saveRun, type CheckResult, type Milestone, type ReviewFinding, type RunRecord } from "./run-record.js";
import { skillNames } from "./skills.js";
import { createWorkspace, runSteps, type Workspace } from "./workspace/index.js";

export interface RunOptions {
  project: string;
  /** New run: the feature request (and/or an issue). */
  request?: string;
  issue?: string;
  /** Existing run to resume. */
  runId?: string;
  /** Follow-up instructions on a finished (or stopped) run: adds a milestone and publishes again. */
  revise?: string;
  /** A decision for a run waiting for plan approval. */
  approval?: ApprovalDecision;
  /** Absent = unattended (no questions; approval pauses the run). */
  interaction?: Interaction;
  emit?: Emit;
  signal?: AbortSignal;
  runtime?: RuntimeKind;
  model?: string;
  budgetUsd?: number;
  approvePlan?: boolean;
  noPr?: boolean;
  keepWorkspace?: boolean;
  /** Pre-chosen id (the web server picks it to stream events). */
  newRunId?: string;
  /** Product folder for this run: a path, or "none". Default: the project profile's, else one that lists this repo. */
  product?: string;
}

class Stop extends Error {
  constructor(
    public status: RunRecord["status"],
    message: string,
  ) {
    super(message);
  }
}

interface Ctx {
  o: RunOptions;
  run: RunRecord;
  profile: Profile;
  repo: RepoRef;
  paths: ReturnType<typeof runPaths>;
  ws: Workspace;
  emit: Emit;
  facts?: Facts;
  knowledge: string;
  skills: string[];
  bootstrapped: boolean;
  product?: { name: string; context: string };
}

// ---------------------------------------------------------------- entry point

export async function executeRun(o: RunOptions): Promise<RunRecord> {
  const profile = await loadProfile(o.project);
  if (!profile) throw new Error(`Project "${o.project}" isn't set up yet. Run setup first.`);
  const env = envDefaults();
  const repo: RepoRef = { url: profile.repo.url, owner: profile.repo.owner, name: profile.repo.name, github: profile.repo.github };

  let run: RunRecord;
  if (o.runId) {
    const r = await readRun(o.project, o.runId);
    if (!r) throw new Error(`Run not found: ${o.runId}`);
    if (r.pid && r.pid !== process.pid && pidAlive(r.pid)) throw new Error(`Run ${r.id} is active in another process (pid ${r.pid}, ${r.status}). Continue it there, or stop that process first.`);
    run = r;
    if (o.budgetUsd) run.budgetUsd = Math.max(run.budgetUsd, o.budgetUsd);
    if (o.model) run.model = o.model;
  } else {
    let request = (o.request ?? "").trim();
    let issue: RunRecord["issue"];
    if (o.issue) {
      if (!repo.github) throw new Error("--issue needs a GitHub repository.");
      const i = await fetchIssue(repo, o.issue);
      issue = { number: i.number, url: i.url };
      request = request ? `${i.text}\n\nAdditional instructions:\n${request}` : i.text;
    }
    if (!request) throw new Error("Describe the feature (text, --file or --issue).");
    const id = o.newRunId ?? newRunId(issue ? `${issue.number}-${request.split("\n")[0].replace(/^GitHub issue #\d+:\s*/, "")}` : request);
    const now = new Date().toISOString();
    const firstLine = request.split("\n").find((l) => l.trim()) ?? "Feature";
    const title = (issue ? firstLine.replace(/^GitHub issue #\d+:\s*/, "") : firstLine).replace(/^#+\s*/, "").slice(0, 90);
    run = {
      id,
      project: o.project,
      request,
      title,
      issue,
      status: "running",
      step: "clone",
      runtime: o.runtime ?? env.runtime,
      model: modelFor(profile, o.model),
      budgetUsd: budgetFor(profile, o.budgetUsd),
      costUsd: 0,
      sessionCosts: {},
      baseBranch: profile.git.baseBranch,
      branch: `${profile.git.branchPrefix}${slugify(issue ? `${issue.number}-${title}` : title, 48)}`,
      milestones: [],
      revisions: [],
      createdAt: now,
      updatedAt: now,
    };
    await mkdir(runPaths(o.project, id).dir, { recursive: true });
  }
  const paths = runPaths(run.project, run.id);
  await mkdir(paths.logs, { recursive: true });
  if (existsSync(path.join(paths.gitDir, "HEAD"))) registerGitDir(paths.repo, paths.gitDir);
  const checkoutGone = run.step !== "clone" && (!existsSync(path.join(paths.gitDir, "HEAD")) || !existsSync(paths.repo));
  if (checkoutGone && !run.publish) throw new Error(`The checkout of ${run.id} was cleaned before its branch was pushed; start a new run.`);

  if (o.revise) {
    if (run.publish && !checkoutGone) await syncPublishedBranch(run, repo);
    const n = run.revisions.length + 1;
    run.revisions.push({ at: new Date().toISOString(), instructions: o.revise });
    run.milestones.push(newMilestone(`R${n}`, { title: `Revision ${n}`, goal: o.revise, tasks: [o.revise], acceptance: [] }));
    if (["review", "verify", "publish", "done"].includes(run.step)) run.step = "implement";
  }

  const userEmit = o.emit ?? (() => {});
  const emit: Emit = (e: DevEvent) => {
    appendFile(paths.events, JSON.stringify({ t: Date.now(), ...e }) + "\n").catch(() => {});
    userEmit(e);
  };

  const ws = createWorkspace(run.runtime, {
    id: run.id,
    project: run.project,
    config: profile.workspace,
    repoDir: paths.repo,
    gitDir: paths.gitDir,
    homeDir: paths.home,
    pluginDir: projectPaths(run.project).plugin,
    secretsFile: secretsFile(run.project),
    log: (l) => emit({ type: "status", message: l }),
  });
  if (o.product) run.productFlag = o.product;
  const choice = resolveProductFor(profile, o.product ?? run.productFlag);
  const product = choice.product ? { name: choice.product.name, context: productContextFor(choice.product) } : undefined;
  if (product) await writeFile(path.join(paths.dir, "product-context.md"), product.context + "\n");
  run.product = choice.product ? { dir: choice.product.dir, name: choice.product.name, source: choice.source } : null;
  if (choice.product) emit({ type: "status", message: `Product context: ${choice.product.name} (${choice.source})` });
  else if (choice.note) emit({ type: "status", message: choice.note });
  const ctx: Ctx = {
    o,
    run,
    profile,
    repo,
    paths,
    ws,
    emit,
    knowledge: await readKnowledge(run.project),
    skills: await skillNames(projectPaths(run.project).plugin),
    bootstrapped: false,
    product,
  };

  run.status = "running";
  run.pid = process.pid;
  run.error = undefined;
  await saveRun(run);
  emit({ type: "status", message: o.runId ? `Resuming ${run.id} at "${run.step}"` : `Started ${run.id}` });

  try {
    if (checkoutGone) await restoreCheckout(ctx);
    for (;;) {
      if (o.signal?.aborted) throw new Stop("cancelled", "Cancelled");
      emit({ type: "step", step: run.step });
      switch (run.step) {
        case "clone":
          await stepClone(ctx);
          run.step = "workspace";
          break;
        case "workspace":
          await stepWorkspace(ctx);
          run.step = "plan";
          break;
        case "plan":
          await stepPlan(ctx);
          run.step = (o.approvePlan ?? profile.autonomy.approvePlan) ? "approval" : "implement";
          break;
        case "approval":
          await stepApproval(ctx);
          run.step = "implement";
          break;
        case "implement":
          await stepImplement(ctx);
          run.step = "review";
          break;
        case "review":
          await stepReview(ctx);
          run.step = "verify";
          break;
        case "verify":
          await stepVerify(ctx);
          run.step = "publish";
          break;
        case "publish":
          await stepPublish(ctx);
          run.step = "done";
          break;
        case "done":
          run.status = "done";
          break;
      }
      await saveRun(run);
      if (run.status === "done") break;
    }
  } catch (e) {
    if (e instanceof Stop) {
      run.status = e.status;
      run.error = e.status === "waiting" ? undefined : e.message;
      emit({ type: "status", message: e.message });
    } else if (o.signal?.aborted) {
      run.status = "cancelled";
      run.error = "Cancelled";
    } else {
      run.status = "error";
      run.error = (e as Error).message;
      emit({ type: "error", message: run.error });
    }
  } finally {
    run.pid = undefined;
    await saveRun(run);
    if (!o.keepWorkspace) await ws.stop().catch(() => {});
  }
  emit({ type: "done", run, status: run.status });
  return run;
}

/** Before a revision: pick up commits someone pushed to the published branch (fast-forward only). */
async function syncPublishedBranch(run: RunRecord, repo: RepoRef) {
  const dir = runPaths(run.project, run.id).repo;
  const f = await fetchBranch(dir, repo, run.branch);
  if (f.code !== 0) return; // branch deleted remotely or offline: carry on with the local history
  const ff = await git(dir, ["merge", "--ff-only", "-q", `origin/${run.branch}`]);
  if (ff.code !== 0) throw new Error(`The published branch ${run.branch} has diverged from the run's local copy; can't revise safely.\n${tail(ff.output, 10)}`);
  run.headSha = await head(dir);
}

/** After `clean`: check the published branch out again and redo the workspace setup. */
async function restoreCheckout(ctx: Ctx) {
  const { run, repo, paths, profile } = ctx;
  ctx.emit({ type: "status", message: `Restoring the checkout of ${run.branch} (it was cleaned)` });
  const mirror = projectPaths(run.project).mirror;
  await updateMirror(repo, mirror);
  await cloneFromMirror(repo, mirror, paths.repo, run.branch, paths.gitDir);
  await configureIdentity(paths.repo, profile.git.authorName, profile.git.authorEmail);
  run.headSha = await head(paths.repo);
  await stepWorkspace(ctx);
}

/** The agent must leave branches and history to the harness (enforced by the read-only git dir in Docker). */
async function checkGitIntegrity(ctx: Ctx, label: string) {
  const { run, paths } = ctx;
  const branch = await currentBranch(paths.repo);
  const sha = await head(paths.repo).catch(() => "");
  if (branch !== run.branch || (run.headSha && sha !== run.headSha))
    throw new Error(`After ${label}, the checkout is on ${branch || "a detached HEAD"}@${sha.slice(0, 7)} instead of ${run.branch}@${(run.headSha ?? "").slice(0, 7)}. The agent changed git state; inspect ${paths.repo} and resume.`);
}

/** Planning and review are read-only phases: park anything they changed in the working tree. */
async function parkStrayChanges(ctx: Ctx, label: string) {
  const changed = await status(ctx.paths.repo);
  if (!changed.length) return;
  await git(ctx.paths.repo, ["stash", "push", "-u", "-q", "-m", `dev-agent: changes made during ${label}`]);
  ctx.emit({ type: "status", message: `${label} changed ${changed.length} file(s) (${changed.slice(0, 5).map((c) => c.path).join(", ")}); stashed them` });
}

function newMilestone(id: string, m: z.infer<typeof MilestoneInput>): Milestone {
  return { id, title: m.title, goal: m.goal, tasks: m.tasks, acceptance: m.acceptance ?? [], status: "pending", attempts: 0 };
}

// ---------------------------------------------------------------- helpers

function remainingBudget(ctx: Ctx): number {
  return ctx.run.budgetUsd - ctx.run.costUsd;
}

function addCost(ctx: Ctx, label: string, r: SessionResult) {
  const key = r.sessionId ?? `${label}-${Date.now()}`;
  ctx.run.sessionCosts[key] = Math.max(ctx.run.sessionCosts[key] ?? 0, r.costUsd);
  ctx.run.costUsd = Object.values(ctx.run.sessionCosts).reduce((a, b) => a + b, 0);
  ctx.emit({ type: "cost", usd: r.costUsd, total: ctx.run.costUsd, label });
}

function ensureBudget(ctx: Ctx) {
  if (remainingBudget(ctx) < 0.25)
    throw new Stop("error", `Budget used up ($${ctx.run.costUsd.toFixed(2)} of $${ctx.run.budgetUsd}). Resume with a higher --budget to continue.`);
}

async function ensureWorkspace(ctx: Ctx) {
  if (ctx.bootstrapped && (await ctx.ws.isRunning())) return;
  await ctx.ws.start(ctx.o.signal);
  if (!ctx.bootstrapped) {
    const r = await bootstrap(ctx);
    ctx.run.bootstrap = r;
    ctx.bootstrapped = true;
  }
  ctx.facts ??= await detect(ctx.paths.repo);
}

async function bootstrap(ctx: Ctx): Promise<RunRecord["bootstrap"]> {
  const logFile = path.join(ctx.paths.logs, "bootstrap.log");
  const steps = await runSteps(ctx.ws, ctx.profile.workspace.bootstrap, {
    timeoutMs: envDefaults().commandTimeoutMs,
    signal: ctx.o.signal,
    onStep: (r) => ctx.emit({ type: "exec", command: r.command, ok: r.ok, code: r.code, phase: "bootstrap", tail: r.ok ? undefined : r.tail }),
    logSink: (cmd, out) => appendFile(logFile, `$ ${cmd}\n${out}\n`),
  });
  const failed = steps.find((s) => !s.ok);
  return failed ? { ok: false, failed: failed.command, tail: tail(failed.tail, 40) } : { ok: true };
}

function bootstrapNote(ctx: Ctx): string {
  const b = ctx.run.bootstrap;
  if (!b || b.ok) return "";
  return `⚠️ Workspace bootstrap failed at \`${b.failed}\`:\n\`\`\`\n${b.tail}\n\`\`\`\nFix the environment first if it blocks your work (you can run commands yourself), and mention it in your notes.\n`;
}

async function runChecks(ctx: Ctx, label: string): Promise<CheckResult[]> {
  const logFile = path.join(ctx.paths.logs, `${label}.log`);
  const steps = await runSteps(
    ctx.ws,
    ctx.profile.verify.map((v) => v.command),
    {
      timeoutMs: envDefaults().commandTimeoutMs,
      continueOnError: true,
      signal: ctx.o.signal,
      logSink: (cmd, out) => appendFile(logFile, `$ ${cmd}\n${out}\n`),
      onStep: (r) => ctx.emit({ type: "exec", command: r.command, ok: r.ok, code: r.code, phase: label }),
    },
  );
  return steps.map((s, i) => ({ name: ctx.profile.verify[i].name, command: s.command, ok: s.ok, code: s.code, durationMs: s.durationMs, tail: s.tail }));
}

function mcpServersFor(ctx: Ctx, devagent: McpServerConfig): Record<string, McpServerConfig> {
  const extra: Record<string, McpServer> = { ...catalogMcp(ctx.profile.tooling.recipes, ctx.facts ?? null), ...ctx.profile.mcpServers };
  const out: Record<string, McpServerConfig> = { devagent };
  for (const [name, s] of Object.entries(extra)) out[name] = s.type === "http" ? { type: "http", url: s.url, headers: s.headers } : { type: "stdio", command: s.command, args: s.args, env: s.env };
  return out;
}

function context(ctx: Ctx): string {
  const mcp = Object.keys(catalogMcp(ctx.profile.tooling.recipes, ctx.facts ?? null)).concat(Object.keys(ctx.profile.mcpServers));
  return projectContext(ctx.profile, ctx.knowledge, ctx.ws.describe(), { skills: ctx.skills, mcp, product: ctx.product });
}

function sessionBase(ctx: Ctx, label: string, writable: boolean): Omit<SessionSpec, "prompt" | "system" | "tools" | "mcpServers"> {
  const ws = ctx.ws;
  return {
    label,
    workspace: ws,
    plugins: [ws.pluginPath],
    settingSources: ["project"],
    guard: {
      cwd: ws.repoPath,
      writable: writable ? [ws.repoPath] : [],
      readable: ws.kind === "docker" ? "any" : [ws.repoPath, ws.pluginPath],
      hostShell: ws.kind === "local",
    },
    model: ctx.run.model,
    maxTurns: 200,
    maxBudgetUsd: remainingBudget(ctx),
    emit: ctx.emit,
    signal: ctx.o.signal,
  };
}

async function uniqueBranch(ctx: Ctx, wanted: string): Promise<string> {
  const mirror = projectPaths(ctx.run.project).mirror;
  const taken = async (b: string) =>
    (await git(mirror, ["show-ref", "--verify", "--quiet", `refs/heads/${b}`])).code === 0 ||
    (await git(ctx.paths.repo, ["show-ref", "--verify", "--quiet", `refs/heads/${b}`])).code === 0;
  let b = wanted;
  for (let i = 2; await taken(b); i++) b = `${wanted}-${i}`;
  return b;
}

// ---------------------------------------------------------------- steps

async function stepClone(ctx: Ctx) {
  const { run, profile, repo, paths } = ctx;
  ctx.emit({ type: "status", message: `Cloning ${repo.github ? `${repo.owner}/${repo.name}` : repo.url} (${run.baseBranch})` });
  const mirror = projectPaths(run.project).mirror;
  await updateMirror(repo, mirror);
  await cloneFromMirror(repo, mirror, paths.repo, run.baseBranch, paths.gitDir);
  await configureIdentity(paths.repo, profile.git.authorName, profile.git.authorEmail);
  run.baseSha = await head(paths.repo);
  run.headSha = run.baseSha;
  run.branch = await uniqueBranch(ctx, run.branch);
  await gitOk(paths.repo, ["checkout", "-q", "-b", run.branch]);
  ctx.emit({ type: "status", message: `Branch ${run.branch} from ${run.baseBranch}@${run.baseSha.slice(0, 7)}` });
}

async function stepWorkspace(ctx: Ctx) {
  const { run, profile, paths } = ctx;
  await ensureWorkspace(ctx);
  // Bootstrap artifacts (.env, sqlite files, caches, lockfile drift) must never end up in a feature commit.
  const artifacts = await applyLocalPolicy(paths.repo);
  if (artifacts.excluded.length + artifacts.hidden.length + artifacts.restored.length)
    ctx.emit({ type: "status", message: `Kept ${artifacts.excluded.length + artifacts.hidden.length} bootstrap artifact(s) out of git` });

  const cmds = toolingCommands(profile.tooling.recipes, profile.tooling.extraCommands, ctx.facts ?? null);
  if (cmds.length) {
    ctx.emit({ type: "status", message: `Installing dev tooling: ${profile.tooling.recipes.join(", ") || "custom"}` });
    const logFile = path.join(paths.logs, "tooling.log");
    await runSteps(ctx.ws, cmds, {
      timeoutMs: envDefaults().commandTimeoutMs,
      continueOnError: true,
      signal: ctx.o.signal,
      logSink: (cmd, out) => appendFile(logFile, `$ ${cmd}\n${out}\n`),
      onStep: (r) => ctx.emit({ type: "exec", command: r.command, ok: r.ok, code: r.code, phase: "tooling", tail: r.ok ? undefined : r.tail }),
    });
    if (profile.tooling.policy === "commit") {
      const c = await commitAll(paths.repo, `${profile.git.commitStyle === "conventional" ? "chore(dev): " : ""}add AI dev tooling (${profile.tooling.recipes.join(", ") || "custom"})\n\nGenerated by dev-agent.`);
      if (c) {
        run.toolingCommit = c.sha;
        run.headSha = c.sha;
        ctx.emit({ type: "status", message: `Committed tooling (${c.files.length} files) as ${c.sha.slice(0, 7)}` });
      }
    } else {
      run.localTooling = await applyLocalPolicy(paths.repo);
    }
  }
  ctx.facts = await detect(paths.repo);
}

async function stepPlan(ctx: Ctx, feedback?: string) {
  await ensureWorkspace(ctx);
  ensureBudget(ctx);
  const { run, profile, paths } = ctx;
  let prdSaved = false;
  let planSaved = false;
  const clarify = !!ctx.o.interaction && profile.autonomy.clarifyingQuestions;

  const tools = [
    tool("save_prd", "Save the PRD (full markdown document). Call again to replace it.", { markdown: z.string().min(200) }, async ({ markdown }) => {
      await writeFile(paths.prd, markdown.trim() + "\n");
      prdSaved = true;
      ctx.emit({ type: "status", message: `PRD saved (${markdown.split("\n").length} lines)` });
      return { content: [{ type: "text" as const, text: `Saved PRD.md. Now call save_plan.` }] };
    }),
    tool("save_plan", "Save the milestone plan. Call again to replace it (before implementation starts).", PlanInput, async (a) => {
      if (run.milestones.some((m) => m.status !== "pending" && /^M\d/.test(m.id)))
        return { content: [{ type: "text" as const, text: "Implementation already started; the plan can't be replaced now." }], isError: true };
      run.title = a.title;
      // follow-up milestones requested before planning finished are kept after the plan
      const extra = run.milestones.filter((m) => /^[RF]\d/.test(m.id));
      run.milestones = [...a.milestones.map((m, i) => newMilestone(`M${i + 1}`, m)), ...extra];
      const desired = a.branchSlug ? `${profile.git.branchPrefix}${a.branchSlug}` : run.branch;
      if (!run.publish && desired !== run.branch && !run.branch.startsWith(`${desired}-`)) {
        const wanted = await uniqueBranch(ctx, desired);
        await gitOk(paths.repo, ["branch", "-m", run.branch, wanted]);
        run.branch = wanted;
      }
      await writeFile(paths.plan, renderPlan(run));
      await saveRun(run);
      planSaved = true;
      ctx.emit({ type: "status", message: `Plan saved: ${run.milestones.map((m) => `${m.id} ${m.title}`).join(" · ")}` });
      return { content: [{ type: "text" as const, text: `Saved PLAN.md with ${run.milestones.length} milestone(s) on branch ${run.branch}. Reply with a three-line summary and stop.` }] };
    }),
  ];
  if (clarify) tools.push(askUserTool({ interaction: ctx.o.interaction!, emit: ctx.emit, storeSecret: (k, v) => writeSecret(run.project, k, v), hasSecret: async (k) => k in (await readSecrets(run.project)) }) as unknown as (typeof tools)[number]);
  const server = createSdkMcpServer({ name: "devagent", version: "1.0.0", tools });

  const base = { ...sessionBase(ctx, "plan", false), system: planSystem({ context: context(ctx), clarify }), tools: READONLY_TOOLS, mcpServers: mcpServersFor(ctx, server) };
  const onSessionId = async (id: string) => {
    run.planSessionId = id;
    await saveRun(run);
  };
  let r: SessionResult;
  if (feedback && run.planSessionId) r = await runSession({ ...base, resume: run.planSessionId, prompt: revisePlanPrompt(feedback), onSessionId });
  else r = await runSession({ ...base, prompt: planPrompt(run, bootstrapNote(ctx)), onSessionId });
  addCost(ctx, "plan", r);
  if (r.aborted) throw new Stop("cancelled", "Cancelled");
  if (!feedback && (!prdSaved || !planSaved) && r.ok && r.sessionId) {
    ensureBudget(ctx);
    r = await runSession({ ...base, maxBudgetUsd: remainingBudget(ctx), resume: r.sessionId, prompt: `You haven't called ${!prdSaved ? "save_prd" : "save_plan"} yet. Do it now.`, onSessionId });
    addCost(ctx, "plan", r);
  }
  await checkGitIntegrity(ctx, "planning");
  await parkStrayChanges(ctx, "planning");
  if (!existsSync(paths.prd) || !run.milestones.length) throw new Error(`Planning didn't produce a PRD and plan: ${r.ok ? "the agent stopped early" : describeStop(r, remainingBudget(ctx))}.`);

  if (profile.docs.commitToRepo) {
    const dir = path.join(paths.repo, profile.docs.dir, slugify(run.title, 48));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "PRD.md"), await readFile(paths.prd, "utf8"));
    await writeFile(path.join(dir, "PLAN.md"), await readFile(paths.plan, "utf8"));
    const c = await commitAll(paths.repo, `${profile.git.commitStyle === "conventional" ? "docs: " : ""}${feedback ? "update" : "add"} PRD and plan for ${run.title}`);
    if (c) {
      run.docsCommit = c.sha;
      run.headSha = c.sha;
    }
  }
}

async function stepApproval(ctx: Ctx) {
  const { run, paths } = ctx;
  for (;;) {
    let d: ApprovalDecision;
    if (ctx.o.approval) {
      d = ctx.o.approval;
      ctx.o.approval = undefined;
    } else if (ctx.o.interaction) {
      run.status = "waiting";
      await saveRun(run);
      ctx.emit({ type: "status", message: "Waiting for your approval of the PRD and plan" });
      d = await ctx.o.interaction.approve({ runId: run.id, prd: paths.prd, plan: paths.plan });
      run.status = "running";
    } else d = { decision: "cancel", feedback: "__pause__" };

    if (d.decision === "approve") {
      ctx.emit({ type: "status", message: "Plan approved" });
      return;
    }
    if (d.decision === "cancel" && d.feedback === "__pause__")
      throw new Stop("waiting", `Waiting for plan approval. Review ${paths.prd} and ${paths.plan}, then run: npm run agent -- approve ${run.id} [--feedback "…"]`);
    if (d.decision === "cancel") throw new Stop("cancelled", "Plan rejected; run stopped.");
    ctx.emit({ type: "status", message: "Revising the PRD and plan with your feedback" });
    await stepPlan(ctx, d.feedback ?? "");
    await saveRun(run);
  }
}

async function stepImplement(ctx: Ctx) {
  for (const m of ctx.run.milestones) {
    if (m.status === "done" || m.status === "done_with_issues" || m.status === "skipped") continue;
    await implementMilestone(ctx, m);
  }
}

async function implementMilestone(ctx: Ctx, m: Milestone) {
  const { run, profile, paths } = ctx;
  await ensureWorkspace(ctx);
  ensureBudget(ctx);
  const index = run.milestones.indexOf(m) + 1;
  m.status = "in_progress";
  m.attempts++;
  await saveRun(run);
  ctx.emit({ type: "milestone", id: m.id, title: m.title, status: m.status });

  let completed = false;
  let blocked: string | null = null;
  let verifyFailures = 0;
  const clarify = !!ctx.o.interaction && profile.autonomy.clarifyingQuestions;

  const tools = [
    tool(
      "complete_milestone",
      "Finish this milestone: dev-agent runs the verify commands and, if they pass, commits your changes. If they fail you get the output.",
      {
        summary: z.string().min(10).describe("What you implemented and how you tested it (2-6 sentences)"),
        commitSubject: z.string().max(100).optional().describe("Commit subject line (conventional commits if the project uses them)"),
        notes: z.string().default("").describe("Notes for later sessions: decisions, gotchas, follow-ups"),
        knownIssues: z.string().optional().describe("Only for failures you can't fix within this milestone (pre-existing/unrelated): what and why"),
      },
      async (a) => {
        const checks = profile.verify.length ? await runChecks(ctx, `verify-${m.id}-${verifyFailures + 1}`) : [];
        const failed = checks.filter((c) => !c.ok);
        if (failed.length) {
          verifyFailures++;
          if (!(a.knownIssues && verifyFailures >= 2)) {
            const detail = failed.map((c) => `✗ ${c.name}: \`${c.command}\` (exit ${c.code})\n${c.tail}`).join("\n\n");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Verification failed (attempt ${verifyFailures}). Nothing was committed.\n\n${detail}\n\nFix it and call complete_milestone again.${verifyFailures >= 2 ? " If a failure is pre-existing or unrelated to this feature and can't be fixed here, call again with knownIssues explaining it." : ""}`,
                },
              ],
              isError: true,
            };
          }
        }
        const subject = commitSubject(a.commitSubject ?? m.title, profile.git.commitStyle);
        const body = [a.summary.trim(), "", `Milestone ${m.id} of "${run.title}".`, ...(a.knownIssues && failed.length ? ["", `Known issues: ${a.knownIssues}`] : []), "", `Generated by dev-agent (run ${run.id}).`].join("\n");
        const c = await commitAll(paths.repo, `${subject}\n\n${body}`);
        if (!c && !a.knownIssues)
          return {
            content: [{ type: "text" as const, text: "There are no changes to commit. Implement the milestone first, or if it truly needs no changes, call again with knownIssues explaining why." }],
            isError: true,
          };
        m.status = failed.length ? "done_with_issues" : "done";
        m.commit = c?.sha;
        if (c) run.headSha = c.sha;
        m.summary = a.summary.trim();
        m.knownIssues = failed.length || !c ? a.knownIssues : undefined;
        const note = [`## ${m.id}: ${m.title}${c ? ` (${c.sha.slice(0, 7)})` : ""}`, "", a.summary.trim(), a.notes.trim() ? `\n${a.notes.trim()}` : "", ""].join("\n");
        await appendFile(paths.notes, note + "\n");
        await writeFile(paths.plan, renderPlan(run));
        await saveRun(run);
        completed = true;
        ctx.emit({ type: "milestone", id: m.id, title: m.title, status: m.status, commit: c?.sha });
        const skipped = c?.skipped.length ? ` Not committed (over 5 MB): ${c.skipped.join(", ")}.` : "";
        const hiddenEdits: string[] = [];
        for (const [f, h] of Object.entries(run.localTooling?.hiddenHashes ?? {})) if ((await fileHash(paths.repo, f)) !== h) hiddenEdits.push(f);
        const hiddenNote = hiddenEdits.length ? ` Note: ${hiddenEdits.join(", ")} hold workspace-only tooling changes and are never committed; your edits there stay local.` : "";
        return {
          content: [
            {
              type: "text" as const,
              text: `${c ? `Committed ${c.sha.slice(0, 7)} (${c.files.length} files: ${c.files.slice(0, 30).join(", ")}${c.files.length > 30 ? ", …" : ""}).` : "Marked done without a commit."}${skipped} Milestone ${m.id} is done.${hiddenNote} End your turn now; the next milestone starts in a fresh session.`,
            },
          ],
        };
      },
    ),
    tool(
      "report_blocker",
      "Stop the run because something outside your control blocks this milestone (missing credentials/services, contradictory requirements).",
      { reason: z.string().min(10), needed: z.string().min(5).describe("What the developer must provide or decide") },
      async ({ reason, needed }) => {
        blocked = `${reason}\nNeeded: ${needed}`;
        return { content: [{ type: "text" as const, text: "Recorded. End your turn now." }] };
      },
    ),
  ];
  if (clarify) tools.push(askUserTool({ interaction: ctx.o.interaction!, emit: ctx.emit, storeSecret: (k, v) => writeSecret(run.project, k, v), hasSecret: async (k) => k in (await readSecrets(run.project)) }) as unknown as (typeof tools)[number]);
  const server = createSdkMcpServer({ name: "devagent", version: "1.0.0", tools });

  const prd = existsSync(paths.prd) ? await readFile(paths.prd, "utf8") : "(no PRD)";
  const notes = existsSync(paths.notes) ? await readFile(paths.notes, "utf8") : "";
  const base = {
    ...sessionBase(ctx, m.id, true),
    system: implementSystem({ context: context(ctx), clarify, verify: profile.verify.length > 0 }),
    tools: CODING_TOOLS,
    mcpServers: mcpServersFor(ctx, server),
    onSessionId: async (id: string) => {
      m.sessionId = id;
      await saveRun(run);
    },
  };
  const prompt = implementPrompt({
    run,
    milestone: m,
    index,
    total: run.milestones.length,
    prd,
    plan: renderPlan(run),
    notes,
    gitLog: await logSince(paths.repo, run.baseSha ?? run.baseBranch),
    bootstrapNote: bootstrapNote(ctx),
  });
  let r = await runSession({ ...base, prompt });
  addCost(ctx, m.id, r);
  for (let nudge = 0; !completed && !blocked && r.ok && r.sessionId && nudge < 2; nudge++) {
    ensureBudget(ctx);
    r = await runSession({
      ...base,
      maxBudgetUsd: remainingBudget(ctx),
      resume: r.sessionId,
      prompt: "You ended your turn without calling complete_milestone. Finish the milestone and call complete_milestone (or report_blocker if you're truly blocked).",
    });
    addCost(ctx, m.id, r);
  }
  await saveRun(run);
  if (r.aborted) throw new Stop("cancelled", "Cancelled");
  await checkGitIntegrity(ctx, m.id);
  if (blocked) throw new Stop("blocked", `Blocked on ${m.id}: ${blocked}`);
  if (!completed) throw new Error(`${m.id} wasn't completed: ${r.ok ? "the agent stopped without calling complete_milestone" : describeStop(r, remainingBudget(ctx))}. Resume the run to continue.`);
}

async function stepReview(ctx: Ctx) {
  const { run, profile, paths } = ctx;
  const rounds = profile.autonomy.reviewRounds;
  if (rounds === 0) return;
  // a fix milestone interrupted by a stop/budget limit is finished before anything else
  for (const m of run.milestones) if (/^F\d/.test(m.id) && !["done", "done_with_issues", "skipped"].includes(m.status)) await implementMilestone(ctx, m);
  const done = run.review?.rounds ?? 0;
  for (let round = done + 1; round <= rounds; round++) {
    await ensureWorkspace(ctx);
    ensureBudget(ctx);
    let submitted: { verdict: "approve" | "changes_requested"; summary: string; findings: ReviewFinding[] } | null = null;
    const server = createSdkMcpServer({
      name: "devagent",
      version: "1.0.0",
      tools: [
        tool(
          "submit_review",
          "Submit the review result.",
          {
            verdict: z.enum(["approve", "changes_requested"]),
            summary: z.string().min(10),
            findings: z
              .array(
                z.object({
                  severity: z.enum(["blocker", "major", "minor", "nit"]),
                  title: z.string(),
                  detail: z.string(),
                  file: z.string().optional(),
                  line: z.number().int().optional(),
                  suggestion: z.string().optional(),
                }),
              )
              .default([]),
          },
          async (a) => {
            submitted = a as typeof submitted;
            return { content: [{ type: "text" as const, text: "Review recorded. End your turn." }] };
          },
        ),
      ],
    });
    const prd = existsSync(paths.prd) ? await readFile(paths.prd, "utf8") : "";
    const base = run.baseSha ?? run.baseBranch;
    const r = await runSession({
      ...sessionBase(ctx, `review ${round}`, false),
      system: reviewSystem({ context: context(ctx) }),
      prompt: reviewPrompt({ run, prd, diffStat: await diffStat(paths.repo, base), gitLog: await logSince(paths.repo, base) }),
      tools: READONLY_TOOLS,
      mcpServers: mcpServersFor(ctx, server),
    });
    addCost(ctx, `review ${round}`, r);
    if (r.aborted) throw new Stop("cancelled", "Cancelled");
    await checkGitIntegrity(ctx, "the review");
    await parkStrayChanges(ctx, "the review");
    const sub = submitted as { verdict: "approve" | "changes_requested"; summary: string; findings: ReviewFinding[] } | null;
    if (!sub) {
      ctx.emit({ type: "status", message: `Review round ${round} produced no verdict (${r.ok ? "no submit_review" : describeStop(r, remainingBudget(ctx))}); continuing.` });
      run.review = { verdict: "approve", summary: "Automated review did not complete.", findings: [], rounds: round };
      return;
    }
    run.review = { ...sub, rounds: round };
    await saveRun(run);
    const serious = sub.findings.filter((f) => f.severity === "blocker" || f.severity === "major");
    ctx.emit({ type: "status", message: `Review round ${round}: ${sub.verdict}${sub.findings.length ? ` (${sub.findings.length} findings, ${serious.length} blocker/major)` : ""}` });
    if (sub.verdict === "approve" || !serious.length) return;
    const fix = newMilestone(`F${round}`, {
      title: `Address review findings${rounds > 1 ? ` (round ${round})` : ""}`,
      goal: "Fix the blocker and major findings from the automated review. Keep the fixes focused.",
      tasks: serious.map((f) => `[${f.severity}] ${f.file ? `${f.file}${f.line ? `:${f.line}` : ""}: ` : ""}${f.title}. ${f.detail}${f.suggestion ? ` Suggested fix: ${f.suggestion}` : ""}`),
      acceptance: ["Each finding is fixed or, if it's wrong, explained in the summary", "Verify commands pass"],
    });
    run.milestones.push(fix);
    await saveRun(run);
    await implementMilestone(ctx, fix);
  }
}

async function stepVerify(ctx: Ctx) {
  const { run } = ctx;
  await ensureWorkspace(ctx);
  ctx.emit({ type: "status", message: "Final verification" });
  const checks = await runChecks(ctx, "verify-final");
  run.verification = { at: new Date().toISOString(), ok: checks.every((c) => c.ok), checks };
  ctx.emit({ type: "status", message: run.verification.ok ? "All checks pass" : `Failing: ${checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}` });
}

async function stepPublish(ctx: Ctx) {
  const { run, profile, repo, paths } = ctx;
  const commits = await logSince(paths.repo, run.baseSha ?? run.baseBranch);
  if (!commits) throw new Error("No commits on the feature branch; nothing to publish.");
  ctx.emit({ type: "status", message: `Pushing ${run.branch}` });
  await pushBranch(paths.repo, repo, run.branch);
  run.publish = { at: new Date().toISOString(), branchUrl: branchUrl(repo, run.branch) };
  const wantPr = profile.publish.pullRequest !== "none" && !ctx.o.noPr;
  if (wantPr && repo.github) {
    try {
      const prd = existsSync(paths.prd) ? await readFile(paths.prd, "utf8") : "";
      const pr = await openOrUpdatePullRequest(repo, {
        head: run.branch,
        base: run.baseBranch,
        title: prTitle(run, profile),
        body: prBody(run, profile, repo, prd),
        draft: profile.publish.pullRequest === "draft" || !run.verification?.ok,
        reviewers: profile.publish.reviewers,
        labels: profile.publish.labels,
      });
      run.publish.prUrl = pr.html_url;
      run.publish.prNumber = pr.number;
      ctx.emit({ type: "status", message: `${pr.created ? "Opened" : "Updated"} pull request #${pr.number}` });
    } catch (e) {
      ctx.emit({ type: "status", message: `Branch pushed, but the pull request failed: ${(e as Error).message}` });
    }
  }
  ctx.emit({ type: "publish", branch: run.branch, branchUrl: run.publish.branchUrl, prUrl: run.publish.prUrl });
}
