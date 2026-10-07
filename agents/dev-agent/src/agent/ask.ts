/** The ask_user MCP tool shared by all phases, backed by an Interaction (terminal or web UI). */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Answers, Emit, Interaction, Question } from "../events.js";

export const QuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/).describe("snake_case key for the answer"),
  header: z.string().max(30).optional().describe("Very short label, e.g. 'PR mode'"),
  question: z.string().min(3),
  options: z
    .array(z.object({ label: z.string().min(1).max(80), description: z.string().max(240).optional() }))
    .max(6)
    .optional()
    .describe("2 to 4 options; recommended first"),
  multiSelect: z.boolean().optional(),
  default: z.union([z.string(), z.array(z.string())]).optional().describe("Label(s) preselected, or default free text"),
  allowOther: z.boolean().optional().describe("Allow a free-text answer besides the options (default true)"),
  secretEnv: z
    .string()
    .regex(/^[A-Z_][A-Z0-9_]*$/)
    .optional()
    .describe("Store the answer as this workspace environment variable; the value is never shown to you"),
});

/** Answer meaning "the developer put this secret into the project's secrets.env themselves" (relay mode). */
const IN_SECRETS_FILE = "__in_secrets_file__";

export function askUserTool(o: {
  interaction: Interaction;
  emit: Emit;
  storeSecret?: (env: string, value: string) => Promise<void>;
  hasSecret?: (env: string) => Promise<boolean>;
}) {
  return tool(
    "ask_user",
    "Ask the developer up to 4 questions at once (options and/or free text). Blocks until they answer. Use secretEnv for credentials.",
    { context: z.string().max(300).optional().describe("One line shown above the questions"), questions: z.array(QuestionSchema).min(1).max(4) },
    async ({ context, questions }) => {
      const qs = questions as Question[];
      let answers: Answers;
      try {
        answers = await o.interaction.ask(qs, context);
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Nobody answered (${(e as Error).message}). Proceed with your best judgement and record the assumption.` }], isError: true };
      }
      const shown: Answers = {};
      for (const q of qs) {
        const a = answers[q.id];
        if (q.secretEnv) {
          const value = Array.isArray(a) ? a.join(",") : (a ?? "");
          if (value === IN_SECRETS_FILE) shown[q.id] = (await o.hasSecret?.(q.secretEnv)) ? `(stored as ${q.secretEnv})` : "(not provided)";
          else if (value && o.storeSecret) {
            await o.storeSecret(q.secretEnv, value);
            shown[q.id] = `(stored as ${q.secretEnv})`;
          } else shown[q.id] = "(skipped)";
        } else shown[q.id] = a ?? "";
      }
      o.emit({
        type: "text",
        label: "developer",
        text: qs.map((q) => `${q.header ?? q.id}: ${Array.isArray(shown[q.id]) ? (shown[q.id] as string[]).join(", ") : shown[q.id]}`).join("\n"),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(shown, null, 2) }] };
    },
  );
}

/** Interaction for unattended runs: questions fail fast, approval pauses the run. */
export const unattended: Interaction = {
  ask: async () => {
    throw new Error("unattended run");
  },
  approve: async () => ({ decision: "cancel", feedback: "__pause__" }),
};
