import { z } from "zod";
import type { Milestone, RunRecord } from "./run-record.js";

export const MilestoneInput = z.object({
  title: z.string().min(3).max(120),
  goal: z.string().min(3),
  tasks: z.array(z.string()).min(1).max(20),
  acceptance: z.array(z.string()).default([]).describe("Acceptance criteria this milestone satisfies (AC ids + short text) and the tests that prove them"),
});

export const PlanInput = {
  branchSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/).optional().describe("Short kebab-case slug for the branch name"),
  title: z.string().min(3).max(100).describe("Feature title, used for the PR"),
  milestones: z.array(MilestoneInput).min(1).max(6),
};

const MARK: Record<Milestone["status"], string> = { pending: "[ ]", in_progress: "[~]", done: "[x]", done_with_issues: "[x]", skipped: "[-]" };

export function renderPlan(run: RunRecord): string {
  const lines = [`# Plan: ${run.title}`, "", `Branch \`${run.branch}\` from \`${run.baseBranch}\`.`, ""];
  for (const m of run.milestones) {
    lines.push(`## ${MARK[m.status]} ${m.id}: ${m.title}${m.commit ? ` (${m.commit.slice(0, 7)})` : ""}`, "", m.goal, "", "Tasks:");
    for (const t of m.tasks) lines.push(`- ${t}`);
    if (m.acceptance.length) {
      lines.push("", "Acceptance:");
      for (const a of m.acceptance) lines.push(`- ${a}`);
    }
    if (m.summary) lines.push("", `Done: ${m.summary}`);
    if (m.knownIssues) lines.push("", `Known issues: ${m.knownIssues}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Pulls the "## Summary" section out of a PRD for the PR description. */
export function prdSection(prd: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "im");
  return prd.match(re)?.[1]?.trim() ?? "";
}
