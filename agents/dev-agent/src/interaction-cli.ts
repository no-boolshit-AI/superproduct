/** Terminal Interaction: numbered options, defaults on Enter, hidden input for secrets. */
import readline from "node:readline";
import type { Answers, ApprovalDecision, Interaction, Question } from "./events.js";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

function prompt(text: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const r = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
      let shownPrompt = false;
      r._writeToOutput = (s: string) => {
        if (!shownPrompt) {
          process.stdout.write(s);
          shownPrompt = true;
        } else if (s.includes("\n")) process.stdout.write("\n");
        else process.stdout.write("*");
      };
    }
    rl.question(text, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });
}

async function askOne(q: Question): Promise<string | string[]> {
  console.log(`\n${bold(q.header ? `${q.header}: ${q.question}` : q.question)}`);
  const opts = q.options ?? [];
  const defaults = q.default === undefined ? [] : Array.isArray(q.default) ? q.default : [q.default];
  if (q.secretEnv) {
    const v = await prompt(`${cyan("›")} ${dim(`(${q.secretEnv}, hidden; Enter to skip)`)} `, true);
    return v;
  }
  if (!opts.length) {
    const d = defaults[0];
    const v = await prompt(`${cyan("›")} ${d ? dim(`[${d}] `) : ""}`);
    return v || d || "";
  }
  opts.forEach((o, i) => {
    const pre = defaults.includes(o.label) ? cyan("●") : " ";
    console.log(` ${pre} ${i + 1}. ${o.label}${o.description ? dim(` — ${o.description}`) : ""}`);
  });
  const hint = q.multiSelect ? "numbers separated by commas" : "a number";
  const other = q.allowOther === false ? "" : " or type an answer";
  for (;;) {
    const v = await prompt(`${cyan("›")} ${dim(`${hint}${other}${defaults.length ? `, Enter = ${defaults.join(", ")}` : ""}`)} `);
    if (!v) {
      if (defaults.length) return q.multiSelect ? defaults : defaults[0];
      if (q.multiSelect) return [];
      continue;
    }
    const nums = v.split(/[,\s]+/).filter(Boolean);
    if (nums.every((n) => /^\d+$/.test(n) && Number(n) >= 1 && Number(n) <= opts.length)) {
      const labels = nums.map((n) => opts[Number(n) - 1].label);
      return q.multiSelect ? labels : labels[0];
    }
    if (q.allowOther === false) {
      console.log(dim("  Pick one of the numbers."));
      continue;
    }
    return q.multiSelect ? [v] : v;
  }
}

export const cliInteraction: Interaction = {
  async ask(questions: Question[], context?: string): Promise<Answers> {
    if (!process.stdin.isTTY) throw new Error("no terminal attached");
    if (context) console.log(`\n${cyan("?")} ${context}`);
    const out: Answers = {};
    for (const q of questions) out[q.id] = await askOne(q);
    console.log();
    return out;
  },

  async approve(info): Promise<ApprovalDecision> {
    if (!process.stdin.isTTY) return { decision: "cancel", feedback: "__pause__" };
    console.log(`\n${bold("PRD and plan are ready for review:")}`);
    console.log(`  ${info.prd}\n  ${info.plan}`);
    const v = await prompt(`${cyan("›")} ${dim("Enter/y = approve and implement · n = stop here · or type feedback to revise")} `);
    if (!v || /^(y|yes|ok|approve)$/i.test(v)) return { decision: "approve" };
    if (/^(n|no|stop|cancel)$/i.test(v)) return { decision: "cancel" };
    return { decision: "revise", feedback: v };
  },
};
