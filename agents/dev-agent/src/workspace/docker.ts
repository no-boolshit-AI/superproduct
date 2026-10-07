/**
 * Docker workspace: a compose project per run with the dev container (+ services). Claude Code itself runs inside
 * the container via `docker exec -i`, so every tool (Bash, file edits, project MCP servers like Laravel Boost) runs
 * there. The SDK's in-process MCP tools and hooks keep working because they travel over the CLI's stdio.
 * Git credentials stay on the host.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SpawnedProcess, SpawnOptions } from "@anthropic-ai/claude-agent-sdk";
import { CACHE_DIR, projectPaths } from "../paths.js";
import { exec, type ExecResult } from "../proc.js";
import { ensureImage } from "./image.js";
import { readSecretsFile } from "./secrets.js";
import { CONTAINER, renderCompose } from "./compose.js";
import { claudeAuthEnv, type ExecOpts, type Workspace, type WorkspaceSpec } from "./types.js";

/** Host-only variables that must not be forwarded into the container. */
const NO_FORWARD = /^(PATH|HOME|USER|LOGNAME|SHELL|PWD|OLDPWD|TMPDIR|TERM|TERM_PROGRAM.*|LANG|LC_.*|SSH_.*|DISPLAY|XPC_.*|__CF.*|COLORTERM|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|NODE_PATH)$/;

