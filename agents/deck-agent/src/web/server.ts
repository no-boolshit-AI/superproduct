/**
 * Local web UI: http://localhost:4848 (127.0.0.1 only).
 * Start a document from a brief (+ files), watch pages render live, download the PDF, request revisions.
 */
import "../env.js";
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OUTPUT_DIR } from "../config.js";
import { describeAuth, jobDirFor, newJobId, readJob, runJob } from "../agent.js";
import type { JobEvent, JobOptions, JobRecord } from "../events.js";
import { imagesEnabled, isMockMode } from "../images.js";
import { resolveBrand } from "../product.js";
import { closeBrowser } from "../render/renderer.js";
import { THEME_IDS, THEMES } from "../themes.js";
import { isFormatOrAuto, isThemeOrAuto } from "../tools.js";

const PORT = Number(process.env.PORT || 4848);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_UI_BUDGET = Number(process.env.MAX_UI_BUDGET_USD || 25);
const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui.html");
const UPLOADS = path.join(OUTPUT_DIR, "_uploads");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf",
  ".woff2": "font/woff2", ".csv": "text/plain; charset=utf-8",
};

interface Live { events: JobEvent[]; clients: Set<http.ServerResponse>; abort: AbortController; cleanup?: NodeJS.Timeout }
const live = new Map<string, Live>();

const send = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

/** Only the UI itself may start or change jobs (blocks drive-by POSTs from other sites). */
function sameOrigin(req: http.IncomingMessage): boolean {
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return false;
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.origin;
  if (origin === "null") return false;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return false; } catch { return false; }
  }
  return true;
}

