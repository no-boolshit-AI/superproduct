/**
 * Mock Anthropic Messages API that plays a scripted developer through every phase (setup, plan, milestones,
 * review), so the real Agent SDK + Claude Code CLI + MCP tools + hooks + git + workspace run end to end at no cost.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface ToolResultLog { phase: string; id: string; isError: boolean; text: string }
export const toolResults: ToolResultLog[] = [];
export const toolsByPhase: Record<string, string[]> = {};
export const systemByPhase: Record<string, string> = {};
export const firstPromptByPhase: Record<string, string> = {};

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
const D = (t: string) => `mcp__devagent__${t}`;

const MATH_BUGGY = `export function add(a, b) {\n  return a + b;\n}\n\nexport function multiply(a, b) {\n  return a + b; // bug\n}\n`;
const MATH_MUL = `export function add(a, b) {\n  return a + b;\n}\n\nexport function multiply(a, b) {\n  return a * b;\n}\n`;
const MATH_DIV = `${MATH_MUL}\nexport function divide(a, b) {\n  return a / b;\n}\n`;
const MATH_SAFE = `${MATH_MUL}\nexport function divide(a, b) {\n  if (b === 0) throw new RangeError("division by zero");\n  return a / b;\n}\n`;
const MATH_SUB = `${MATH_SAFE}\nexport function subtract(a, b) {\n  return a - b;\n}\n`;
const test = (name: string, fn: string, body: string) =>
  `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { ${fn} } from "../src/math.js";\n\ntest("${name}", () => {\n  ${body}\n});\n`;

const PRD = `# Multiply and divide: PRD

## Summary
Add multiply and divide to the calculator library so callers don't hand-roll arithmetic.

## Context
src/math.js exports add only; tests live in test/*.test.js and run with node --test.

## Goals
- multiply(a, b) and divide(a, b) exported from src/math.js

## Acceptance criteria
- AC-1: multiply(3, 4) returns 12
- AC-2: divide(8, 2) returns 4

## Assumptions and open questions
- Division by zero behaviour is unspecified; we follow JavaScript semantics unless told otherwise.
`;

export function workspaceConfig() {
  return {
    base: "node",
    versions: { node: "22" },
    aptPackages: [],
    phpExtensions: [],
    playwright: false,
    ...(process.env.TEST_CUSTOM_IMAGE ? { customImage: process.env.TEST_CUSTOM_IMAGE } : {}),
    services: [],
    env: { APP_MODE: "test" },
    bootstrap: [`node -e "require('fs').writeFileSync('.bootstrapped', process.env.APP_MODE + ':secret-length-' + (process.env.STRIPE_SECRET || '').length)"`],
  };
}
const TOOLING = {
  policy: "local",
  recipes: [],
  extraCommands: [
    "mkdir -p .claude/skills/local-tool && printf -- '---\\nname: local-tool\\ndescription: Repo tooling skill\\n---\\nUse it.\\n' > .claude/skills/local-tool/SKILL.md && printf '# Agent guidelines\\n' > AGENTS.md",
  ],
};
const VERIFY = [{ name: "tests", command: "npm test" }];

type Step = ([string, unknown] | Block)[];

function scripts(): Record<string, Step[]> {
  return {
    setup: [
      [["Read", { file_path: "README.md" }], ["Glob", { pattern: "**/*.js" }]],
      [
        [
          D("ask_user"),
          {
            context: "A few questions about publishing and secrets",
            questions: [
              { id: "pr", header: "PR mode", question: "Open pull requests?", options: [{ label: "Draft PR" }, { label: "Push branch only" }], default: "Draft PR" },
              { id: "stripe", question: "Stripe test key used by the test-suite?", secretEnv: "STRIPE_SECRET" },
            ],
          },
        ],
      ],
      [[D("install_skills"), { custom: [{ repo: process.env.TEST_SKILLS_REPO, paths: ["skills/tdd-lite", "skills/no-skill"] }] }]],
      [[D("test_workspace"), { workspace: workspaceConfig(), tooling: TOOLING, verify: VERIFY }]],
      [[D("workspace_exec"), { command: "node --version && cat .bootstrapped && (test -f /.dockerenv && echo IN_CONTAINER || echo ON_HOST)" }]],
      [
        [
          D("save_profile"),
          {
            name: "Calc",
            stack: { primary: "node", frameworks: [], summary: "Tiny calculator library" },
            git: { baseBranch: "main", branchPrefix: "feature/", commitStyle: "conventional" },
            publish: { pullRequest: "draft", reviewers: [], labels: [] },
            autonomy: { approvePlan: false, clarifyingQuestions: false, reviewRounds: 1 },
            docs: { commitToRepo: false, dir: "docs/features" },
            tooling: TOOLING,
            workspace: workspaceConfig(),
            verify: VERIFY,
            notes: "Keep functions pure. Tests with node:test.",
            knowledge: "# Calc\n\nA tiny ESM calculator library. Code in src/math.js, tests in test/*.test.js run by `node --test` (npm test). Functions are pure and exported by name.",
          },
        ],
      ],
      [{ type: "text", text: "Setup complete: draft PRs, local tooling, one skill." }],
    ],
    plan: [
      [["Bash", { command: "test -f /.dockerenv && echo IN_CONTAINER || echo ON_HOST; cat .bootstrapped; ls .claude/skills" }], ["Read", { file_path: "src/math.js" }]],
      [["Write", { file_path: "src/hack.js", content: "nope" }]],
      [[D("save_prd"), { markdown: PRD }]],
      [
        [
          D("save_plan"),
          {
            title: "Add multiply and divide",
            branchSlug: "math-ops",
            milestones: [
              { title: "Multiply", goal: "Export multiply(a, b)", tasks: ["Add multiply to src/math.js", "Add test/multiply.test.js"], acceptance: ["AC-1"] },
              { title: "Divide", goal: "Export divide(a, b)", tasks: ["Add divide to src/math.js", "Add test/divide.test.js"], acceptance: ["AC-2"] },
            ],
          },
        ],
      ],
      [{ type: "text", text: "PRD and plan saved." }],
    ],
    M1: [
      [["Read", { file_path: "src/math.js" }]],
      [["Write", { file_path: "src/math.js", content: MATH_BUGGY }], ["Write", { file_path: "test/multiply.test.js", content: test("multiply", "multiply", "assert.equal(multiply(3, 4), 12);") }]],
      [["Bash", { command: "git push origin HEAD" }], ["Write", { file_path: "/etc/devagent-test.txt", content: "x" }], ["Bash", { command: "git checkout main" }]],
      [[D("complete_milestone"), { summary: "Added multiply with a test.", commitSubject: "add multiply", notes: "multiply lives in src/math.js" }]],
      [["Write", { file_path: "src/math.js", content: MATH_MUL }]],
      [[D("complete_milestone"), { summary: "Added multiply with a test; fixed the operator.", commitSubject: "feat(math): add multiply", notes: "multiply lives in src/math.js" }]],
      [{ type: "text", text: "M1 done." }],
    ],
    M2: [
      [["Read", { file_path: "src/math.js" }]],
      // slips past the guard's pattern; in Docker the read-only git dir still stops it
      ...((process.env.DEVAGENT_E2E_RUNTIME === "docker" ? [[["Bash", { command: "sh -c 'git commit --allow-empty -q -m sneaky' && echo SNEAKY_OK || echo SNEAKY_BLOCKED; git status --short | head -3" }]]] : []) as Step[]),
      [["Write", { file_path: "src/math.js", content: MATH_DIV }], ["Write", { file_path: "test/divide.test.js", content: test("divide", "divide", "assert.equal(divide(8, 2), 4);") }]],
      [[D("complete_milestone"), { summary: "Added divide with a test.", commitSubject: "feat(math): add divide" }]],
      [{ type: "text", text: "M2 done." }],
    ],
    review: [
      [["Bash", { command: "git log --oneline -5 && git diff --stat HEAD~2" }]],
      [
        [
          D("submit_review"),
          {
            verdict: "changes_requested",
            summary: "Division by zero isn't handled.",
            findings: [
              { severity: "major", title: "divide(1, 0) returns Infinity", detail: "Callers expect an error.", file: "src/math.js", line: 10, suggestion: "throw a RangeError" },
              { severity: "nit", title: "Add JSDoc to exports", detail: "Nice to have." },
            ],
          },
        ],
      ],
      [{ type: "text", text: "Review submitted." }],
    ],
    F1: [
      [["Read", { file_path: "src/math.js" }]],
      [["Write", { file_path: "src/math.js", content: MATH_SAFE }], ["Write", { file_path: "test/divide-zero.test.js", content: test("divide by zero", "divide", "assert.throws(() => divide(1, 0), RangeError);") }]],
      [[D("complete_milestone"), { summary: "divide throws RangeError for zero.", commitSubject: "fix(math): reject division by zero" }]],
      [{ type: "text", text: "F1 done." }],
    ],
    R1: [
      [["Read", { file_path: "src/math.js" }]],
      [["Write", { file_path: "src/math.js", content: MATH_SUB }], ["Write", { file_path: "test/subtract.test.js", content: test("subtract", "subtract", "assert.equal(subtract(5, 3), 2);") }]],
      [[D("complete_milestone"), { summary: "Added subtract.", commitSubject: "feat(math): add subtract" }]],
      [{ type: "text", text: "R1 done." }],
    ],
  };
}

