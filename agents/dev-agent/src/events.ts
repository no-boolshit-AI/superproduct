import type { RunRecord } from "./run-record.js";

export type Step = "clone" | "workspace" | "plan" | "approval" | "implement" | "review" | "verify" | "publish" | "done";

export type DevEvent =
  | { type: "status"; message: string }
  | { type: "step"; step: Step | "setup" }
  | { type: "text"; text: string; label?: string }
  | { type: "tool"; name: string; summary: string; label?: string }
  | { type: "exec"; command: string; ok?: boolean; code?: number; tail?: string; phase?: string }
  | { type: "question"; id: string; questions: Question[]; context?: string }
  | { type: "answered"; id: string }
  | { type: "approval"; id: string; prd: string; plan: string }
  | { type: "milestone"; id: string; title: string; status: string; commit?: string }
  | { type: "cost"; usd: number; total: number; label?: string }
  | { type: "publish"; branch: string; branchUrl?: string; prUrl?: string }
  | { type: "error"; message: string }
  | { type: "done"; run?: RunRecord; project?: string; status: string };

export type Emit = (e: DevEvent) => void;

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  id: string;
  question: string;
  header?: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
  /** Pre-selected answer(s) (labels) or default free text. */
  default?: string | string[];
  /** The answer is stored as a workspace secret under this env var name and never shown to the model. */
  secretEnv?: string;
  /** Free text allowed in addition to the options. */
  allowOther?: boolean;
}

export type Answers = Record<string, string | string[]>;

export interface ApprovalDecision {
  decision: "approve" | "revise" | "cancel";
  feedback?: string;
}

/** How the agent reaches a human. Absent when the run is unattended. */
export interface Interaction {
  ask(questions: Question[], context?: string): Promise<Answers>;
  approve(info: { runId: string; prd: string; plan: string }): Promise<ApprovalDecision>;
}
