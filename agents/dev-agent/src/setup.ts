/**
 * First-run setup of a project: detect the stack, interview the developer, install dev skills, make the workspace
 * bootstrap and verify cleanly, and save the profile + project knowledge.
 */
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { askUserTool } from "./agent/ask.js";
import { setupPrompt, setupSystem } from "./agent/prompts.js";
import { describeStop, runSession } from "./agent/session.js";
import { CATALOG, catalogEntry, describeCatalog, toolingCommands, type SkillSource } from "./catalog.js";
import { defaults as envDefaults, type RuntimeKind } from "./config.js";
import { detect, type Facts } from "./detect.js";
import type { DevEvent, Emit, Interaction } from "./events.js";
import { cloneFromMirror, remoteDefaultBranch, status, updateMirror } from "./git.js";
import { parseRepo, type RepoRef } from "./github.js";
import { DOCKER_DIR, projectPaths, slugify } from "./paths.js";
import { tail } from "./proc.js";
import {
  loadProfile,
  McpServerSchema,
  readSecrets,
  ProfileSchema,
  saveProfile,
  secretsFile,
  STACKS,
  VerifyStepSchema,
  WorkspaceSchema,
  writeSecret,
  type Profile,
  type WorkspaceConfig,
} from "./profile.js";
import { ensurePlugin, installSkills, skillNames } from "./skills.js";
import { claudeAuthEnv, PARENT_SESSION_VARS } from "./workspace/types.js";
import { createWorkspace, runSteps, type Workspace } from "./workspace/index.js";

export interface SetupOptions {
  repo: string;
  slug?: string;
  name?: string;
  interaction: Interaction;
  emit?: Emit;
  signal?: AbortSignal;
  runtime?: RuntimeKind;
  model?: string;
  budgetUsd?: number;
  reconfigure?: boolean;
}

interface SetupState {
  sessionId?: string;
  repo: string;
  startedAt: string;
}

const TOOLING_SCHEMA = {
  policy: z.enum(["commit", "local"]).describe("local: tooling stays in the workspace; commit: one chore commit at the start of each feature branch"),
  recipes: z.array(z.string()).describe("Catalog ids whose repo tooling commands / MCP servers to use"),
  extraCommands: z.array(z.string()).default([]).describe("Custom tooling commands run after bootstrap (non-interactive)"),
};

