import { query, type HookCallback, type HookJSONOutput, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { OUTPUT_DIR, pageName, slugify } from "./config.js";
import { initJobDir, listPages, readDoc } from "./document.js";
import type { Emit, JobEvent, JobOptions, JobRecord } from "./events.js";
import { exportDocument, type Job } from "./pipeline.js";
import { productContext, resolveBrand } from "./product.js";
import { initialPrompt, revisionPrompt, systemPrompt } from "./prompt.js";
import { createDeckServer, toolNames, type ToolContext } from "./tools.js";

const VERSION = "0.1.0";

export function newJobId(brief: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${slugify(brief.split("\n").find((l) => l.trim()) ?? "deck", 40)}`;
}

export function jobDirFor(id: string): string {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`Invalid job id: ${id}`);
  return path.join(OUTPUT_DIR, id);
}

export function readJob(id: string): JobRecord | null {
  try {
    const job = JSON.parse(fs.readFileSync(path.join(jobDirFor(id), "job.json"), "utf8")) as JobRecord;
    job.dir = jobDirFor(id); // where the job folder is now, if it moved since it was created
    return job;
  } catch {
    return null;
  }
}

function saveJob(job: JobRecord) {
  job.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(job.dir, "job.json"), JSON.stringify(job, null, 2));
}

/**
 * Environment for the Claude Code subprocess. Auth precedence (same as the CLI):
 *  ANTHROPIC_API_KEY → CLAUDE_CODE_OAUTH_TOKEN (subscription token from `claude setup-token`) → this machine's Claude Code login.
 * Empty values are removed so a blank line in .env doesn't shadow the subscription login.
 */
export function agentEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: `deck-agent/${VERSION}` };
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) if (!env[k]?.trim()) delete env[k];
  for (const k of ["CLAUDE_CODE_SESSION_ID", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"]) delete env[k];
  return env;
}

export function describeAuth(): string {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "Anthropic API key (ANTHROPIC_API_KEY)";
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) return "Claude subscription (CLAUDE_CODE_OAUTH_TOKEN)";
  return "Claude subscription via this machine's Claude Code login";
}

const isInside = (p: string, root: string) => {
  const rel = path.relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** Read is the only built-in tool; keep it inside the job folder. */
function guardHook(jobDir: string): HookCallback {
  const deny = (reason: string): HookJSONOutput => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    if (input.tool_name !== "Read") return {};
    const ti = (input.tool_input ?? {}) as Record<string, unknown>;
    const raw = String(ti.file_path ?? "");
    const abs = path.resolve(jobDir, raw);
    if (!isInside(abs, jobDir)) return deny("Reading is limited to the job folder (inputs/, assets/ and the files you created).");
    return {};
  };
}

const KIND: Record<string, string> = { ".csv": "data", ".tsv": "data", ".xlsx": "data", ".xlsm": "data", ".json": "data", ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".svg": "image", ".pdf": "document", ".md": "document", ".txt": "document", ".docx": "document" };

/** Copy user files into the job: images → assets/, everything else → inputs/. */
function importInputs(dir: string, files: string[]): { rel: string; kind: string }[] {
  const out: { rel: string; kind: string }[] = [];
  for (const src of files) {
    const ext = path.extname(src).toLowerCase();
    const kind = KIND[ext] ?? "file";
    const base = path.basename(src).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const rel = path.join(kind === "image" ? "assets" : "inputs", base);
    fs.copyFileSync(path.resolve(src), path.join(dir, rel));
    out.push({ rel, kind: kind === "document" && ext === ".docx" ? "Word document (not readable; ask for PDF/markdown if needed)" : kind });
  }
  return out;
}

function summarizeTool(name: string, input: Record<string, unknown>): string | null {
  const n = name.replace(/^mcp__deck__/, "");
  switch (n) {
    case "Read": return `Reading ${path.basename(String(input.file_path ?? ""))}`;
    case "setup_document": return `Setting up ${input.format} · ${input.theme}`;
    case "plan_storyline": return `Planning storyline (${(input.pages as unknown[])?.length ?? "?"} pages)`;
    case "inspect_data": return `Inspecting ${input.path}`;
    case "create_chart": return `Chart "${input.id}" (${input.type})`;
    case "create_diagram": return `Diagram "${input.id}" (${input.type})`;
    case "create_table": return `Table "${input.id}"`;
    case "create_kpis": return `KPIs "${input.id}"`;
    case "write_page": return `Page ${input.index}: ${input.layout}${input.title ? ` — ${String(input.title).slice(0, 80)}` : ""}`;
    case "view_page": return `Viewing page ${input.index}`;
    case "remove_page": return `Removing page ${input.index}`;
    case "move_page": return `Moving page ${input.from} → ${input.to}`;
    case "review_document": return "Reviewing all pages";
    case "export_document": return "Exporting PDF";
    case "generate_image": return `Image "${input.name}" (${input.style})`;
    default: return null;
  }
}

export interface RunArgs {
  options: JobOptions;
  reviseJobId?: string;
  instructions?: string;
  jobId?: string;
  emit?: Emit;
  signal?: AbortSignal;
  onMessage?: (m: SDKMessage) => void;
}

export async function runJob(args: RunArgs): Promise<JobRecord> {
  const o = args.options;
  let job: JobRecord;
  if (args.reviseJobId) {
    const existing = readJob(args.reviseJobId);
    if (!existing) throw new Error(`Job not found: ${args.reviseJobId}`);
    if (!existing.sessionId) throw new Error("This job has no saved agent session, so it can't be revised.");
    job = existing;
    job.status = "running";
    job.error = undefined;
    job.revisions = [...(job.revisions ?? []), { at: new Date().toISOString(), instructions: args.instructions ?? "" }];
    Object.assign(o, {
      ...job.options,
      model: o.model ?? job.options.model,
      maxBudgetUsd: o.maxBudgetUsd ?? job.options.maxBudgetUsd,
      brandPath: o.brandPath ?? job.options.brandPath,
      product: o.product ?? job.options.product,
      brief: job.brief,
      inputs: o.inputs,
    });
  } else {
    const id = args.jobId ?? newJobId(o.brief);
    const dir = jobDirFor(id);
    fs.mkdirSync(dir, { recursive: true });
    initJobDir(dir);
    fs.writeFileSync(path.join(dir, "brief.md"), o.brief);
    const { brief: _b, inputs: _i, ...rest } = o;
    job = { id, dir, brief: o.brief, options: rest, status: "running", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pages: [], revisions: [] };
  }
  const dir = job.dir;
  saveJob(job);
  const eventsFile = path.join(dir, "events.jsonl");
  const emit: Emit = (e: JobEvent) => {
    fs.appendFile(eventsFile, JSON.stringify({ t: Date.now(), ...e }) + "\n", () => {});
    args.emit?.(e);
  };
  const inputs = importInputs(dir, o.inputs ?? []);
  const { brand, product, houseTheme } = resolveBrand({ brandPath: o.brandPath, product: o.product });
  const context = product ? productContext(product) : undefined;
  if (context) fs.writeFileSync(path.join(dir, "product-context.md"), context);
  job.product = product ? { dir: product.dir, name: product.name } : null;
  job.brand = brand.source;
  saveJob(job);
  const jobCtx: Job = { dir, brand };
  const ctx: ToolContext = {
    job: jobCtx,
    forced: { format: o.format === "auto" ? undefined : o.format, theme: o.theme === "auto" ? undefined : o.theme },
    emit,
    maxImages: Number(process.env.MAX_IMAGES || 6),
    stats: { images: 0, exported: false },
  };
  emit({ type: "status", message: args.reviseJobId ? `Revising ${job.id}` : `Started ${job.id}` });
  emit({ type: "status", message: `Brand: ${brand.name} (${brand.source ?? "brand file"})${product ? ` · product context: ${product.name}` : " · no product folder"}` });

  const abort = new AbortController();
  args.signal?.addEventListener("abort", () => abort.abort());
  const tools = toolNames();
  try {
    const q = query({
      prompt: args.reviseJobId ? revisionPrompt(args.instructions ?? "", inputs) : initialPrompt(o, inputs),
      options: {
        systemPrompt: systemPrompt(o, { product: product && context ? { name: product.name, context } : undefined, houseTheme, brandName: brand.name }),
        model: o.model || process.env.CLAUDE_MODEL?.trim() || undefined,
        cwd: dir,
        tools: ["Read"],
        allowedTools: ["Read", ...tools],
        disallowedTools: ["Bash", "Write", "Edit", "WebFetch", "WebSearch", "mcp__claude-in-chrome", "mcp__Claude_in_Chrome"],
        permissionMode: "dontAsk",
        settingSources: [],
        strictMcpConfig: true,
        mcpServers: { deck: createDeckServer(ctx) },
        hooks: { PreToolUse: [{ hooks: [guardHook(dir)] }] },
        maxTurns: o.maxTurns ?? Number(process.env.MAX_TURNS || 160),
        maxBudgetUsd: o.maxBudgetUsd ?? (process.env.MAX_BUDGET_USD ? Number(process.env.MAX_BUDGET_USD) : undefined),
        abortController: abort,
        ...(args.reviseJobId && job.sessionId ? { resume: job.sessionId } : {}),
        env: agentEnv(),
      },
    });
    for await (const msg of q) {
      args.onMessage?.(msg);
      if (!job.sessionId && "session_id" in msg && msg.session_id) {
        job.sessionId = msg.session_id;
        saveJob(job);
      }
      if (msg.type === "assistant" && !msg.parent_tool_use_id) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text.trim()) emit({ type: "text", text: block.text.trim() });
          if (block.type === "tool_use") {
            const s = summarizeTool(block.name, (block.input ?? {}) as Record<string, unknown>);
            if (s) emit({ type: "tool", name: block.name, summary: s });
          }
        }
      } else if (msg.type === "result") {
        job.costUsd = Math.max(job.costUsd ?? 0, msg.total_cost_usd ?? 0);
        emit({ type: "cost", usd: msg.total_cost_usd ?? 0, turns: msg.num_turns });
        if (msg.subtype === "success") job.summary = msg.result;
        else {
          const why =
            msg.subtype === "error_max_budget_usd" ? `Stopped at the $${o.maxBudgetUsd ?? process.env.MAX_BUDGET_USD} budget limit`
            : msg.subtype === "error_max_turns" ? "Stopped at the turn limit"
            : `Agent error: ${(msg as { errors?: string[] }).errors?.join("; ") || msg.subtype}`;
          emit({ type: "status", message: `${why}. Exporting what exists.` });
          job.error = why;
        }
      }
    }
  } catch (e) {
    if (abort.signal.aborted) {
      job.status = "cancelled";
      job.error = "Cancelled";
    } else {
      job.error = (e as Error).message;
      emit({ type: "error", message: job.error });
    }
  }

  // Safety net: make sure whatever exists is exported.
  try {
    const doc = readDoc(dir);
    const pages = listPages(dir);
    if (doc && pages.length) {
      if (!ctx.stats.exported) {
        emit({ type: "status", message: `Exporting ${pages.length} page(s)` });
        const r = await exportDocument(jobCtx);
        emit({ type: "export", pdf: path.relative(dir, r.pdf), pages: r.pngs.map((p) => path.relative(dir, p)) });
      }
      const pdf = fs.readdirSync(dir).find((f) => f.endsWith(".pdf"));
      job.pdf = pdf;
      job.title = doc.title;
      job.format = doc.format;
      job.theme = doc.theme;
      job.pages = pages.map((p) => ({ index: p.index, preview: `preview/${pageName(p.index)}.jpg`, png: `png/${pageName(p.index)}.png`, title: p.spec.title, layout: p.spec.layout }));
      if (job.status === "running") job.status = "done";
    } else if (job.status === "running") {
      job.status = "error";
      job.error ??= "The agent finished without writing any pages.";
    }
  } catch (e) {
    job.status = "error";
    job.error = `Export failed: ${(e as Error).message}`;
    emit({ type: "error", message: job.error });
  }
  saveJob(job);
  emit({ type: "done", job });
  return job;
}
