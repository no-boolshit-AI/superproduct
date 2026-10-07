/**
 * Relay Interaction (--relay / --ask-dir): questions and plan approvals become JSON files that another agent (the
 * orchestrating Claude in the parent folder) reads, asks the human about, and answers. Works when dev-agent runs in
 * the background without a terminal.
 *
 *   <dir>/<id>.pending.json   written by dev-agent   { id, kind: "questions" | "approval", … , howToAnswer }
 *   <dir>/<id>.answer.json    written by the relay   { answers: { <questionId>: "label" | ["a","b"] | "free text" } }
 *                                                     { decision: "approve" | "revise" | "cancel", feedback?: "…" }
 *   <dir>/history.jsonl       what was asked and answered (secret answers redacted)
 *
 * `npm run agent -- pending` lists open items; `npm run agent -- answer <id> …` writes the answer file.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Answers, ApprovalDecision, Interaction, Question } from "./events.js";
import { HOME } from "./paths.js";

/** Answer value meaning "the human added this secret to the project's secrets.env themselves". */
export const IN_SECRETS_FILE = "__in_secrets_file__";

export interface PendingItem {
  id: string;
  kind: "questions" | "approval";
  scope: string;
  createdAt: string;
  pid: number;
  context?: string;
  questions?: Question[];
  prd?: string;
  plan?: string;
  secretsFile?: string;
  howToAnswer: string;
}

export const defaultAskDir = () => path.resolve(process.env.DEVAGENT_ASK_DIR || path.join(HOME, "ask"));

async function writeAtomic(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

export async function listPending(dir = defaultAskDir()): Promise<PendingItem[]> {
  if (!existsSync(dir)) return [];
  const out: PendingItem[] = [];
  for (const f of (await readdir(dir)).filter((n) => n.endsWith(".pending.json")).sort()) {
    try {
      const item = JSON.parse(await readFile(path.join(dir, f), "utf8")) as PendingItem;
      if (!existsSync(path.join(dir, `${item.id}.answer.json`))) out.push(item);
    } catch {
      /* half-written */
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Validates and writes an answer for a pending item. Throws with a helpful message on mistakes. */
export async function writeAnswer(id: string, payload: { answers?: Answers; decision?: ApprovalDecision["decision"]; feedback?: string }, dir = defaultAskDir()): Promise<PendingItem> {
  const item = (await listPending(dir)).find((p) => p.id === id || p.id.startsWith(id));
  if (!item) throw new Error(`No open question with id ${id}. See: npm run agent -- pending`);
  if (item.kind === "approval") {
    if (!payload.decision) throw new Error("This is a plan approval: answer with --decision approve | revise | cancel (and --feedback for revise).");
    if (payload.decision === "revise" && !payload.feedback?.trim()) throw new Error("--decision revise needs --feedback.");
    await writeAtomic(path.join(dir, `${item.id}.answer.json`), { decision: payload.decision, feedback: payload.feedback });
    return item;
  }
  const answers = payload.answers ?? {};
  const missing = (item.questions ?? []).filter((q) => !(q.id in answers)).map((q) => q.id);
  if (missing.length) throw new Error(`Missing answers for: ${missing.join(", ")}. Use "" to skip a question.`);
  for (const q of item.questions ?? []) {
    const a = answers[q.id];
    if (q.secretEnv && typeof a === "string" && a && a !== IN_SECRETS_FILE)
      throw new Error(`Don't pass secret values through answers. Have the user add ${q.secretEnv}=… to ${item.secretsFile ?? "the project's secrets.env"} (or append it there yourself), then answer "${IN_SECRETS_FILE}".`);
  }
  await writeAtomic(path.join(dir, `${item.id}.answer.json`), { answers });
  return item;
}

function howTo(kind: PendingItem["kind"], id: string, secretsFile?: string): string {
  if (kind === "approval")
    return `Ask the user to review the PRD and plan, then: npm run agent -- answer ${id} --decision approve | --decision revise --feedback "…" | --decision cancel`;
  return [
    `Ask the user these questions (offer the options; defaults are the recommended choice), then: npm run agent -- answer ${id} --json '{"<questionId>": "<option label or text>", …}'`,
    `multiSelect questions take an array of labels. Use "" to skip.`,
    `For questions with secretEnv: never relay the value. The user adds NAME=value to ${secretsFile ?? "the project's secrets.env"} (or you append it there if they gave it to you), then answer "${IN_SECRETS_FILE}".`,
  ].join(" ");
}

export function fileInteraction(o: { dir?: string; scope: string; secretsFile?: string; onPending?: (item: PendingItem) => void; timeoutMs?: number }): Interaction {
  const dir = o.dir ?? defaultAskDir();
  const timeoutMs = o.timeoutMs ?? Number(process.env.DEVAGENT_ASK_TIMEOUT_MIN || 240) * 60_000;

  async function waitFor<T>(item: PendingItem, redact: (a: T) => unknown): Promise<T | null> {
    await mkdir(dir, { recursive: true });
    await writeAtomic(path.join(dir, `${item.id}.pending.json`), item);
    o.onPending?.(item);
    const answerFile = path.join(dir, `${item.id}.answer.json`);
    const started = Date.now();
    try {
      for (;;) {
        if (existsSync(answerFile)) {
          try {
            const a = JSON.parse(await readFile(answerFile, "utf8")) as T;
            await appendFile(path.join(dir, "history.jsonl"), JSON.stringify({ at: new Date().toISOString(), id: item.id, kind: item.kind, scope: item.scope, questions: item.questions, answer: redact(a) }) + "\n");
            return a;
          } catch {
            /* being written; retry */
          }
        }
        if (Date.now() - started > timeoutMs) return null;
        await new Promise((r) => setTimeout(r, 1000));
      }
    } finally {
      await rm(path.join(dir, `${item.id}.pending.json`), { force: true });
      await rm(answerFile, { force: true });
    }
  }

  const base = () => ({ id: randomUUID().slice(0, 8), scope: o.scope, createdAt: new Date().toISOString(), pid: process.pid });

  return {
    async ask(questions: Question[], context?: string): Promise<Answers> {
      const id = base().id;
      const item: PendingItem = { ...base(), id, kind: "questions", context, questions, secretsFile: o.secretsFile, howToAnswer: howTo("questions", id, o.secretsFile) };
      const secretIds = new Set(questions.filter((q) => q.secretEnv).map((q) => q.id));
      const r = await waitFor<{ answers: Answers }>(item, (a) => ({
        answers: Object.fromEntries(Object.entries(a.answers ?? {}).map(([k, v]) => [k, secretIds.has(k) ? "(secret)" : v])),
      }));
      if (!r) throw new Error("no answer within the relay timeout");
      return r.answers ?? {};
    },
    async approve(info): Promise<ApprovalDecision> {
      const id = base().id;
      const item: PendingItem = { ...base(), id, kind: "approval", prd: info.prd, plan: info.plan, howToAnswer: howTo("approval", id) };
      const r = await waitFor<ApprovalDecision>(item, (a) => a);
      return r ?? { decision: "cancel", feedback: "__pause__" };
    },
  };
}