export async function setupProject(o: SetupOptions): Promise<Profile> {
  const repo = parseRepo(o.repo);
  const slug = o.slug ?? slugify(repo.name, 40);
  const p = projectPaths(slug);
  const existing = await loadProfile(slug);
  if (existing && !o.reconfigure) return existing;
  const env = envDefaults();
  const runtime = o.runtime ?? env.runtime;
  await mkdir(p.setup, { recursive: true });

  const eventsFile = path.join(p.setup, "events.jsonl");
  const emit: Emit = (e: DevEvent) => {
    appendFile(eventsFile, JSON.stringify({ t: Date.now(), ...e }) + "\n").catch(() => {});
    o.emit?.(e);
  };
  emit({ type: "step", step: "setup" });
  emit({ type: "status", message: `Setting up ${repo.github ? `${repo.owner}/${repo.name}` : repo.url} as project "${slug}"` });

  let defaultBranch: string;
  try {
    defaultBranch = await remoteDefaultBranch(repo);
  } catch (e) {
    throw new Error(
      `Can't reach ${repo.url}. ${repo.github ? "For private repos set GITHUB_TOKEN in .env (fine-grained token: Contents read/write, Pull requests read/write) or log in with `gh auth login`." : ""}\n${(e as Error).message}`,
    );
  }
  emit({ type: "status", message: `Fetching ${defaultBranch}` });
  await updateMirror(repo, p.mirror);
  const probe = p.setupRepo;
  await cloneFromMirror(repo, p.mirror, probe, existing?.git.baseBranch ?? defaultBranch, p.setupGitDir);
  const facts = await detect(probe);
  await writeFile(path.join(p.dir, "facts.json"), JSON.stringify(facts, null, 2));
  emit({ type: "status", message: `Detected ${facts.primary}${facts.frameworks.length ? ` (${facts.frameworks.join(", ")})` : ""}` });
  await ensurePlugin(p.plugin, slug);

  const stateFile = path.join(p.setup, "state.json");
  const state: SetupState = existsSync(stateFile) ? JSON.parse(await readFile(stateFile, "utf8")) : { repo: repo.url, startedAt: new Date().toISOString() };

  const ctx: SetupCtx = { slug, repo, defaultBranch, facts, probe, runtime, emit, signal: o.signal, verifiedHash: null, saved: null, existing, name: o.name };
  const server = createSdkMcpServer({
    name: "devagent",
    version: "1.0.0",
    tools: [
      askUserTool({ interaction: o.interaction, emit, storeSecret: (k, v) => writeSecret(slug, k, v), hasSecret: async (k) => k in (await readSecrets(slug)) }),
      installSkillsTool(ctx),
      testWorkspaceTool(ctx),
      workspaceExecTool(ctx),
      saveProfileTool(ctx),
    ],
  });

  const model = o.model ?? existing?.limits.model ?? env.model;
  const budget = o.budgetUsd ?? env.setupBudgetUsd;
  const hostEnv: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) if (!PARENT_SESSION_VARS.test(k)) hostEnv[k] = v;
  const common = {
    label: "setup",
    system: setupSystem({ defaultsApprove: process.env.APPROVE_PLAN === "1", runtime }),
    cwd: probe,
    tools: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
    mcpServers: { devagent: server },
    settingSources: [] as [],
    guard: { cwd: probe, writable: [], readable: [probe, p.plugin, DOCKER_DIR], noBash: true },
    model,
    maxTurns: 150,
    env: { ...hostEnv, ...claudeAuthEnv() },
    emit,
    signal: o.signal,
    onSessionId: async (id: string) => {
      state.sessionId = id;
      await writeFile(stateFile, JSON.stringify(state, null, 2));
    },
  };

  try {
    let spent = 0;
    let r = await runSession({
      ...common,
      prompt: setupPrompt({ repo: repo.github ? `${repo.owner}/${repo.name}` : repo.url, facts, catalog: describeCatalog(facts), skillsInstalled: await skillNames(p.plugin), previous: existing }),
      maxBudgetUsd: budget,
    });
    spent += r.costUsd;
    if (!ctx.saved && r.ok && r.sessionId && !o.signal?.aborted) {
      r = await runSession({
        ...common,
        resume: r.sessionId,
        prompt: "You haven't called save_profile yet. Finish the setup now: test_workspace if needed, then save_profile.",
        maxBudgetUsd: Math.max(0.5, budget - spent),
      });
      spent += r.costUsd;
    }
    emit({ type: "cost", usd: spent, total: spent, label: "setup" });
    if (!ctx.saved) throw new Error(`Setup didn't finish: ${r.ok ? "the agent ended without saving the profile" : describeStop(r, budget)}. Run setup again to continue.`);
    await writeFile(stateFile, JSON.stringify({ ...state, sessionId: undefined, finishedAt: new Date().toISOString() }, null, 2));
    emit({ type: "done", project: slug, status: "done" });
    return ctx.saved;
  } catch (e) {
    emit({ type: "error", message: (e as Error).message });
    emit({ type: "done", project: slug, status: "error" });
    throw e;
  } finally {
    await ctx.ws?.stop().catch(() => {});
  }
}

interface SetupCtx {
  slug: string;
  name?: string;
  repo: RepoRef;
  defaultBranch: string;
  facts: Facts;
  probe: string;
  runtime: RuntimeKind;
  emit: Emit;
  signal?: AbortSignal;
  ws?: Workspace;
  wsHash?: string;
  verifiedHash: string | null;
  lastReport?: string;
  saved: Profile | null;
  existing: Profile | null;
}

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });

