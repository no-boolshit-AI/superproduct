import { query, type HookCallback, type HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
import type { JobOptions } from "./config.js";
import type { Emit, JobEvent, JobRecord } from "./events.js";
import { DESIGN_DIR, OUTPUT_DIR, REFERENCE_DIR, STYLEGUIDE } from "./paths.js";
import { initialPrompt, revisionPrompt, systemPrompt } from "./prompt.js";
import { writeCreditsMd } from "./tools/commons.js";
import { renderSlides } from "./tools/render.js";
import { createCollageServer, listSlides, TOOL_NAMES } from "./tools/server.js";
import { prepareJobDir, slugify } from "./workspace.js";
import { brandFontKit, productAt, productContext } from "./product.js";

const BUILTIN_TOOLS = ["Read", "Write", "Edit", "Glob"];

export function newJobId(brief: string): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  return `${stamp}-${slugify(brief.split("\n")[0] ?? "post", 40)}`;
}

export function jobDirFor(id: string): string {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`Invalid job id: ${id}`);
  return path.join(OUTPUT_DIR, id);
}

export async function readJob(id: string): Promise<JobRecord | null> {
  try {
    const job = JSON.parse(await readFile(path.join(jobDirFor(id), "job.json"), "utf8")) as JobRecord;
    job.dir = jobDirFor(id); // where the job folder is now, if it moved since it was created
    return job;
  } catch {
    return null;
  }
}

async function saveJob(job: JobRecord): Promise<void> {
  job.updatedAt = new Date().toISOString();
  await writeFile(path.join(job.dir, "job.json"), JSON.stringify(job, null, 2));
}

