# Workspace

Everything you make with [superproduct](https://github.com/no-boolshit-AI/superproduct) lives here: the product the
agents work for, your briefs and every result. The kit around this folder is code and stays public. This folder is
yours: the kit's `.gitignore` leaves it out, and it is a git repository of its own, so none of it can end up in the
kit's repository.

| Folder | What | Made by |
|---|---|---|
| `product/` | the product: brand, voice, facts, offers (spec: the kit's `templates/product/README.md`) | `node scripts/product.mjs init`, then the main agent |
| `products/` | other products or clients; an agent uses one with `--product <id>` | `node scripts/product.mjs init --product workspace/products/<id>` |
| `products-archive/` | products replaced by `init --archive` | `node scripts/product.mjs init --archive` |
| `briefs/` | briefs and campaign records | the main agent |
| `out/<agent>/` | results of carousel, collage-post, deck and explainer | the agents |
| `sites/<slug>/` | landing pages: source, static build in `out/`, screenshots in `.lpa/screens/` | landing-page |
| `dev/` | dev-agent's repo setups (`projects/`) and runs (`runs/`) | dev |
| `references/<agent>/` | your reference images (collage-post reads `references/collage-post/`) | you |

Keys are not here: they belong to you and your computer, so they stay in each agent's `.env` in the kit.

## Keep it in a private repository

```bash
git remote add origin <your private repository>
git add -A && git commit -m "Workspace"
git push -u origin HEAD
```

`.gitignore` leaves out secrets, `node_modules`, builds and the results in `out/`, which grow fast (PDFs, PNGs,
videos). Delete its `/out/` line to version them too; Git LFS helps with the videos.

## More than one workspace

One workspace per client keeps products, briefs and results apart. Point the kit at another one with
`SUPERPRODUCT_WORKSPACE=<folder>` (absolute, or relative to the kit), or make the kit's `workspace` a symlink to it.
In Cowork, keep it inside the connected folder: the VM can't follow a link out of it.
