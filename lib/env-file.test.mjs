// Zero-cost tests for lib/env-file.mjs:   node --test lib/env-file.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { describeEnvExample, ensureEnvFile, formatEnvValue, isSecretName, parseEnv, readEnvFile, setEnv, updateEnvFile, updateEnvText, writeEnvValue } from "./env-file.mjs";

const TEMPLATE = `# Claude auth (pick ONE)
#  c) Pay-as-you-go API key (takes precedence over the subscription if set).
# ANTHROPIC_API_KEY=
# OpenAI images
OPENAI_API_KEY=
MAX_BUDGET_USD=5
`;

test("parseEnv: active lines only, quotes stripped, the later line wins", () => {
  assert.deepEqual(parseEnv(`# A=1\nA=2\nexport B="x y"\nA=3\nC='z'\n`), { A: "3", B: "x y", C: "z" });
});

test("setEnv: fills the active line and keeps everything else", () => {
  const out = setEnv(TEMPLATE, "OPENAI_API_KEY", "sk-proj-abc_123");
  assert.equal(out, TEMPLATE.replace("OPENAI_API_KEY=\n", "OPENAI_API_KEY=sk-proj-abc_123\n"));
  assert.equal(parseEnv(out).MAX_BUDGET_USD, "5");
});

test("setEnv: takes over the template's commented-out line, not prose that mentions the name", () => {
  const out = setEnv(TEMPLATE, "ANTHROPIC_API_KEY", "sk-ant-api03-x");
  assert.match(out, /^ANTHROPIC_API_KEY=sk-ant-api03-x$/m);
  assert.doesNotMatch(out, /^# ANTHROPIC_API_KEY=/m);
  assert.match(out, /^#  c\) Pay-as-you-go/m);
  assert.equal(out.split("\n").length, TEMPLATE.split("\n").length);
});

test("setEnv: appends a new name before the final newline; drops duplicates; empties with ''", () => {
  assert.equal(setEnv("A=1\n", "B", "2"), "A=1\nB=2\n");
  assert.equal(setEnv("A=1", "B", "2"), "A=1\nB=2\n");
  assert.equal(setEnv("A=1\nB=x\nB=y\n", "B", "z"), "A=1\nB=z\n");
  assert.equal(setEnv("A=1\nB=x\n", "B", ""), "A=1\nB=\n");
  assert.equal(setEnv("A=1\r\nB=x\r\n", "B", "z"), "A=1\r\nB=z\r\n", "keeps Windows line ends");
});

test("setEnv: quotes values with spaces, refuses line breaks", () => {
  assert.equal(parseEnv(setEnv("", "WIKIMEDIA_CONTACT", "Jane Doe <jane@example.com>")).WIKIMEDIA_CONTACT, "Jane Doe <jane@example.com>");
  assert.throws(() => setEnv("", "A", "x\ny"));
});

test("ensureEnvFile / writeEnvValue: a new .env starts from .env.example, an existing one is kept", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "env-file-test-"));
  assert.equal(ensureEnvFile(dir), false, "no template, nothing to copy");
  writeFileSync(path.join(dir, ".env.example"), TEMPLATE);
  writeEnvValue(dir, "OPENAI_API_KEY", "sk-1");
  assert.deepEqual(readEnvFile(path.join(dir, ".env")), { OPENAI_API_KEY: "sk-1", MAX_BUDGET_USD: "5" });
  assert.equal(ensureEnvFile(dir), false);
  writeEnvValue(dir, "OPENAI_API_KEY", "sk-2");
  assert.match(readFileSync(path.join(dir, ".env"), "utf8"), /^OPENAI_API_KEY=sk-2$/m);
  assert.equal(readFileSync(path.join(dir, ".env.example"), "utf8"), TEMPLATE, "the template is untouched");
  assert.ok(!existsSync(path.join(dir, ".env.tmp")));
  rmSync(dir, { recursive: true, force: true });
});

const EXAMPLE = `# ── Claude auth (pick ONE) ───────────
#  a) Your subscription, nothing to set.
#  b) A token from claude setup-token.
CLAUDE_CODE_OAUTH_TOKEN=
#  c) Pay-as-you-go API key.
ANTHROPIC_API_KEY=

# --- optional ---
# Hard stop on spend per run (USD)
MAX_BUDGET_USD=5
# Where runs go
# OUTPUT_DIR=../out
`;