const isInside = (p: string, root: string) => {
  const rel = path.relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** Keeps the agent's file access inside the job folder (+ read-only design/reference files). */
function guardHook(jobDir: string): HookCallback {
  const deny = (reason: string): HookJSONOutput => ({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  });
  const readable = [jobDir, DESIGN_DIR, REFERENCE_DIR, STYLEGUIDE];
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const ti = (input.tool_input ?? {}) as Record<string, unknown>;
    const raw = (ti.file_path ?? ti.path ?? (typeof ti.pattern === "string" && path.isAbsolute(ti.pattern) ? ti.pattern : undefined)) as
      | string
      | undefined;
    if (!raw) return {};
    const abs = path.resolve(jobDir, raw.replace(/\*.*$/, "") || ".");
    if (input.tool_name === "Write" || input.tool_name === "Edit") {
      if (!isInside(abs, jobDir)) return deny(`Only files inside the job folder (${jobDir}) can be written.`);
      if (isInside(abs, path.join(jobDir, "_design"))) return deny("_design/ is the shared design system and is read-only.");
      if (["job.json", "events.jsonl", "credits.jsonl", "index.html", "CREDITS.md", "PRODUCT.md"].includes(path.relative(jobDir, abs)))
        return deny("That file is managed by the host app.");
      if (!/\.(html|md|txt)$/i.test(abs)) return deny("Only .html, .md and .txt files can be written.");
      const body = String(ti.content ?? ti.new_string ?? "");
      if (/<(iframe|object|embed|frame|form|base|meta\s+http-equiv)\b/i.test(body) || /<script(?![^>]*src=["']_design\/collage\.js["'])/i.test(body) || /\b(src|href)\s*=\s*["']?(https?:|\/\/|file:|\.\.\/)/i.test(body))
        return deny("Slides may not contain iframes/objects/forms, scripts other than _design/collage.js, external URLs or ../ paths.");
      return {};
    }
    if (!readable.some((r) => isInside(abs, r))) return deny("Reading is limited to the job folder, design/, reference/ and STYLEGUIDE.md.");
    return {};
  };
}

function summarizeTool(name: string, input: Record<string, unknown>, jobDir: string): string | null {
  const rel = (p: unknown) => {
    if (typeof p !== "string") return "";
    const abs = path.resolve(jobDir, p);
    const r = path.relative(jobDir, abs);
    return r.startsWith("..") ? path.basename(abs) : r || p;
  };
  switch (name) {
    case "Write":
      return `Writing ${rel(input.file_path)}`;
    case "Edit":
      return `Editing ${rel(input.file_path)}`;
    case "Read": {
      const p = String(input.file_path ?? "");
      return `Reading ${p.includes(`${path.sep}layouts${path.sep}`) ? "layout " + path.basename(p) : rel(p)}`;
    }
    case "Glob":
      return null;
    default:
      return null; // collage tools emit their own progress
  }
}

export interface RunArgs {
  options: JobOptions;
  /** Existing job to revise (resumes the agent session). */
  reviseJobId?: string;
  instructions?: string;
  /** Pre-chosen id for a new job (the web server picks it to stream events). */
  jobId?: string;
  emit?: Emit;
  signal?: AbortSignal;
}

export async function runJob(args: RunArgs): Promise<JobRecord> {
  const { options: o } = args;
  const userEmit = args.emit ?? (() => {});
  let job: JobRecord;

  if (args.reviseJobId) {
    const existing = await readJob(args.reviseJobId);
    if (!existing) throw new Error(`Job not found: ${args.reviseJobId}`);
    if (!existing.sessionId) throw new Error("This job has no saved agent session, so it can't be revised.");
    job = existing;
    job.status = "running";
    job.error = undefined;
    job.revisions = [...(job.revisions ?? []), { at: new Date().toISOString(), instructions: args.instructions ?? "" }];
    // keep the original creative options, but allow new budget/model settings
    Object.assign(o, { ...(job.options as Partial<JobOptions>), model: o.model, maxBudgetUsd: o.maxBudgetUsd, brief: job.brief });
  } else {
    const id = args.jobId ?? newJobId(o.brief);
    const dir = jobDirFor(id);
    await mkdir(dir, { recursive: true });
    const p = productAt(o.product);
    const fonts = p && o.brandFonts ? brandFontKit(p) : undefined;
    await prepareJobDir(dir, fonts ? { fontFiles: fonts.files, css: fonts.css } : {});
    if (p) await writeFile(path.join(dir, "PRODUCT.md"), productContext(p));
    job = {
      id,
      dir,
      brief: o.brief,
      options: { ...o, brief: undefined },
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slides: [],
      revisions: [],
    };
  }
  const jobDir = job.dir;
  await saveJob(job);

  const eventsFile = path.join(jobDir, "events.jsonl");
  const emit: Emit = (e: JobEvent) => {
    appendFile(eventsFile, JSON.stringify({ t: Date.now(), ...e }) + "\n").catch(() => {});
    userEmit(e);
  };

  const ctx = {
    jobDir,
    imageModel: o.imageModel,
    imageQuality: o.imageQuality,
    maxImages: o.maxImages,
    allowAttribution: o.allowAttribution,
    emit,
    stats: { generated: await countGenerated(jobDir), downloaded: 0, renders: 0 },
  };

  emit({ type: "status", message: args.reviseJobId ? `Revising ${job.id}` : `Started ${job.id}` });

  const abort = new AbortController();
  args.signal?.addEventListener("abort", () => abort.abort());

  try {
    const q = query({
      prompt: args.reviseJobId ? revisionPrompt(args.instructions ?? "") : initialPrompt(o),
      options: {
        model: o.model,
        cwd: jobDir,
        systemPrompt: systemPrompt(jobDir, o, promptProduct(o)),
        tools: BUILTIN_TOOLS,
        allowedTools: [...BUILTIN_TOOLS, ...TOOL_NAMES],
        // drop browser integrations a local Claude Code install may expose
        disallowedTools: ["mcp__claude-in-chrome", "mcp__Claude_in_Chrome", "Bash", "WebFetch", "WebSearch"],
        permissionMode: "dontAsk",
        settingSources: [],
        strictMcpConfig: true, // ignore MCP servers configured on this machine; only our tools
        mcpServers: { collage: createCollageServer(ctx) },
        hooks: { PreToolUse: [{ hooks: [guardHook(jobDir)] }] },
        maxTurns: 90,
        maxBudgetUsd: o.maxBudgetUsd,
        abortController: abort,
        ...(job.sessionId && args.reviseJobId ? { resume: job.sessionId } : {}),
        env: agentEnv(),
      },
    });

    for await (const msg of q) {
      if (!job.sessionId && "session_id" in msg && msg.session_id) {
        job.sessionId = msg.session_id;
        await saveJob(job);
      }
      if (msg.type === "assistant" && !msg.parent_tool_use_id) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text.trim()) emit({ type: "text", text: block.text.trim() });
          if (block.type === "tool_use") {
            const s = summarizeTool(block.name, (block.input ?? {}) as Record<string, unknown>, jobDir);
            if (s) emit({ type: "tool", name: block.name, summary: s });
          }
        }
      } else if (msg.type === "result") {
        // cumulative for the session (a resumed session continues from its saved total)
        job.costUsd = Math.max(job.costUsd ?? 0, msg.total_cost_usd ?? 0);
        emit({ type: "cost", usd: msg.total_cost_usd ?? 0, turns: msg.num_turns });
        if (msg.subtype !== "success") {
          const why =
            msg.subtype === "error_max_budget_usd"
              ? `Stopped at the $${o.maxBudgetUsd} budget limit`
              : msg.subtype === "error_max_turns"
                ? "Stopped at the turn limit"
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

  // Final export: whatever slides exist get rendered and packaged.
  try {
    const slides = await listSlides(jobDir);
    if (slides.length) {
      emit({ type: "status", message: `Exporting ${slides.length} slide(s) at ${o.scale}x` });
      Object.assign(job, await exportJob(job, o.scale));
      if (job.status === "running") job.status = "done";
    } else if (job.status === "running") {
      job.status = "error";
      job.error ??= "The agent finished without writing any slides.";
    }
  } catch (e) {
    job.status = "error";
    job.error = `Export failed: ${(e as Error).message}`;
    emit({ type: "error", message: job.error });
  }
  await saveJob(job);
  emit({ type: "done", job });
  return job;
}

/** Product context and font names for the system prompt (from the job's product folder, if any). */
function promptProduct(o: JobOptions): { name: string; context: string; serif?: string; sans?: string } | undefined {
  const p = productAt(o.product);
  if (!p) return undefined;
  const fonts = o.brandFonts ? brandFontKit(p) : undefined;
  return { name: p.name, context: productContext(p), serif: fonts?.serif, sans: fonts?.sans };
}

/** Environment for the Claude Code subprocess, minus variables that would tie it to a parent Claude session. */
function agentEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "collage-post-agent/0.1.0" };
  for (const k of ["CLAUDE_CODE_SESSION_ID", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"]) delete env[k];
  return env;
}

async function countGenerated(jobDir: string): Promise<number> {
  try {
    const raw = await readFile(path.join(jobDir, "events.jsonl"), "utf8");
    return raw.split("\n").filter((l) => l.includes('"source":"generated"')).length;
  } catch {
    return 0;
  }
}

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, base)));
    else out.push(path.relative(base, p));
  }
  return out;
}

