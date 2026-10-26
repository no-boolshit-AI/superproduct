# dev-agent

A Claude Agent SDK agent that works as a developer on an existing GitHub project. You give it a feature request; it
writes a **PRD**, a **plan with milestones**, implements and tests each milestone, gets an automated review, and
**pushes a new branch** (plus a draft pull request if you want one).

The first time it meets a repository it runs a **setup interview**:

1. It reads the code and detects the stack.
2. It asks you how your team works.
3. It installs the stack's AI dev skills, e.g. **Laravel Boost** for Laravel apps.
4. It checks that a fresh workspace boots and the tests pass.

Every run then gets **its own folder and its own Docker container** (plus MySQL/Postgres/Redis if the app needs them).

```
                 once per repository                                   every feature request
┌──────────────────────────────────────────────┐   ┌───────────────────────────────────────────────────────────────┐
│ setup: detect stack → interview → skills →   │   │ runs/<project>/<run-id>/                                       │
│ workspace test (bootstrap + tooling + tests) │──▶│ clone → container → PRD + plan → [approve] → M1 … Mn → review  │
│ → projects/<slug>/project.json + PROJECT.md  │   │ → verify → push branch / draft PR        (resume at any step) │
└──────────────────────────────────────────────┘   └───────────────────────────────────────────────────────────────┘
```

`projects/` and `runs/` live in the workspace's `dev/` folder (`../../workspace/dev`, see
[`lib/workspace.mjs`](../../lib/workspace.mjs); `DEVAGENT_HOME` to change it), with your other work, never in the kit.

## Quick start

```bash
npm install
cp .env.example .env          # Claude auth + GitHub token (see below)
npm run doctor                # checks Node, git, Docker, credentials

npm run agent -- setup acme/shop                          # first run: the interview (about 5 to 15 minutes)
npm run agent -- "Let customers export invoices as CSV"   # a feature run
npm run web                                               # or do all of it in the browser: http://localhost:4949
```

### Requirements

- **Node 20.12+, git.**
- **Docker Desktop** (macOS) or Docker Engine + compose (Linux). Each project's workspace image is built on its first
  run; that takes a few minutes, and later runs start in seconds.
