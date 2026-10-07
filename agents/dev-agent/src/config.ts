import "./env.js";

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export type RuntimeKind = "docker" | "local";

export interface Defaults {
  model: string;
  maxBudgetUsd: number;
  setupBudgetUsd: number;
  runtime: RuntimeKind;
  commandTimeoutMs: number;
  port: number;
}

export function defaults(): Defaults {
  const env = process.env;
  return {
    model: env.AGENT_MODEL || "opus",
    maxBudgetUsd: num(env.MAX_BUDGET_USD, 30),
    setupBudgetUsd: num(env.SETUP_BUDGET_USD, 8),
    runtime: env.RUNTIME === "local" ? "local" : "docker",
    commandTimeoutMs: num(env.COMMAND_TIMEOUT_MIN, 20) * 60_000,
    port: num(env.PORT, 4949),
  };
}

/** Missing credentials, as human-readable names. */
export function checkClaudeAuth(): string[] {
  const e = process.env;
  const ok =
    e.ANTHROPIC_API_KEY || e.CLAUDE_CODE_OAUTH_TOKEN || e.ANTHROPIC_AUTH_TOKEN || e.CLAUDE_CODE_USE_BEDROCK || e.CLAUDE_CODE_USE_VERTEX || e.CLAUDE_CODE_USE_FOUNDRY;
  return ok ? [] : ["ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN"];
}
