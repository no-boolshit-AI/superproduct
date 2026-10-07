/** Throwaway git repos for the tests: a tiny Node project (+ bare "remote") and a skills repo. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function sh(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "t@example.com" } });
}

export function writeTree(root: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
}

export function gitRepo(files: Record<string, string>, branch = "main"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devagent-fx-"));
  writeTree(dir, files);
  sh(dir, "git", ["init", "-q", "-b", branch]);
  sh(dir, "git", ["add", "-A"]);
  sh(dir, "git", ["commit", "-q", "-m", "chore: initial commit"]);
  return dir;
}

export const MATH_V1 = `export function add(a, b) {\n  return a + b;\n}\n`;

/** A Node library with a passing test-suite, published to a bare repo that plays the GitHub remote. */
export function calcRemote(): { work: string; remote: string } {
  const work = gitRepo({
    "package.json": JSON.stringify({ name: "calc", version: "1.0.0", type: "module", scripts: { test: "node --test" } }, null, 2) + "\n",
    "src/math.js": MATH_V1,
    "test/add.test.js": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "../src/math.js";\n\ntest("add", () => assert.equal(add(2, 3), 5));\n`,
    "README.md": "# calc\n\nA tiny calculator library.\n",
    ".env.example": "STRIPE_SECRET=\nAPP_MODE=dev\n",
    ".gitignore": "node_modules/\n",
  });
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "devagent-remote-")) + "/calc.git";
  sh(os.tmpdir(), "git", ["clone", "-q", "--bare", work, remote]);
  return { work, remote };
}

export function skillsRepo(): string {
  return gitRepo({
    "skills/tdd-lite/SKILL.md": "---\nname: tdd-lite\ndescription: >-\n  Write the failing test first,\n  then the code.\n---\n\n# TDD lite\n\n1. Red 2. Green 3. Refactor\n",
    "skills/tdd-lite/reference.md": "More detail.\n",
    "skills/no-skill/README.md": "not a skill\n",
  });
}
