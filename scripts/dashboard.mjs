#!/usr/bin/env node
/**
 * The dashboard: a page in your browser that shows what the agents are doing, everything they made and your product
 * folder, and walks you through setup (keys, installs, settings). Zero dependencies, Node 20+.
 *
 *   node scripts/dashboard.mjs [--port 4646] [--open]
 *
 * --open opens it in your browser. Landing pages are previewed on the next port (4647). It listens on this computer
 * only (127.0.0.1); keys you enter go into each agent's .env and are never shown again. Ctrl+C stops it.
 */
import { spawn } from "node:child_process";
import { createDashboard } from "../dashboard/server.mjs";

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log("node scripts/dashboard.mjs [--port 4646] [--open]");
  process.exit(0);
}
const portArg = argv.indexOf("--port");
const wanted = portArg >= 0 ? Number(argv[portArg + 1]) : Number(process.env.DASHBOARD_PORT) || 4646;
if (!Number.isInteger(wanted) || wanted < 1 || wanted > 65534) {
  console.error("✗ --port needs a number between 1 and 65534");
  process.exit(1);
}

/** Listen on the first free port from `port` on, trying up to ten. */
function listen(server, port, tries = 10) {
  return new Promise((resolve, reject) => {
    const attempt = (p, left) => {
      server.once("error", (e) => (e.code === "EADDRINUSE" && left > 1 ? attempt(p + 2, left - 1) : reject(e)));
      server.listen(p, "127.0.0.1", () => resolve(server.address().port));
    };
    attempt(port, tries);
  });
}

const { server, sites } = createDashboard();
try {
  const port = await listen(server, wanted);
  const sitesPort = await listen(sites, port + 1);
  const url = `http://127.0.0.1:${port}`;
  console.log(`superproduct dashboard: ${url}`);
  console.log(`  landing page previews on port ${sitesPort} · Ctrl+C stops it`);
  if (argv.includes("--open")) {
    const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  }
} catch (e) {
  console.error(`✗ Couldn't start the dashboard: ${e.message}`);
  process.exit(1);
}
