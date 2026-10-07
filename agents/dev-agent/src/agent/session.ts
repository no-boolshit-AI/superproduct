/** One Agent SDK session (setup, plan, milestone, review): common options, event mapping and cost tracking. */
import { query, type McpServerConfig, type SettingSource } from "@anthropic-ai/claude-agent-sdk";
import path from "node:path";
import type { Emit } from "../events.js";
import type { Workspace } from "../workspace/index.js";
import { guardHook, type GuardOptions } from "./guard.js";

export interface SessionSpec {
  label: string;
  prompt: string;
  /** Appended to Claude Code's own system prompt. */
  system: string;
  /** Where Claude Code runs. Omit to run it on the host (setup agent). */
  workspace?: Workspace;
  /** Host cwd when there is no workspace. */
  cwd?: string;
  tools: string[];
  mcpServers: Record<string, McpServerConfig>;
  plugins?: string[];
  settingSources: SettingSource[];
  guard: GuardOptions;
  model: string;
  maxTurns: number;
  maxBudgetUsd: number;
  resume?: string;
  env?: Record<string, string | undefined>;
  emit: Emit;
  signal?: AbortSignal;
  onSessionId?: (id: string) => void | Promise<void>;
}

export interface SessionResult {
  sessionId?: string;
  costUsd: number;
  subtype: string;
  ok: boolean;
  error?: string;
  finalText: string;
  aborted: boolean;
}

/** Built-in tools for a coding session (unknown names are ignored by Claude Code). */
export const CODING_TOOLS = ["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "Bash", "BashOutput", "KillShell", "TaskOutput", "TaskStop", "Skill", "Agent", "Task", "TodoWrite", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "WebFetch", "WebSearch", "NotebookEdit"];
export const READONLY_TOOLS = ["Read", "Glob", "Grep", "Bash", "BashOutput", "KillShell", "TaskOutput", "TaskStop", "Skill", "Agent", "Task", "TodoWrite", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "WebFetch", "WebSearch"];

function summarize(name: string, input: Record<string, unknown>, root: string): string | null {
  const rel = (p: unknown) => (typeof p === "string" ? (path.isAbsolute(p) && p.startsWith(root) ? path.relative(root, p) || "." : p) : "");
  switch (name) {
    case "Bash":
      return `$ ${String(input.command ?? "").split("\n")[0].slice(0, 160)}`;
    case "Write":
      return `write ${rel(input.file_path)}`;
    case "Edit":
    case "MultiEdit":
      return `edit ${rel(input.file_path)}`;
    case "Read":
      return `read ${rel(input.file_path)}`;
    case "Grep":
      return `grep ${String(input.pattern ?? "").slice(0, 80)}`;
    case "Glob":
      return `glob ${String(input.pattern ?? "")}`;
    case "Skill":
      return `skill ${String(input.skill ?? input.name ?? "")}`;
    case "Agent":
    case "Task":
      return `subagent: ${String(input.description ?? "").slice(0, 80)}`;
    case "WebSearch":
      return `search: ${String(input.query ?? "").slice(0, 100)}`;
    case "WebFetch":
      return `fetch ${String(input.url ?? "").slice(0, 120)}`;
    default:
      if (name.startsWith("mcp__devagent__")) return null; // our tools emit their own events
      if (name.startsWith("mcp__")) return `${name.replace(/^mcp__/, "").replace("__", ": ")}`;
      return null;
  }
}

export async function runSession(s: SessionSpec): Promise<SessionResult> {
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  s.signal?.addEventListener("abort", onAbort);
  const ws = s.workspace;
  const cwd = ws ? ws.repoPath : (s.cwd ?? process.cwd());
  const res: SessionResult = { costUsd: 0, subtype: "unknown", ok: false, finalText: "", aborted: false };
  let lastText = "";
  try {
    const q = query({
      prompt: s.prompt,
      options: {
        model: s.model,
        cwd,
        systemPrompt: { type: "preset", preset: "claude_code", append: s.system },
        tools: s.tools,
        settingSources: s.settingSources,
        skills: "all",
        plugins: (s.plugins ?? []).map((p) => ({ type: "local" as const, path: p })),
        mcpServers: s.mcpServers,
        // everything not denied by the guard hook (or the project's own deny rules) is allowed
        permissionMode: "default",
        canUseTool: async (_name, input) => ({ behavior: "allow", updatedInput: input }),
        disallowedTools: ["AskUserQuestion", "EnterPlanMode", "ExitPlanMode", "EnterWorktree", "ExitWorktree", "CronCreate", "ScheduleWakeup", "RemoteTrigger", "PushNotification"],
        hooks: { PreToolUse: [{ hooks: [guardHook(s.guard)] }] },
        maxTurns: s.maxTurns,
        maxBudgetUsd: Math.max(0.05, s.maxBudgetUsd),
        abortController: abort,
        ...(s.resume ? { resume: s.resume } : {}),
        env: s.env ?? ws?.claudeEnv() ?? { ...process.env },
        ...(ws?.spawnClaude ? { spawnClaudeCodeProcess: ws.spawnClaude } : {}),
        stderr: (d: string) => {
          if (/error/i.test(d) && process.env.DEVAGENT_DEBUG) process.stderr.write(d);
        },
      },
    });

    for await (const msg of q) {
      if ("session_id" in msg && msg.session_id && res.sessionId !== msg.session_id) {
        res.sessionId = msg.session_id;
        await s.onSessionId?.(msg.session_id);
      }
      if (msg.type === "system" && msg.subtype === "init") {
        const mcp = (msg.mcp_servers ?? []).filter((m) => m.name !== "devagent").map((m) => `${m.name}${m.status === "connected" ? "" : ` (${m.status})`}`);
        const skills = (msg.skills ?? []).length;
        s.emit({ type: "status", message: `[${s.label}] session ready · ${skills} skills${mcp.length ? ` · MCP: ${mcp.join(", ")}` : ""}` });
      } else if (msg.type === "assistant" && !msg.parent_tool_use_id) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text.trim()) {
            lastText = block.text.trim();
            s.emit({ type: "text", text: lastText.slice(0, 4000), label: s.label });
          } else if (block.type === "tool_use") {
            const sum = summarize(block.name, (block.input ?? {}) as Record<string, unknown>, cwd);
            if (sum) s.emit({ type: "tool", name: block.name, summary: sum, label: s.label });
          }
        }
      } else if (msg.type === "result") {
        res.costUsd = Math.max(res.costUsd, msg.total_cost_usd ?? 0);
        res.subtype = msg.subtype;
        res.ok = msg.subtype === "success";
        if (msg.subtype === "success") res.finalText = msg.result || lastText;
        else res.error = (msg as { errors?: string[] }).errors?.join("; ") || msg.subtype;
      }
    }
  } catch (e) {
    if (abort.signal.aborted) {
      res.aborted = true;
      res.error = "Cancelled";
    } else {
      res.error = (e as Error).message;
    }
  } finally {
    s.signal?.removeEventListener("abort", onAbort);
  }
  if (!res.finalText) res.finalText = lastText;
  return res;
}

export function describeStop(r: SessionResult, budget: number): string {
  if (r.aborted) return "Cancelled";
  if (r.subtype === "error_max_budget_usd") return `Stopped at the $${budget.toFixed(2)} budget limit`;
  if (r.subtype === "error_max_turns") return "Stopped at the turn limit";
  return `Agent error: ${r.error ?? r.subtype}`;
}
