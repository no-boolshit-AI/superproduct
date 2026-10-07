# briefs/

Briefs written by the main agent (see `../CLAUDE.md`), kept so every output can be traced back to what was asked.

- One brief: `YYYY-MM-DD-<slug>.md`, with inputs (data, images, logos) in `YYYY-MM-DD-<slug>/`.
- A campaign: `YYYY-MM-DD-<campaign>/` containing:
  - `brief.md` (the master brief);
  - one brief per agent (`landing.md`, `carousel.md`, `collage.md`, `deck.md`);
  - `assets/`;
  - `README.md` (what ran, output paths, spend, open placeholders).
- The product's brand, voice and standing facts are not repeated here: they live in `../product/` and the agents read
  them. A brief holds what is specific to one job.
- Work for another product or client: give it its own product folder (from the repo root: `node scripts/product.mjs init
  --name … --product products/<id>`) and pass it to the agents (`--product ../../products/<id>` from an agent folder).

Agents are run from their own folder, so pass briefs as `../../briefs/<file>` or as an absolute path.

Everything in this folder except this README is git-ignored: briefs often hold unpublished plans and numbers.
