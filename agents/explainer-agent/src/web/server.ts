/**
 * Local web UI: http://localhost:5050 (127.0.0.1 only).
 * Start a video from a brief (+ files), follow the HyperFrames workflow step by step, watch the MP4, copy the post,
 * request revisions.
 */
import "../env.js";
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeAuth, jobDirFor, newJobId, readJob, runJob, type RunArgs } from "../agent.js";
import { DEFAULT_FORMAT, DEFAULT_LENGTH_SEC, DEFAULT_STYLE, FORMATS, FORMAT_IDS, OUTPUT_DIR, STYLES, STYLE_SPECS, WORKFLOWS, cliVersion, isFormat, isQuality, isStyle, isWorkflow, pluginInfo } from "../config.js";
import type { JobEvent, JobOptions, JobRecord } from "../events.js";
import { STEPS } from "../events.js";
import { preflight, type Preflight } from "../hyperframes.js";
import { soundSettings } from "../media/elevenlabs.js";
import { imageSettings } from "../media/images.js";
import { brandKit, resolveProduct } from "../product.js";

const PORT = Number(process.env.PORT || 5050);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_UI_BUDGET = Number(process.env.MAX_UI_BUDGET_USD || 30);
const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui.html");
const UPLOADS = path.join(OUTPUT_DIR, "_uploads");
const UPLOAD_TYPES = /\.(png|jpe?g|webp|gif|svg|avif|mp4|mov|webm|m4v|mp3|wav|m4a|aac|ogg|flac|md|markdown|txt|csv|tsv|json|pdf)$/i;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".woff2": "font/woff2", ".pdf": "application/pdf",
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
    try {
      if (new URL(origin).host !== req.headers.host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function body(req: http.IncomingMessage, limit = 300_000_000): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("Request too large (max about 200 MB of files).");
    chunks.push(c as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

// Files in a job folder are the agent's output (compositions are HTML with scripts): no network, no forms, no API calls.
const OUT_CSP = "default-src 'self' data: blob:; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' blob:; connect-src 'none'; form-action 'none'; base-uri 'self'; frame-ancestors 'self'";

/** Serve a file inside `root`, with byte ranges (the video player seeks with them). */
function serveFile(req: http.IncomingMessage, res: http.ServerResponse, root: string, rel: string, opts: { download?: boolean; csp?: boolean } = {}) {
  let abs: string;
  try {
    abs = path.resolve(root, decodeURIComponent(rel));
  } catch {
    res.writeHead(400).end("Bad path");
    return;
  }
  const inside = path.relative(root, abs);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside) || !existsSync(abs) || !statSync(abs).isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const size = statSync(abs).size;
  const headers: Record<string, string | number> = {
    "Content-Type": TYPES[path.extname(abs).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  if (opts.csp) headers["Content-Security-Policy"] = OUT_CSP;
  if (opts.download) headers["Content-Disposition"] = `attachment; filename="${path.basename(abs)}"`;
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    createReadStream(abs, { start, end }).on("error", () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "Content-Length": size });
  if (req.method === "HEAD") return void res.end();
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
    l.cleanup = setTimeout(() => {
      if (live.get(id) === l) live.delete(id);
    }, 5 * 60_000);
  }
}

function start(id: string, args: RunArgs) {
  const prev = live.get(id);
  if (prev?.cleanup) clearTimeout(prev.cleanup);
  const abort = new AbortController();
  live.set(id, { events: [], clients: new Set(), abort });
  runJob({ ...args, signal: abort.signal, emit: (e) => broadcast(id, e) }).catch((err) => {
    const message = (err as Error).message;
    broadcast(id, { type: "error", message });
    const job: JobRecord = { id, dir: jobDirFor(id), brief: "", options: { format: DEFAULT_FORMAT }, status: "error", createdAt: "", updatedAt: "", revisions: [], error: message };
    broadcast(id, { type: "done", job });
  });
}

/** Store uploaded files (base64) and return their absolute paths. */
function saveUploads(files: unknown): string[] {
  if (!Array.isArray(files) || !files.length) return [];
  const dir = path.join(UPLOADS, `${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return files.slice(0, 20).map((f: { name?: string; data?: string }) => {
    const name = String(f.name ?? "file").replace(/[^\w.-]+/g, "-").replace(/^[-.]+/, "").slice(0, 80) || "file";
    if (!UPLOAD_TYPES.test(name)) throw new Error(`Unsupported file type: ${name}`);
    const p = path.join(dir, name);
    writeFileSync(p, Buffer.from(String(f.data ?? ""), "base64"));
    return p;
  });
}

function optionsFrom(b: any): JobOptions {
  const o: JobOptions = { brief: String(b.brief ?? "").trim(), format: isFormat(b.format) ? b.format : DEFAULT_FORMAT };
  const length = Number(b.length);
  if (b.length !== undefined && b.length !== "") {
    if (!(length >= 3 && length <= 300)) throw new Error("Length must be between 3 and 300 seconds.");
    o.lengthSec = Math.round(length);
  }
  if (b.voice === true) o.voice = true;
  if (b.voiceId) o.voiceId = String(b.voiceId).trim().slice(0, 120);
  if (b.sfx === true) o.sfx = true;
  if (b.images === false) o.images = false;
  if (b.musicPrompt && String(b.musicPrompt).trim()) o.musicPrompt = String(b.musicPrompt).trim().slice(0, 400);
  if (b.language) o.language = String(b.language).trim().slice(0, 20);
  if (b.audience) o.audience = String(b.audience).trim().slice(0, 200);
  if (isQuality(b.quality)) o.quality = b.quality;
  if (isWorkflow(b.workflow)) o.workflow = b.workflow;
  if (isStyle(b.style)) o.style = b.style;
  if (b.url) {
    const url = String(b.url).trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error("The website must be an http(s) URL.");
    o.url = url;
  }
  if (o.workflow === "product-launch-video" && !o.url) throw new Error("A product launch video needs the website URL.");
  if (b.model) o.model = String(b.model).slice(0, 80);
  if (b.budget) o.maxBudgetUsd = Math.min(MAX_UI_BUDGET, Math.max(0.5, Number(b.budget) || 15));
  return o;
}

let machine: Promise<Preflight> | null = null;

/** What the UI shows in its header: auth, brand, HyperFrames versions, the voice provider and whether Chrome is ready. */
async function meta() {
  let brand = "none";
  let product: string | null = null;
  let style = DEFAULT_STYLE;
  try {
    const p = resolveProduct(undefined);
    const kit = brandKit(p);
    brand = kit.source;
    style = kit.style ?? DEFAULT_STYLE;
    product = p?.name ?? null;
  } catch (e) {
    brand = `error: ${(e as Error).message}`;
  }
  machine ??= preflight({ voice: true });
  const pf = await machine;
  const plugin = pluginInfo();
  return {
    auth: describeAuth(),
    brand,
    product,
    hyperframes: { cli: cliVersion(), skills: plugin.version, skillCount: plugin.skills.length },
    voice: pf.voice.provider,
    images: (() => {
      const i = imageSettings();
      return i.available ? (i.mock ? "placeholders (IMAGE_MOCK=1)" : `OpenAI ${i.model}`) : null;
    })(),
    sound: soundSettings().available ? "ElevenLabs" : null,
    ready: pf.problems.filter((p) => !p.startsWith("--voice")),
    formats: FORMAT_IDS.map((id) => ({ id, label: FORMATS[id].label })),
    workflows: WORKFLOWS,
    styles: STYLES.map((id) => ({ id, label: STYLE_SPECS[id].label })),
    steps: STEPS,
    defaults: { format: DEFAULT_FORMAT, style, length: DEFAULT_LENGTH_SEC, budget: Number(process.env.MAX_BUDGET_USD || 15) },
    maxBudget: MAX_UI_BUDGET,
  };
}

function listJobs() {
  if (!existsSync(OUTPUT_DIR)) return [];
  return readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => readJob(d.name))
    .filter((j): j is JobRecord => !!j)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((j) => ({
      id: j.id,
      title: j.title ?? j.brief.split("\n")[0].replace(/^#+\s*/, "").slice(0, 80),
      status: j.status,
      format: j.options.format,
      durationSec: j.durationSec,
      thumb: j.contactSheet,
      createdAt: j.createdAt,
      running: live.has(j.id) && j.status === "running",
    }));
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const p = url.pathname;
    const m = p.match(/^\/api\/jobs\/([a-z0-9-]+)(\/[a-z]+)?$/i);
    if (req.method === "GET" && p === "/") return serveFile(req, res, path.dirname(UI), "ui.html");
    if ((req.method === "GET" || req.method === "HEAD") && p.startsWith("/out/")) {
      const [, , id, ...rest] = p.split("/");
      return serveFile(req, res, jobDirFor(id), rest.join("/"), { download: url.searchParams.has("download"), csp: true });
    }
    if (req.method === "POST" && !sameOrigin(req)) return send(res, 403, { error: "Cross-origin requests are not allowed." });
    if (req.method === "GET" && p === "/api/meta") return send(res, 200, await meta());
    if (req.method === "GET" && p === "/api/jobs") return send(res, 200, listJobs());
    if (req.method === "POST" && p === "/api/jobs") {
      const b = await body(req);
      let o: JobOptions;
      try {
        o = optionsFrom(b);
        if (!o.brief) throw new Error("The brief is empty.");
        o.inputs = saveUploads(b.files);
      } catch (e) {
        return send(res, 400, { error: (e as Error).message });
      }
      const id = newJobId(o.brief);
      start(id, { options: o, jobId: id });
      return send(res, 202, { id });
    }
    if (m) {
      const [, id, action] = m;
      if (req.method === "GET" && !action) {
        const job = readJob(id);
        if (!job) return send(res, 404, { error: "Not found" });
        let post: string | null = null;
        try {
          if (job.post) post = readFileSync(path.join(jobDirFor(job.id), job.post), "utf8");
        } catch {}
        return send(res, 200, { ...job, post, running: live.has(id) && job.status === "running" });
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
        if (!readJob(id)) return send(res, 404, { error: "Not found" });
        const o: JobOptions = { brief: "revision", format: DEFAULT_FORMAT };
        if (isQuality(b.quality)) o.quality = b.quality;
        if (b.budget) o.maxBudgetUsd = Math.min(MAX_UI_BUDGET, Math.max(0.5, Number(b.budget) || 15));
        try {
          o.inputs = saveUploads(b.files);
        } catch (e) {
          return send(res, 400, { error: (e as Error).message });
        }
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
    console.log(`explainer-agent → http://localhost:${PORT}`);
    console.log(`  Claude auth: ${describeAuth()}`);
  });
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.on(sig, () => {
      for (const l of live.values()) l.abort.abort();
      setTimeout(() => process.exit(0), 300);
    });
}
