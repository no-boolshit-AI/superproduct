/**
 * Curated "dev skills" per stack. An entry can have up to three parts:
 * - commands: run inside the workspace after bootstrap, on every run (tooling that lives in the repo, e.g. Laravel Boost);
 * - skills:   SKILL.md folders copied once from GitHub into the project's plugin (never touch the repo);
 * - mcp:      MCP servers given to every agent session (started inside the workspace).
 * The setup agent can also install skills that aren't listed here (any GitHub repo + path).
 */
import type { Facts } from "./detect.js";
import type { McpServer, Stack } from "./profile.js";

export interface SkillSource {
  /** owner/name on GitHub, or any git URL / local path. */
  repo: string;
  ref?: string;
  /** Folders inside the repo that contain a SKILL.md. */
  paths: string[];
}

export interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  stacks: Stack[] | "all";
  applies(f: Facts): boolean;
  recommended(f: Facts): boolean;
  commands?(f: Facts): string[];
  skills?: SkillSource[];
  mcp?(f: Facts): Record<string, McpServer>;
  /** Extra requirement shown to the user/agent. */
  note?: string;
  /** Workspace changes this entry needs. */
  needsPlaywright?: boolean;
}

const fw = (f: Facts, name: string) => f.frameworks.includes(name);
const isFrontend = (f: Facts) => ["react", "vue", "svelte", "nextjs", "nuxt", "livewire", "inertia", "tailwind"].some((x) => fw(f, x));

/** Ensures boost.json lists Claude Code (Boost can't auto-detect the SDK's bundled binary). */
const BOOST_AGENTS =
  `php -r '$f="boost.json";$j=is_file($f)?(json_decode(file_get_contents($f),true)?:[]):[];` +
  `$j["agents"]=array_values(array_unique(array_merge($j["agents"]??[],["claude_code"])));` +
  `file_put_contents($f,json_encode($j,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)."\\n");'`;

