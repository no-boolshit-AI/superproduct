/**
 * An agent's .env, read and edited in place: comments, order and the other settings stay as they are. Used by
 * scripts/agents.mjs (status, setup, keys). Zero dependencies. Nothing here logs a value.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/** The NAME=value pairs of a .env text; a later line wins, as with dotenv and process.loadEnvFile. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(LINE);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

export function readEnvFile(file) {
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
}

/** A value as it can stand after NAME=: bare when it's one plain word, else quoted. */
function quote(value) {
  if (/[\r\n]/.test(value)) throw new Error("a value can't span lines");
  if (/^[\w.,:;@%+\-/=~]*$/.test(value)) return value;
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  throw new Error("a value can't contain both kinds of quotes");
}

/**
 * The .env text with NAME set to value ("" empties it): the first NAME= line takes it and later ones go, else the
 * first commented-out "# NAME=" line of the template does, else it's appended.
 */
export function setEnv(text, name, value) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const entry = `${name}=${quote(value)}`;
  const active = (l) => l.match(LINE)?.[1] === name;
  let i = lines.findIndex(active);
  if (i >= 0) {
    lines[i] = entry;
    return lines.filter((l, j) => j <= i || !active(l)).join(eol);
  }
  i = lines.findIndex((l) => new RegExp(`^\\s*#\\s*(?:export\\s+)?${name}\\s*=`).test(l));
  if (i >= 0) lines[i] = entry;
  else if (lines.at(-1) === "") lines.splice(-1, 0, entry);
  else lines.push(entry, "");
  return lines.join(eol);
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
  ensureEnvFile(dir);
  const file = path.join(dir, ".env");
  writeFileSync(file, setEnv(existsSync(file) ? readFileSync(file, "utf8") : "", name, value), { mode: 0o600 });
}
