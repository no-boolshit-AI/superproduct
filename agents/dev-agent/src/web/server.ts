/**
 * Local web UI: http://localhost:4949
 * Set up projects (the interview happens in the browser), start feature runs, watch them live, answer questions,
 * approve plans, read PRD/plan/notes, resume, revise and publish. Binds to 127.0.0.1 only.
 */
import { randomUUID } from "node:crypto";
import http from "node:http";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkClaudeAuth, defaults } from "../config.js";
import type { Answers, ApprovalDecision, DevEvent, Interaction, Question } from "../events.js";
import { githubToken, parseRepo } from "../github.js";
import { projectPaths, runPaths, slugify } from "../paths.js";
import { exec } from "../proc.js";
import { listProjects, loadProfile, readKnowledge } from "../profile.js";
import { findRun, isStale, listRuns, newRunId, saveRun, type RunRecord } from "../run-record.js";
import { executeRun, type RunOptions } from "../run.js";
import { setupProject } from "../setup.js";
import { listInstalled } from "../skills.js";

const PORT = defaults().port;
const HOST = process.env.HOST || "127.0.0.1";
const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui.html");

type Pending = { kind: "ask"; resolve: (a: Answers) => void; reject: (e: Error) => void } | { kind: "approve"; resolve: (d: ApprovalDecision) => void };

interface Live {
  events: DevEvent[];
  clients: Set<http.ServerResponse>;
  abort: AbortController;
  pending: Map<string, Pending>;
  finished: boolean;
}
const live = new Map<string, Live>();

function send(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/** Only the UI itself may start or change things (blocks drive-by POSTs from other websites). */
function sameOrigin(req: http.IncomingMessage): boolean {
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return false;
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.origin;
  if (origin === "null") return false;
  if (origin) {
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }
  return true;
}

async function body(req: http.IncomingMessage): Promise<any> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 500_000) throw new Error("Request too large");
  }
  return raw ? JSON.parse(raw) : {};
}

function broadcast(key: string, e: DevEvent) {
  const l = live.get(key);
  if (!l) return;
  l.events.push(e);
  if (l.events.length > 5000) l.events.splice(0, l.events.length - 5000);
  const line = `data: ${JSON.stringify(e)}\n\n`;
  for (const c of l.clients) c.write(line);
  if (e.type === "done") {
    l.finished = true;
    for (const c of l.clients) c.end();
    l.clients.clear();
    setTimeout(() => live.get(key) === l && live.delete(key), 10 * 60_000).unref();
  }
}

function webInteraction(key: string): Interaction {
  return {
    ask: (questions: Question[], context?: string) =>
      new Promise<Answers>((resolve, reject) => {
        const l = live.get(key);
        if (!l) return reject(new Error("no session"));
        const id = randomUUID();
        l.pending.set(id, { kind: "ask", resolve, reject });
        broadcast(key, { type: "question", id, questions, context });
      }),
    approve: (info) =>
      new Promise<ApprovalDecision>((resolve) => {
        const l = live.get(key);
        if (!l) return resolve({ decision: "cancel", feedback: "__pause__" });
        const id = randomUUID();
        l.pending.set(id, { kind: "approve", resolve });
        broadcast(key, { type: "approval", id, prd: info.prd, plan: info.plan });
      }),
  };
}

function startLive(key: string): Live {
  const prev = live.get(key);
  if (prev && !prev.finished) throw new Error("Already running.");
  const l: Live = { events: [], clients: new Set(), abort: new AbortController(), pending: new Map(), finished: false };
  live.set(key, l);
  return l;
}

function cancelLive(key: string) {
  const l = live.get(key);
  if (!l) return;
  l.abort.abort();
  for (const p of l.pending.values()) p.kind === "ask" ? p.reject(new Error("cancelled")) : p.resolve({ decision: "cancel" });
  l.pending.clear();
}

function launchRun(id: string, opts: Omit<RunOptions, "interaction" | "emit" | "signal">) {
  const key = `run:${id}`;
  const l = startLive(key);
  executeRun({ ...opts, interaction: webInteraction(key), emit: (e) => broadcast(key, e), signal: l.abort.signal }).catch((err) => {
    broadcast(key, { type: "error", message: (err as Error).message });
    broadcast(key, { type: "done", status: "error" });
  });
}

function runView(r: RunRecord) {
  const st = isStale(r) ? "stopped" : r.status;
  return { ...r, status: st, live: live.has(`run:${r.id}`) && !live.get(`run:${r.id}`)!.finished, request: undefined, requestPreview: r.request.slice(0, 300) };
}