export const CATALOG: CatalogEntry[] = [
  {
    id: "laravel-boost",
    title: "Laravel Boost",
    description:
      "Official Laravel AI tooling: version-matched guidelines (CLAUDE.md/AGENTS.md), Laravel skills (Pest, Livewire, Inertia, Tailwind, Flux…) and an MCP server (DB schema & queries, logs, last error, docs search).",
    stacks: ["laravel"],
    applies: (f) => fw(f, "laravel") && (f.versions.laravel ?? 0) >= 11,
    recommended: () => true,
    commands: (f) => [
      fw(f, "laravel-boost") ? "true" : "composer show laravel/boost >/dev/null 2>&1 || composer require laravel/boost --dev --no-interaction --no-progress",
      BOOST_AGENTS,
      "php artisan boost:install --no-interaction",
    ],
    note: "With the 'local' tooling policy Boost is installed into vendor/ only; composer.json/lock stay untouched.",
  },
  {
    id: "next-agents-md",
    title: "Next.js docs index (AGENTS.md)",
    description: "Adds a version-matched Next.js documentation index to AGENTS.md (bundled docs on Next 16.2+, downloaded otherwise).",
    stacks: ["nextjs"],
    applies: (f) => fw(f, "nextjs"),
    recommended: () => true,
    commands: () => ["npx -y @next/codemod@latest agents-md --output AGENTS.md"],
  },
  {
    id: "next-devtools-mcp",
    title: "Next.js DevTools MCP",
    description: "Next.js's official MCP server: docs lookup, and routes/errors/logs from a running `next dev` (Next 16+).",
    stacks: ["nextjs"],
    applies: (f) => fw(f, "nextjs"),
    recommended: (f) => (f.versions.next ?? 0) >= 16,
    mcp: () => ({ "next-devtools": { command: "npx", args: ["-y", "next-devtools-mcp@latest"], env: { NEXT_TELEMETRY_DISABLED: "1" } } }),
  },
  {
    id: "vercel-react-skills",
    title: "Vercel React skills",
    description: "react-best-practices, composition-patterns and web-design-guidelines from vercel-labs/agent-skills.",
    stacks: ["nextjs", "node", "laravel"],
    applies: (f) => fw(f, "react"),
    recommended: (f) => fw(f, "react"),
    skills: [{ repo: "vercel-labs/agent-skills", ref: "main", paths: ["skills/react-best-practices", "skills/composition-patterns", "skills/web-design-guidelines"] }],
  },
  {
    id: "next-dev-loop",
    title: "Next.js dev-loop skill",
    description: "Official skill for verifying changes in a running `next dev` via /_next/mcp and the agent-browser CLI.",
    stacks: ["nextjs"],
    applies: (f) => fw(f, "nextjs") && (f.versions.next ?? 0) >= 16,
    recommended: () => false,
    skills: [{ repo: "vercel/next.js", ref: "canary", paths: ["skills/next-dev-loop"] }],
    note: "Needs a running dev server and the agent-browser CLI in the workspace.",
  },
  {
    id: "shadcn",
    title: "shadcn/ui skill + MCP",
    description: "shadcn/ui component skill and the shadcn MCP server for browsing/adding registry components.",
    stacks: ["nextjs", "node", "laravel"],
    applies: (f) => fw(f, "shadcn"),
    recommended: (f) => fw(f, "shadcn"),
    skills: [{ repo: "shadcn/ui", ref: "main", paths: ["skills/shadcn"] }],
    mcp: () => ({ shadcn: { command: "npx", args: ["-y", "shadcn@latest", "mcp"] } }),
  },
  {
    id: "prisma",
    title: "Prisma skills + MCP",
    description: "Prisma CLI and Client API skills, plus the project's local `prisma mcp` server (migrate status/dev).",
    stacks: ["nextjs", "node"],
    applies: (f) => fw(f, "prisma"),
    recommended: (f) => fw(f, "prisma"),
    skills: [{ repo: "prisma/skills", ref: "main", paths: ["prisma-cli", "prisma-client-api"] }],
    mcp: () => ({ prisma: { command: "npx", args: ["prisma", "mcp"] } }),
  },
  {
    id: "playwright-mcp",
    title: "Playwright MCP (headless browser)",
    description: "Lets the agent open the running app in headless Chromium to check UI changes.",
    stacks: "all",
    applies: (f) => isFrontend(f),
    recommended: () => false,
    needsPlaywright: true,
    mcp: () => ({ playwright: { command: "npx", args: ["-y", "@playwright/mcp@latest", "--headless", "--isolated", "--no-sandbox"] } }),
    note: "Adds Chromium system libraries to the workspace image.",
  },
  {
    id: "frontend-design",
    title: "Frontend design skill (Anthropic)",
    description: "Anthropic's skill for distinctive, production-grade UI work.",
    stacks: "all",
    applies: (f) => isFrontend(f),
    recommended: (f) => isFrontend(f),
    skills: [{ repo: "anthropics/skills", ref: "main", paths: ["skills/frontend-design"] }],
  },
  {
    id: "webapp-testing",
    title: "Web app testing skill (Anthropic)",
    description: "Anthropic's Playwright-based skill for testing local web apps (needs Python + Playwright in the workspace).",
    stacks: "all",
    applies: (f) => isFrontend(f),
    recommended: () => false,
    needsPlaywright: true,
    skills: [{ repo: "anthropics/skills", ref: "main", paths: ["skills/webapp-testing"] }],
  },
  {
    id: "astral",
    title: "Astral skills (uv, ruff, ty)",
    description: "Astral's official skills for uv, ruff and ty.",
    stacks: ["python", "django", "fastapi"],
    applies: (f) => !!f.python,
    recommended: (f) => !!f.python,
    skills: [{ repo: "astral-sh/claude-code-plugins", ref: "main", paths: ["plugins/astral/skills/uv", "plugins/astral/skills/ruff", "plugins/astral/skills/ty"] }],
  },
  {
    id: "fastapi",
    title: "FastAPI skill (official)",
    description: "The skill that ships inside the FastAPI package.",
    stacks: ["fastapi"],
    applies: (f) => fw(f, "fastapi"),
    recommended: (f) => fw(f, "fastapi"),
    skills: [{ repo: "fastapi/fastapi", ref: "master", paths: ["fastapi/.agents/skills/fastapi"] }],
  },
  {
    id: "django-ai-boost",
    title: "Django AI Boost (MCP)",
    description: "Community 'Laravel Boost for Django': read-only MCP tools for models, URLs, schema, migrations, checks and logs.",
    stacks: ["django"],
    applies: (f) => fw(f, "django"),
    recommended: (f) => fw(f, "django") && Number((f.versions.python ?? "3.13").split(".")[1]) >= 12,
    // installed into the virtualenv only, never into the project's manifests
    commands: (f) => [f.python?.manager === "uv" ? "uv pip install -q django-ai-boost" : "pip install -q django-ai-boost"],
    mcp: (f) => {
      const settings = f.python?.djangoSettings ?? "config.settings";
      return { "django-ai-boost": { command: "django-ai-boost", args: ["--settings", settings], env: { DJANGO_SETTINGS_MODULE: settings } } };
    },
    note: "Needs Python 3.12+.",
  },
  {
    id: "superpowers",
    title: "Superpowers: TDD, debugging, verification",
    description: "obra/superpowers skills: test-driven-development, systematic-debugging, verification-before-completion.",
    stacks: "all",
    applies: () => true,
    recommended: () => true,
    skills: [{ repo: "obra/superpowers", ref: "main", paths: ["skills/test-driven-development", "skills/systematic-debugging", "skills/verification-before-completion"] }],
  },
  {
    id: "context7",
    title: "Context7 docs MCP",
    description: "Up-to-date, version-specific library docs on demand (remote MCP). Set CONTEXT7_API_KEY in .env for higher limits.",
    stacks: "all",
    applies: () => true,
    recommended: () => true,
    mcp: () => ({
      context7: {
        type: "http",
        url: "https://mcp.context7.com/mcp",
        // resolved at session start on the host; never stored in project.json
        ...(process.env.CONTEXT7_API_KEY
          ? { headers: { CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY, Authorization: `Bearer ${process.env.CONTEXT7_API_KEY}` } }
          : {}),
      },
    }),
  },
];

