---
name: dev-agent
description: Implement a feature or change in an existing GitHub repository with agents/dev-agent (PRD, milestone plan, tested commits in Docker, review, pushed branch + draft PR). Use for "add/implement/fix/build X in our app/repo", GitHub issues, and setting up a new repo for the developer agent.
---

# dev-agent

**Folder:** `agents/dev-agent`. **Command:** `npm run agent -- …` (or `node scripts/agents.mjs run dev …`).
**Web UI:** `npm run web` → http://localhost:4949. **Time:** setup takes 5 to 15 minutes; a feature takes 15 minutes
to a few hours. **Spend:** setup about $1 to $4 (`SETUP_BUDGET_USD` 8), a run up to `MAX_BUDGET_USD` (30).

## Readiness (your computer)
- `node scripts/agents.mjs status dev`. Not installed? Run `node scripts/agents.mjs install dev`, then
  `cd agents/dev-agent && npm run doctor`.
- `.env` needs one of these, because the run's container can't use your computer's Claude login:
  - `ANTHROPIC_API_KEY`;
  - `CLAUDE_CODE_OAUTH_TOKEN` (the user runs `claude setup-token`).
- Also in `.env`: `GITHUB_TOKEN`, a fine-grained token with Contents RW, Pull requests RW and Metadata R. Without it,
  dev-agent falls back to `gh auth`.
- Docker Desktop must be running.

## 1. First time for a repo: setup (an interview)
```bash
cd agents/dev-agent && npm run agent -- setup <owner/repo> --relay        # background it
```
The setup agent:
- detects the stack;
- asks 2 or 3 rounds of questions (base branch, PR mode, which dev skills to install such as Laravel Boost, tooling
  policy local or commit, database, secrets, autonomy, budget, conventions);
- builds the Docker image (a few minutes the first time);
- runs bootstrap and tests until a fresh workspace passes;
- saves `workspace/dev/projects/<slug>/project.json` and `PROJECT.md`.

`node scripts/agents.mjs status dev` doesn't list projects. Use `npm run agent -- projects`.

**The product folder.** If the repository is the product's own code (its website or app), runs should get the product
context (glossary, architecture notes, voice, brand guidelines and design tokens). dev-agent only uses a product folder
meant for the repo:
- add the repo to `workspace/product/product.json → repos` (`"owner/name"`), which covers every project on that repo; or
- pass `--product ../../workspace/product` (or the id of a product in `workspace/products/`) to `setup` (saved in the
  project profile) or to a single run.
The setup summary and `show <run-id>` print which product a run uses; `--product none` turns it off.

## 2. Features
```bash
cd agents/dev-agent
npm run agent -- "<feature request>" --project <slug> --relay              # background it
npm run agent -- --project <slug> --issue 123 --relay                     # a GitHub issue as the request
npm run agent -- --project <slug> --file ../../workspace/briefs/<brief>.md --relay --approve   # pause for plan approval
```
Steps: clone → container → PRD + plan → (approval) → one session per milestone, committing only when the verify
commands pass → review → fix milestone → final checks → push branch and draft PR. Follow along with
`npm run agent -- show <run-id>`, or read `workspace/dev/runs/<project>/<run-id>/run.json` and `events.jsonl`.

Other commands:
- `list`;
- `resume <run-id> [--budget 50]`: after a stop, error or budget limit;
- `revise <run-id> "also …"`: a new milestone on the same branch, and the PR is updated;
- `publish <run-id>`;
- `approve <run-id>` / `reject <run-id>`: for a paused run;
- `clean <run-id>`.

Options:
- `--approve` / `--no-approve`;
- `--no-pr`;
- `--budget`;
- `--model opus|sonnet`;
- `--keep-workspace`;
- `--runtime local` (no Docker; only for trusted repos);
- `--product <dir|none>` (see "The product folder" above).

## 3. Relaying questions and approvals (always use `--relay`)
dev-agent prints `DEVAGENT_PENDING {"id":"3f9c2a1b","kind":"questions",…}` and waits. Then:

```bash
node scripts/agents.mjs pending          # JSON: [{ id, kind, scope, context, questions[] | prd, plan, secretsFile, howToAnswer }]
```

**Questions.** Each question has an `id`, the `question` text, and optionally `header`, `options[{label,
description}]`, `multiSelect`, `default` and `secretEnv`.
- Ask the user, ideally with AskUserQuestion: keep the options and mark the default as recommended.
- Up to 4 questions arrive per item.
- Answer with option labels or free text:
  ```bash
  node scripts/agents.mjs answer 3f9c2a1b --json '{"pr_mode": "Draft PR", "skills": ["laravel-boost", "superpowers"], "notes": "Use Pest, not PHPUnit"}'
  ```
- `""` skips a question.

**Secret questions (`secretEnv`)** must never pass through answers or chat.
- Ask the user to add `NAME=value` to the `secretsFile` from the item.
- If they paste the secret into the chat anyway, append it there with a shell command and don't repeat it.
- Then answer `"__in_secrets_file__"`. The helper refuses anything else.

**Approvals (`kind: "approval"`).** Read the `prd` and `plan` files and give the user a short summary: goals, the
milestones, and the assumptions that matter. Then:
```bash
node scripts/agents.mjs answer 7d01e9aa --decision approve
node scripts/agents.mjs answer 7d01e9aa --decision revise --feedback "Use a queued job for exports over 10k rows"
node scripts/agents.mjs answer 7d01e9aa --decision cancel
```

**Timeouts.**
- A question left unanswered for 4 hours (`DEVAGENT_ASK_TIMEOUT_MIN`) makes the agent assume.
- An unanswered approval pauses the run; `approve <run-id>` continues it later.

## Report
- The branch and PR link (from `run.json` → `publish`).
- The milestones with their commits.
- Failing checks (the PR stays a draft).
- Known issues and the review's remaining notes.
- The spend.

The PR body already has the full write-up; link it rather than repeating it.

## Pitfalls
- One run per repo at a time.
- Never merge the PR yourself.
- `RUNTIME=local` has no isolation. Use it only if the user explicitly wants it and trusts the repo.
- Don't set `DEVAGENT_HOME` unless the user asks. The orchestrator helper expects runs in `agents/dev-agent/runs`.
