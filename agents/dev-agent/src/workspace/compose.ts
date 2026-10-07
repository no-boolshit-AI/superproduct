/** Compose file for one workspace: the dev container plus optional database/cache services. */
import type { Service } from "../profile.js";

export const SERVICE_DEFS: Record<Service, Record<string, unknown>> = {
  mysql: {
    image: "mysql:8.4",
    environment: { MYSQL_DATABASE: "app", MYSQL_USER: "app", MYSQL_PASSWORD: "secret", MYSQL_ROOT_PASSWORD: "secret" },
    tmpfs: ["/var/lib/mysql"],
    healthcheck: { test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-uroot", "-psecret"], interval: "3s", timeout: "5s", retries: 60 },
  },
  mariadb: {
    image: "mariadb:11",
    environment: { MARIADB_DATABASE: "app", MARIADB_USER: "app", MARIADB_PASSWORD: "secret", MARIADB_ROOT_PASSWORD: "secret" },
    tmpfs: ["/var/lib/mysql"],
    healthcheck: { test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"], interval: "3s", timeout: "5s", retries: 60 },
  },
  postgres: {
    image: "postgres:17",
    environment: { POSTGRES_DB: "app", POSTGRES_USER: "app", POSTGRES_PASSWORD: "secret" },
    tmpfs: ["/var/lib/postgresql/data"],
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U app -d app"], interval: "3s", timeout: "5s", retries: 60 },
  },
  redis: {
    image: "redis:7-alpine",
    healthcheck: { test: ["CMD", "redis-cli", "ping"], interval: "3s", timeout: "5s", retries: 40 },
  },
};

/** Connection variables injected into the workspace for each service (Laravel, Django, Prisma… conventions). */
export const SERVICE_ENV: Record<Service, Record<string, string>> = {
  mysql: { DB_HOST: "mysql", DB_PORT: "3306", DB_DATABASE: "app", DB_USERNAME: "app", DB_PASSWORD: "secret", DATABASE_URL: "mysql://app:secret@mysql:3306/app" },
  mariadb: {
    DB_HOST: "mariadb",
    DB_PORT: "3306",
    DB_DATABASE: "app",
    DB_USERNAME: "app",
    DB_PASSWORD: "secret",
    DATABASE_URL: "mysql://app:secret@mariadb:3306/app",
  },
  postgres: {
    DB_HOST: "postgres",
    DB_PORT: "5432",
    DB_DATABASE: "app",
    DB_USERNAME: "app",
    DB_PASSWORD: "secret",
    DATABASE_URL: "postgresql://app:secret@postgres:5432/app",
  },
  redis: { REDIS_HOST: "redis", REDIS_PORT: "6379", REDIS_URL: "redis://redis:6379" },
};

export const CONTAINER = { repo: "/workspace/repo", home: "/workspace/.home", cache: "/workspace/.cache", plugin: "/opt/devagent/plugin" } as const;

export interface ComposeInput {
  name: string;
  containerName: string;
  image: string;
  repoDir: string;
  /** Host git dir, mounted read-only at the same absolute path (the checkout's .git file points there). */
  gitDir?: string;
  homeDir: string;
  cacheDir: string;
  pluginDir: string;
  services: Service[];
  env: Record<string, string>;
  /** Secret values (from projects/<slug>/secrets.env). */
  secrets?: Record<string, string>;
  user?: string;
  override?: unknown;
}

const bind = (source: string, target: string, readOnly = false) => ({ type: "bind", source, target, ...(readOnly ? { read_only: true } : {}) });

export function renderCompose(c: ComposeInput): Record<string, unknown> {
  const env: Record<string, string> = {
    HOME: CONTAINER.home,
    USER: "dev",
    LOGNAME: "dev",
    CI: "true",
    COMPOSER_CACHE_DIR: `${CONTAINER.cache}/composer`,
    npm_config_cache: `${CONTAINER.cache}/npm`,
    YARN_CACHE_FOLDER: `${CONTAINER.cache}/yarn`,
    PNPM_HOME: `${CONTAINER.cache}/pnpm-home`,
    npm_config_store_dir: `${CONTAINER.cache}/pnpm-store`,
    UV_CACHE_DIR: `${CONTAINER.cache}/uv`,
    PIP_CACHE_DIR: `${CONTAINER.cache}/pip`,
    PLAYWRIGHT_BROWSERS_PATH: `${CONTAINER.cache}/ms-playwright`,
    COREPACK_HOME: `${CONTAINER.cache}/corepack`,
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    // git hooks can't be installed (the git dir is read-only here) and aren't needed
    HUSKY: "0",
    // the repo is owned by the host user; let git inside the container work with it
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "safe.directory",
    GIT_CONFIG_VALUE_0: "*",
  };
  for (const s of c.services) Object.assign(env, SERVICE_ENV[s]);
  Object.assign(env, c.env, c.secrets ?? {});
  // compose interpolates $VAR in values; keep them literal
  for (const k of Object.keys(env)) env[k] = env[k].replace(/\$/g, "$$$$");

  const workspace: Record<string, unknown> = {
    image: c.image,
    container_name: c.containerName,
    command: ["sleep", "infinity"],
    init: true,
    working_dir: CONTAINER.repo,
    environment: env,
    volumes: [
      bind(c.repoDir, CONTAINER.repo),
      ...(c.gitDir ? [bind(c.gitDir, c.gitDir, true)] : []),
      bind(c.homeDir, CONTAINER.home),
      bind(c.cacheDir, CONTAINER.cache),
      bind(c.pluginDir, CONTAINER.plugin, true),
    ],
    extra_hosts: ["host.docker.internal:host-gateway"],
    labels: { "dev-agent.workspace": c.name },
  };
  if (c.user) workspace.user = c.user;
  if (c.services.length) workspace.depends_on = Object.fromEntries(c.services.map((s) => [s, { condition: "service_healthy" }]));

  const doc: Record<string, unknown> = {
    name: c.name,
    services: { workspace, ...Object.fromEntries(c.services.map((s) => [s, SERVICE_DEFS[s]])) },
  };
  return c.override ? (deepMerge(doc, c.override) as Record<string, unknown>) : doc;
}

/** Objects merge recursively, arrays and scalars replace, `"key+": [...]` appends to a list, null deletes the key. */
export function deepMerge(a: unknown, b: unknown): unknown {
  if (b === undefined) return a;
  if (b === null) return undefined;
  if (typeof a !== "object" || a === null || Array.isArray(a) || typeof b !== "object" || Array.isArray(b)) return b;
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
    if (k.endsWith("+") && Array.isArray(v)) {
      const key = k.slice(0, -1);
      out[key] = [...(Array.isArray(out[key]) ? (out[key] as unknown[]) : []), ...v];
      continue;
    }
    const merged = deepMerge(out[k], v);
    if (merged === undefined) delete out[k];
    else out[k] = merged;
  }
  return out;
}