function installSkillsTool(ctx: SetupCtx) {
  return tool(
    "install_skills",
    "Install agent skills into the project's skill plugin: catalog ids and/or custom GitHub sources (repo owner/name, optional ref, folders that contain SKILL.md).",
    {
      catalogIds: z.array(z.string()).default([]),
      custom: z
        .array(z.object({ repo: z.string(), ref: z.string().optional(), paths: z.array(z.string()).min(1) }))
        .default([]),
    },
    async ({ catalogIds, custom }) => {
      const sources: SkillSource[] = [];
      const unknown: string[] = [];
      for (const id of catalogIds) {
        const e = catalogEntry(id);
        if (!e) unknown.push(id);
        else if (e.skills) sources.push(...e.skills);
      }
      sources.push(...custom);
      if (!sources.length) return text(unknown.length ? `Unknown catalog ids: ${unknown.join(", ")}` : "Nothing to install (those entries have no skills).", !!unknown.length);
      ctx.emit({ type: "status", message: `Installing skills from ${sources.map((s) => s.repo).join(", ")}` });
      const r = await installSkills(projectPaths(ctx.slug).plugin, ctx.slug, sources, (m) => ctx.emit({ type: "status", message: m }));
      return text(
        [
          r.installed.length ? `Installed: ${r.installed.map((s) => `${s.name} (${s.repo})`).join(", ")}` : "Nothing installed.",
          r.errors.length ? `Errors:\n${r.errors.join("\n")}` : "",
          unknown.length ? `Unknown catalog ids: ${unknown.join(", ")}` : "",
          `All skills in the plugin: ${(await skillNames(projectPaths(ctx.slug).plugin)).join(", ") || "none"}`,
        ]
          .filter(Boolean)
          .join("\n"),
        r.errors.length > 0 && !r.installed.length,
      );
    },
  );
}

function configHash(x: unknown): string {
  return createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
}

