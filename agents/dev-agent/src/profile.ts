/** Per-project profile: everything collected during the first-run setup (projects/<slug>/project.json). */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PROJECTS_DIR, projectPaths } from "./paths.js";

export const STACKS = ["laravel", "php", "nextjs", "node", "django", "fastapi", "python", "other"] as const;
export type Stack = (typeof STACKS)[number];
export const SERVICES = ["mysql", "mariadb", "postgres", "redis"] as const;
export type Service = (typeof SERVICES)[number];
export const BASES = ["php", "node", "python"] as const;

export const McpServerSchema = z.union([
  z.object({
    type: z.literal("stdio").optional(),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).optional(),
  }),
  z.object({ type: z.literal("http"), url: z.string().url(), headers: z.record(z.string(), z.string()).optional() }),
]);
export type McpServer = z.infer<typeof McpServerSchema>;

export const VerifyStepSchema = z.object({
  name: z.string().min(1).max(40).describe("Short label, e.g. tests, lint, types, build"),
  command: z.string().min(1).describe("Shell command run from the repo root inside the workspace"),
});
export type VerifyStep = z.infer<typeof VerifyStepSchema>;

/** The part of the profile the setup agent can try out with test_workspace before saving. */
export const WorkspaceSchema = z.object({
  base: z.enum(BASES).describe("Workspace image family"),
  versions: z
    .object({
      php: z.string().regex(/^\d+\.\d+$/).optional(),
      node: z.string().regex(/^\d+$/).default("22"),
      python: z.string().regex(/^\d+\.\d+$/).optional(),
    })
    .default({ node: "22" }),
  aptPackages: z.array(z.string().regex(/^[a-z0-9][a-z0-9.+-]*$/)).default([]),
  phpExtensions: z.array(z.string().regex(/^[a-z0-9_]+(-[0-9.]+)?$/)).default([]),
  playwright: z.boolean().default(false).describe("Install Chromium system libraries for browser tests"),
  customImage: z.string().optional().describe("Use this prebuilt image instead of building one (must contain /usr/local/bin/claude)"),
  services: z.array(z.enum(SERVICES)).default([]),
  env: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string()).default({}),
  bootstrap: z.array(z.string().min(1)).default([]).describe("Commands run in order from the repo root on every fresh workspace"),
});
export type WorkspaceConfig = z.infer<typeof WorkspaceSchema>;

export const ProfileSchema = z.object({
  version: z.literal(1),
  slug: z.string(),
  name: z.string(),
  repo: z.object({
    url: z.string(),
    owner: z.string(),
    name: z.string(),
    github: z.boolean(),
    defaultBranch: z.string(),
  }),
  stack: z.object({
    primary: z.enum(STACKS),
    frameworks: z.array(z.string()).default([]),
    summary: z.string().default(""),
  }),
  git: z.object({
    baseBranch: z.string(),
    branchPrefix: z.string().default("feature/"),
    commitStyle: z.enum(["conventional", "plain"]).default("conventional"),
    authorName: z.string().default("dev-agent"),
    authorEmail: z.string().default("dev-agent@users.noreply.github.com"),
  }),
  publish: z.object({
    pullRequest: z.enum(["draft", "ready", "none"]).default("draft"),
    reviewers: z.array(z.string()).default([]),
    labels: z.array(z.string()).default([]),
  }),
  autonomy: z.object({
    approvePlan: z.boolean().default(false),
    clarifyingQuestions: z.boolean().default(false),
    reviewRounds: z.number().int().min(0).max(3).default(1),
  }),
  docs: z.object({
    commitToRepo: z.boolean().default(false),
    dir: z.string().default("docs/features"),
  }),
  tooling: z.object({
    policy: z.enum(["commit", "local"]).default("local"),
    recipes: z.array(z.string()).default([]),
    extraCommands: z.array(z.string()).default([]),
    skills: z.array(z.string()).default([]),
  }),
  workspace: WorkspaceSchema,
  mcpServers: z.record(z.string().regex(/^[a-z0-9_-]+$/i), McpServerSchema).default({}),
  verify: z.array(VerifyStepSchema).default([]),
  limits: z.object({ model: z.string().optional(), maxBudgetUsd: z.number().positive().optional() }).default({}),
  notes: z.string().default(""),
  /** Product folder this repository belongs to (a path, relative to dev-agent, or "none"). Default: the product folder that lists this repo. */
  product: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export async function loadProfile(slug: string): Promise<Profile | null> {
  const p = projectPaths(slug).profile;
  if (!existsSync(p)) return null;
  return ProfileSchema.parse(JSON.parse(await readFile(p, "utf8")));
}

export async function saveProfile(profile: Profile): Promise<void> {
  const p = projectPaths(profile.slug);
  await mkdir(p.dir, { recursive: true });
  profile.updatedAt = new Date().toISOString();
  await writeFile(p.profile, JSON.stringify(ProfileSchema.parse(profile), null, 2) + "\n");
}

export async function listProjects(): Promise<Profile[]> {
  if (!existsSync(PROJECTS_DIR)) return [];
  const out: Profile[] = [];
  for (const d of await readdir(PROJECTS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    try {
      const p = await loadProfile(d.name);
      if (p) out.push(p);
    } catch {
      /* broken profile: ignore in listings */
    }
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readKnowledge(slug: string): Promise<string> {
  try {
    return await readFile(projectPaths(slug).knowledge, "utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------- secrets (never shown to the model)

export async function readSecrets(slug: string): Promise<Record<string, string>> {
  const file = projectPaths(slug).secrets;
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export async function writeSecret(slug: string, key: string, value: string): Promise<void> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid variable name: ${key}`);
  if (/[\r\n]/.test(value)) throw new Error("Secret values must be a single line.");
  const p = projectPaths(slug);
  await mkdir(p.dir, { recursive: true });
  const all = { ...(await readSecrets(slug)), [key]: value };
  await writeFile(p.secrets, Object.entries(all).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
  await chmod(p.secrets, 0o600).catch(() => {});
}

export function secretsFile(slug: string): string | undefined {
  const f = projectPaths(slug).secrets;
  return existsSync(f) ? f : undefined;
}

export function modelFor(profile: Profile | null, override?: string): string {
  return override || profile?.limits.model || process.env.AGENT_MODEL || "opus";
}

export function budgetFor(profile: Profile | null, override?: number): number {
  return override ?? profile?.limits.maxBudgetUsd ?? Number(process.env.MAX_BUDGET_USD || 30);
}

export const pathInside = (p: string, root: string) => {
  const rel = path.relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};
