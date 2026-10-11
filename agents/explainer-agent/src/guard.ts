/**
 * What the agent may touch. The HyperFrames workflow needs a shell (CLI commands, bundled helper scripts, ffprobe),
 * so instead of taking Bash away this checks every call:
 *  - files: read inside the job folder, the bundled skills and temp dirs; write only inside the HyperFrames project
 *    (and temp dirs); never a .env file;
 *  - Bash: an allow-list of programs; hyperframes subcommands that open browsers/apps, publish, sign in or change
 *    versions are refused; node/python only run the bundled skill scripts; no network tools, nested shells or
 *    command substitution; every path argument and redirect must stay inside the roots above.
 * It is an accident guard for an agent working on our own briefs, not a sandbox against a hostile one.
 */
import os from "node:os";
import path from "node:path";

export interface Roots {
  /** job folder: brief, records, project (read) */
  job: string;
  /** HyperFrames project (read + write; the agent's cwd) */
  project: string;
  /** bundled HyperFrames plugin (read-only) */
  plugin: string;
  /** this agent's folder (read-only; .env excluded) */
  agent: string;
  /** temp dirs (read + write) */
  tmp: string[];
}

export function rootsFor(jobDir: string, projectDir: string, pluginDir: string, agentDir: string): Roots {
  const tmp = [...new Set([os.tmpdir(), "/tmp", "/private/tmp", "/var/folders"].map((p) => path.resolve(p)))];
  return { job: path.resolve(jobDir), project: path.resolve(projectDir), plugin: path.resolve(pluginDir), agent: path.resolve(agentDir), tmp };
}

