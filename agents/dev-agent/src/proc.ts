/** Small process helpers: run a command, capture (bounded) output, enforce a timeout. */
import { spawn, type SpawnOptions } from "node:child_process";

export interface ExecResult {
  code: number;
  /** Combined stdout+stderr (the last `maxBytes` of it). */
  output: string;
  stdout: string;
  timedOut: boolean;
  durationMs: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  input?: string;
  maxBytes?: number;
  signal?: AbortSignal;
  onLine?: (line: string) => void;
}

/** Runs `cmd args…` without a shell. Never throws for a non-zero exit; check `code`. */
export function exec(cmd: string, args: string[], o: ExecOptions = {}): Promise<ExecResult> {
  const max = o.maxBytes ?? 2_000_000;
  const started = Date.now();
  return new Promise((resolve) => {
    const opts: SpawnOptions = { cwd: o.cwd, env: o.env ?? process.env, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" };
    let child;
    try {
      child = spawn(cmd, args, opts);
    } catch (e) {
      resolve({ code: 127, output: (e as Error).message, stdout: "", timedOut: false, durationMs: 0 });
      return;
    }
    let out = "";
    let stdout = "";
    let partial = "";
    let timedOut = false;
    const push = (buf: Buffer, isStdout: boolean) => {
      const s = buf.toString("utf8");
      out += s;
      if (out.length > max) out = out.slice(out.length - max);
      if (isStdout) {
        stdout += s;
        if (stdout.length > max) stdout = stdout.slice(stdout.length - max);
      }
      if (o.onLine) {
        partial += s;
        const lines = partial.split(/\r?\n/);
        partial = lines.pop() ?? "";
        for (const l of lines) o.onLine(l);
      }
    };
    child.stdout?.on("data", (b: Buffer) => push(b, true));
    child.stderr?.on("data", (b: Buffer) => push(b, false));
    const kill = () => {
      try {
        if (child.pid && opts.detached) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    };
    const timer = o.timeoutMs ? setTimeout(() => ((timedOut = true), kill()), o.timeoutMs) : undefined;
    const onAbort = () => kill();
    o.signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (e) => {
      out += `\n${e.message}`;
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      o.signal?.removeEventListener("abort", onAbort);
      if (o.onLine && partial) o.onLine(partial);
      resolve({ code: timedOut ? 124 : (code ?? 1), output: out, stdout, timedOut, durationMs: Date.now() - started });
    });
    if (o.input !== undefined) child.stdin?.end(o.input);
    else child.stdin?.end();
  });
}

/** Last `n` lines of a text, for showing command output to the agent or the user. */
export function tail(text: string, n = 80): string {
  const lines = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.length > n ? `… (${lines.length - n} earlier lines)\n${lines.slice(-n).join("\n")}` : lines.join("\n");
}

/** POSIX single-quote a string for `bash -c`. */
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