async function readOr(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function sse(req: http.IncomingMessage, res: http.ServerResponse, key: string, eventsFile: string, final: () => Promise<DevEvent | null>) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
  const l = live.get(key);
  if (l) {
    for (const e of l.events) res.write(`data: ${JSON.stringify(e)}\n\n`);
    if (l.finished) return res.end();
    l.clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
    req.on("close", () => (clearInterval(ping), l.clients.delete(res)));
    return;
  }
  const raw = await readOr(eventsFile);
  const lines = raw.split("\n").filter((x) => x && !x.includes('"type":"done"') && !x.includes('"type":"question"') && !x.includes('"type":"approval"'));
  for (const line of lines.slice(-3000)) res.write(`data: ${line}\n\n`);
  const f = await final();
  if (f) res.write(`data: ${JSON.stringify(f)}\n\n`);
  res.end();
}

/** Blocks DNS-rebinding: a page on another name that resolves to 127.0.0.1 must not reach the API. */
function hostAllowed(req: http.IncomingMessage): boolean {
  if (HOST !== "127.0.0.1" && HOST !== "localhost") return true;
  const h = String(req.headers.host ?? "").toLowerCase();
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h);
}

const budgetFrom = (v: unknown) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? Math.max(1, Math.min(500, n)) : undefined;
};

