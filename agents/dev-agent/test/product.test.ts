/**
 * Product folder → dev runs: which product a project gets (flag, profile, or a product folder that lists the repo),
 * the repo-reference matching, and the product section in the agents' project context. Uses the fictional fixture in
 * lib/fixtures/acme (repos: ["acme/bread-shop"]); never the repo's own product/ folder.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DEVAGENT_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "devagent-product-"));
const FIXTURE = path.resolve(import.meta.dirname, "../../../lib/fixtures/acme");
const { repoKey, resolveProductFor, productContextFor } = await import("../src/product.js");
const { projectContext } = await import("../src/agent/prompts.js");
const { ProfileSchema } = await import("../src/profile.js");

const repo = (owner: string, name: string) => ({ owner, name, url: `https://github.com/${owner}/${name}.git` });

// repo references
assert.equal(repoKey("acme/bread-shop"), "acme/bread-shop");
assert.equal(repoKey("https://github.com/Acme/Bread-Shop.git"), "acme/bread-shop");
assert.equal(repoKey("git@github.com:acme/bread-shop.git"), "acme/bread-shop");
assert.equal(repoKey("github.com/acme/bread-shop/"), "acme/bread-shop");

// PRODUCT_DIR applies only to repos the product lists
process.env.PRODUCT_DIR = FIXTURE;
const listed = resolveProductFor({ repo: repo("acme", "bread-shop") });
assert.equal(listed.product?.name, "Acme Bread");
assert.equal(listed.source, "env");
const other = resolveProductFor({ repo: repo("acme", "shop") });
assert.equal(other.product, null, "a product that doesn't list the repo is not used");
assert.match(other.note ?? "", /doesn't list acme\/shop/);

// the flag and the profile apply regardless of repos; "none" turns it off
process.env.PRODUCT_DIR = "none";
assert.equal(resolveProductFor({ repo: repo("acme", "shop") }).product, null);
assert.equal(resolveProductFor({ repo: repo("acme", "shop") }, FIXTURE).source, "flag");
const fromProfile = resolveProductFor({ repo: repo("acme", "shop"), product: FIXTURE });
assert.equal(fromProfile.product?.name, "Acme Bread");
assert.equal(fromProfile.source, "profile");
assert.equal(resolveProductFor({ repo: repo("acme", "bread-shop"), product: FIXTURE }, "none").product, null, "--product none beats the profile");
assert.throws(() => resolveProductFor({ repo: repo("acme", "shop") }, os.tmpdir()), /No product\.json/);

// the profile schema accepts the field and stays valid without it
const profileBase = JSON.parse(
  JSON.stringify({
    version: 1,
    slug: "bread",
    name: "Bread shop",
    repo: { url: "https://github.com/acme/bread-shop.git", owner: "acme", name: "bread-shop", github: true, defaultBranch: "main" },
    stack: { primary: "node" },
    git: { baseBranch: "main" },
    publish: {},
    autonomy: {},
    docs: {},
    tooling: {},
    workspace: { base: "node" },
    createdAt: "2026-10-07T00:00:00Z",
    updatedAt: "2026-10-07T00:00:00Z",
  }),
);
assert.equal(ProfileSchema.parse(profileBase).product, undefined);
const profile = ProfileSchema.parse({ ...profileBase, product: FIXTURE });
assert.equal(profile.product, FIXTURE);

// the product section in the agents' project context
const product = resolveProductFor(profile).product!;
const context = productContextFor(product);
assert.match(context, /# Product context: Acme Bread/);
const withProduct = projectContext(profile, "Knowledge.", "local workspace", { skills: [], mcp: [], product: { name: product.name, context } });
assert.match(withProduct, /### Product: Acme Bread[\s\S]*The repository's own conventions \(CLAUDE\.md, the code\) win/);
assert.ok(withProduct.includes(context.trim()), "compiled context included");
const without = projectContext(profile, "Knowledge.", "local workspace", { skills: [], mcp: [] });
assert.doesNotMatch(without, /### Product:/);

console.log("✓ product: repo matching, flag/profile/env precedence, schema, prompt section");