- **Claude auth.** Use one of:
  - `ANTHROPIC_API_KEY` (pay-as-you-go);
  - `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, which uses your subscription. Containers can't use your computer's
    keychain login, so the token is needed here.
- **GitHub access.** A fine-grained token in `GITHUB_TOKEN` with Contents read/write, Pull requests read/write and
  Metadata read, limited to the repos the agent works on. Without it, dev-agent falls back to `gh auth token`, or to
  your SSH keys for `git@github.com:` URLs (pull requests then need `gh`).

## First run: project setup

`npm run agent -- setup <repo>` (or "Set up project" in the web UI). The setup agent:

1. **Clones and detects the stack.** It reads the manifests, versions, package manager, test and lint tools, CI
   commands, `.env.example`, database/cache usage, existing AI files and git conventions (branch prefixes,
   conventional commits).
2. **Interviews you**, with detected values preselected and at most 3 short rounds:
   - base branch, branch prefix, commit style;
   - pull request mode (draft / ready / push only), reviewers, labels;
   - which dev skills to install, and the tooling policy (below);
   - database and services, verify commands, and secrets. A secret goes straight into
     `projects/<slug>/secrets.env`; the model only ever sees "(stored)";
   - autonomy: plan approval, clarifying questions, review rounds, budget, model, and your team's conventions.
3. **Installs agent skills** into a per-project Claude Code plugin (`projects/<slug>/plugin`). They're never written
   into your repo.
4. **Makes the workspace work.** It builds the image, starts a fresh workspace, runs bootstrap, tooling and the verify
   commands, reads the failures and fixes the config until everything passes on the untouched base branch.
5. **Saves** `project.json` (the profile) and `PROJECT.md`, a short architecture and conventions brief that every
   run receives.

Running `setup` again on a configured project reconfigures it.

### The product folder

A repository can belong to a product described in a product folder ([`templates/product/README.md`](../../templates/product/README.md)):
what the product is, its glossary, architecture notes, voice and design tokens. When it does, every plan, implement
and review session gets that context next to `PROJECT.md` (profiles `development` and `design` from
`product.json → agents.dev.profiles`, plus the brand's CSS variables), and the run folder keeps a copy in
`product-context.md`. The repository's own conventions still win on how things are built.

dev-agent works on many repositories, so it only uses a product folder that is meant for the repository:

1. `--product <dir|id|none>` on a run (an id names a product in the workspace's `products/`);
2. `"product"` in the project profile (`setup … --product <dir>` saves it);
3. `$PRODUCT_DIR` or the workspace's `product/`, if its `product.json → repos` lists the repository
   (`owner/name` or its URL).

`show <run-id>` and `run.json` say which product a run used and why (`flag`, `profile`, `env` or `nearest`).

### Dev skills catalog

| Stack | Entry | What it adds |
|---|---|---|
| Laravel | `laravel-boost` | Official Boost: version-matched guidelines (CLAUDE.md/AGENTS.md), Laravel skills (Pest, Livewire, Inertia, Tailwind, Flux…), MCP server (DB schema & queries, logs, last error, docs search). Installed with `composer require laravel/boost --dev` + `boost:install -n` (boost.json pre-seeded with `claude_code`). |
| Next.js | `next-agents-md` | Version-matched Next.js docs index in AGENTS.md (`@next/codemod agents-md`) |
| Next.js | `next-devtools-mcp` | Next.js DevTools MCP (docs; routes/errors/logs from `next dev`, Next 16+) |
| Next.js | `next-dev-loop` | Official skill for verifying changes in a running dev server (optional) |
| React | `vercel-react-skills` | react-best-practices, composition-patterns, web-design-guidelines |
| shadcn/ui | `shadcn` | shadcn skill + `shadcn mcp` |
| Prisma | `prisma` | prisma-cli / prisma-client-api skills + local `prisma mcp` |
| Python | `astral` | uv, ruff, ty skills |
| FastAPI | `fastapi` | The skill that ships inside FastAPI |
| Django | `django-ai-boost` | Community "Boost for Django" MCP (models, URLs, schema, migrations, checks, logs); venv-only install |
| front-end | `frontend-design`, `webapp-testing`, `playwright-mcp` | Anthropic skills; headless browser MCP (optional) |
| all | `superpowers` | test-driven-development, systematic-debugging, verification-before-completion |
| all | `context7` | Version-specific library docs MCP (`CONTEXT7_API_KEY` optional) |

The setup agent can also install any other skill you name (a GitHub repo + the folders that hold `SKILL.md`), and add
custom tooling commands or MCP servers.

### Tooling policy: `local` or `commit`

Some tooling has to live in the repo, such as Boost's guidelines, `.mcp.json` and `.claude/skills`. Every run installs
it into its own fresh clone, then:

- **local** (default): nothing about it is committed. Manifest changes (composer.json/lock, package.json…) are
  restored, and the installed packages stay in vendor/node_modules, so Boost's MCP keeps working. Other changed files
  are marked skip-worktree, and new files go to `.git/info/exclude`.
- **commit**: the tooling is committed as one `chore(dev): add AI dev tooling (…)` commit at the start of the branch,
  so your team gets it once the first PR is merged.

## A feature run

```bash
npm run agent -- "Let customers export invoices as CSV"          # one project configured: uses it
npm run agent -- --project shop --file feature.md
npm run agent -- --project shop --issue 123                      # a GitHub issue (+ comments) as the request
npm run agent -- --repo acme/shop "…"                            # runs setup first if the repo is new
```

| Step | What happens |
|---|---|
| clone | `projects/<slug>/mirror.git` is fetched, then cloned (hard links, fast) into `runs/<slug>/<run-id>/repo` on a new branch `<prefix><slug>` |
| workspace | `docker compose up` for this run: dev container (+ services), bootstrap commands, repo tooling, tooling policy. Bootstrap artifacts (.env, sqlite files, lockfile drift) are kept out of git |
| plan | Read-only session: explores the code, then `save_prd` (PRD.md) and `save_plan` (1 to 6 vertical-slice milestones, PLAN.md). The branch is renamed to the plan's slug |
| approval | Only if enabled: approve, send feedback (the PRD/plan are revised) or stop. Unattended runs pause here (`approve <run-id>`) |
| implement | One fresh session per milestone with the PRD, plan, git log and NOTES.md. The agent codes and tests, then calls `complete_milestone`; dev-agent runs the verify commands and commits only if they pass (failures go back to the agent) |
| review | A read-only reviewer checks the full diff against the PRD; blocker/major findings become a fix milestone |
| verify | All verify commands on the final branch |
| publish | `git push` from the host, plus a draft/ready PR (summary, milestones with commits, checks table, review notes, assumptions, collapsed PRD). Failing checks force a draft |

Each run folder holds:

- `run.json` (state) and `events.jsonl`;
- `PRD.md`, `PLAN.md` and `NOTES.md`;
- `logs/`: bootstrap, tooling, every verify attempt, Claude stderr;
- `compose.json`;
- `repo/` (the checkout) and `git/` (its git database, kept outside the working tree);
- `home/`: the container's HOME, with the session transcripts.

```bash
npm run agent -- list                          # runs and status
npm run agent -- show <run-id>
npm run agent -- resume <run-id> --budget 50   # continue after a stop, an error or a budget limit
npm run agent -- approve <run-id> [--feedback "Use a queued job for large exports"] | reject <run-id>
npm run agent -- revise <run-id> "Also add the VAT column"     # new milestone on the same branch, PR updated
npm run agent -- publish <run-id>              # push / PR again
npm run agent -- clean <run-id> | --finished   # drop repo/, git/ and home/, keep the record and documents
```

Options: `--approve` / `--no-approve`, `--no-pr`, `--budget <usd>`, `--model opus|sonnet|<id>`, `--runtime docker|local`,
`--keep-workspace`, `--unattended`, `--relay` (see below), `--product <dir|id|none>` (see "The product folder").

## Relay mode (driven by another agent)

When an orchestrating agent (e.g. the main Claude in the parent folder) runs dev-agent in the background, there is no
terminal for the interview or the plan approval. `--relay` turns them into files:

```bash
npm run agent -- setup acme/shop --relay &           # prints DEVAGENT_PENDING {"id":…,"kind":"questions",…}
npm run agent -- pending                             # open items as JSON (questions with options/defaults, or PRD/plan paths)
npm run agent -- answer 3f9c2a1b --json '{"pr_mode": "Draft PR", "skills": ["laravel-boost", "superpowers"]}'
npm run agent -- "Add CSV export" --relay --approve &
npm run agent -- answer 7d01e9aa --decision approve   # or: --decision revise --feedback "…" | --decision cancel
```

- Files live in `ask/` in the agent's home, the workspace's `dev/` (`--ask-dir` or `DEVAGENT_ASK_DIR` to change): `<id>.pending.json`, then `<id>.answer.json`.
  `history.jsonl` keeps a log with secrets redacted.
- **Secrets never go through answers.** For a question with `secretEnv`, the user adds `NAME=value` to the project's
  `secrets.env` (the pending item names the file), and the answer is `"__in_secrets_file__"`. `answer` refuses
  anything else.
- An unanswered question times out after `DEVAGENT_ASK_TIMEOUT_MIN` (240); the agent then proceeds on assumptions. An
  unanswered approval pauses the run, and `approve <run-id>` continues it later.

## Web UI

`npm run web` serves http://localhost:4949 (bound to 127.0.0.1; same-origin JSON POSTs only). In it you can:

- set up projects, with the interview's questions shown as forms and secrets as password fields;
- start runs and watch them live;
- answer questions and approve plans;
- read the PRD, plan, notes and the original request;
- resume, revise or push again.

## How the workspace works

- **One image per project**, built from `docker/php.Dockerfile`, `node.Dockerfile` or `python.Dockerfile`. Build args
  come from the profile: PHP/Node/Python versions, PHP extensions, apt packages and Playwright deps. The image tag is
  a hash of the Dockerfile and its args, so a changed config rebuilds automatically. Build logs go to
  `projects/<slug>/image/`.
- **Claude Code runs inside the container.** The SDK's `spawnClaudeCodeProcess` starts it with `docker exec -i`, so
  Bash, file edits, `.claude/skills`, CLAUDE.md and project MCP servers (Boost's `php artisan boost:mcp`) all run
  there. dev-agent's own tools (`complete_milestone`, `save_plan`…) and the guard hooks run on the host and travel
  over the CLI's stdio. The container gets the Claude Code binary that matches the SDK version (`install-claude.sh`).
- **Services** are mysql 8.4, mariadb 11, postgres 17 and redis 7 (tmpfs, health-checked). Connection variables
  (`DB_HOST`, `DATABASE_URL`, `REDIS_HOST`…) are injected into the workspace.
- **Caches** for composer, npm, pnpm, uv, pip and Playwright are shared per project in `cache/<slug>`.
- **Customisation:**
  - `projects/<slug>/compose.override.json` is deep-merged into every compose file (`"key+": [...]` appends to a
    list, `null` removes a key).
  - `workspace.customImage` uses your own image instead; it must contain `/usr/local/bin/claude`.
- **`RUNTIME=local`** runs everything on your machine in the run folder: no isolation and no services. It's meant for
  trusted repos and the tests.

## Safety model

- **GitHub credentials never enter the container.** Clone, fetch and push run on the host, with the token passed as a
  one-off HTTP header; nothing is written to git config. Pushes go to the profile's URL, never to whatever `origin`
  says.
- **The git database is read-only inside the container.**
  - Each checkout keeps it outside the working tree (`clone --separate-git-dir`), mounted read-only, so
    `git status/diff/log` work but nothing in the container can commit, rewrite history, switch branches or plant git
    config.
  - Host git commands name that database explicitly. They run with hooks, fsmonitor and signing disabled, and with
    an environment that holds no API keys.
  - After every session dev-agent checks that HEAD is still the branch tip it committed.
- **A PreToolUse guard limits the agent:**
  - It can write only inside the repo and never touches `.git/`.
  - It can't commit, push, rebase, merge, switch branches or change remotes/config; the harness does those. With
    `RUNTIME=local` this guard and the HEAD check are the only protection.
  - It has no GitHub CLI.
  - When Claude Code runs on your machine (setup, `RUNTIME=local`), it compares paths with symlinks resolved, as
    Claude Code reports them, so a `DEVAGENT_HOME` behind a symlink works and a link out of the repo or to `.git/`
    doesn't.
  - The setup agent runs on the host with read-only tools and no shell; everything it executes goes through the
    workspace.
- **The planning and review sessions** have no file-editing tools. Anything they change through the shell is stashed
  afterwards.
- **Spend:**
  - Each run has a USD budget (`MAX_BUDGET_USD`, per project or `--budget`), enforced per session.
  - A run that hits it stops cleanly and can be resumed with a higher budget.
- **Secrets** are only available as environment variables inside the workspace. The agent never sees them in
  prompts, but code it runs there can read them, so use test/sandbox credentials.

## Configuration (.env)

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` | | Claude auth (Bedrock/Vertex variables are passed through too) |
| `GITHUB_TOKEN` | `gh auth token` | Clone/push private repos, pull requests, issues |
| `AGENT_MODEL` | `opus` | Default model (per project / `--model`) |
| `MAX_BUDGET_USD` / `SETUP_BUDGET_USD` | 30 / 8 | Spend caps per run / per setup |
| `RUNTIME` | `docker` | `docker` or `local` |
| `APPROVE_PLAN` | 0 | Default for new projects (the interview asks) |
| `COMMAND_TIMEOUT_MIN` | 20 | Per bootstrap/verify command |
| `PORT` | 4949 | Web UI |
| `DEVAGENT_HOME` | the workspace's `dev/` | Where `projects/`, `runs/`, `cache/` and `ask/` live |
| `DEVAGENT_AUTHOR_NAME` / `_EMAIL` | dev-agent | Commit author default |
| `CONTEXT7_API_KEY` | | Optional, for the Context7 MCP |
| `PRODUCT_DIR` | the workspace's `product/` | Product folder; used only for repositories its `product.json → repos` lists. `none` turns it off |

