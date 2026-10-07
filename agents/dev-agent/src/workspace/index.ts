import type { RuntimeKind } from "../config.js";
import { DockerWorkspace } from "./docker.js";
import { LocalWorkspace } from "./local.js";
import type { Workspace, WorkspaceSpec } from "./types.js";

export type { Workspace, WorkspaceSpec } from "./types.js";

export function createWorkspace(kind: RuntimeKind, spec: WorkspaceSpec): Workspace {
  return kind === "local" ? new LocalWorkspace(spec) : new DockerWorkspace(spec);
}

export interface StepResult {
  command: string;
  ok: boolean;
  code: number;
  durationMs: number;
  timedOut: boolean;
  tail: string;
}

/** Runs commands in order; stops at the first failure unless `continueOnError`. */
export async function runSteps(
  ws: Workspace,
  commands: string[],
  o: { timeoutMs: number; onStep?: (r: StepResult, i: number) => void; log?: (line: string) => void; continueOnError?: boolean; signal?: AbortSignal; logSink?: (cmd: string, output: string) => Promise<void> },
): Promise<StepResult[]> {
  const { tail } = await import("../proc.js");
  const out: StepResult[] = [];
  for (const [i, command] of commands.entries()) {
    o.log?.(`$ ${command}`);
    const r = await ws.exec(command, { timeoutMs: o.timeoutMs, signal: o.signal });
    await o.logSink?.(command, r.output);
    const res: StepResult = { command, ok: r.code === 0, code: r.code, durationMs: r.durationMs, timedOut: r.timedOut, tail: tail(r.output, 60) };
    out.push(res);
    o.onStep?.(res, i);
    if (!res.ok && !o.continueOnError) break;
  }
  return out;
}
