/**
 * Test-only docker setup for sandboxes without registry access: a FROM-scratch image whose container borrows the
 * host's /usr, /lib, /etc and Node via read-only bind mounts (projects/calc/compose.override.json). Exercises the
 * real compose lifecycle, `docker exec` spawning of Claude Code, MCP over stdio and hooks.
 * Use: DEVAGENT_E2E_RUNTIME=docker TEST_CUSTOM_IMAGE=devagent-hostmount:test DEVAGENT_E2E_SETUP_HOOK=test/docker-hostmount.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export default async function (home: string) {
  const ctx = fs.mkdtempSync(path.join(os.tmpdir(), "devagent-img-"));
  fs.writeFileSync(path.join(ctx, ".keep"), "");
  fs.writeFileSync(path.join(ctx, "Dockerfile"), 'FROM scratch\nCOPY .keep /workspace/.keep\nCMD ["/bin/sleep","infinity"]\n');
  execFileSync("docker", ["build", "-q", "-t", "devagent-hostmount:test", ctx], { stdio: "inherit" });
  if (!fs.existsSync("/usr/local/bin/claude")) throw new Error("Copy the SDK's linux claude binary to /usr/local/bin/claude first.");
  const node = path.dirname(path.dirname(process.execPath));
  const override = {
    services: {
      workspace: {
        // TEST_BRIDGE=1 keeps the default bridge network (exercises the host.docker.internal rewrite)
        ...(process.env.TEST_BRIDGE === "1" ? {} : { network_mode: "host", extra_hosts: null }),
        init: null,
        tmpfs: ["/tmp"],
        "volumes+": ["/usr:/usr:ro", "/lib:/lib:ro", "/lib64:/lib64:ro", "/bin:/bin:ro", "/sbin:/sbin:ro", "/etc:/etc:ro", `${node}:${node}:ro`],
        environment: { PATH: `${node}/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` },
      },
    },
  };
  fs.mkdirSync(path.join(home, "projects", "calc"), { recursive: true });
  fs.writeFileSync(path.join(home, "projects", "calc", "compose.override.json"), JSON.stringify(override, null, 2));
}
