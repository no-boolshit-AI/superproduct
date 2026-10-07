/** Loads .env from the project root before anything reads process.env (imported first by paths.ts). */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
// Real environment variables win over .env (Node's loader does not overwrite existing ones).
if (existsSync(envFile)) process.loadEnvFile(envFile);
