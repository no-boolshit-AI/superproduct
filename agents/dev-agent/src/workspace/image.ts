/** Workspace images: one per project, built from docker/<base>.Dockerfile with build args from the profile. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DOCKER_DIR, projectPaths, sdkVersion } from "../paths.js";
import { exec } from "../proc.js";
import type { WorkspaceConfig } from "../profile.js";

const DEFAULT_PHP_EXTENSIONS = ["bcmath", "exif", "gd", "intl", "pcntl", "pdo_mysql", "pdo_pgsql", "redis", "zip"];

export function buildArgs(ws: WorkspaceConfig, sdk = sdkVersion()): Record<string, string> {
  const args: Record<string, string> = {
    CLAUDE_SDK_VERSION: sdk,
    NODE_MAJOR: ws.versions.node ?? "22",
    APT_PACKAGES: [...new Set(ws.aptPackages)].sort().join(" "),
    PLAYWRIGHT: ws.playwright ? "1" : "0",
  };
  if (ws.base === "php") {
    args.PHP_VERSION = ws.versions.php ?? "8.4";
    args.PHP_EXTENSIONS = [...new Set([...DEFAULT_PHP_EXTENSIONS, ...ws.phpExtensions])].sort().join(" ");
  }
  if (ws.base === "python") args.PYTHON_VERSION = ws.versions.python ?? "3.13";
  return args;
}

export function imageSpec(slug: string, ws: WorkspaceConfig, sdk = sdkVersion()) {
  const dockerfile = path.join(DOCKER_DIR, `${ws.base}.Dockerfile`);
  const args = buildArgs(ws, sdk);
  const hash = createHash("sha256")
    .update(readFileSync(dockerfile))
    .update(readFileSync(path.join(DOCKER_DIR, "install-claude.sh")))
    .update(JSON.stringify(args))
    .digest("hex")
    .slice(0, 12);
  return { tag: `devagent-${slug.toLowerCase()}:${hash}`, dockerfile, args, hash };
}

export async function imageExists(tag: string): Promise<boolean> {
  return (await exec("docker", ["image", "inspect", tag], { timeoutMs: 30_000 })).code === 0;
}

/** Builds the project image if it doesn't exist yet. Returns the tag. */
export async function ensureImage(slug: string, ws: WorkspaceConfig, log: (line: string) => void = () => {}, signal?: AbortSignal): Promise<string> {
  if (ws.customImage) return ws.customImage;
  const spec = imageSpec(slug, ws);
  if (await imageExists(spec.tag)) return spec.tag;
  const dir = projectPaths(slug).image;
  await mkdir(dir, { recursive: true });
  const logFile = path.join(dir, `build-${spec.hash}.log`);
  await writeFile(path.join(dir, `build-${spec.hash}.json`), JSON.stringify({ tag: spec.tag, dockerfile: path.basename(spec.dockerfile), args: spec.args }, null, 2));
  log(`Building workspace image ${spec.tag} (first time for this configuration; this takes a few minutes)`);
  let last = 0;
  const r = await exec(
    "docker",
    ["build", "--progress=plain", "-f", spec.dockerfile, ...Object.entries(spec.args).flatMap(([k, v]) => ["--build-arg", `${k}=${v}`]), "-t", spec.tag, DOCKER_DIR],
    {
      timeoutMs: 60 * 60_000,
      signal,
      env: { ...process.env, DOCKER_BUILDKIT: "1" },
      maxBytes: 4_000_000,
      onLine: (l) => {
        // BuildKit step headers look like "#7 [stage-3 4/9] RUN install-php-extensions …"
        if (/^#\d+ \[/.test(l) && Date.now() - last > 1500) {
          last = Date.now();
          log(`  ${l.replace(/^#\d+ /, "").slice(0, 140)}`);
        }
      },
    },
  );
  await writeFile(logFile, r.output);
  if (r.code !== 0) throw new Error(`Image build failed (log: ${logFile}):\n${r.output.split("\n").slice(-30).join("\n")}`);
  log(`Image ready: ${spec.tag}`);
  return spec.tag;
}
