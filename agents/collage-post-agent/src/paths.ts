import "./env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DESIGN_DIR = path.join(ROOT, "design");
export const LAYOUTS_DIR = path.join(DESIGN_DIR, "layouts");
export const SAMPLES_DIR = path.join(DESIGN_DIR, "samples");
export const REFERENCE_DIR = path.join(ROOT, "reference");
export const STYLEGUIDE = path.join(ROOT, "STYLEGUIDE.md");
export const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || path.join(ROOT, "output"));
