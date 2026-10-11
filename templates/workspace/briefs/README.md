# briefs/

Briefs written by the main agent (see the kit's `CLAUDE.md`), kept so every output can be traced back to what was asked.

- One brief: `YYYY-MM-DD-<slug>.md`, with inputs (data, images, logos) in `YYYY-MM-DD-<slug>/`.
- A campaign: `YYYY-MM-DD-<campaign>/` containing:
  - `brief.md` (the master brief);
  - one brief per agent (`landing.md`, `carousel.md`, `collage.md`, `deck.md`, `explainer.md`);
  - `assets/`;
  - `README.md` (what ran, output paths, spend, open placeholders).
- The product's brand, voice and standing facts are not repeated here: they live in `../product/` and the agents read
  them. A brief holds what is specific to one job.
- Work for another product or client: give it its own product folder (from the kit's folder: `node scripts/product.mjs
  init --name … --product workspace/products/<id>`) and pass it to the agents with `--product <id>`.

Agents are run from their own folder in the kit, so pass briefs as `../../workspace/briefs/<file>` or as an absolute
path.
