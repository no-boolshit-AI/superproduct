/**
 * Local workspace (RUNTIME=local): commands and Claude Code run directly on this machine in the run's clone.
 * No isolation and no services; meant for trusted repos, machines without Docker, and the test-suite.
 */
import { mkdir } from "node:fs/promises";
import { exec, type ExecResult } from "../proc.js";
import { readSecretsFile } from "./secrets.js";
import { CONTAINER } from "./compose.js";
import { claudeAuthEnv, PARENT_SESSION_VARS, type ExecOpts, type Workspace, type WorkspaceSpec } from "./types.js";

export class LocalWorkspace implements Workspace {
  readonly kind = "local" as const;
  readonly repoPath: string;
  readonly pluginPath: string;

  constructor(private spec: WorkspaceSpec) {
    this.repoPath = spec.repoDir;
    this.pluginPath = spec.pluginDir;
  }

  /** Profile env values use container paths; map them onto this machine. */
  private env(): NodeJS.ProcessEnv {
    const base: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) if (!PARENT_SESSION_VARS.test(k)) base[k] = v;
    const out: NodeJS.ProcessEnv = { ...base, CI: "true" };
    for (const [k, v] of Object.entries({ ...this.spec.config.env, ...readSecretsFile(this.spec.secretsFile) })) {
      const local = v.split(CONTAINER.repo).join(this.spec.repoDir);
      if (k === "PATH") {
        const extra = local.split(":").filter((p) => p.startsWith(this.spec.repoDir));
        out.PATH = [...extra, process.env.PATH].filter(Boolean).join(":");
      } else out[k] = local;
    }
    return out;
  }

  async start(): Promise<void> {
    await mkdir(this.spec.homeDir, { recursive: true });
    if (this.spec.config.services.length)
      this.spec.log?.(`Note: RUNTIME=local doesn't start services (${this.spec.config.services.join(", ")}); point the app at your own.`);
  }

  async isRunning(): Promise<boolean> {
    return true;
  }

  exec(command: string, o: ExecOpts = {}): Promise<ExecResult> {
    return exec("bash", ["-c", command], { cwd: this.spec.repoDir, env: this.env(), timeoutMs: o.timeoutMs ?? 20 * 60_000, onLine: o.onLine, signal: o.signal });
  }

  claudeEnv(): Record<string, string | undefined> {
    return { ...this.env(), ...claudeAuthEnv() };
  }

  async stop(): Promise<void> {}

  describe(): string {
    return `This machine (RUNTIME=local, no container). The repo is at ${this.spec.repoDir}. Each Bash call starts in the repo root.`;
  }
}

