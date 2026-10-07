/** Offline test of the Wikimedia logic with fixture responses (no network). */
import { readFileSync, mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SAMPLES_DIR } from "../src/paths.js";
import assert from "node:assert/strict";
import { classifyLicense, downloadCandidate, findCandidates, readCredits, writeCreditsMd } from "../src/tools/commons.js";

const jpg = readFileSync(path.join(SAMPLES_DIR, "sample-portrait.jpg"));
const calls: string[] = [];
const info = (title: string, lic: string, short: string, w = 1400) => ({
  title,
  index: 1,
  imageinfo: [{
    thumburl: `https://upload.wikimedia.org/thumb/${encodeURIComponent(title)}/1400px.jpg`,
    url: "https://upload.wikimedia.org/orig.jpg",
    descriptionurl: `https://commons.wikimedia.org/wiki/${title}`,
    width: w, height: 1800, mime: "image/jpeg",
    extmetadata: { License: { value: lic }, LicenseShortName: { value: short }, Artist: { value: '<a href="x">Justus Sustermans</a>' }, AttributionRequired: { value: lic.startsWith("cc-by") ? "true" : "false" } },
  }],
});

globalThis.fetch = (async (input: string | URL) => {
  const u = new URL(String(input));
  calls.push(u.searchParams.get("action") + " " + (u.searchParams.get("gsrsearch") ?? u.searchParams.get("titles") ?? u.searchParams.get("search") ?? u.pathname));
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
  if (u.host === "upload.wikimedia.org") return new Response(jpg, { status: 200 });
  const a = u.searchParams.get("action");
  if (a === "wbsearchentities") return json({ search: [{ id: "Q999" }, { id: "Q307" }] });
  if (a === "wbgetentities")
    return json({ entities: {
      Q999: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q4167410" } } } }] } }, // disambiguation page, not human
      Q307: { labels: { en: { value: "Galileo Galilei" } }, claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
        P18: [{ mainsnak: { datavalue: { value: "Justus Sustermans - Portrait of Galileo Galilei, 1636.jpg" } } }],
      } },
    } });
  if (a === "query" && u.searchParams.get("titles"))
    return json({ query: { pages: [info("File:Justus Sustermans - Portrait of Galileo Galilei, 1636.jpg", "pd", "Public domain")] } });
  if (a === "query" && u.searchParams.get("generator") === "search")
    return json({ query: { pages: [
      info("File:Galileo copyrighted.jpg", "cc-by-sa-4.0", "CC BY-SA 4.0"),
      info("File:Galileo tiny.jpg", "pd", "Public domain", 300),
      info("File:Galileo cc0.jpg", "cc0", "CC0"),
    ] } });
  return new Response("nope", { status: 404 });
}) as typeof fetch;

// licence classification
assert.equal(classifyLicense({ License: { value: "pd" }, LicenseShortName: { value: "Public domain" } }, false), "pd");
assert.equal(classifyLicense({ License: { value: "cc0" } }, false), "cc0");
assert.equal(classifyLicense({ License: { value: "cc-by-sa-4.0" }, LicenseShortName: { value: "CC BY-SA 4.0" } }, false), null);
assert.equal(classifyLicense({ License: { value: "cc-by-sa-4.0" }, LicenseShortName: { value: "CC BY-SA 4.0" } }, true), "cc-by-sa");
assert.equal(classifyLicense({ License: { value: "cc-by-4.0" } }, true), "cc-by");
assert.equal(classifyLicense({ LicenseShortName: { value: "Fair use" }, NonFree: { value: "true" } }, true), null);

const pd = await findCandidates("Galileo Galilei", true, false, 3);
console.log(pd.note, pd.candidates.map((c) => `${c.title} [${c.license}] ${c.artist}`));
assert.equal(pd.candidates[0].title, "File:Justus Sustermans - Portrait of Galileo Galilei, 1636.jpg");
assert.ok(!pd.candidates.some((c) => c.title.includes("copyrighted")), "CC BY-SA must be excluded by default");
assert.ok(!pd.candidates.some((c) => c.title.includes("tiny")), "small images excluded");
assert.ok(pd.candidates.some((c) => c.title.includes("cc0")));

const by = await findCandidates("Galileo Galilei", true, true, 4);
assert.ok(by.candidates.some((c) => c.licenseKind === "cc-by-sa"));

const dir = mkdtempSync(path.join(os.tmpdir(), "collage-commons-"));

mkdirSync(dir + "/assets", { recursive: true });
const f = await downloadCandidate(pd.candidates[0], dir, "galileo");
assert.equal(f.path, "assets/galileo.jpg");
assert.equal((await readCredits(dir)).length, 1);
const md = await writeCreditsMd(dir, new Set(["assets/galileo.jpg"]));
console.log(readFileSync(md!, "utf8"));

console.log("commons tests passed");
