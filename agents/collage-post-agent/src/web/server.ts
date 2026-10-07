/**
 * Local web UI: http://localhost:4747
 * Start a post from a brief, watch the agent work (live log + images), preview and download
 * the slides, and send revision requests. Binds to 127.0.0.1 only.
 */
import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkKeys, defaults, type JobOptions } from "../config.js";
import { jobDirFor, newJobId, readJob, runJob } from "../agent.js";
import type { JobEvent, JobRecord } from "../events.js";
import { DESIGN_DIR, OUTPUT_DIR } from "../paths.js";
import { PALETTES, PALETTE_NAMES } from "../palettes.js";
import { closeBrowser } from "../tools/render.js";

const PORT = Number(process.env.PORT || 4747);
const MAX_UI_BUDGET = Number(process.env.MAX_UI_BUDGET_USD || 25);
const HOST = process.env.HOST || "127.0.0.1";
const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui.html");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".zip": "application/zip",
};

interface Live {
  events: JobEvent[];
  clients: Set<http.ServerResponse>;
  abort: AbortController;
  cleanup?: NodeJS.Timeout;
}
const live = new Map<string, Live>();

function send(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/** Only the UI itself may start or change jobs (blocks drive-by POSTs from other websites). */
function sameOrigin(req: http.IncomingMessage): boolean {
  const ct = String(req.headers["content-type"] ?? "");
  if (!ct.startsWith("application/json")) return false;
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.origin;
  if (origin && origin !== "null") {
    try {
      if (new URL(origin).host !== req.headers.host) return false;
    } catch {
      return false;
    }
  } else if (origin === "null") return false;
  return true;
}

async function body(req: http.IncomingMessage): Promise<any> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 200_000) throw new Error("Request too large");
  }
  return raw ? JSON.parse(raw) : {};
}

// Generated slides are untrusted HTML: no inline scripts, no network calls, no forms.
const OUT_CSP =
  "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'";