export function catalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === id);
}

/** Catalog entries relevant to this repo, recommended ones first. */
export function catalogFor(f: Facts): { entry: CatalogEntry; recommended: boolean }[] {
  return CATALOG.filter((e) => e.applies(f))
    .map((entry) => ({ entry, recommended: entry.recommended(f) }))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

/** Plain-text summary for prompts and tool results. */
export function describeCatalog(f: Facts): string {
  return catalogFor(f)
    .map(({ entry: e, recommended }) => {
      const parts = [e.commands ? "repo tooling" : "", e.skills ? "skills" : "", e.mcp ? "MCP" : ""].filter(Boolean).join(" + ");
      return `- ${e.id}${recommended ? " (recommended)" : ""}: ${e.title} [${parts}]. ${e.description}${e.note ? ` Note: ${e.note}` : ""}`;
    })
    .join("\n");
}

/** Resolves the per-run tooling commands for a profile (catalog commands + custom ones + the AGENTS.md bridge). */
export function toolingCommands(recipes: string[], extra: string[], f: Facts | null): string[] {
  const cmds: string[] = [];
  for (const id of recipes) {
    const e = catalogEntry(id);
    if (e?.commands) cmds.push(...e.commands(f ?? ({ frameworks: [], versions: {} } as unknown as Facts)));
  }
  cmds.push(...extra);
  if (cmds.length) cmds.push(AGENTS_MD_BRIDGE);
  return cmds;
}

/** Claude Code only reads AGENTS.md when there is no CLAUDE.md: make CLAUDE.md import it. */
export const AGENTS_MD_BRIDGE = `if [ -f AGENTS.md ]; then if [ ! -f CLAUDE.md ]; then printf '@AGENTS.md\\n' > CLAUDE.md; elif ! grep -q '@AGENTS.md' CLAUDE.md; then printf '\\n@AGENTS.md\\n' >> CLAUDE.md; fi; fi`;

/** MCP servers contributed by the chosen catalog entries. */
export function catalogMcp(recipes: string[], f: Facts | null): Record<string, McpServer> {
  const out: Record<string, McpServer> = {};
  for (const id of recipes) Object.assign(out, catalogEntry(id)?.mcp?.(f ?? ({ frameworks: [], versions: {} } as unknown as Facts)) ?? {});
  return out;
}