export const isInside = (p: string, root: string) => {
  const rel = path.relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

const SYSTEM_READ = ["/usr/share/fonts", "/Library/Fonts", "/System/Library/Fonts", path.join(os.homedir(), "Library", "Fonts"), "/dev/null"];
const DEV_WRITE = new Set(["/dev/null", "/dev/stdout", "/dev/stderr"]);

const readRoots = (r: Roots) => [r.job, r.plugin, r.agent, ...r.tmp, ...SYSTEM_READ];
const writeRoots = (r: Roots) => [r.project, ...r.tmp];

const isSecret = (p: string) => /^\.env(\.|$)/.test(path.basename(p)) || /(^|\/)secrets?\.env$/.test(p);

function checkReadPath(abs: string, r: Roots): string | null {
  if (isSecret(abs)) return `${path.basename(abs)} holds secrets and is off limits`;
  if (readRoots(r).some((root) => isInside(abs, root))) return null;
  return `${abs} is outside the job folder and the HyperFrames skills`;
}

function checkWritePath(abs: string, r: Roots): string | null {
  if (DEV_WRITE.has(abs)) return null;
  if (isSecret(abs)) return `${path.basename(abs)} holds secrets and is off limits`;
  if (isInside(abs, r.plugin)) return "the HyperFrames skills are read-only; write into the project instead";
  if (writeRoots(r).some((root) => isInside(abs, root))) return null;
  return `writing is limited to the HyperFrames project (${r.project}); ${abs} is outside it`;
}

const expandHome = (p: string) => (p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);

/** Read/Write/Edit/Glob/Grep/NotebookEdit. Returns a refusal reason, or null. */
export function checkFileTool(tool: string, input: Record<string, unknown>, r: Roots, cwd = r.project): string | null {
  const resolve = (p: unknown) => path.resolve(cwd, expandHome(String(p)));
  switch (tool) {
    case "Read":
      return input.file_path ? checkReadPath(resolve(input.file_path), r) : null;
    case "Glob":
    case "Grep": {
      const base = input.path ? resolve(input.path) : cwd;
      const why = checkReadPath(base, r);
      if (why) return why;
      const pat = String(input.pattern ?? input.glob ?? "");
      if (tool === "Glob" && (pat.startsWith("/") || pat.startsWith("~") || pat.includes(".."))) return checkReadPath(resolve(pat.split("*")[0] || "/"), r);
      return null;
    }
    case "Write":
    case "Edit":
    case "MultiEdit":
      return input.file_path ? checkWritePath(resolve(input.file_path), r) : null;
    case "NotebookEdit":
      return input.notebook_path ? checkWritePath(resolve(input.notebook_path), r) : null;
    default:
      return null;
  }
}

// ── shell parsing ────────────────────────────────────────────────────────────

interface Redirect {
  op: string;
  target: string;
}
interface Segment {
  words: string[];
  redirects: Redirect[];
}

/**
 * A small POSIX-ish lexer: quotes, escapes, comments, here-documents, the operators ; && || | & and newlines, and
 * redirections. Throws on command/process substitution, which the policy refuses.
 */
export function parseShell(cmd: string, vars: Record<string, string> = {}): Segment[] {
  const segs: Segment[] = [];
  let cur: Segment = { words: [], redirects: [] };
  let word = "";
  let inWord = false;
  let pendingRedirect: string | null = null;
  const heredocs: string[] = [];
  const local: Record<string, string> = { ...vars };
  const push = () => {
    if (!inWord) return;
    if (pendingRedirect) {
      if (pendingRedirect === "<<" || pendingRedirect === "<<-") heredocs.push(word);
      else cur.redirects.push({ op: pendingRedirect, target: word });
      pendingRedirect = null;
    } else cur.words.push(word);
    word = "";
    inWord = false;
  };
  const end = () => {
    push();
    if (cur.words.length || cur.redirects.length) {
      // NAME=value prefixes and export NAME=value become variables for later words
      for (const w of cur.words) {
        const m = w.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s);
        if (m) local[m[1]] = m[2];
      }
      if (cur.words[0] === "export") for (const w of cur.words.slice(1)) {
        const m = w.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s);
        if (m) local[m[1]] = m[2];
      }
      segs.push(cur);
    }
    cur = { words: [], redirects: [] };
  };
  const expand = (name: string) => local[name] ?? process.env[name] ?? "";
  let i = 0;
  const n = cmd.length;
  while (i < n) {
    const c = cmd[i];
    if (c === "\\" && i + 1 < n) {
      if (cmd[i + 1] === "\n") {
        i += 2;
        continue;
      }
      word += cmd[i + 1];
      inWord = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      const j = cmd.indexOf("'", i + 1);
      if (j < 0) throw new Error("unterminated quote");
      word += cmd.slice(i + 1, j);
      inWord = true;
      i = j + 1;
      continue;
    }
    if (c === '"') {
      i++;
      inWord = true;
      while (i < n && cmd[i] !== '"') {
        if (cmd[i] === "\\" && i + 1 < n && '"\\$`'.includes(cmd[i + 1])) {
          word += cmd[i + 1];
          i += 2;
          continue;
        }
        if (cmd[i] === "`" || (cmd[i] === "$" && cmd[i + 1] === "(")) throw new Error("command substitution");
        if (cmd[i] === "$") {
          const m = cmd.slice(i).match(/^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/);
          if (m) {
            word += expand(m[1] ?? m[2]);
            i += m[0].length;
            continue;
          }
        }
        word += cmd[i++];
      }
      if (i >= n) throw new Error("unterminated quote");
      i++;
      continue;
    }
    if (c === "`" || (c === "$" && cmd[i + 1] === "(")) throw new Error("command substitution");
    if ((c === "<" || c === ">") && cmd[i + 1] === "(") throw new Error("process substitution");
    if (c === "$") {
      const m = cmd.slice(i).match(/^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/);
      if (m) {
        word += expand(m[1] ?? m[2]);
        inWord = true;
        i += m[0].length;
        continue;
      }
    }
    if (c === "#" && !inWord) {
      while (i < n && cmd[i] !== "\n") i++;
      continue;
    }
    if (c === "\n") {
      end();
      i++;
      // skip here-document bodies that started on the line just ended
      while (heredocs.length) {
        const raw = heredocs.shift()!;
        // the lexer drops quotes, so remember whether the delimiter was quoted from the original text
        const quoted = /<<-?\s*(['"])/.test(cmd.slice(0, i));
        const delim = raw.replace(/^['"]|['"]$/g, "");
        while (i < n) {
          const nl = cmd.indexOf("\n", i);
          const line = cmd.slice(i, nl < 0 ? n : nl);
          i = nl < 0 ? n : nl + 1;
          if (line.replace(/^\t+/, "") === delim) break;
          // an unquoted here-document still expands $(…) and `…`
          if (!quoted && (/\$\(/.test(line) || /`/.test(line))) throw new Error("command substitution");
        }
      }
      continue;
    }
    if (c === " " || c === "\t") {
      push();
      i++;
      continue;
    }
    if (c === ";" || c === "|" || (c === "&" && cmd[i + 1] !== ">")) {
      end();
      i += (c === "|" && cmd[i + 1] === "|") || (c === "&" && cmd[i + 1] === "&") ? 2 : 1;
      continue;
    }
    // redirections: [n]>&m [n]> [n]>> &> < << <<-
    const rm = cmd.slice(i).match(/^(\d?>&\d|&>>?|\d?>>?|<<-?|<)/);
    if (rm && (!inWord || /^\d$/.test(word))) {
      const op = rm[1];
      if (/^\d$/.test(word) && inWord) {
        word = "";
        inWord = false;
      } else push();
      i += op.length;
      if (/>&\d$/.test(op)) continue; // 2>&1 needs no target
      pendingRedirect = op;
      while (cmd[i] === " " || cmd[i] === "\t") i++;
      continue;
    }
    word += c;
    inWord = true;
    i++;
  }
  end();
  return segs;
}

// ── policy ───────────────────────────────────────────────────────────────────

const NETWORK = new Set(["curl", "wget", "nc", "ncat", "netcat", "ssh", "scp", "sftp", "rsync", "ftp", "telnet", "socat"]);
const ALLOWED = new Set([
  "ls", "cat", "head", "tail", "wc", "grep", "egrep", "fgrep", "rg", "find", "sort", "uniq", "cut", "tr", "jq", "echo", "printf",
  "pwd", "sleep", "wait", "true", "false", "test", "[", "diff", "cmp", "basename", "dirname", "realpath", "readlink", "stat", "file",
  "du", "df", "date", "seq", "awk", "sed", "tee", "mkdir", "cp", "mv", "touch", "rm", "rmdir", "chmod", "cd", "export", "kill",
  "which", "command", "type", "ffmpeg", "ffprobe", "fc-list", "fc-match", "md5", "md5sum", "shasum", "sha256sum", "base64",
  "column", "nl", "paste", "comm", "fold", "rev", "unzip", "zip", "gzip", "gunzip", "identify", "convert", "magick", "sips",
  "hyperframes", "node", "python", "python3", "npx", "npm", "timeout", "nohup", "time",
]);
const WRAPPERS = new Set(["timeout", "nohup", "time"]);
/** programs whose arguments are text, not files */
const NO_PATH_ARGS = new Set(["echo", "printf", "pwd", "sleep", "wait", "true", "false", "test", "[", "basename", "dirname", "date", "seq", "kill", "which", "command", "type", "fc-list", "fc-match", "df"]);
const WRITERS = new Set(["mkdir", "touch", "rm", "rmdir", "chmod", "tee"]);

/** hyperframes subcommands a headless run must not use, and why. */
const HF_DENY: Record<string, string> = {
  preview: "Studio preview opens a browser and this run is headless; use `hyperframes snapshot` to look at frames",
  open: "the desktop app isn't part of this run",
  "catch-up": "the desktop app isn't part of this run",
  publish: "publishing is the person's call; explainer-agent never uploads",
  present: "presenter mode needs a person",
  skills: "the bundled HyperFrames plugin owns the skills; don't install or update skills",
  upgrade: "explainer-agent pins the HyperFrames version; don't upgrade the project",
  cloud: "render locally with `hyperframes render`",
  lambda: "render locally with `hyperframes render`",
  cloudrun: "render locally with `hyperframes render`",
  feedback: "not part of this run",
  clean: "don't delete HyperFrames caches from an agent run",
};

function hyperframesRule(args: string[]): string | null {
  const sub = args.find((a) => !a.startsWith("-"));
  if (!sub) return null;
  if (HF_DENY[sub]) return `\`hyperframes ${sub}\` is off: ${HF_DENY[sub]}`;
  const rest = args.slice(args.indexOf(sub) + 1).filter((a) => !a.startsWith("-"));
  if (sub === "auth" && rest[0] !== "status") return "only `hyperframes auth status` is allowed; signing in is the person's job (keys go in .env)";
  if (sub === "telemetry" && rest[0] !== "status") return "telemetry stays off for agent runs";
  if (sub === "browser" && !["path", "ensure", undefined].includes(rest[0])) return "only `hyperframes browser path|ensure` is allowed";
  return null;
}

const looksLikePath = (w: string) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(w) && (w.startsWith("/") || w.startsWith("~") || w.startsWith("./") || w.startsWith("../") || w === ".." || w.includes("/"));

export interface BashCheck {
  ok: boolean;
  reason?: string;
  /** the command runs a HyperFrames step that loads compositions in Chrome (render, snapshot, check, …) */
  rendersCompositions?: boolean;
}

const RENDERING = new Set(["render", "snapshot", "check", "validate", "inspect", "lint", "compare", "keyframes", "benchmark"]);

export function checkBash(command: string, r: Roots, cwd = r.project): BashCheck {
  let segs: Segment[];
  try {
    segs = parseShell(command, { HOME: os.homedir(), PWD: cwd, PROJECT_DIR: r.project, PROJECT_ROOT: r.project, PLUGIN_ROOT: r.plugin });
  } catch (e) {
    const what = (e as Error).message;
    return { ok: false, reason: what.includes("substitution") ? `${what} ($(…), \`…\`, <(…)) isn't allowed: run the inner command first and use its output` : `couldn't parse the command (${what})` };
  }
  let dir = cwd;
  let renders = false;
  const absOf = (w: string) => path.resolve(dir, expandHome(w));
  const read = (w: string) => (looksLikePath(w) ? checkReadPath(absOf(w), r) : null);
  const write = (w: string) => (looksLikePath(w) || !w.startsWith("-") ? checkWritePath(absOf(w), r) : null);

  for (const seg of segs) {
    let words = [...seg.words];
    // drop leading NAME=value assignments
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words = words.slice(1);
    for (const red of seg.redirects) {
      const why = red.op.startsWith("<") ? read(red.target) : checkWritePath(absOf(red.target), r);
      if (why) return { ok: false, reason: `redirect ${red.op} ${red.target}: ${why}` };
    }
    if (!words.length) continue;
    // wrappers: timeout 60 cmd …, nohup cmd …
    while (words.length && WRAPPERS.has(path.basename(words[0]))) {
      words = words.slice(1);
      while (words.length && (/^-/.test(words[0]) || /^\d+[smhd]?$/.test(words[0]))) words = words.slice(1);
    }
    if (!words.length) continue;
    const prog0 = words[0];
    const prog = path.basename(prog0);
    const args = words.slice(1);
    if (prog0.includes("/") && !/node_modules\/\.bin\/hyperframes$/.test(prog0)) {
      const why = checkReadPath(absOf(prog0), r);
      if (why) return { ok: false, reason: `running ${prog0}: ${why}` };
    }
    if (NETWORK.has(prog)) return { ok: false, reason: `\`${prog}\` is off: no direct network calls. HyperFrames commands and the bundled scripts reach the services they need` };
    if (["open", "xdg-open", "osascript"].includes(prog)) return { ok: false, reason: "this run is headless: nothing may open apps, files or browsers" };
    if (["bash", "sh", "zsh", "fish", "dash", "eval", "exec", "source", ".", "xargs", "env", "printenv", "set", "sudo", "su"].includes(prog))
      return { ok: false, reason: `\`${prog}\` is off: run commands directly, one per call or joined with &&` };
    if (["git", "docker", "brew", "apt", "apt-get", "pip", "pip3", "yarn", "pnpm", "bun", "deno", "uv", "launchctl", "crontab", "killall"].includes(prog))
      return { ok: false, reason: `\`${prog}\` isn't part of a video run` };
    if (!ALLOWED.has(prog)) return { ok: false, reason: `\`${prog}\` isn't on this agent's command list (HyperFrames CLI, the bundled skill scripts, ffmpeg/ffprobe and basic file tools)` };

    let hfArgs: string[] | null = null;
    switch (prog) {
      case "cd": {
        const target = args[0] ?? os.homedir();
        const abs = absOf(target);
        const why = checkReadPath(abs, r);
        if (why) return { ok: false, reason: `cd ${target}: ${why}` };
        dir = abs;
        continue;
      }
      case "export":
        continue;
      case "find":
        if (args.some((a) => ["-exec", "-execdir", "-ok", "-okdir", "-delete", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(a)))
          return { ok: false, reason: "find may only list files; act on the results with separate commands" };
        break;
      case "awk":
        if (args.some((a) => /system\s*\(|\|\s*getline|print\s*>\s*"/.test(a))) return { ok: false, reason: "awk may not run commands or write files" };
        break;
      case "hyperframes":
        hfArgs = args;
        break;
      case "npx": {
        const k = args.findIndex((a) => !a.startsWith("-"));
        const pkg = k >= 0 ? args[k] : "";
        if (!/^hyperframes(@[\w.-]+)?$/.test(pkg)) return { ok: false, reason: "npx may only run hyperframes (it is also installed: use `hyperframes …`)" };
        hfArgs = args.slice(k + 1);
        break;
      }
      case "npm": {
        if (args[0] === "run" && ["check", "render", "lint"].includes(args[1] ?? "")) {
          renders = true;
          break;
        }
        return { ok: false, reason: "npm is limited to `npm run check|render` in the project; use `hyperframes …` directly" };
      }
      case "node": {
        const k = args.findIndex((a) => !a.startsWith("-"));
        const bad = args.slice(0, k < 0 ? args.length : k).find((a) => /^(-e|--eval|-p|--print|-i|--interactive|-r|--require|--import|--loader|--experimental-loader)$/.test(a));
        if (bad || k < 0) return { ok: false, reason: "node may only run the bundled HyperFrames skill scripts (no -e/--eval, no REPL)" };
        const script = absOf(args[k]);
        if (!isInside(script, r.plugin)) return { ok: false, reason: `node may only run scripts from the bundled HyperFrames skills (${r.plugin}); ${args[k]} isn't one` };
        const rest = args.slice(k + 1);
        if (/[/\\]plugin-cli\.mjs$/.test(script)) {
          if (rest[0] === "--script") {
            const inner = rest[1] ? absOf(rest[1]) : "";
            if (!inner || !isInside(inner, r.plugin)) return { ok: false, reason: "plugin-cli --script may only run bundled skill scripts" };
          } else hfArgs = rest;
        }
        for (const a of rest) {
          const v = a.includes("=") && a.startsWith("--") ? a.slice(a.indexOf("=") + 1) : a;
          const why = read(v);
          if (why) return { ok: false, reason: why };
        }
        break;
      }
      case "python":
      case "python3": {
        if (args.length === 1 && /^(--version|-V)$/.test(args[0])) break;
        const k = args.findIndex((a) => !a.startsWith("-"));
        if (k < 0 || args.slice(0, k).some((a) => a === "-c" || a === "-m")) return { ok: false, reason: "python may only run the bundled HyperFrames skill scripts" };
        if (!isInside(absOf(args[k]), r.plugin)) return { ok: false, reason: `python may only run scripts from the bundled HyperFrames skills; ${args[k]} isn't one` };
        break;
      }
      case "kill":
        break;
    }

    if (hfArgs) {
      const why = hyperframesRule(hfArgs);
      if (why) return { ok: false, reason: why };
      const sub = hfArgs.find((a) => !a.startsWith("-"));
      if (sub && RENDERING.has(sub)) renders = true;
      for (let j = 0; j < hfArgs.length; j++) {
        const a = hfArgs[j];
        const isOut = a === "-o" || a === "--output";
        const v = a.startsWith("--") && a.includes("=") ? a.slice(a.indexOf("=") + 1) : a;
        if (isOut && hfArgs[j + 1]) {
          const w = checkWritePath(absOf(hfArgs[j + 1]), r);
          if (w) return { ok: false, reason: w };
          j++;
          continue;
        }
        if (/^--output=/.test(a)) {
          const w = checkWritePath(absOf(v), r);
          if (w) return { ok: false, reason: w };
          continue;
        }
        const why = read(v);
        if (why) return { ok: false, reason: why };
      }
      continue;
    }

    // generic path checks
    const positional = args.filter((a) => !a.startsWith("-") || looksLikePath(a));
    const values = args.map((a) => (a.startsWith("--") && a.includes("=") ? a.slice(a.indexOf("=") + 1) : a));
    if (WRITERS.has(prog) || (prog === "sed" && args.some((a) => /^-i/.test(a) || a === "--in-place"))) {
      const targets = prog === "sed" ? positional.slice(1) : positional;
      for (const t of targets) {
        if (prog === "chmod" && /^[0-7]{3,4}$|^[ugoa]*[+=-]/.test(t)) continue;
        const why = checkWritePath(absOf(t), r);
        if (why) return { ok: false, reason: `${prog} ${t}: ${why}` };
      }
      if (prog === "rm" && positional.some((t) => path.resolve(dir, expandHome(t)) === r.project)) return { ok: false, reason: "don't delete the whole project" };
      continue;
    }
    if (prog === "cp" || prog === "mv") {
      if (positional.length < 2) continue;
      const dest = positional[positional.length - 1];
      const why = checkWritePath(absOf(dest), r);
      if (why) return { ok: false, reason: `${prog} → ${dest}: ${why}` };
      for (const s of positional.slice(0, -1)) {
        const w = prog === "mv" ? checkWritePath(absOf(s), r) : checkReadPath(absOf(s), r);
        if (w) return { ok: false, reason: `${prog} ${s}: ${w}` };
      }
      continue;
    }
    if (prog === "ffmpeg") {
      const paths = values.filter((v) => looksLikePath(v) || /\.(mp4|mov|webm|wav|mp3|m4a|png|jpe?g|gif|aac)$/i.test(v));
      const out = paths[paths.length - 1];
      for (const p of paths) {
        const why = p === out ? checkWritePath(absOf(p), r) : read(p);
        if (why) return { ok: false, reason: `ffmpeg ${p}: ${why}` };
      }
      continue;
    }
    if (prog === "unzip" || prog === "zip" || prog === "gzip" || prog === "gunzip" || prog === "convert" || prog === "magick" || prog === "sips") {
      for (const v of values) {
        if (!looksLikePath(v) && !/\.\w{2,4}$/.test(v)) continue;
        const why = checkWritePath(absOf(v), r) && read(v);
        if (why) return { ok: false, reason: `${prog} ${v}: ${why}` };
      }
      continue;
    }
    if (NO_PATH_ARGS.has(prog)) continue;
    for (const v of values) {
      const why = read(v);
      if (why) return { ok: false, reason: `${prog} ${v}: ${why}` };
    }
  }
  return { ok: true, rendersCompositions: renders };
}

/**
 * The skills invoke the CLI as `npx hyperframes@<ver> …`, through the plugin launcher (which runs that same npx) or as
 * the project's `npm run check|render`. Each of those fetches a second copy of the CLI into the npx cache. Map them onto
 * the installed CLI (same version) before they run; the command was already checked in its original form.
 */
export function localCli(command: string): string {
  // the launcher's path, bare or quoted (a quoted path may contain spaces)
  const launcher = String.raw`(?:"[^"]*|'[^']*|[^"'\s]*)\/skills\/hyperframes\/scripts\/plugin-cli\.mjs["']?`;
  return command
    .replace(new RegExp(String.raw`\bnode\s+${launcher}\s+--script\s+`, "g"), "node ")
    .replace(new RegExp(String.raw`\bnode\s+${launcher}(?=\s|$)`, "g"), "hyperframes")
    .replace(/\bnpx\s+(?:(?:--yes|-y)\s+)*hyperframes(?:@[\w.-]+)?(?=[\s;&|)]|$)/g, "hyperframes")
    .replace(/\bnpm\s+run\s+(check|render|lint)(?:\s+--)?(?=[\s;&|)]|$)/g, "hyperframes $1");
}
