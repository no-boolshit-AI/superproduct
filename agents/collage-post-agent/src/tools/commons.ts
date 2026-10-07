/**
 * Public-domain (and optionally CC BY / BY-SA) images from Wikimedia Commons.
 * For a named person we first use Wikidata's "image" property (P18), which is the
 * canonical portrait, then Commons files that depict the person (P180), then text search.
 */
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeName } from "./openaiImage.js";

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA = "https://www.wikidata.org/w/api.php";

function userAgent(): string {
  const contact = process.env.WIKIMEDIA_CONTACT || "local tool";
  return `collage-post-agent/0.1 (${contact})`;
}

async function getJson(url: string, params: Record<string, string>): Promise<any> {
  const u = new URL(url);
  for (const [k, v] of Object.entries({ format: "json", formatversion: "2", ...params })) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: { "User-Agent": userAgent(), Accept: "application/json" } });
  if (!res.ok) throw new Error(`${u.host} answered HTTP ${res.status}`);
  return res.json();
}

export interface Candidate {
  title: string; // "File:...."
  thumbUrl: string;
  sourceUrl: string; // description page
  width: number;
  height: number;
  license: string; // short name
  licenseKind: "pd" | "cc0" | "cc-by" | "cc-by-sa";
  artist: string;
  attributionRequired: boolean;
}

export interface FoundImage extends Candidate {
  path: string; // relative to job dir
  absPath: string;
}

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyLicense(
  meta: Record<string, { value?: string } | undefined>,
  allowAttribution: boolean,
): Candidate["licenseKind"] | null {
  const lic = String(meta.License?.value ?? "").toLowerCase();
  const short = String(meta.LicenseShortName?.value ?? "");
  const both = `${lic} ${short.toLowerCase()}`;
  if (meta.NonFree?.value && String(meta.NonFree.value).toLowerCase() === "true") return null;
  if (/\bcc0\b|cc-zero/.test(both)) return "cc0";
  if (/^pd\b|^pd-|public domain/.test(lic) || /public domain|^pd\b/i.test(short)) return "pd";
  if (allowAttribution) {
    if (/^cc-by-sa-\d|cc by-sa \d/.test(both)) return "cc-by-sa";
    if (/^cc-by-\d|cc by \d/.test(both)) return "cc-by";
  }
  return null;
}

/** Turn a Commons API page (formatversion=2) into a candidate, or null if unusable. */
export function toCandidate(page: any, allowAttribution: boolean): Candidate | null {
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  if (!/^image\/(jpeg|png|webp|tiff)$/.test(info.mime ?? "")) return null;
  if ((info.width ?? 0) < 500 || (info.height ?? 0) < 500) return null;
  const meta = info.extmetadata ?? {};
  const kind = classifyLicense(meta, allowAttribution);
  if (!kind) return null;
  return {
    title: page.title,
    thumbUrl: info.thumburl || info.url,
    sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    width: info.width,
    height: info.height,
    license: stripHtml(meta.LicenseShortName?.value ?? kind.toUpperCase()),
    licenseKind: kind,
    artist: stripHtml(meta.Artist?.value ?? "Unknown").slice(0, 160) || "Unknown",
    attributionRequired: String(meta.AttributionRequired?.value ?? "").toLowerCase() === "true",
  };
}

const IMAGEINFO = {
  prop: "imageinfo",
  iiprop: "url|size|mime|extmetadata",
  iiurlwidth: "1280",
  iiextmetadatafilter: "LicenseShortName|License|Artist|AttributionRequired|NonFree|Copyrighted",
};

async function imageInfoForTitles(titles: string[], allowAttribution: boolean): Promise<Candidate[]> {
  if (!titles.length) return [];
  const data = await getJson(COMMONS, { action: "query", titles: titles.slice(0, 40).join("|"), ...IMAGEINFO });
  const pages: any[] = data?.query?.pages ?? [];
  const order = new Map(titles.map((t, i) => [t.replace(/_/g, " "), i]));
  return pages
    .sort((a, b) => (order.get(a.title) ?? 99) - (order.get(b.title) ?? 99))
    .map((p) => toCandidate(p, allowAttribution))
    .filter((c): c is Candidate => !!c);
}

