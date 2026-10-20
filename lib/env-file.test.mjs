// Zero-cost tests for lib/env-file.mjs:   node --test lib/env-file.test.mjs
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ensureEnvFile, parseEnv, readEnvFile, setEnv, writeEnvValue } from "./env-file.mjs";

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
