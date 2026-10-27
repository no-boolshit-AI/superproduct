/**
 * The superproduct dashboard's server (Node 20+, ESM, zero dependencies): a local web page that shows the agents'
 * readiness, everything they made and the product folder, answers the dev-agent's questions, and walks you through
 * setup (keys, installs, settings). Started by `node scripts/dashboard.mjs`.
 *
 * It reads the kit and the workspace on every request, so the page shows what's on disk. It listens on 127.0.0.1 only,
 * answers only requests addressed to that host (no DNS rebinding), and every change needs the token the page was
 * served with, which other sites can't read. Keys go into each agent's .env and never come back out: the API only
 * says which names are set. Files are served from the workspace (and the agents' output folders and product folder
 * when those live elsewhere), never .env, secrets.env, .git or node_modules.
 *
 * Landing pages get a second server on the next port (the site preview): Next.js exports load their files from the
 * site's root (/_next/…), and a separate origin keeps the sites' scripts away from the dashboard.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REGISTRY, agentPath, askDir, coworkVm, findAgent, listPending, outputRoot, probeToolsAsync, productStatus, statusOf, workspaceStatus, writeAnswer } from "../lib/agents.mjs";
import { describeEnvExample, isSecretName, readEnvFile, updateEnvFile } from "../lib/env-file.mjs";
import { findProductDir, listDocs, loadProduct, parseFrontmatter } from "../lib/product.mjs";
import { KIT_ROOT, workspaceDir } from "../lib/workspace.mjs";
import { PRIVATE, listRuns, runDetail, runFiles } from "./runs.mjs";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

/** The services the agents use, how the page names them, and where to get a key. */
export const CONNECTIONS = [
  { id: "claude", label: "Claude", role: "Thinking and writing", vars: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"], url: "https://platform.claude.com", essential: true },
  { id: "openai", label: "OpenAI", role: "Pictures", vars: ["OPENAI_API_KEY"], url: "https://platform.openai.com/api-keys" },
  { id: "elevenlabs", label: "ElevenLabs", role: "Voice, music and sound", vars: ["ELEVENLABS_API_KEY"], url: "https://elevenlabs.io/app/settings/api-keys" },
  { id: "github", label: "GitHub", role: "App changes", vars: ["GITHUB_TOKEN"], url: "https://github.com/settings/personal-access-tokens/new" },
  { id: "heygen", label: "HeyGen", role: "Narration, another voice", vars: ["HEYGEN_API_KEY"], url: "https://app.heygen.com/settings" },
  { id: "context7", label: "Context7", role: "Library docs for the dev agent", vars: ["CONTEXT7_API_KEY"], url: "https://context7.com/dashboard" },
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".csv": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};
const typeOf = (file) => TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";

const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "frame-src 'self' http://127.0.0.1:* http://localhost:*",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");
/** Files from the workspace that could run scripts (HTML, SVG) get an origin of their own. */
const SANDBOX = "sandbox allow-scripts allow-popups";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
const inside = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** First name of the person at this computer, for the greeting (the page lets them change it). */
function userName() {
  let full = "";
  try {
    if (process.platform === "darwin") full = execFileSync("id", ["-F"], { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    /* no full name */
  }
  const name = (full.trim() || os.userInfo().username || "").split(/[\s._-]+/)[0];
  return name ? name[0].toUpperCase() + name.slice(1) : "";
}

/**
 * Create the dashboard. Returns { server, sites, token, state }: two http.Servers, not listening yet.
 * `registry`, `env` and `probe` (what's installed on this computer) are for tests.
 */
export function createDashboard({ registry = REGISTRY, env = process.env, token = randomBytes(18).toString("base64url"), probe = probeToolsAsync } = {}) {
  const user = userName();
  let tools = null;
  let toolsPromise = null;
  const refreshTools = () => (toolsPromise = probe().then((t) => (tools = t)));
  const getTools = async () => tools ?? (await (toolsPromise ?? refreshTools()));
  const tasks = new Map();
  let sitesPort = null;

  // ------------------------------------------------------------ where files may come from

  /** Folders whose files the page may show: { key: absolute path }. */
  function roots() {
    const ws = real(workspaceDir({ env }));
    const out = { ws };
    const product = productDir();
    if (product && !inside(ws, real(product))) out.product = real(product);
    for (const a of registry) {
      const root = real(outputRoot(a, agentEnvOf(a)));
      if (!inside(ws, root)) out[`out-${a.id}`] = root;
    }
    return out;
  }
  const agentEnvOf = (a) => ({ ...readEnvFile(path.join(agentPath(a), ".env")), ...Object.fromEntries(Object.entries(env).filter(([, v]) => v)) });
  const productDir = () => {
    try {
      return findProductDir({ from: KIT_ROOT, env, workspace: workspaceDir({ env }) });
    } catch {
      return null;
    }
  };

  /** The URL that serves an absolute path, or null when it's outside every root. */
  function urlFor(abs, all = roots()) {
    const p = real(abs);
    let best = null;
    for (const [key, root] of Object.entries(all)) if (inside(root, p) && (!best || root.length > best[1].length)) best = [key, root];
    if (!best || PRIVATE.test(p)) return null;
    return `/f/${best[0]}/${path.relative(best[1], p).split(path.sep).map(encodeURIComponent).join("/")}`;
  }

  /** The absolute path a /f/<root>/<path> URL names, if it's allowed. */
  function pathFor(urlPath) {
    const m = urlPath.match(/^\/f\/([^/]+)\/(.*)$/);
    if (!m) return null;
    const root = roots()[m[1]];
    if (!root) return null;
    let rel;
    try {
      rel = m[2].split("/").map(decodeURIComponent).join(path.sep);
    } catch {
      return null;
    }
    const abs = path.resolve(root, rel);
    if (!inside(root, abs) || PRIVATE.test(path.relative(root, abs))) return null;
    if (existsSync(abs) && !inside(root, real(abs))) return null;
    return abs;
  }

  // ------------------------------------------------------------ state

  function agentInfo(a, t) {
    const dir = agentPath(a);
    const example = path.join(dir, ".env.example");
    const settings = existsSync(example) ? describeEnvExample(readFileSync(example, "utf8")) : [];
    const fileEnv = readEnvFile(path.join(dir, ".env"));
    // the keys of the services in CONNECTIONS this agent takes, plus whatever the registry lists
    const services = new Set(CONNECTIONS.flatMap((c) => c.vars));
    const accepts = [...new Set([...a.env.required, ...a.env.optional, ...settings.filter((s) => services.has(s.name)).map((s) => s.name)])];
    const keys = accepts.map((name) => ({
      name,
      set: !!(fileEnv[name] || env[name]),
      source: fileEnv[name] ? "env-file" : env[name] ? "shell" : null,
      required: a.env.required.includes(name),
    }));
    const st = statusOf(a, { tools: t, env });
    return {
      id: a.id,
      dir: a.dir,
      title: a.title,
      summary: a.summary,
      command: a.command,
      example: a.example,
      web: a.web,
      needs: a.needs,
      claudeAuth: a.claudeAuth,
      skill: a.skill,
      test: a.test,
      ready: st.ready,
      problems: st.problems,
      checks: st.checks,
      claude: st.claude,
      keys,
      hasEnv: existsSync(path.join(dir, ".env")),
      hasExample: existsSync(example),
    };
  }

  function connectionsInfo(agents) {
    return CONNECTIONS.map((c) => {
      const users = agents.filter((a) => a.keys.some((k) => c.vars.includes(k.name)));
      const perAgent = users.map((a) => ({
        id: a.id,
        vars: a.keys.filter((k) => c.vars.includes(k.name)).map((k) => ({ name: k.name, set: k.set, source: k.source, required: k.required })),
      }));
      const has = (pa) => pa.vars.some((v) => v.set);
      let state;
      let detail;
      if (c.id === "claude") {
        const ok = agents.filter((a) => a.claude);
        state = ok.length === agents.length ? "connected" : ok.length ? "partial" : "missing";
        const login = agents.filter((a) => /login/.test(a.claude ?? "")).length;
        const keyed = agents.filter((a) => a.claude && !/login/.test(a.claude)).length;
        detail = [login ? `Claude Code login for ${login}` : null, keyed ? `key or token in ${keyed}` : null, agents.length - ok.length ? `${agents.length - ok.length} still need one` : null].filter(Boolean).join(" · ");
      } else {
        const set = perAgent.filter(has).length;
        const needed = perAgent.filter((pa) => pa.vars.some((v) => v.required));
        state = set === 0 ? "missing" : needed.some((pa) => !has(pa)) || set < perAgent.length ? "partial" : "connected";
        detail = set ? `Set in ${set} of ${perAgent.length} agents` : needed.length ? `Needed by ${needed.map((pa) => pa.id).join(", ")}` : "Optional";
      }
      return { ...c, state, detail, required: perAgent.some((pa) => pa.vars.some((v) => v.required)), agents: perAgent };
    });
  }

  let productCache = { at: 0, value: null };
  function productInfo() {
    if (Date.now() - productCache.at < 4000) return productCache.value;
    const st = productStatus({ env });
    const dir = productDir();
    let value = { ...st, docs: [], counts: st.docs ?? {} };
    if (dir && st.name) {
      try {
        const p = loadProduct(dir);
        const m = p.manifest;
        const docs = listDocs(dir).map((rel) => {
          let fm = { data: {} };
          try {
            fm = parseFrontmatter(readFileSync(path.join(dir, rel), "utf8"));
          } catch {
            /* unreadable */
          }
          return { path: rel, title: fm.data.title ?? path.basename(rel, ".md"), status: fm.data.status ?? null, updated: fm.data.updated ? String(fm.data.updated) : null };
        });
        const logo = p.logo("primary") ?? p.logo("mark");
        value = {
          ...value,
          id: m.id,
          tagline: m.tagline ?? null,
          oneLiner: m.oneLiner ?? null,
          website: m.website ?? null,
          offerings: (m.offerings ?? []).length,
          cta: m.cta?.primary ?? null,
          logo: logo ? urlFor(logo) : null,
          absDir: dir,
          docs,
        };
      } catch (e) {
        value = { ...value, error: e.message };
      }
    }
    productCache = { at: Date.now(), value };
    return value;
  }

  async function state() {
    const t = await getTools();
    const agents = registry.map((a) => agentInfo(a, t));
    const all = roots();
    const runs = registry
      .flatMap((a) => listRuns(a, { env: agentEnvOf(a) }))
      .map(({ dir, ...r }) => ({ ...r, folder: dir, thumb: r.thumb ? urlFor(path.join(dir, r.thumb), all) : null }))
      .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
    let pending = [];
    try {
      pending = listPending(askDir({ registry, env })).map(({ pid, howToAnswer, ...item }) => ({
        ...item,
        prdUrl: item.prd && existsSync(item.prd) ? urlFor(item.prd, all) : null,
        planUrl: item.plan && existsSync(item.plan) ? urlFor(item.plan, all) : null,
      }));
    } catch {
      /* no relay folder */
    }
    return {
      generatedAt: new Date().toISOString(),
      user,
      kit: KIT_ROOT,
      coworkVm,
      sitesPort,
      workspace: { ...workspaceStatus({ env }), abs: workspaceDir({ env }) },
      product: productInfo(),
      agents,
      connections: connectionsInfo(agents),
      runs,
      pending,
      tasks: [...tasks.values()].map(({ child, ...t }) => ({ ...t, log: t.log.slice(-60) })),
      tools: t,
    };
  }

  // ------------------------------------------------------------ one run, files, docs, settings

  function findRun(agentId, runId) {
    const a = findAgent(agentId, registry);
    if (!a) throw new HttpError(404, `Unknown agent ${agentId}`);
    const run = listRuns(a, { env: agentEnvOf(a) }).find((r) => r.id === runId);
    if (!run) throw new HttpError(404, `No run ${runId} for ${agentId}`);
    return { a, run };
  }

  function withUrls(dir, f, all) {
    return { ...f, url: urlFor(path.join(dir, f.rel), all) };
  }

  function runInfo(agentId, runId) {
    const { a, run } = findRun(agentId, runId);
    const d = runDetail(a, run);
    const all = roots();
    const { dir, ...rest } = d;
    const site = a.id === "landing-page" && existsSync(path.join(dir, "out", "index.html")) && sitesPort ? `http://127.0.0.1:${sitesPort}/${encodeURIComponent(path.basename(dir))}/` : null;
    return {
      ...rest,
      folder: dir,
      thumb: run.thumb ? urlFor(path.join(dir, run.thumb), all) : null,
      files: d.files.map((f) => withUrls(dir, f, all)),
      galleries: d.galleries.map((g) => ({ ...g, items: g.items.map((f) => withUrls(dir, f, all)) })),
      docs: d.docs.map((f) => withUrls(dir, f, all)),
      primary: d.primary ? { ...d.primary, url: d.primary.kind === "gallery" ? null : urlFor(path.join(dir, d.primary.rel), all) } : null,
      site,
    };
  }

  function allFiles() {
    const all = roots();
    return registry.flatMap((a) =>
      listRuns(a, { env: agentEnvOf(a) }).flatMap((run) =>
        runFiles(a, run).map((f) => ({ ...withUrls(run.dir, f, all), agent: a.id, run: run.id, runTitle: run.title, runStatus: run.status })),
      ),
    );
  }

  function docInfo(rel) {
    const dir = productDir();
    if (!dir || !listDocs(dir).includes(rel)) throw new HttpError(404, "No such document in the product folder");
    const { data, body } = parseFrontmatter(readFileSync(path.join(dir, rel), "utf8"));
    return { path: rel, data, body, file: path.join(dir, rel), url: urlFor(path.join(dir, rel)) };
  }

  function settingsOf(agentId) {
    const a = findAgent(agentId, registry);
    if (!a) throw new HttpError(404, `Unknown agent ${agentId}`);
    const dir = agentPath(a);
    const example = path.join(dir, ".env.example");
    const items = existsSync(example) ? describeEnvExample(readFileSync(example, "utf8")) : [];
    const current = readEnvFile(path.join(dir, ".env"));
    return {
      agent: a.id,
      file: path.join(a.dir, ".env"),
      exists: existsSync(path.join(dir, ".env")),
      items: items.map((s) => ({
        ...s,
        set: !!current[s.name],
        // secrets never leave the server; other settings show their value
        current: s.secret ? undefined : (current[s.name] ?? null),
        value: s.secret ? "" : s.value,
      })),
    };
  }

  /** Write variables into one agent's .env (starting from its .env.example). Only names its .env.example or the registry knows. */
  function writeEnv(agentId, values) {
    const a = findAgent(agentId, registry);
    if (!a) throw new HttpError(404, `Unknown agent ${agentId}`);
    const dir = agentPath(a);
    const example = path.join(dir, ".env.example");
    const known = new Set([...a.env.required, ...a.env.optional, ...(existsSync(example) ? describeEnvExample(readFileSync(example, "utf8")).map((s) => s.name) : [])]);
    const clean = {};
    for (const [name, value] of Object.entries(values ?? {})) {
      if (!known.has(name)) throw new HttpError(400, `${a.id} has no setting ${name}`);
      if (value !== null && typeof value !== "string") throw new HttpError(400, `${name}: the value must be text`);
      const v = value == null ? "" : value.trim();
      if (v.length > 4096) throw new HttpError(400, `${name}: the value is too long`);
      if (isSecretName(name) && /\s/.test(v)) throw new HttpError(400, `${name}: a key can't contain spaces`);
      clean[name] = v;
    }
    try {
      updateEnvFile(path.join(dir, ".env"), clean, { example });
    } catch (e) {
      throw new HttpError(400, e.message);
    }
    productCache.at = 0;
    return Object.keys(clean);
  }

  // ------------------------------------------------------------ installs and tests

  function startTask(action, agentId) {
    if (!["install", "test"].includes(action)) throw new HttpError(400, "Tasks are install or test");
    const a = findAgent(agentId, registry);
    if (!a) throw new HttpError(404, `Unknown agent ${agentId}`);
    if (coworkVm) throw new HttpError(409, "The agents install and run on your computer, not in the Cowork VM: run the dashboard there.");
    for (const t of tasks.values()) if (t.agent === a.id && t.status === "running") throw new HttpError(409, `${a.id} is already busy (${t.action})`);
    const id = `${action}-${a.id}-${Date.now().toString(36)}`;
    const task = { id, action, agent: a.id, status: "running", startedAt: new Date().toISOString(), endedAt: null, code: null, log: [] };
    const child = spawn(process.execPath, [path.join(KIT_ROOT, "scripts", "agents.mjs"), action, a.id], {
      cwd: KIT_ROOT,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", npm_config_color: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let partial = "";
    const take = (chunk) => {
      const text = (partial + chunk.toString("utf8")).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r(?!\n)/g, "\n");
      const lines = text.split("\n");
      partial = lines.pop();
      task.log.push(...lines.filter((l) => l.trim()));
      if (task.log.length > 400) task.log.splice(0, task.log.length - 400);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("close", (code) => {
      if (partial.trim()) task.log.push(partial);
      task.status = code === 0 ? "done" : "failed";
      task.code = code;
      task.endedAt = new Date().toISOString();
      refreshTools();
    });
    child.on("error", (e) => {
      task.status = "failed";
      task.log.push(e.message);
    });
    tasks.set(id, task);
    for (const old of [...tasks.keys()].slice(0, -20)) if (tasks.get(old).status !== "running") tasks.delete(old);
    const { log, ...summary } = task;
    return { ...summary, log: [] };
  }

  // ------------------------------------------------------------ open a folder on this computer

  function reveal(abs) {
    const p = real(abs);
    const allowed = [...Object.values(roots()), ...registry.map((a) => real(agentPath(a)))];
    if (!allowed.some((r) => inside(r, p)) || PRIVATE.test(p) || !existsSync(p)) throw new HttpError(403, "That folder isn't part of the kit or the workspace");
    const isDir = statSync(p).isDirectory();
    const [cmd, args] = process.platform === "darwin" ? ["open", isDir ? [p] : ["-R", p]] : process.platform === "win32" ? ["explorer", isDir ? [p] : [`/select,${p}`]] : ["xdg-open", [isDir ? p : path.dirname(p)]];
    spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  }

  // ------------------------------------------------------------ HTTP

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "x-content-type-options": "nosniff", "cache-control": "no-store", ...headers });
    res.end(body);
  };
  const json = (res, status, data) => send(res, status, JSON.stringify(data), { "content-type": "application/json; charset=utf-8" });

  const hostAllowed = (host, port) => [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(String(host ?? "").toLowerCase());

  async function body(req) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > 65536) throw new HttpError(413, "Too much data");
      chunks.push(c);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      throw new HttpError(400, "The request isn't JSON");
    }
  }

  /** Serve a file, with byte ranges (videos seek with them). */
  function serveFile(req, res, file, headers = {}) {
    let st;
    try {
      st = statSync(file);
    } catch {
      return send(res, 404, "Not found");
    }
    if (!st.isFile()) return send(res, 404, "Not found");
    const type = typeOf(file);
    const base = { "content-type": type, "accept-ranges": "bytes", "x-content-type-options": "nosniff", "cache-control": "no-cache", "last-modified": st.mtime.toUTCString(), ...headers };
    if (/text\/html|image\/svg/.test(type) && !headers["content-security-policy"]) base["content-security-policy"] = SANDBOX;
    const range = String(req.headers.range ?? "").match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
      let end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start >= st.size || start > end) return send(res, 416, "", { "content-range": `bytes */${st.size}` });
      res.writeHead(206, { ...base, "content-range": `bytes ${start}-${end}/${st.size}`, "content-length": end - start + 1 });
      if (req.method === "HEAD") return res.end();
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...base, "content-length": st.size });
    if (req.method === "HEAD") return res.end();
    createReadStream(file).pipe(res);
  }

  function servePage(res) {
    const html = readFileSync(path.join(PUBLIC, "index.html"), "utf8").replace("__DASHBOARD_TOKEN__", token);
    send(res, 200, html, { "content-type": "text/html; charset=utf-8", "content-security-policy": PAGE_CSP, "referrer-policy": "no-referrer" });
  }

  async function route(req, res) {
    const port = req.socket.localPort;
    if (!hostAllowed(req.headers.host, port)) return send(res, 421, "This dashboard only answers on 127.0.0.1 and localhost.");
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;
    const method = req.method;

    if (method === "POST") {
      const origin = req.headers.origin;
      if (origin && !hostAllowed(origin.replace(/^http:\/\//, ""), port)) throw new HttpError(403, "Changes are only accepted from the dashboard itself");
      if (req.headers["x-dashboard-token"] !== token) throw new HttpError(403, "Reload the page: the dashboard was restarted");
      const data = await body(req);
      if (p === "/api/keys") {
        const { name, value, agents } = data;
        const conn = CONNECTIONS.find((c) => c.vars.includes(name));
        if (!conn) throw new HttpError(400, `${name} isn't a key the dashboard manages`);
        if (!Array.isArray(agents) || !agents.length) throw new HttpError(400, "Choose at least one agent");
        const t = await getTools();
        for (const id of agents) {
          const a = findAgent(id, registry);
          if (!a || !agentInfo(a, t).keys.some((k) => k.name === name)) throw new HttpError(400, `${id} doesn't use ${name}`);
        }
        for (const id of agents) writeEnv(id, { [name]: value ?? "" });
        return json(res, 200, { ok: true, agents });
      }
      let m;
      if ((m = p.match(/^\/api\/agents\/([\w-]+)\/settings$/))) return json(res, 200, { ok: true, written: writeEnv(m[1], data.values) });
      if (p === "/api/tasks") return json(res, 200, startTask(data.action, data.agent));
      if (p === "/api/tools/refresh") {
        await refreshTools();
        return json(res, 200, { ok: true });
      }
      if (p === "/api/reveal") {
        const target = data.url ? pathFor(new URL(data.url, "http://x").pathname) : data.path;
        if (!target) throw new HttpError(400, "Nothing to open");
        reveal(target);
        return json(res, 200, { ok: true });
      }
      if ((m = p.match(/^\/api\/relay\/([\w.-]+)$/))) {
        try {
          const item = writeAnswer(m[1], data, askDir({ registry, env }));
          return json(res, 200, { ok: true, id: item.id });
        } catch (e) {
          throw new HttpError(400, e.message);
        }
      }
      throw new HttpError(404, "No such action");
    }

    if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "Method not allowed");
    if (p === "/api/state") return json(res, 200, await state());
    if (p === "/api/run") return json(res, 200, runInfo(url.searchParams.get("agent"), url.searchParams.get("id")));
    if (p === "/api/files") return json(res, 200, allFiles());
    if (p === "/api/doc") return json(res, 200, docInfo(url.searchParams.get("path")));
    let m;
    if ((m = p.match(/^\/api\/agents\/([\w-]+)\/settings$/))) return json(res, 200, settingsOf(m[1]));
    if (p.startsWith("/f/")) {
      const file = pathFor(p);
      if (!file) return send(res, 404, "Not found");
      return serveFile(req, res, file, url.searchParams.has("download") ? { "content-disposition": `attachment; filename="${path.basename(file).replace(/"/g, "")}"` } : {});
    }
    if (p === "/" || p === "/index.html") return servePage(res);
    const file = path.resolve(PUBLIC, `.${decodeURIComponent(p)}`);
    if (!inside(PUBLIC, file) || !existsSync(file)) return send(res, 404, "Not found");
    return serveFile(req, res, file, { "content-security-policy": PAGE_CSP });
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((e) => {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) return json(res, e.status, { error: e.message });
      console.error(e);
      json(res, 500, { error: e.message });
    });
  });

  // ------------------------------------------------------------ landing page previews

  /** The landing pages' static builds by slug: sites/<slug>/out. */
  function siteDirs() {
    const a = findAgent("landing-page", registry);
    if (!a) return {};
    const base = outputRoot(a, agentEnvOf(a));
    return Object.fromEntries(listRuns(a, { env: agentEnvOf(a) }).map((r) => [r.id, path.join(base, r.id, "out")]).filter(([, d]) => existsSync(d)));
  }

  const sites = http.createServer((req, res) => {
    const port = req.socket.localPort;
    if (!hostAllowed(req.headers.host, port)) return send(res, 421, "This preview only answers on 127.0.0.1 and localhost.");
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
    const url = new URL(req.url, `http://${req.headers.host}`);
    const all = siteDirs();
    let p;
    try {
      p = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 400, "Bad path");
    }
    const [first, ...rest] = p.split("/").filter(Boolean);
    let slug = first && all[first] ? first : String(req.headers.cookie ?? "").match(/(?:^|;\s*)sp_site=([^;]+)/)?.[1];
    if (slug) slug = decodeURIComponent(slug);
    const out = slug && all[slug];
    if (!out) return send(res, 404, "No landing page here. Open one from the dashboard.", { "content-type": "text/plain; charset=utf-8" });
    const sub = first === slug ? rest.join("/") : p.replace(/^\/+/, "");
    const candidates = [sub, `${sub}.html`, path.join(sub, "index.html")].filter((c) => c !== ".html");
    const file = candidates.map((c) => path.resolve(out, c || "index.html")).find((f) => inside(out, f) && existsSync(f) && statSync(f).isFile());
    const headers = { "set-cookie": `sp_site=${encodeURIComponent(slug)}; Path=/; SameSite=Lax`, "content-security-policy": "frame-ancestors http://127.0.0.1:* http://localhost:*" };
    if (!file) return send(res, 404, "Not found", headers);
    serveFile(req, res, file, headers);
  });
  sites.on("listening", () => (sitesPort = sites.address().port));

  refreshTools();
  return { server, sites, token, state };
}
