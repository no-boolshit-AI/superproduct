import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export: `next build` writes a deployable site to ./out
  output: "export",
  images: { unoptimized: true },
  // When built inside the agent workspace, node_modules lives one level up
  // (sites/node_modules). LPA_TURBOPACK_ROOT points Turbopack at that folder.
  turbopack: { root: process.env.LPA_TURBOPACK_ROOT ?? here },
};

export default nextConfig;
