#!/usr/bin/env tsx
/**
 * Builds the sample deck and report without Claude:
 * `npm run demo [-- --theme corporate] [--only deck|report] [--no-export] [--brand brands/x.json] [--product <dir>|none]`
 * The brand comes from the product folder when there is one (see ../../product), like a real job.
 */
import { parseArgs } from "node:util";
import { closeBrowser } from "../src/render/renderer.js";
import { isTheme } from "../src/themes.js";
import { strategyDeck, strategyReport } from "./demo-content.js";
import { buildDemo } from "./demo-lib.js";

const { values } = parseArgs({
  options: { theme: { type: "string" }, only: { type: "string" }, "no-export": { type: "boolean" }, brand: { type: "string" }, product: { type: "string" }, out: { type: "string" } },
});
const theme = values.theme && isTheme(values.theme) ? values.theme : "strategy";
try {
  if (!values.only || values.only === "deck") await buildDemo(`demo-deck-${theme}`, strategyDeck(theme), { export: !values["no-export"], brandPath: values.brand, product: values.product, outRoot: values.out });
  if (!values.only || values.only === "report") await buildDemo(`demo-report-${theme}`, strategyReport(theme), { export: !values["no-export"], brandPath: values.brand, product: values.product, outRoot: values.out });
} finally {
  await closeBrowser();
}