async function serveFile(res: http.ServerResponse, root: string, rel: string, opts: { download?: boolean; csp?: boolean } = {}) {
  let abs: string;
  try {
    abs = path.resolve(root, decodeURIComponent(rel));
  } catch {
    res.writeHead(400).end("Bad path");
    return;
  }
  const inside = path.relative(root, abs);
  const isFile = !inside.startsWith("..") && !path.isAbsolute(inside) && existsSync(abs) && (await stat(abs).catch(() => null))?.isFile();
  if (!isFile) {
    res.writeHead(404).end("Not found");
    return;
  }
  const headers: Record<string, string> = {
    "Content-Type": TYPES[path.extname(abs).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  if (opts.csp) headers["Content-Security-Policy"] = OUT_CSP;
  if (opts.download) headers["Content-Disposition"] = `attachment; filename="${path.basename(abs)}"`;
  res.writeHead(200, headers);
  createReadStream(abs)
    .on("error", () => res.destroy())
    .pipe(res);
}

function broadcast(id: string, e: JobEvent) {
  const l = live.get(id);
  if (!l) return;
  l.events.push(e);
  const line = `data: ${JSON.stringify(e)}\n\n`;
  for (const c of l.clients) c.write(line);
  if (e.type === "done") {
    for (const c of l.clients) c.end();
    l.clients.clear();
    l.cleanup = setTimeout(() => {
      if (live.get(id) === l) live.delete(id); // never drop a newer run (e.g. a revision) of the same job
    }, 5 * 60_000);
  }
}

function start(id: string, args: Parameters<typeof runJob>[0]) {
  const prev = live.get(id);
  if (prev?.cleanup) clearTimeout(prev.cleanup);
  const abort = new AbortController();
  live.set(id, { events: [], clients: new Set(), abort });
  runJob({ ...args, signal: abort.signal, emit: (e) => broadcast(id, e) }).catch((err) => {
    broadcast(id, { type: "error", message: (err as Error).message });
    broadcast(id, {
      type: "done",
      job: { id, dir: jobDirFor(id), brief: "", options: {}, status: "error", createdAt: "", updatedAt: "", slides: [], revisions: [], error: (err as Error).message },
    });
  });
}

function optionsFrom(b: any): JobOptions {
  const o = defaults();
  o.brief = String(b.brief ?? "").trim();
  if (b.slides !== undefined) o.slides = b.slides === "auto" ? "auto" : Math.max(1, Math.min(10, Number(b.slides) || 7));
  if (b.palette && (b.palette === "auto" || PALETTE_NAMES.includes(b.palette))) o.palette = b.palette;
  if (b.brand) o.brand = String(b.brand).slice(0, 60);
  if (b.model) o.model = String(b.model);
  if (b.imageModel) o.imageModel = String(b.imageModel);
  if (b.quality) o.imageQuality = b.quality;
  if (b.maxImages) o.maxImages = Math.max(0, Math.min(30, Number(b.maxImages)));
  if (typeof b.allowAttribution === "boolean") o.allowAttribution = b.allowAttribution;
  if (b.scale) o.scale = Number(b.scale) === 2 ? 2 : 1;
  if (b.budget) o.maxBudgetUsd = Math.min(MAX_UI_BUDGET, Math.max(0.5, Number(b.budget) || o.maxBudgetUsd));
  return o;
}

async function listJobs(): Promise<(JobRecord & { running: boolean; thumb?: string })[]> {
  if (!existsSync(OUTPUT_DIR)) return [];
  const ids = (await readdir(OUTPUT_DIR, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name);
  const jobs = await Promise.all(ids.map((id) => readJob(id)));
  return jobs
    .filter((j): j is JobRecord => !!j)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((j) => ({ ...j, caption: undefined, running: live.has(j.id) && j.status === "running", thumb: j.slides[0]?.png }));
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const p = url.pathname;
    const m = p.match(/^\/api\/jobs\/([a-z0-9-]+)(\/[a-z]+)?$/i);

    if (req.method === "GET" && p === "/") return await serveFile(res, path.dirname(UI), "ui.html");
    if (req.method === "GET" && p.startsWith("/design/")) return await serveFile(res, DESIGN_DIR, p.slice("/design/".length));
    if (req.method === "GET" && p.startsWith("/out/")) {
      const [, , id, ...rest] = p.split("/");
      return await serveFile(res, jobDirFor(id), rest.join("/"), { download: url.searchParams.has("download"), csp: true });
    }
    if (req.method === "POST" && !sameOrigin(req)) return send(res, 403, { error: "Cross-origin requests are not allowed." });

    if (req.method === "GET" && p === "/api/meta") {
      const d = defaults();
      return send(res, 200, {
        missingKeys: checkKeys(),
        defaults: { ...d, brief: undefined },
        palettes: PALETTES.map((x) => ({ name: x.name, label: x.label, mood: x.mood, mode: x.mode, colors: [x.bg, x.ink, x.loud, x.deep, x.ink2] })),
      });
    }
    if (req.method === "GET" && p === "/api/jobs") return send(res, 200, await listJobs());

    if (req.method === "POST" && p === "/api/jobs") {
      const o = optionsFrom(await body(req));
      if (!o.brief) return send(res, 400, { error: "The brief is empty." });
      const missing = checkKeys();
      if (missing.length) return send(res, 400, { error: `Missing ${missing.join(" and ")} in .env` });
      const id = newJobId(o.brief);
      start(id, { options: o, jobId: id });
      return send(res, 202, { id });
    }

    if (m) {
      const [, id, action] = m;
      if (req.method === "GET" && !action) {
        const job = await readJob(id);
        return job ? send(res, 200, { ...job, running: live.has(id) && job.status === "running" }) : send(res, 404, { error: "Not found" });
      }
      if (req.method === "GET" && action === "/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        const l = live.get(id);
        if (l) {
          for (const e of l.events) res.write(`data: ${JSON.stringify(e)}\n\n`);
          if (l.events.some((e) => e.type === "done")) return res.end();
          l.clients.add(res);
          const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
          req.on("close", () => (clearInterval(ping), l.clients.delete(res)));
          return;
        }
        // finished job: replay its log
        try {
          const raw = await readFile(path.join(jobDirFor(id), "events.jsonl"), "utf8");
          // every run (first + revisions) logged its own "done"; send only the final state below
          for (const line of raw.split("\n").filter(Boolean)) if (!line.includes('"type":"done"')) res.write(`data: ${line}\n\n`);
        } catch {}
        const job = await readJob(id);
        if (job) res.write(`data: ${JSON.stringify({ type: "done", job })}\n\n`);
        return res.end();
      }
      if (req.method === "POST" && action === "/revise") {
        const b = await body(req);
        const instructions = String(b.instructions ?? "").trim();
        if (!instructions) return send(res, 400, { error: "Describe the change." });
        const cur = live.get(id);
        if (cur && !cur.events.some((e) => e.type === "done")) return send(res, 409, { error: "This job is still running." });
        start(id, { options: optionsFrom(b), reviseJobId: id, instructions });
        return send(res, 202, { id });
      }
      if (req.method === "POST" && action === "/cancel") {
        live.get(id)?.abort.abort();
        return send(res, 200, { ok: true });
      }
    }
    res.writeHead(404).end("Not found");
  } catch (e) {
    send(res, 500, { error: (e as Error).message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Collage post agent → http://localhost:${PORT}`);
  const missing = checkKeys();
  if (missing.length) console.log(`  ! Missing ${missing.join(" and ")}: copy .env.example to .env`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    for (const l of live.values()) l.abort.abort();
    await closeBrowser();
    process.exit(0);
  });
}