function toBlocks(phase: string, step: Step, i: number): Block[] {
  return step.map((s, j) => (Array.isArray(s) ? { type: "tool_use", id: `toolu_${phase}_${i}_${j}`, name: s[0] as string, input: s[1] } : (s as Block)));
}

function sse(res: http.ServerResponse, blocks: Block[], stop: string) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const w = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  w("message_start", { type: "message_start", message: { id: `msg_${Date.now()}`, type: "message", role: "assistant", model: "claude-mock", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } } });
  blocks.forEach((b, i) => {
    if (b.type === "text") {
      w("content_block_start", { type: "content_block_start", index: i, content_block: { type: "text", text: "" } });
      w("content_block_delta", { type: "content_block_delta", index: i, delta: { type: "text_delta", text: b.text } });
    } else {
      w("content_block_start", { type: "content_block_start", index: i, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
      w("content_block_delta", { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    }
    w("content_block_stop", { type: "content_block_stop", index: i });
  });
  w("message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 50 } });
  w("message_stop", { type: "message_stop" });
  res.end();
}

const textOf = (c: unknown): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((x: { type?: string; text?: string }) => (x.type === "text" ? (x.text ?? "") : "")).join("\n") : "";

function phaseOf(names: string[], firstUser: string): string | null {
  if (names.includes(D("save_profile"))) return "setup";
  if (names.includes(D("save_plan"))) return "plan";
  if (names.includes(D("submit_review"))) return "review";
  if (names.includes(D("complete_milestone"))) return firstUser.match(/Implement milestone (\w+)/)?.[1] ?? "M?";
  return null;
}

export async function startMockClaude(o: { host?: string } = {}) {
  const seen = new Set<string>();
  const all = scripts();
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const j = raw ? JSON.parse(raw) : {};
    if (!req.url?.startsWith("/v1/messages") || req.url.includes("count_tokens")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ input_tokens: 100 }));
    }
    const names: string[] = (j.tools ?? []).map((t: { name: string }) => t.name);
    const msgs = (j.messages ?? []) as { role: string; content: unknown }[];
    const firstUser = textOf(msgs.find((m) => m.role === "user")?.content);
    const phase = phaseOf(names, firstUser);
    let blocks: Block[] = [{ type: "text", text: "ok" }];
    if (phase && all[phase]) {
      toolsByPhase[phase] = names;
      firstPromptByPhase[phase] ??= firstUser;
      systemByPhase[phase] = Array.isArray(j.system) ? j.system.map((s: { text?: string }) => s.text ?? "").join("\n") : String(j.system ?? "");
      const results = msgs.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((c: { type?: string }) => c.type === "tool_result") as {
        tool_use_id: string;
        is_error?: boolean;
        content: unknown;
      }[];
      for (const r of results) {
        if (seen.has(r.tool_use_id)) continue;
        seen.add(r.tool_use_id);
        toolResults.push({ phase, id: r.tool_use_id, isError: !!r.is_error, text: textOf(r.content) });
      }
      const done = new Set(results.map((r) => r.tool_use_id));
      const script = all[phase];
      let i = 0;
      while (i < script.length - 1) {
        const ids = toBlocks(phase, script[i], i).filter((b) => b.type === "tool_use").map((b) => (b as { id: string }).id);
        if (ids.length && ids.every((x) => done.has(x))) i++;
        else break;
      }
      blocks = toBlocks(phase, script[i], i);
    }
    const stop = blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
    if (j.stream) return sse(res, blocks, stop);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "msg_x", type: "message", role: "assistant", model: "claude-mock", content: blocks, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 3 } }));
  });
  await new Promise<void>((r) => server.listen(0, o.host ?? "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  process.env.NO_PROXY = [process.env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(",");
  for (const k of Object.keys(process.env)) if (/^(CLAUDE_CODE_REMOTE|SESSION_INGRESS|CCR_|CLAUDE_CODE_SESSION|CLAUDECODE)/.test(k)) delete process.env[k];
  return { port, close: () => server.close() };
}

/** Scripted answers for ask_user / approval in tests. */
export const scriptedInteraction = {
  async ask(questions: { id: string; secretEnv?: string; default?: string | string[] }[]) {
    const out: Record<string, string | string[]> = {};
    for (const q of questions) out[q.id] = q.secretEnv ? "sk_test_123" : (q.default ?? "yes");
    return out;
  },
  async approve() {
    return { decision: "approve" as const };
  },
};