/** Render final PNGs, write CREDITS.md + index.html, and zip the post. */
export async function exportJob(job: JobRecord, scale: 1 | 2): Promise<Pick<JobRecord, "slides" | "zip" | "caption">> {
  const jobDir = job.dir;
  const slides = await listSlides(jobDir);
  const rendered = await renderSlides(
    slides.map((s) => path.join(jobDir, s)),
    path.join(jobDir, "png"),
    { scale },
  );

  const used = new Set<string>();
  let palette = "";
  for (const s of slides) {
    const html = await readFile(path.join(jobDir, s), "utf8");
    for (const m of html.matchAll(/assets\/[A-Za-z0-9._-]+/g)) used.add(m[0]);
    palette ||= html.match(/data-palette="([a-z0-9-]+)"/)?.[1] ?? "";
  }
  await writeCreditsMd(jobDir, used);
  const caption = existsSync(path.join(jobDir, "caption.md")) ? await readFile(path.join(jobDir, "caption.md"), "utf8") : "";
  await writeFile(path.join(jobDir, "index.html"), galleryHtml(job, slides, caption, palette));

  const files: Record<string, Uint8Array> = {};
  const add = async (rel: string) => {
    const abs = path.join(jobDir, rel);
    if (existsSync(abs) && (await stat(abs)).isFile()) files[`${job.id}/${rel.split(path.sep).join("/")}`] = await readFile(abs);
  };
  for (const s of slides) await add(s);
  for (const s of slides) await add(path.join("png", s.replace(/\.html$/, ".png")));
  for (const f of await walk(path.join(jobDir, "_design"))) await add(path.join("_design", f));
  for (const a of used) await add(a);
  for (const f of ["index.html", "caption.md", "CREDITS.md", "plan.md"]) await add(f);
  const zipName = `${job.id}.zip`;
  await writeFile(path.join(jobDir, zipName), zipSync(files, { level: 6 }));

  return {
    slides: rendered.map((r) => ({ html: path.basename(r.html), png: path.relative(jobDir, r.image) })),
    zip: zipName,
    caption,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function galleryHtml(job: JobRecord, slides: string[], caption: string, palette: string): string {
  const cards = slides
    .map((s, i) => {
      const png = `png/${s.replace(/\.html$/, ".png")}`;
      return `<figure><a href="${s}"><img src="${png}" alt="Slide ${i + 1}" loading="lazy"></a>
      <figcaption>${String(i + 1).padStart(2, "0")} · <a href="${s}">HTML</a> · <a href="${png}" download>PNG</a></figcaption></figure>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(job.id)}</title>
<style>
@font-face{font-family:"Roboto Serif";src:url(_design/fonts/roboto-serif-latin-full-normal.woff2) format("woff2");font-weight:100 900;font-stretch:50% 150%}
@font-face{font-family:"Inter";src:url(_design/fonts/inter-latin-wght-normal.woff2) format("woff2");font-weight:100 900}
:root{--bg:#141210;--fg:#efe9e1;--mute:#a59d93;--line:#2c2723}
@media (prefers-color-scheme:light){:root{--bg:#f6f2ec;--fg:#1c1814;--mute:#6b645b;--line:#e2dbd1}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,system-ui,sans-serif}
main{max-width:1240px;margin:0 auto;padding:32px 16px 64px}
h1{font:300 clamp(28px,5vw,48px)/1.05 "Roboto Serif",Georgia,serif;font-stretch:112%;margin:0 0 6px}
.meta{color:var(--mute);margin:0 0 28px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}
figure{margin:0} img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border:1px solid var(--line)}
figcaption{color:var(--mute);font-size:13px;padding:6px 0 0} a{color:inherit}
pre{white-space:pre-wrap;font:14px/1.55 Inter,system-ui,sans-serif;border-top:1px solid var(--line);padding-top:20px;margin-top:36px;max-width:720px}
</style></head><body><main>
<h1>${esc(job.brief.split("\n")[0].slice(0, 90))}</h1>
<p class="meta">${slides.length} slide${slides.length === 1 ? "" : "s"} · palette ${esc(palette || "?")} · <a href="${esc(job.id)}.zip" download>Download all (zip)</a>${existsSync(path.join(job.dir, "CREDITS.md")) ? ' · <a href="CREDITS.md">Image credits</a>' : ""}</p>
<div class="grid">${cards}</div>
${caption ? `<pre>${esc(caption)}</pre>` : ""}
</main></body></html>`;
}