function testWorkspaceTool(ctx: SetupCtx) {
  return tool(
    "test_workspace",
    "Start a fresh workspace with this configuration and run bootstrap, repo tooling and verify commands. Reports every step. The workspace stays up for workspace_exec until the next test_workspace.",
    {
      workspace: WorkspaceSchema,
      tooling: z.object(TOOLING_SCHEMA),
      verify: z.array(VerifyStepSchema),
      keepDependencies: z.boolean().default(false).describe("Reuse the previous checkout (vendor/, node_modules/) for a faster retry instead of a fresh clone"),
    },
    async ({ workspace, tooling, verify, keepDependencies }) => {
      const p = projectPaths(ctx.slug);
      const hash = configHash({ workspace, tooling: { ...tooling, policy: undefined }, verify });
      const imageAffecting = configHash({ base: workspace.base, versions: workspace.versions, apt: workspace.aptPackages, ext: workspace.phpExtensions, pw: workspace.playwright, img: workspace.customImage, services: workspace.services, env: workspace.env });
      const lines: string[] = [];
      let freshRun = false;
      try {
        if (ctx.ws && (!keepDependencies || ctx.wsHash !== imageAffecting)) {
          await ctx.ws.stop();
          ctx.ws = undefined;
        }
        const fresh = !keepDependencies || !existsSync(path.join(p.setupGitDir, "HEAD"));
        freshRun = fresh && !ctx.ws;
        if (fresh) {
          await cloneFromMirror(ctx.repo, p.mirror, ctx.probe, ctx.existing?.git.baseBranch ?? ctx.defaultBranch, p.setupGitDir);
        }
        if (!ctx.ws) {
          ctx.ws = createWorkspace(ctx.runtime, {
            id: `setup-${ctx.slug}`,
            project: ctx.slug,
            config: workspace as WorkspaceConfig,
            repoDir: ctx.probe,
            gitDir: p.setupGitDir,
            homeDir: path.join(p.setup, "home"),
            pluginDir: p.plugin,
            secretsFile: secretsFile(ctx.slug),
            log: (l) => ctx.emit({ type: "status", message: l }),
          });
          ctx.wsHash = imageAffecting;
          await ctx.ws.start(ctx.signal);
        }
      } catch (e) {
        ctx.ws = undefined;
        return text(`Workspace failed to start:\n${tail((e as Error).message, 60)}`, true);
      }
      const ws = ctx.ws;
      const timeoutMs = envDefaults().commandTimeoutMs;
      const report = (label: string, r: { command: string; ok: boolean; durationMs: number; tail: string; timedOut: boolean }) => {
        lines.push(`${r.ok ? "✓" : "✗"} ${label}: ${r.command} (${(r.durationMs / 1000).toFixed(1)}s${r.timedOut ? ", timed out" : ""})`);
        if (!r.ok) lines.push(r.tail.split("\n").map((l) => `    ${l}`).join("\n"));
        ctx.emit({ type: "exec", command: r.command, ok: r.ok, phase: label });
      };
      const boot = await runSteps(ws, workspace.bootstrap, { timeoutMs, onStep: (r) => report("bootstrap", r), signal: ctx.signal });
      let ok = boot.every((r) => r.ok);
      if (ok) {
        const tool = toolingCommands(tooling.recipes, tooling.extraCommands, ctx.facts);
        const tr = await runSteps(ws, tool, { timeoutMs, onStep: (r) => report("tooling", r), signal: ctx.signal });
        ok = tr.every((r) => r.ok);
        const changed = await status(ctx.probe);
        lines.push(
          changed.length
            ? `Working tree changes after bootstrap + tooling (with policy "${tooling.policy}" these are ${tooling.policy === "commit" ? "committed as a chore commit (bootstrap artifacts are excluded first)" : "kept local only"}):\n${changed.map((c) => `  ${c.code} ${c.path}`).join("\n")}`
            : "Working tree is clean after bootstrap + tooling.",
        );
        if (ok) {
          const vr = await runSteps(ws, verify.map((v) => v.command), { timeoutMs, continueOnError: true, onStep: (r, i) => report(`verify ${verify[i].name}`, r), signal: ctx.signal });
          ok = vr.every((r) => r.ok);
        }
      }
      // only a run on a fresh clone and container proves the config (workspace_exec fixes don't count)
      ctx.verifiedHash = ok && freshRun ? hash : null;
      lines.unshift(
        !ok
          ? "Some steps failed (details below). Fix the configuration and run test_workspace again."
          : freshRun
            ? "All steps passed. You can save_profile with exactly this configuration."
            : "All steps passed on the reused checkout. Run test_workspace once more without keepDependencies to verify on a fresh clone before saving.",
      );
      ctx.lastReport = lines.join("\n");
      return text(ctx.lastReport, !ok);
    },
  );
}

function workspaceExecTool(ctx: SetupCtx) {
  return tool(
    "workspace_exec",
    "Run a shell command in the workspace started by the last test_workspace (repo root, non-interactive).",
    { command: z.string().min(1), timeoutSec: z.number().int().min(5).max(3600).default(300) },
    async ({ command, timeoutSec }) => {
      if (!ctx.ws) return text("No workspace is running. Call test_workspace first.", true);
      ctx.emit({ type: "exec", command, phase: "setup" });
      const r = await ctx.ws.exec(command, { timeoutMs: timeoutSec * 1000, signal: ctx.signal });
      return text(`exit ${r.code}${r.timedOut ? " (timed out)" : ""}\n${tail(r.output, 150)}`, r.code !== 0);
    },
  );
}

