/**
 * env-file.mjs: an agent's settings as its .env.example describes them, and changes to its .env that leave the rest of
 * the file alone: comments, order and the other settings stay as they are (Node 20+, ESM, zero dependencies). Used by
 * scripts/agents.mjs (status, setup, keys) and the dashboard's setup screens.
 *
 *   describeEnvExample(text)        → [{ name, value, description, group, commented, secret }]
 *   updateEnvText(text, { NAME: "value" | null })   → the same text with those lines changed (null or "" empties them)
 *   updateEnvFile(file, values, { example })        → writes .env (from .env.example when it doesn't exist yet), mode 600
 *   readEnvFile(file) · setEnv(text, NAME, value) · ensureEnvFile(dir) · writeEnvValue(dir, NAME, value)   one at a time
 *
 * Values are written so Node's process.loadEnvFile and dotenv read them back unchanged. Nothing here returns a secret.
 */
import { chmodSync, copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Names whose values are secrets: never shown, only "set" or "not set". */
export const isSecretName = (name) => /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name);

const VAR = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const COMMENTED_VAR = /^\s*#\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/;
const DIVIDER = /^\s*#\s*[─━\-=]{2,}\s*(.*?)\s*[─━\-=]*\s*$/;

/** The value part of a NAME=value line, without quotes or a trailing comment. */
export function unquote(raw) {
  const v = raw.trim();
  const q = v[0];
  if ((q === '"' || q === "'" || q === "`") && v.lastIndexOf(q) > 0) return v.slice(1, v.lastIndexOf(q));
  return v.replace(/\s+#.*$/, "").trim();
}

/** NAME=value pairs of a .env text (later lines win, as with dotenv and process.loadEnvFile). */
export function parseEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(VAR);
    if (m) out[m[1]] = unquote(m[2]);
  }
  return out;
}

export function readEnvFile(file) {
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
}

/**
 * The settings a .env.example offers, in order: comment lines right above a variable describe it, divider comments
 * (`# ── Output ───`, `# --- optional ---`) start a group, and commented-out variables (`# NAME=value`) count too.
 */
export function describeEnvExample(text) {
  const out = [];
  const seen = new Set();
  let group = "";
  let notes = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) {
      notes = [];
      continue;
    }
    const divider = line.match(DIVIDER);
    if (divider) {
      if (divider[1]) group = divider[1].replace(/^[─━\-=\s]+|[─━\-=\s]+$/g, "");
      notes = [];
      continue;
    }
    const v = line.match(VAR) ?? line.match(COMMENTED_VAR);
    if (v) {
      const [, name, raw] = v;
      if (!seen.has(name)) {
        seen.add(name);
        out.push({ name, value: unquote(raw), description: notes.join(" ").trim(), group, commented: !VAR.test(line), secret: isSecretName(name) });
      }
      notes = [];
      continue;
    }
    if (/^\s*#/.test(line)) notes.push(line.replace(/^\s*#\s?/, "").trim());
  }
  return out;
}

/** How a value is written: bare when that's safe, else quoted; refuses what no .env can hold. */
export function formatEnvValue(value) {
  const v = String(value ?? "");
  if (/[\r\n\0]/.test(v)) throw new Error("A value can't contain line breaks");
  if (/^[\w.,:/@+%~=*^!?-]*$/.test(v)) return v;
  if (!v.includes("'")) return `'${v}'`;
  if (!v.includes('"') && !v.includes("\\")) return `"${v}"`;
  throw new Error("A value can't contain both ' and \" quotes");
}

/**
 * The .env text with the given variables changed: the first NAME= line takes the value and later ones go, else a
 * commented-out `# NAME=` line is switched on, else it's appended. null or "" leaves the variable empty (NAME=).
 * Windows line ends stay Windows line ends.
 */
export function updateEnvText(text, values) {
  text = String(text ?? "");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  for (const [name, value] of Object.entries(values)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`"${name}" is not a variable name`);
    const next = `${name}=${value == null ? "" : formatEnvValue(value)}`;
    const live = (l) => l.match(VAR)?.[1] === name;
    const first = lines.findIndex(live);
    if (first >= 0) {
      lines = lines.filter((l, i) => i <= first || !live(l));
      lines[first] = next;
      continue;
    }
    const off = lines.findIndex((l) => l.match(COMMENTED_VAR)?.[1] === name);
    if (off >= 0) lines[off] = next;
    else lines.push(next);
  }
  return `${lines.join(eol)}${eol}`;
}

/** The .env text with NAME set to value ("" empties it). */
export const setEnv = (text, name, value) => updateEnvText(text, { [name]: value });

/**
 * Change variables in an .env file. When the file doesn't exist yet it starts as a copy of `example` (the agent's
 * .env.example), like `cp .env.example .env`. Written atomically and readable by you only (mode 600).
 */
export function updateEnvFile(file, values, { example } = {}) {
  const base = existsSync(file) ? readFileSync(file, "utf8") : example && existsSync(example) ? readFileSync(example, "utf8") : "";
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, updateEnvText(base, values), { mode: 0o600 });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    /* not supported on this file system */
  }
}

/** Create <dir>/.env from <dir>/.env.example (the template holds no secrets) if it's missing. True when created. */
export function ensureEnvFile(dir) {
  const file = path.join(dir, ".env");
  const example = path.join(dir, ".env.example");
  if (existsSync(file) || !existsSync(example)) return false;
  copyFileSync(example, file);
  return true;
}

/** Set NAME in <dir>/.env, creating the file from its template first. */
export function writeEnvValue(dir, name, value) {
  updateEnvFile(path.join(dir, ".env"), { [name]: value }, { example: path.join(dir, ".env.example") });
}