async function searchCommons(search: string, allowAttribution: boolean, limit = 20): Promise<Candidate[]> {
  const data = await getJson(COMMONS, {
    action: "query",
    generator: "search",
    gsrsearch: `${search} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    ...IMAGEINFO,
  });
  const pages: any[] = data?.query?.pages ?? [];
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => toCandidate(p, allowAttribution))
    .filter((c): c is Candidate => !!c);
}

/** Wikidata: find the person's item id and the files on their "image" (P18) claim. */
async function wikidataPerson(name: string): Promise<{ id: string; label: string; files: string[] } | null> {
  const s = await getJson(WIKIDATA, { action: "wbsearchentities", search: name, language: "en", type: "item", limit: "7" });
  const ids: string[] = (s?.search ?? []).map((r: any) => r.id).filter(Boolean);
  if (!ids.length) return null;
  const e = await getJson(WIKIDATA, { action: "wbgetentities", ids: ids.join("|"), props: "claims|labels", languages: "en" });
  for (const id of ids) {
    const ent = e?.entities?.[id];
    const isHuman = (ent?.claims?.P31 ?? []).some((c: any) => c?.mainsnak?.datavalue?.value?.id === "Q5");
    if (!isHuman) continue;
    const files = (ent?.claims?.P18 ?? [])
      .map((c: any) => c?.mainsnak?.datavalue?.value)
      .filter((v: unknown): v is string => typeof v === "string")
      .map((f: string) => `File:${f}`);
    return { id, label: ent?.labels?.en?.value ?? name, files };
  }
  return null;
}

export async function findCandidates(
  query: string,
  person: boolean,
  allowAttribution: boolean,
  want: number,
): Promise<{ candidates: Candidate[]; note: string }> {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const add = (cs: Candidate[]) => {
    for (const c of cs) if (!seen.has(c.title) && out.length < want) (seen.add(c.title), out.push(c));
  };
  let note = "";
  if (person) {
    const wd = await wikidataPerson(query);
    if (wd) {
      note = `Wikidata ${wd.id} (${wd.label}).`;
      add(await imageInfoForTitles(wd.files, allowAttribution));
      if (out.length < want) add(await searchCommons(`haswbstatement:P180=${wd.id}`, allowAttribution));
    } else note = "No Wikidata person found; used text search.";
  }
  if (out.length < want) add(await searchCommons(person ? `"${query}"` : query, allowAttribution));
  return { candidates: out, note };
}

export async function downloadCandidate(c: Candidate, jobDir: string, filename: string): Promise<FoundImage> {
  const res = await fetch(c.thumbUrl, { headers: { "User-Agent": userAgent() } });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}) for ${c.title}`);
  const ext = (path.extname(new URL(c.thumbUrl).pathname).toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[0] ?? ".jpg").replace(".jpeg", ".jpg");
  const rel = path.join("assets", `${safeName(filename)}${ext}`);
  const absPath = path.join(jobDir, rel);
  await writeFile(absPath, Buffer.from(await res.arrayBuffer()));
  await recordCredit(jobDir, { file: rel, ...c });
  return { ...c, path: rel, absPath };
}

export interface Credit extends Candidate {
  file: string;
}

export async function recordCredit(jobDir: string, credit: Credit): Promise<void> {
  await appendFile(path.join(jobDir, "credits.jsonl"), JSON.stringify(credit) + "\n");
}

export async function readCredits(jobDir: string): Promise<Credit[]> {
  try {
    const raw = await readFile(path.join(jobDir, "credits.jsonl"), "utf8");
    return raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** Markdown credits for the images actually used in the slides. */
export async function writeCreditsMd(jobDir: string, usedFiles: Set<string>): Promise<string | null> {
  const credits = (await readCredits(jobDir)).filter((c) => usedFiles.has(c.file.replace(/\\/g, "/")));
  if (!credits.length) {
    await rm(path.join(jobDir, "CREDITS.md"), { force: true });
    return null;
  }
  const unique = [...new Map(credits.map((c) => [c.file, c])).values()];
  const lines = [
    "# Image credits",
    "",
    "Photographs and artworks from Wikimedia Commons. Keep these credits with the post (e.g. in the caption or first comment) when the licence asks for attribution.",
    "",
    ...unique.map(
      (c) =>
        `- \`${c.file}\`: ${c.title.replace(/^File:/, "")}. ${c.artist}. ${c.license}${c.attributionRequired ? " (attribution required)" : ""}. ${c.sourceUrl}`,
    ),
    "",
  ];
  const out = path.join(jobDir, "CREDITS.md");
  await writeFile(out, lines.join("\n"));
  return out;
}