function saveProfileTool(ctx: SetupCtx) {
  return tool(
    "save_profile",
    "Save the verified project profile and the project knowledge. Use exactly the workspace/tooling/verify config that last passed test_workspace.",
    {
      name: z.string().optional().describe("Display name of the project"),
      stack: z.object({ primary: z.enum(STACKS), frameworks: z.array(z.string()), summary: z.string().max(400) }),
      git: z.object({
        baseBranch: z.string(),
        branchPrefix: z.string().regex(/^[\w./-]*$/),
        commitStyle: z.enum(["conventional", "plain"]),
        authorName: z.string().optional(),
        authorEmail: z.string().optional(),
      }),
      publish: z.object({ pullRequest: z.enum(["draft", "ready", "none"]), reviewers: z.array(z.string()).default([]), labels: z.array(z.string()).default([]) }),
      autonomy: z.object({ approvePlan: z.boolean(), clarifyingQuestions: z.boolean(), reviewRounds: z.number().int().min(0).max(3) }),
      docs: z.object({ commitToRepo: z.boolean(), dir: z.string().default("docs/features") }),
      tooling: z.object(TOOLING_SCHEMA),
      workspace: WorkspaceSchema,
      verify: z.array(VerifyStepSchema),
      mcpServers: z.record(z.string(), McpServerSchema).default({}).describe("Extra MCP servers beyond the catalog ones (run inside the workspace)"),
      limits: z.object({ model: z.string().optional(), maxBudgetUsd: z.number().positive().optional() }).default({}),
      notes: z.string().default("").describe("Conventions and instructions from the developer, verbatim where possible"),
      knowledge: z.string().min(100).describe("PROJECT.md: architecture, key paths, conventions, how to run things, gotchas"),
      unverifiedReason: z.string().optional().describe("Only if test_workspace could not be made to pass: why, and what the developer said"),
    },
    async (a) => {
      const hash = configHash({ workspace: a.workspace, tooling: { ...a.tooling, policy: undefined }, verify: a.verify });
      if (ctx.verifiedHash !== hash && !a.unverifiedReason)
        return text("This configuration hasn't passed test_workspace. Run test_workspace with exactly this workspace/tooling/verify config first (or pass unverifiedReason).", true);
      const unknown = a.tooling.recipes.filter((id) => !CATALOG.some((e) => e.id === id));
      if (unknown.length) return text(`Unknown catalog ids in tooling.recipes: ${unknown.join(", ")}`, true);
      const now = new Date().toISOString();
      const p = projectPaths(ctx.slug);
      const needsPlaywright = a.tooling.recipes.some((id) => catalogEntry(id)?.needsPlaywright);
      const profile: Profile = ProfileSchema.parse({
        version: 1,
        slug: ctx.slug,
        name: a.name || ctx.name || ctx.existing?.name || `${ctx.repo.owner}/${ctx.repo.name}`,
        repo: { url: ctx.repo.url, owner: ctx.repo.owner, name: ctx.repo.name, github: ctx.repo.github, defaultBranch: ctx.defaultBranch },
        stack: a.stack,
        git: {
          ...a.git,
          authorName: a.git.authorName || process.env.DEVAGENT_AUTHOR_NAME || "dev-agent",
          authorEmail: a.git.authorEmail || process.env.DEVAGENT_AUTHOR_EMAIL || "dev-agent@users.noreply.github.com",
        },
        publish: a.publish,
        autonomy: a.autonomy,
        docs: a.docs,
        tooling: { ...a.tooling, skills: await skillNames(p.plugin) },
        workspace: { ...a.workspace, playwright: a.workspace.playwright || needsPlaywright },
        mcpServers: a.mcpServers,
        verify: a.verify,
        limits: a.limits,
        notes: a.notes + (a.unverifiedReason ? `\n\nSetup note: workspace not fully verified: ${a.unverifiedReason}` : ""),
        createdAt: ctx.existing?.createdAt ?? now,
        updatedAt: now,
      });
      await saveProfile(profile);
      await writeFile(p.knowledge, a.knowledge.trim() + "\n");
      if (ctx.lastReport) await writeFile(path.join(p.setup, "last-workspace-test.txt"), ctx.lastReport);
      ctx.saved = profile;
      ctx.emit({ type: "status", message: `Saved project profile ${p.profile}` });
      return text("Saved. Setup is complete: reply with a short summary for the developer and end your turn.");
    },
  );
}
