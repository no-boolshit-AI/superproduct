# Contributing to superproduct

Thanks for helping. Bug reports, fixes, new layouts and themes, and new agents are all welcome.

## Before you open a pull request

- **No product data.** Never commit a real product folder, briefs, agent outputs, `.env` files, tokens or keys. They
  are git-ignored; keep it that way. Examples and tests use the fictional product in `lib/fixtures/acme` or made-up
  content (Acme, Northwind and the like).
- **No third-party material.** Only add images, fonts and text you are allowed to redistribute under the repository's
  terms: your own work, public domain, or open licences such as the SIL Open Font License. Credit sources next to the
  files (see `agents/collage-post-agent/design/samples/CREDITS.txt`). Screenshots of other people's posts or sites stay
  local.
- **No brand in the code.** Agents take colours, fonts, logos, voice and facts from the product folder through
  `lib/product.mjs`. Built-in defaults stay neutral.

## Working on the code

```bash
node scripts/agents.mjs install <agent>   # npm install + setup steps
node scripts/agents.mjs test <agent>      # the agent's zero-cost tests (mock Claude API, no spend)
node --test lib/product.test.mjs          # the product folder loader
```

- Work inside one agent at a time and follow its README and conventions (TypeScript, Claude Agent SDK, one output
  folder per run, guardrails on what the agent may read and write).
- Keep tests free to run: mock the Claude and OpenAI APIs, set `PRODUCT_DIR=none` unless the test is about the product
  folder, and use `lib/fixtures/acme` when it is.
- Update the agent's README, its skill in `skills/` and `agents.json` when you change commands, options or outputs.
- New agents follow the checklist at the end of [`CLAUDE.md`](CLAUDE.md#adding-or-changing-an-agent).

## Licence

superproduct is licensed under the GNU Affero General Public License v3.0 or later. By contributing, you agree that your
contribution is licensed under the same terms.
