import type { SpawnedProcess, SpawnOptions } from "@anthropic-ai/claude-agent-sdk";
import type { ExecResult } from "../proc.js";
import type { WorkspaceConfig } from "../profile.js";

export interface WorkspaceSpec {
  /** Unique id (run id or setup-<slug>); names the compose project and container. */
  id: string;
  /** Project slug (image tag, compose override, caches). */
  project: string;
  config: WorkspaceConfig;
  /** Host folders. */
  repoDir: string;
  /** Host git dir of the checkout; mounted read-only at the same path. */
  gitDir?: string;
  homeDir: string;
  pluginDir: string;
  /** Host file with KEY=VALUE secrets for the workspace (never shown to the model). */
  secretsFile?: string;
  log?: (line: string) => void;
}

export interface ExecOpts {
  timeoutMs?: number;
  onLine?: (line: string) => void;
  signal?: AbortSignal;
}

/** Where the project's code runs: its own Docker container (+ services), or this machine. */
export interface Workspace {
  readonly kind: "docker" | "local";
  /** Repo path as the agent sees it. */
  readonly repoPath: string;
  /** Project skills plugin path as the agent sees it. */
  readonly pluginPath: string;
  start(signal?: AbortSignal): Promise<void>;
  isRunning(): Promise<boolean>;
  /** Runs a shell command from the repo root. */
  exec(command: string, o?: ExecOpts): Promise<ExecResult>;
  /** Custom process spawner for the Agent SDK (runs Claude Code inside the container). */
  spawnClaude?: (o: SpawnOptions) => SpawnedProcess;
  /** Environment for the Claude Code process. */
  claudeEnv(): Record<string, string | undefined>;
  stop(): Promise<void>;
  /** One line for prompts and logs. */
  describe(): string;
}

/** Variables that tie a process to a parent Claude Code session; never pass them on. */
export const PARENT_SESSION_VARS = /^(CLAUDECODE|CLAUDE_CODE_(SESSION|ENTRYPOINT|EXECPATH|REMOTE|CONTAINER_ID|TEE_|SYNC_|MESSAGING|WORKER|POST_FOR|ENVIRONMENT_RUNNER|ORGANIZATION_UUID|ACCOUNT_UUID|USER_EMAIL|DIAGNOSTICS|ARTIFACT|CHILD_SESSION|PEWTER)|CLAUDE_SESSION_INGRESS|CLAUDE_PROJECT_|CCR_|SESSION_INGRESS)/;

/** Auth and behaviour variables the Claude Code process needs, wherever it runs. */
export function claudeAuthEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || PARENT_SESSION_VARS.test(k)) continue;
    if (
      /^(ANTHROPIC_|AWS_|GOOGLE_CLOUD_|CLOUD_ML_REGION$|VERTEX_REGION_|CONTEXT7_API_KEY$|MAX_THINKING_TOKENS$|DISABLE_)/.test(k) ||
      /^CLAUDE_CODE_(OAUTH_TOKEN|USE_BEDROCK|USE_VERTEX|USE_FOUNDRY|SKIP_|MAX_OUTPUT_TOKENS|DISABLE_|EFFORT|SUBAGENT_MODEL|API_KEY_HELPER)/.test(k)
    )
      out[k] = v;
  }
  out.CLAUDE_AGENT_SDK_CLIENT_APP = "dev-agent/0.1.0";
  out.DISABLE_AUTOUPDATER = "1";
  return out;
}
