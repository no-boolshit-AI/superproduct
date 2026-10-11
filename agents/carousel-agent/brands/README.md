# brands/

Not for your brand files: put a client's brand file in the workspace (e.g. `../../../workspace/brands/<client>.json`)
and run `npm run generate -- --file brief.md --brand ../../workspace/brands/<client>.json`. Better still, give the
client a product folder (`node scripts/product.mjs init --product <client>` from the kit's folder, then
`--product <client>`): brand, voice and facts in one place. This folder is git-ignored apart from this file.

The format is in the README ("Brand"); `../brand.json` is the default without a product folder.