test("describeEnvExample: names, defaults, the comments above as description, groups, commented-out variables", () => {
  const s = describeEnvExample(EXAMPLE);
  assert.deepEqual(
    s.map((x) => x.name),
    ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "MAX_BUDGET_USD", "OUTPUT_DIR"],
  );
  const [token, key, budget, out] = s;
  assert.equal(token.group, "Claude auth (pick ONE)");
  assert.match(token.description, /subscription.*setup-token/);
  assert.equal(key.description, "c) Pay-as-you-go API key.");
  assert.ok(token.secret && key.secret && !budget.secret);
  assert.equal(budget.group, "optional");
  assert.equal(budget.value, "5");
  assert.equal(out.commented, true);
  assert.equal(out.value, "../out");
  assert.equal(budget.commented, false);
});

test("isSecretName: keys, tokens and secrets, not settings", () => {
  for (const n of ["OPENAI_API_KEY", "GITHUB_TOKEN", "LPA_API_TOKEN", "CLIENT_SECRET"]) assert.ok(isSecretName(n), n);
  for (const n of ["MAX_BUDGET_USD", "WIKIMEDIA_CONTACT", "PORT"]) assert.ok(!isSecretName(n), n);
});

test("updateEnvText: replaces in place, switches on a commented-out line, appends the rest, keeps everything else", () => {
  const text = updateEnvText(EXAMPLE, { ANTHROPIC_API_KEY: "sk-ant-api03-abc", OUTPUT_DIR: "/tmp/runs", NEW_ONE: "x", MAX_BUDGET_USD: null });
  const lines = text.split("\n");
  assert.ok(lines.includes("ANTHROPIC_API_KEY=sk-ant-api03-abc"));
  assert.ok(lines.includes("OUTPUT_DIR=/tmp/runs"));
  assert.ok(!text.includes("# OUTPUT_DIR="), "the commented line became the setting");
  assert.equal(lines.filter((l) => l === "NEW_ONE=x").length, 1);
  assert.ok(lines.includes("MAX_BUDGET_USD="), "null empties it");
  assert.ok(text.includes("#  c) Pay-as-you-go API key."), "comments stay");
  assert.equal(lines.indexOf("ANTHROPIC_API_KEY=sk-ant-api03-abc"), EXAMPLE.split("\n").indexOf("ANTHROPIC_API_KEY="), "same line as before");
  assert.ok(text.endsWith("\n") && !text.endsWith("\n\n"));
});

test("formatEnvValue: bare when safe, quoted otherwise, and what parseEnv reads back is the value", () => {
  for (const v of ["sk-ant-api03-AbC_d.e", "Your Brand", "a#b", "it's", 'say "hi"', "$HOME/x", ""]) {
    const parsed = parseEnv(`X=${formatEnvValue(v)}\n`).X;
    assert.equal(parsed, v, `round trip of ${JSON.stringify(v)}`);
  }
  // the agents read their .env with Node's own parser
  const dir = mkdtempSync(path.join(os.tmpdir(), "env-file-node-"));
  const values = { A: "sk-ant-api03-AbC_d.e", B: "Your Brand", C: "a#b", D: "it's", E: 'say "hi"', F: "$HOME/x" };
  writeFileSync(path.join(dir, ".env"), updateEnvText("", values));
  const read = spawnSync(process.execPath, ["-e", `process.loadEnvFile(${JSON.stringify(path.join(dir, ".env"))}); console.log(JSON.stringify(Object.fromEntries("ABCDEF".split("").map((k) => [k, process.env[k]]))))`], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(read.stdout), values, read.stderr);
  assert.equal(formatEnvValue("plain-value_1"), "plain-value_1");
  assert.throws(() => formatEnvValue("two\nlines"), /line breaks/);
  assert.throws(() => updateEnvText("", { "BAD NAME": "x" }), /not a variable name/);
});

test("updateEnvFile: starts from .env.example, writes mode 600, and later changes keep earlier ones", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "env-file-test-"));
  const example = path.join(dir, ".env.example");
  const file = path.join(dir, ".env");
  writeFileSync(example, EXAMPLE);
  updateEnvFile(file, { OPENAI_API_KEY: "sk-proj-1" }, { example });
  assert.ok(existsSync(file));
  if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
  updateEnvFile(file, { MAX_BUDGET_USD: "9" }, { example });
  const env = parseEnv(readFileSync(file, "utf8"));
  assert.equal(env.OPENAI_API_KEY, "sk-proj-1");
  assert.equal(env.MAX_BUDGET_USD, "9");
  assert.equal(env.ANTHROPIC_API_KEY, "");
  assert.match(readFileSync(file, "utf8"), /Hard stop on spend/, "the example's comments came along");
});
