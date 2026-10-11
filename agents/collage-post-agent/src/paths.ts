import "./env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outputDir, referencesDir } from "../../../lib/workspace.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DESIGN_DIR = path.join(ROOT, "design");
export const LAYOUTS_DIR = path.join(DESIGN_DIR, "layouts");
export const SAMPLES_DIR = path.join(DESIGN_DIR, "samples");
/** Your reference posts (layout and mood only): $REFERENCE_DIR, else the workspace's references/collage-post. */
export const REFERENCE_DIR = path.resolve(process.env.REFERENCE_DIR || referencesDir("collage-post"));
export const STYLEGUIDE = path.join(ROOT, "STYLEGUIDE.md");
/** Where posts go: $OUTPUT_DIR, else the workspace's out/collage-post (see lib/workspace.mjs). */
export const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || outputDir("collage-post"));
