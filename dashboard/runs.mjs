/**
 * runs.mjs: what the dashboard shows about each run, read from the agents' output folders (zero dependencies).
 *
 * Every agent records a run its own way (job.json, run.json, .lpa/result.json, or only its files); this turns them
 * into one shape: a title, a status everyone understands, when it happened, the spend, a thumbnail, the files.
 *
 *   status   ready · working · question (a storyboard to approve, a dev-agent question) · failed · stopped (marked
 *            running, but nothing has changed for half an hour) · cancelled · unknown
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { outputFolders, outputRoot, readJson, recordStatus } from "../lib/agents.mjs";

const KINDS = [
  ["image", /\.(png|jpe?g|webp|gif|svg|avif)$/i],
  ["video", /\.(mp4|mov|webm|m4v)$/i],
  ["audio", /\.(mp3|wav|m4a|aac|ogg)$/i],
  ["pdf", /\.pdf$/i],
  ["markdown", /\.(md|markdown)$/i],
  ["html", /\.html?$/i],
  ["archive", /\.(zip|tgz|tar|gz)$/i],
  ["data", /\.(json|jsonl|csv|tsv|xlsx|yml|yaml)$/i],
  ["text", /\.(txt|log)$/i],
];
export const fileKind = (name) => KINDS.find(([, re]) => re.test(name))?.[0] ?? "other";

/** Never listed or served: secrets and machinery. */
export const PRIVATE = /(^|[\\/])(\.env(\.[^\\/]*)?|secrets\.env|\.git|node_modules|\.next)([\\/]|$)/;

/** A run marked running that hasn't changed for this long has most likely stopped (the process died or was killed). */
export const STALE_MS = 30 * 60 * 1000;

/** Files that are the agents' bookkeeping, not results: left out of the Files view. */
const BOOKKEEPING = /^(job|run|manifest|doc|storyline-plan|credits)\.jsonl?$|^events\.jsonl$|^product-context\.md$|^shell-env\.sh$|\.log$/i;

/** Big result first, by name: what a run's card shows. */
const THUMBS = ["contact-sheet.jpg", "preview/slide-01.jpg", "preview/page-01.jpg", ".lpa/screens/desktop-01.jpg", "png/slide-01.png", "png/page-01.png", "storyboard.jpg"];
const THUMB_DIRS = ["preview", "png", ".lpa/screens", "screens"];

const cache = new Map();
/** JSON, parsed again only when the file changed. */
function readRecord(file) {
  let st;
  try {
    st = statSync(file);
  } catch {
    return null;
  }
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.data;
  const data = readJson(file);
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, data });
  return data;
}

const mtimeOf = (file) => {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

const list = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith(".") || e.name === ".lpa");
  } catch {
    return [];
  }
};

/** One status for every agent's vocabulary. `fresh`: the run's folder changed recently. */
export function normalizeStatus(raw, { fresh = false, hasResult = false } = {}) {
  switch (raw) {
    case "done":
    case "success":
    case "succeeded":
      return "ready";
    case "storyboard":
    case "waiting":
      return "question";
    case "running":
    case "queued":
    case "in_progress":
      return fresh ? "working" : "stopped";
    case "error":
    case "failed":
    case "agent_error":
    case "verification_failed":
    case "blocked":
      return "failed";
    case "cancelled":
    case "aborted":
      return "cancelled";
    case undefined:
    case null:
      return hasResult ? "ready" : fresh ? "working" : "unknown";
    default:
      return "unknown";
  }
}