export const composeProjectName = (id: string) => `devagent-${id}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 60);

export class DockerWorkspace implements Workspace {
  readonly kind = "docker" as const;
  readonly repoPath = CONTAINER.repo;
  readonly pluginPath = CONTAINER.plugin;
  readonly name: string;
  readonly container: string;
  private composeFile: string;
  private image?: string;

  constructor(private spec: WorkspaceSpec) {
    this.name = composeProjectName(spec.id);
    this.container = `${this.name}-ws`;
    this.composeFile = path.join(path.dirname(spec.homeDir), "compose.json");
  }

  private log(l: string) {
    this.spec.log?.(l);
  }

  async start(signal?: AbortSignal): Promise<void> {
    const s = this.spec;
    if (await this.isRunning()) {
      await this.readNetworkMode();
      return;
    }
    const docker = await exec("docker", ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 20_000 });
    if (docker.code !== 0) throw new Error(`Docker isn't available (${docker.output.trim().split("\n")[0]}). Start Docker Desktop, or set RUNTIME=local.`);
    this.image = await ensureImage(s.project, s.config, (l) => this.log(l), signal);
    const cacheDir = path.join(CACHE_DIR, s.project);
    for (const d of [s.homeDir, cacheDir, s.pluginDir]) await mkdir(d, { recursive: true });
    const overrideFile = projectPaths(s.project).composeOverride;
    const override = existsSync(overrideFile) ? JSON.parse(await readFile(overrideFile, "utf8")) : undefined;
    const uid = process.getuid?.();
    const gid = process.getgid?.();
    const doc = renderCompose({
      name: this.name,
      containerName: this.container,
      image: this.image,
      repoDir: s.repoDir,
      gitDir: s.gitDir,
      homeDir: s.homeDir,
      cacheDir,
      pluginDir: s.pluginDir,
      services: s.config.services,
      env: s.config.env,
      secrets: readSecretsFile(s.secretsFile),
      user: uid !== undefined && gid !== undefined ? `${uid}:${gid}` : undefined,
      override,
    });
    await writeFile(this.composeFile, JSON.stringify(doc, null, 2), { mode: 0o600 }); // holds the secrets
    await chmod(this.composeFile, 0o600).catch(() => {});
    await this.readNetworkMode();
    this.log(`Starting workspace ${this.container}${s.config.services.length ? ` with ${s.config.services.join(", ")}` : ""}`);
    const up = await exec("docker", ["compose", "-p", this.name, "-f", this.composeFile, "up", "-d", "--wait", "--wait-timeout", "600"], {
      timeoutMs: 20 * 60_000,
      signal,
    });
    if (up.code !== 0) throw new Error(`docker compose up failed:\n${up.output.split("\n").slice(-25).join("\n")}`);
  }

  /** With host networking the container shares the host's loopback; otherwise it reaches it as host.docker.internal. */
  private hostNetwork = false;
  private async readNetworkMode() {
    try {
      const doc = JSON.parse(await readFile(this.composeFile, "utf8"));
      this.hostNetwork = doc.services?.workspace?.network_mode === "host";
    } catch {
      this.hostNetwork = false;
    }
  }

  async isRunning(): Promise<boolean> {
    const r = await exec("docker", ["inspect", "-f", "{{.State.Running}}", this.container], { timeoutMs: 20_000 });
    return r.code === 0 && r.stdout.trim() === "true";
  }

  async exec(command: string, o: ExecOpts = {}): Promise<ExecResult> {
    const secs = Math.max(1, Math.round((o.timeoutMs ?? 20 * 60_000) / 1000));
    const r = await exec(
      "docker",
      ["exec", "-i", "-w", CONTAINER.repo, this.container, "timeout", "--kill-after=10", String(secs), "bash", "-c", command],
      { timeoutMs: (secs + 60) * 1000, onLine: o.onLine, signal: o.signal },
    );
    if (r.code === 124) r.timedOut = true;
    return r;
  }

  claudeEnv(): Record<string, string | undefined> {
    // PATH/HOME are only for the docker CLI on the host; the container brings its own
    const env: Record<string, string | undefined> = { PATH: process.env.PATH, HOME: process.env.HOME, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", ...claudeAuthEnv() };
    // an API gateway/proxy on the host's localhost (e.g. LiteLLM) is host.docker.internal from inside the container
    if (!this.hostNetwork && env.ANTHROPIC_BASE_URL) env.ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL.replace(/^(https?:\/\/)(127\.0\.0\.1|localhost|\[::1\])(?=[:/]|$)/, "$1host.docker.internal");
    return env;
  }

  spawnClaude = (o: SpawnOptions): SpawnedProcess => {
    const forward = Object.entries(o.env).filter(([k, v]) => v !== undefined && !NO_FORWARD.test(k));
    const args = [
      "exec",
      "-i",
      "-w",
      o.cwd && o.cwd.startsWith("/workspace") ? o.cwd : CONTAINER.repo,
      // `-e NAME` takes the value from the docker CLI's environment: secrets stay off the command line
      ...forward.flatMap(([k]) => ["-e", k]),
      this.container,
      "claude",
      ...o.args,
    ];
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const [k, v] of forward) env[k] = v;
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"], env, signal: o.signal });
    const logDir = path.join(path.dirname(this.spec.homeDir), "logs");
    mkdirSync(logDir, { recursive: true });
    child.stderr?.pipe(createWriteStream(path.join(logDir, "claude-stderr.log"), { flags: "a" }));
    return child;
  };

  async stop(): Promise<void> {
    if (!existsSync(this.composeFile)) return;
    this.log(`Stopping workspace ${this.container}`);
    await exec("docker", ["compose", "-p", this.name, "-f", this.composeFile, "down", "-v", "--remove-orphans", "-t", "5"], { timeoutMs: 5 * 60_000 });
  }

  describe(): string {
    const c = this.spec.config;
    const v = c.base === "php" ? `PHP ${c.versions.php ?? "8.4"}` : c.base === "python" ? `Python ${c.versions.python ?? "3.13"}` : `Node ${c.versions.node}`;
    return `Docker container ${this.container} (${c.customImage ?? `${c.base} image, ${v}, Node ${c.versions.node}`})${c.services.length ? `, services: ${c.services.map((s) => `${s} (host "${s}")`).join(", ")}` : ""}. The repo is at ${CONTAINER.repo}. Each Bash call starts in the repo root.`;
  }
}