export const server = http.createServer(async (req, res) => {
  try {
    if (!hostAllowed(req)) return send(res, 421, { error: "Unexpected Host header." });
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const p = url.pathname;
    if (req.method === "GET" && (p === "/" || p === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" });
      return createReadStream(UI).pipe(res);
    }
    if (req.method === "POST" && !sameOrigin(req)) return send(res, 403, { error: "Cross-origin requests are not allowed." });

    if (req.method === "GET" && p === "/api/meta") {
      const d = defaults();
      const docker = d.runtime === "docker" ? (await exec("docker", ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 8000 })).code === 0 : null;
      return send(res, 200, { missingAuth: checkClaudeAuth(), github: !!githubToken(), runtime: d.runtime, docker, model: d.model, budget: d.maxBudgetUsd });
    }

    // ------------------------------------------------ projects
    if (req.method === "GET" && p === "/api/projects") {
      const projects = await listProjects();
      const settingUp = [...live.entries()].filter(([k, l]) => k.startsWith("setup:") && !l.finished).map(([k]) => k.slice(6));
      return send(res, 200, { projects: projects.map((x) => ({ slug: x.slug, name: x.name, repo: `${x.repo.owner}/${x.repo.name}`, stack: x.stack.primary, pr: x.publish.pullRequest, approvePlan: x.autonomy.approvePlan })), settingUp });
    }
    if (req.method === "POST" && p === "/api/projects") {
      const b = await body(req);
      const repoIn = String(b.repo ?? "").trim();
      if (!repoIn) return send(res, 400, { error: "Which repository?" });
      if (checkClaudeAuth().length) return send(res, 400, { error: "Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in .env first." });
      const slug = b.slug ? slugify(String(b.slug), 40) : slugify(parseRepo(repoIn).name, 40);
      if (!b.reconfigure && (await loadProfile(slug))) return send(res, 409, { error: `Project "${slug}" is already set up. Use Reconfigure on its page.` });
      const key = `setup:${slug}`;
      let l: Live;
      try {
        l = startLive(key);
      } catch (e) {
        return send(res, 409, { error: (e as Error).message });
      }
      setupProject({ repo: repoIn, slug, interaction: webInteraction(key), emit: (e) => broadcast(key, e), signal: l.abort.signal, reconfigure: !!b.reconfigure }).catch((err) => {
        broadcast(key, { type: "error", message: (err as Error).message });
        broadcast(key, { type: "done", project: slug, status: "error" });
      });
      return send(res, 202, { slug });
    }
    const pm = p.match(/^\/api\/projects\/([a-z0-9._-]+)(\/[a-z]+)?$/i);
    if (pm) {
      const [, slug, action] = pm;
      const key = `setup:${slug}`;
      if (req.method === "GET" && !action) {
        const profile = await loadProfile(slug);
        return send(res, 200, {
          profile,
          knowledge: await readKnowledge(slug),
          skills: await listInstalled(projectPaths(slug).plugin),
          settingUp: live.has(key) && !live.get(key)!.finished,
        });
      }
      if (req.method === "GET" && action === "/events")
        return sse(req, res, key, path.join(projectPaths(slug).setup, "events.jsonl"), async () => ({ type: "done", project: slug, status: (await loadProfile(slug)) ? "done" : "error" }));
      if (req.method === "POST" && action === "/answer") return answer(res, key, await body(req));
      if (req.method === "POST" && action === "/cancel") {
        cancelLive(key);
        return send(res, 200, { ok: true });
      }
    }

    // ------------------------------------------------ runs
    if (req.method === "GET" && p === "/api/runs") {
      const runs = await listRuns(url.searchParams.get("project") || undefined);
      return send(res, 200, runs.slice(0, 200).map(runView));
    }
    if (req.method === "POST" && p === "/api/runs") {
      const b = await body(req);
      const project = String(b.project ?? "");
      if (!(await loadProfile(project))) return send(res, 400, { error: "Pick a configured project." });
      const request = String(b.request ?? "").trim();
      if (!request && !b.issue) return send(res, 400, { error: "Describe the feature (or give an issue number)." });
      if (checkClaudeAuth().length) return send(res, 400, { error: "Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in .env first." });
      const id = newRunId(request || `issue-${b.issue}`);
      launchRun(id, {
        project,
        request,
        issue: b.issue ? String(b.issue) : undefined,
        newRunId: id,
        approvePlan: typeof b.approvePlan === "boolean" ? b.approvePlan : undefined,
        noPr: !!b.noPr,
        budgetUsd: budgetFrom(b.budget),
        model: b.model ? String(b.model) : undefined,
      });
      return send(res, 202, { id });
    }
    const rm = p.match(/^\/api\/runs\/([a-z0-9._-]+)(\/[a-z]+)?$/i);
    if (rm) {
      const [, id, action] = rm;
      const key = `run:${id}`;
      const run = await findRun(id);
      if (!run) {
        // a run that was just launched may not have written run.json yet
        const l = live.get(key);
        if (l && action === "/events") return sse(req, res, key, "", async () => null);
        if (l && action === "/cancel") return cancelLive(key), send(res, 200, { ok: true });
        if (l && !action) return send(res, 200, { id, title: "Starting…", status: "running", step: "clone", live: true, milestones: [], costUsd: 0, budgetUsd: 0, branch: "", project: "", request: "", prd: "", plan: "", notes: "", folder: "" });
        return send(res, 404, { error: "Run not found" });
      }
      const rp = runPaths(run.project, run.id);
      if (req.method === "GET" && !action)
        return send(res, 200, { ...runView(run), request: run.request, prd: await readOr(rp.prd), plan: await readOr(rp.plan), notes: await readOr(rp.notes), folder: rp.dir });
      if (req.method === "GET" && action === "/events") return sse(req, res, key, rp.events, async () => ({ type: "done", run: (await findRun(id)) ?? undefined, status: (await findRun(id))?.status ?? "error" }));
      if (req.method === "POST" && action === "/answer") return answer(res, key, await body(req));
      if (req.method === "POST" && action === "/cancel") {
        cancelLive(key);
        return send(res, 200, { ok: true });
      }
      const busy = live.has(key) && !live.get(key)!.finished;
      if (req.method === "POST" && ["/resume", "/approve", "/revise", "/publish"].includes(action ?? "")) {
        const b = await body(req);
        if (busy && action !== "/approve") return send(res, 409, { error: "This run is active." });
        if (run.status === "running" && !isStale(run) && !busy) return send(res, 409, { error: "This run is active in another process (CLI)." });
        const common = { project: run.project, runId: run.id, budgetUsd: budgetFrom(b.budget) };
        if (action === "/approve") {
          const decision: ApprovalDecision = b.decision === "revise" ? { decision: "revise", feedback: String(b.feedback ?? "") } : b.decision === "cancel" ? { decision: "cancel" } : { decision: "approve" };
          const l = live.get(key);
          const pending = l && [...l.pending.entries()].find(([, x]) => x.kind === "approve");
          if (pending) {
            l!.pending.delete(pending[0]);
            (pending[1] as Extract<Pending, { kind: "approve" }>).resolve(decision);
            broadcast(key, { type: "answered", id: pending[0] });
            return send(res, 200, { ok: true });
          }
          if (run.step !== "approval") return send(res, 409, { error: "The run isn't waiting for approval." });
          launchRun(id, { ...common, approval: decision });
          return send(res, 202, { id });
        }
        if (action === "/revise") {
          const instructions = String(b.instructions ?? "").trim();
          if (!instructions) return send(res, 400, { error: "Describe the change." });
          launchRun(id, { ...common, revise: instructions });
          return send(res, 202, { id });
        }
        if (action === "/publish") {
          if (!run.milestones.some((m) => m.commit)) return send(res, 400, { error: "No commits yet." });
          run.step = "publish";
          run.status = "error";
          await saveRun(run);
        }
        launchRun(id, common);
        return send(res, 202, { id });
      }
    }
    res.writeHead(404).end("Not found");
  } catch (e) {
    send(res, 500, { error: (e as Error).message });
  }
});

function answer(res: http.ServerResponse, key: string, b: { id?: string; answers?: Answers }) {
  const l = live.get(key);
  const pending = b.id ? l?.pending.get(b.id) : undefined;
  if (!l || !pending || pending.kind !== "ask") return send(res, 404, { error: "That question is no longer open." });
  l.pending.delete(b.id!);
  pending.resolve(b.answers ?? {});
  broadcast(key, { type: "answered", id: b.id! });
  return send(res, 200, { ok: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => {
    console.log(`dev-agent → http://localhost:${PORT}`);
    const missing = checkClaudeAuth();
    if (missing.length) console.log(`  ! Missing ${missing.join(", ")}: copy .env.example to .env`);
  });
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      for (const k of live.keys()) cancelLive(k);
      setTimeout(() => process.exit(0), 20_000).unref();
      if (![...live.values()].some((l) => !l.finished)) process.exit(0);
    });
  }
}