async function body(req: http.IncomingMessage, limit = 40_000_000): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("Request too large (max 40 MB of files).");
    chunks.push(c as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

// Generated pages are untrusted HTML: no scripts beyond our own runtime, no network, no forms.
const OUT_CSP = "default-src 'self' data: blob: file:; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline' file:; font-src 'self' data: file:; connect-src 'none'; form-action 'none'; base-uri 'self' file:; frame-ancestors 'self'";

function serveFile(res: http.ServerResponse, root: string, rel: string, opts: { download?: boolean; csp?: boolean } = {}) {
  let abs: string;
  try { abs = path.resolve(root, decodeURIComponent(rel)); } catch { res.writeHead(400).end("Bad path"); return; }
  const inside = path.relative(root, abs);
  if (inside.startsWith("..") || path.isAbsolute(inside) || !existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404).end("Not found"); return; }
  const headers: Record<string, string> = { "Content-Type": TYPES[path.extname(abs).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" };
  if (opts.csp) headers["Content-Security-Policy"] = OUT_CSP;
  if (opts.download) headers["Content-Disposition"] = `attachment; filename="${path.basename(abs)}"`;
  res.writeHead(200, headers);
  createReadStream(abs).on("error", () => res.destroy()).pipe(res);
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
    l.cleanup = setTimeout(() => { if (live.get(id) === l) live.delete(id); }, 5 * 60_000);
  }
}

function start(id: string, args: Parameters<typeof runJob>[0]) {
  const prev = live.get(id);
  if (prev?.cleanup) clearTimeout(prev.cleanup);
  const abort = new AbortController();
  live.set(id, { events: [], clients: new Set(), abort });
  runJob({ ...args, signal: abort.signal, emit: (e) => broadcast(id, e) }).catch((err) => {
    broadcast(id, { type: "error", message: (err as Error).message });
    broadcast(id, { type: "done", job: { id, dir: jobDirFor(id), brief: "", options: { format: "auto", theme: "auto" }, status: "error", createdAt: "", updatedAt: "", pages: [], revisions: [], error: (err as Error).message } });
  });
}

/** Store uploaded files (base64) and return their absolute paths. */
function saveUploads(files: unknown): string[] {
  if (!Array.isArray(files)) return [];
  const dir = path.join(UPLOADS, `${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return files.slice(0, 20).map((f: { name?: string; data?: string }) => {
    const name = String(f.name ?? "file").replace(/[^\w.-]+/g, "-").slice(0, 80) || "file";
    if (!/\.(csv|tsv|xlsx|xlsm|json|md|txt|pdf|png|jpe?g|webp|svg)$/i.test(name)) throw new Error(`Unsupported file type: ${name}`);
    const p = path.join(dir, name);
    writeFileSync(p, Buffer.from(String(f.data ?? ""), "base64"));
    return p;
  });
}

function optionsFrom(b: any): JobOptions {
  const o: JobOptions = { brief: String(b.brief ?? "").trim(), format: "auto", theme: "auto" };
  if (isFormatOrAuto(b.format)) o.format = b.format;
  if (isThemeOrAuto(b.theme)) o.theme = b.theme;
  if (b.pages) o.pages = Math.max(1, Math.min(60, Number(b.pages) || 0)) || undefined;
  if (b.audience) o.audience = String(b.audience).slice(0, 200);
  if (b.language) o.language = String(b.language).slice(0, 20);
  if (b.model) o.model = String(b.model).slice(0, 80);
  if (b.budget) o.maxBudgetUsd = Math.min(MAX_UI_BUDGET, Math.max(0.5, Number(b.budget) || 8));
  return o;
}

/** Brand and product the UI's jobs will use (the same resolution as the CLI without --brand / --product). */
function activeBrand(): { brand: string; product: string | null; houseTheme: string | null } {
  try {
    const r = resolveBrand({});
    return { brand: r.brand.name, product: r.product?.name ?? null, houseTheme: r.houseTheme ?? null };
  } catch (e) {
    return { brand: `error: ${(e as Error).message}`, product: null, houseTheme: null };
  }
}

function listJobs() {
  if (!existsSync(OUTPUT_DIR)) return [];
  return readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("demo-"))
    .map((d) => readJob(d.name))
    .filter((j): j is JobRecord => !!j)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((j) => ({ id: j.id, title: j.title ?? j.brief.split("\n")[0].slice(0, 80), status: j.status, format: j.format, theme: j.theme, pages: j.pages.length, thumb: j.pages[0]?.preview, createdAt: j.createdAt, running: live.has(j.id) && j.status === "running" }));
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const p = url.pathname;
    const m = p.match(/^\/api\/jobs\/([a-z0-9-]+)(\/[a-z]+)?$/i);
    if (req.method === "GET" && p === "/") return serveFile(res, path.dirname(UI), "ui.html");
    if (req.method === "GET" && p.startsWith("/out/")) {
      const [, , id, ...rest] = p.split("/");
      return serveFile(res, jobDirFor(id), rest.join("/"), { download: url.searchParams.has("download"), csp: true });
    }
    if (req.method === "POST" && !sameOrigin(req)) return send(res, 403, { error: "Cross-origin requests are not allowed." });
    if (req.method === "GET" && p === "/api/meta")
      return send(res, 200, {
        auth: describeAuth(),
        images: imagesEnabled() ? (isMockMode() ? "mock" : process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare") : "off",
        themes: THEME_IDS.map((t) => ({ id: t, label: THEMES[t].label, bestFor: THEMES[t].bestFor })),
        maxBudget: MAX_UI_BUDGET,
        defaultBudget: Number(process.env.MAX_BUDGET_USD || 8),
        ...activeBrand(),
      });
    if (req.method === "GET" && p === "/api/jobs") return send(res, 200, listJobs());
    if (req.method === "POST" && p === "/api/jobs") {
      const b = await body(req);
      const o = optionsFrom(b);
      if (!o.brief) return send(res, 400, { error: "The brief is empty." });
      o.inputs = saveUploads(b.files);
      const id = newJobId(o.brief);
      start(id, { options: o, jobId: id });
      return send(res, 202, { id });
    }
    if (m) {
      const [, id, action] = m;
      if (req.method === "GET" && !action) {
        const job = readJob(id);
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
        try {
          const raw = readFileSync(path.join(jobDirFor(id), "events.jsonl"), "utf8");
          for (const line of raw.split("\n").filter(Boolean)) if (!line.includes('"type":"done"')) res.write(`data: ${line}\n\n`);
        } catch {}
        const job = readJob(id);
        if (job) res.write(`data: ${JSON.stringify({ type: "done", job })}\n\n`);
        return res.end();
      }
      if (req.method === "POST" && action === "/revise") {
        const b = await body(req);
        const instructions = String(b.instructions ?? "").trim();
        if (!instructions) return send(res, 400, { error: "Describe the change." });
        const cur = live.get(id);
        if (cur && !cur.events.some((e) => e.type === "done")) return send(res, 409, { error: "This job is still running." });
        const o = optionsFrom({ ...b, brief: "revision" });
        o.inputs = saveUploads(b.files);
        start(id, { options: o, reviseJobId: id, instructions });
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  server.listen(PORT, HOST, () => {
    console.log(`deck-agent → http://localhost:${PORT}`);
    console.log(`  Claude auth: ${describeAuth()}`);
  });
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.on(sig, async () => {
      for (const l of live.values()) l.abort.abort();
      await closeBrowser();
      process.exit(0);
    });
}