/** "20261008-123538-ai-in-romanian-business-2026" → "Ai in romanian business 2026". */
export function prettify(name) {
  const s = String(name)
    .replace(/^\d{8}-\d{6}-/, "")
    .replace(/^\d{4}-\d{2}-\d{2}(-\d{2}-\d{2})?-/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return s ? s[0].toUpperCase() + s.slice(1) : String(name);
}

function firstHeading(file) {
  try {
    const text = readFileSync(file, "utf8").slice(0, 4000);
    const m = text.replace(/^---[\s\S]*?\n---\n/, "").match(/^#\s+(.+)$/m);
    const h = m ? m[1].replace(/^(plan|brief)\s*[—:-]\s*/i, "").replace(/,?\s*palette\s+`?[\w-]+`?\s*$/i, "").replace(/`/g, "").trim() : "";
    return h && !/^(plan|brief|readme)$/i.test(h) ? h : null;
  } catch {
    return null;
  }
}

const firstLine = (text) => {
  const line = String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  if (!line) return null;
  const s = line.length > 90 ? `${line.slice(0, 88).replace(/\s+\S*$/, "")}…` : line;
  return s[0].toUpperCase() + s.slice(1);
};

/** The record's title, else the brief's first heading, else the request, else the folder name without its timestamp. */
function titleOf(rec, dir) {
  if (typeof rec?.title === "string" && rec.title.trim()) return rec.title.trim();
  // brief first; a plan's heading (landing pages, collage posts) names the subject better than a one-line request
  for (const f of ["brief.md", "BRIEF.md", "PLAN.md", "plan.md"]) {
    const h = existsSync(path.join(dir, f)) && firstHeading(path.join(dir, f));
    if (h) return h;
  }
  const request = rec?.request ?? rec?.brief;
  return (typeof request === "string" && firstLine(request)) || prettify(path.basename(dir));
}

/** What a running job is doing right now: the last status line of its events.jsonl. */
function activityOf(dir) {
  const file = path.join(dir, "events.jsonl");
  let fd;
  try {
    const size = statSync(file).size;
    const len = Math.min(size, 16384);
    const buf = Buffer.alloc(len);
    fd = openSync(file, "r");
    readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString("utf8").split("\n").reverse();
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        const text = e.message ?? e.summary ?? e.label ?? (e.type === "step" ? e.step : null);
        if (typeof text === "string" && text.trim()) return text.trim().slice(0, 140);
      } catch {
        /* a partial first line */
      }
    }
  } catch {
    /* no events */
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return null;
}

function thumbOf(dir, rawStatus) {
  const names = rawStatus === "storyboard" ? ["storyboard.jpg", ...THUMBS] : THUMBS;
  for (const rel of names) if (existsSync(path.join(dir, rel))) return rel;
  for (const sub of THUMB_DIRS) {
    const img = list(path.join(dir, sub))
      .filter((e) => e.isFile() && fileKind(e.name) === "image")
      .map((e) => e.name)
      .sort()[0];
    if (img) return `${sub}/${img}`;
  }
  return null;
}

/** All runs of one agent, newest first, as the dashboard lists them. `now` is for tests. */
export function listRuns(a, { env, now = Date.now() } = {}) {
  const base = outputRoot(a, env);
  return outputFolders(a, env)
    .map((dir) => {
      const recFile = path.join(dir, a.outputs.record);
      const rec = readRecord(recFile);
      const raw = recordStatus(rec);
      const last = Math.max(mtimeOf(dir), mtimeOf(recFile), mtimeOf(path.join(dir, "events.jsonl")));
      const fresh = now - last < STALE_MS;
      const hasResult = a.outputs.files.some((f) => existsSync(path.join(dir, f)));
      const status = normalizeStatus(raw, { fresh, hasResult });
      const created = rec?.createdAt ? Date.parse(rec.createdAt) : statSync(dir).birthtimeMs || mtimeOf(dir);
      return {
        agent: a.id,
        id: path.relative(base, dir).split(path.sep).join("/"),
        dir,
        title: titleOf(rec, dir),
        status,
        rawStatus: raw ?? null,
        phase: rec?.phase ?? rec?.step ?? null,
        activity: status === "working" ? activityOf(dir) : null,
        createdAt: new Date(created).toISOString(),
        updatedAt: new Date(Math.max(last, rec?.updatedAt ? Date.parse(rec.updatedAt) : 0)).toISOString(),
        costUsd: typeof (rec?.costUsd ?? rec?.cost) === "number" ? (rec.costUsd ?? rec.cost) : null,
        thumb: thumbOf(dir, raw),
        error: status === "failed" ? String(rec?.error ?? rec?.summary ?? "").slice(0, 300) || null : null,
      };
    })
    .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
}

const fileEntry = (dir, rel) => {
  const st = statSync(path.join(dir, rel));
  return { rel, name: path.basename(rel), kind: fileKind(rel), size: st.size, mtime: new Date(st.mtimeMs).toISOString() };
};

/** The pictures in a folder of a run, by name. */
function gallery(dir, sub) {
  return list(path.join(dir, sub))
    .filter((e) => e.isFile() && fileKind(e.name) === "image")
    .map((e) => fileEntry(dir, `${sub}/${e.name}`))
    .sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
}

/**
 * Everything about one run: the record's useful fields, the files at the top of its folder (key files first), the
 * picture folders the registry names (png/, .lpa/screens), the documents to read, and what to show big.
 */
export function runDetail(a, run) {
  const dir = run.dir;
  const rec = readRecord(path.join(dir, a.outputs.record)) ?? {};
  const keys = new Set(a.outputs.files);
  for (const f of [rec.pdf, rec.video, rec.contactSheet, rec.post, rec.zip, rec.storyboard?.review, rec.storyboard?.sheet]) if (typeof f === "string") keys.add(f);
  const files = list(dir)
    .filter((e) => e.isFile() && !PRIVATE.test(e.name) && e.name !== ".DS_Store")
    .map((e) => ({ ...fileEntry(dir, e.name), key: keys.has(e.name) }))
    .sort((x, y) => Number(y.key) - Number(x.key) || x.name.localeCompare(y.name));
  for (const f of a.outputs.files.filter((f) => f.includes("/") && !f.endsWith("/"))) {
    if (existsSync(path.join(dir, f)) && statSync(path.join(dir, f)).isFile()) files.unshift({ ...fileEntry(dir, f), key: true });
  }
  const galleries = a.outputs.files
    .filter((f) => existsSync(path.join(dir, f)) && statSync(path.join(dir, f)).isDirectory())
    .map((f) => ({ name: f, items: gallery(dir, f) }))
    .filter((g) => g.items.length);
  const docs = files.filter((f) => f.kind === "markdown" && (f.key || /^(brief|plan|credits)\.md$/i.test(f.name)));
  const video = files.find((f) => f.kind === "video" && f.key) ?? files.find((f) => f.kind === "video");
  const pdf = files.find((f) => f.kind === "pdf" && f.key) ?? files.find((f) => f.kind === "pdf");
  const storyboard = run.rawStatus === "storyboard" && files.find((f) => f.name === "storyboard.jpg");
  const primary = storyboard ? { kind: "image", rel: storyboard.rel } : video ? { kind: "video", rel: video.rel } : pdf ? { kind: "pdf", rel: pdf.rel } : galleries.length ? { kind: "gallery", rel: galleries[0].name } : run.thumb ? { kind: "image", rel: run.thumb } : null;
  const pick = (...names) => Object.fromEntries(names.filter((n) => rec[n] !== undefined && rec[n] !== null).map((n) => [n, rec[n]]));
  return {
    ...run,
    record: {
      ...pick("summary", "error", "warnings", "placeholders", "format", "theme", "durationSec", "width", "height", "frames", "brand", "product", "lint", "buildOk", "turns", "durationMs", "branch", "publish", "project", "request", "workflow", "caption"),
      options: rec.options ? Object.fromEntries(Object.entries(rec.options).filter(([k]) => !/key|token|secret/i.test(k))) : undefined,
      storyboard: rec.storyboard ? { version: rec.storyboard.version, frames: rec.storyboard.frames, seconds: rec.storyboard.seconds, presentedAt: rec.storyboard.presentedAt, approvedAt: rec.storyboard.approvedAt } : undefined,
      revisions: Array.isArray(rec.revisions) ? rec.revisions.map((r) => ({ at: r.at, kind: r.kind, instructions: String(r.instructions ?? "").slice(0, 400) })) : undefined,
      pages: Array.isArray(rec.pages) ? rec.pages.length : Array.isArray(rec.slides) ? rec.slides.length : undefined,
      milestones: Array.isArray(rec.milestones) ? rec.milestones.map((m) => ({ title: m.title, status: m.status })) : undefined,
    },
    files,
    galleries,
    docs,
    primary,
  };
}

/** The results of every run, for the Files view: pictures, videos, PDFs, archives and the key documents. */
export function runFiles(a, run) {
  const d = runDetail(a, run);
  const seen = new Set();
  const out = [];
  const add = (f, group) => {
    if (seen.has(f.rel)) return;
    seen.add(f.rel);
    out.push({ ...f, group });
  };
  for (const g of d.galleries) for (const f of g.items) add(f, g.name);
  for (const f of d.files) {
    if (BOOKKEEPING.test(f.name)) continue;
    if (["image", "video", "audio", "pdf", "archive"].includes(f.kind) || (f.kind === "markdown" && f.key) || (f.kind === "html" && f.key)) add(f, null);
  }
  return out;
}