## Tests

```bash
npm test                         # unit + product folder + end-to-end + web + relay, offline, no Claude spend
DEVAGENT_TEST_DOCKER=1 npm test  # also the end-to-end test in a real Docker workspace (builds the node image)
npm run typecheck
```

The end-to-end tests drive the **real** stack with a scripted mock of the Claude API: the Agent SDK, the Claude Code
CLI, our MCP tools, hooks, git and the workspace. They cover:

- setup: interview, secret storage, skill install, workspace test, profile;
- a run: PRD and plan, a milestone whose first verify fails and gets fixed, the guard blocking `git push`, writes
  outside the repo and branch switches, review → fix milestone, final checks, and a push to a bare "remote" with
  exactly the feature commits (tooling and bootstrap artifacts stay out);
- a revision on the same branch;
- an approval pause;
- the browser flow over HTTP;
- relay mode through the real CLI (`pending` / `answer`), including the refusal of secret values.

The docker variant also passes with Claude Code running inside the container.

## Troubleshooting

- **Image build fails.** See `projects/<slug>/image/build-*.log`. Add apt packages or PHP extensions with
  `npm run agent -- setup --project <slug>` (reconfigure).
- **"Docker isn't available".** Start Docker Desktop, or `RUNTIME=local`.
- **Push rejected.** Check that the token has Contents write access to the repo. `npm run agent -- publish <run-id>`
  retries.
- **Boost writes nothing.** Boost needs `boost.json` → `agents: ["claude_code"]`; the recipe seeds it. Check
  `runs/…/logs/tooling.log`.
- **A run stopped.** Use `npm run agent -- show <run-id>` for the reason, then `resume`.
