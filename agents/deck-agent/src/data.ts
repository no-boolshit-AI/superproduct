/** inspect_data: read CSV / TSV / JSON / XLSX files the user supplied and summarise them for the agent. */
import fs from "node:fs";
import path from "node:path";
import readXlsxFile from "read-excel-file/node";

type Cell = string | number | boolean | null;
export interface Table {
  name: string;
  header: string[];
  rows: Cell[][];
}

function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const toCell = (v: unknown): Cell => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const n = s.replace(/[\s,]/g, "").replace(/^\((.*)\)$/, "-$1").replace(/%$/, "");
  if (/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(n)) return Number(n);
  return s;
};

export async function loadTables(file: string, sheet?: string): Promise<Table[]> {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".csv" || ext === ".tsv" || ext === ".txt") {
    const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
    const first = text.split("\n")[0] ?? "";
    const delim = ext === ".tsv" || first.split("\t").length > first.split(",").length ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",";
    const rows = parseDelimited(text, delim);
    return [{ name: path.basename(file), header: (rows[0] ?? []).map(String), rows: rows.slice(1).map((r) => r.map(toCell)) }];
  }
  if (ext === ".json") {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const arr = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
    if (arr && arr.length && typeof arr[0] === "object" && !Array.isArray(arr[0])) {
      const header = [...new Set(arr.flatMap((o: object) => Object.keys(o)))] as string[];
      return [{ name: path.basename(file), header, rows: arr.map((o: Record<string, unknown>) => header.map((h) => toCell(o[h]))) }];
    }
    if (arr && Array.isArray(arr[0])) return [{ name: path.basename(file), header: arr[0].map(String), rows: arr.slice(1).map((r: unknown[]) => r.map(toCell)) }];
    if (data && typeof data === "object") {
      const keys = Object.keys(data).filter((k) => Array.isArray(data[k]));
      if (keys.length) {
        const n = Math.max(...keys.map((k) => data[k].length));
        return [{ name: path.basename(file), header: keys, rows: Array.from({ length: n }, (_, i) => keys.map((k) => toCell(data[k][i]))) }];
      }
    }
    throw new Error("JSON must be an array of objects, an array of arrays, or an object of arrays.");
  }
  if (ext === ".xlsx" || ext === ".xlsm") {
    const sheets = await readXlsxFile(fs.readFileSync(file));
    const pick = sheet ? sheets.filter((s) => s.sheet === sheet) : sheets;
    if (!pick.length) throw new Error(`Sheet "${sheet}" not found. Sheets: ${sheets.map((s) => s.sheet).join(", ")}`);
    return pick.map((s) => {
      const rows = (s.data as unknown[][]).filter((r) => r.some((c) => c !== null && c !== ""));
      return { name: s.sheet, header: (rows[0] ?? []).map((c) => String(c ?? "")), rows: rows.slice(1).map((r) => r.map(toCell)) };
    });
  }
  throw new Error(`Unsupported file type ${ext}. Use .csv, .tsv, .json or .xlsx (for .md/.txt briefs use Read).`);
}

const fmtNum = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 1 }) : String(Math.round(n * 1000) / 1000));

export function summarize(t: Table, maxRows = 40): string {
  const lines = [`### ${t.name}: ${t.rows.length} rows × ${t.header.length} columns`, ""];
  const stats = t.header.map((h, j) => {
    const vals = t.rows.map((r) => r[j]);
    const nums = vals.filter((v): v is number => typeof v === "number");
    if (nums.length >= Math.max(1, vals.filter((v) => v !== null).length * 0.8)) {
      const sum = nums.reduce((a, b) => a + b, 0);
      return `- **${h || `col${j + 1}`}**: numeric, min ${fmtNum(Math.min(...nums))}, max ${fmtNum(Math.max(...nums))}, sum ${fmtNum(sum)}, mean ${fmtNum(sum / nums.length)}${nums.length < vals.length ? `, ${vals.length - nums.length} blank/text` : ""}`;
    }
    const distinct = [...new Set(vals.filter((v) => v !== null).map(String))];
    return `- **${h || `col${j + 1}`}**: text, ${distinct.length} distinct${distinct.length <= 12 ? ` (${distinct.slice(0, 12).join(", ")})` : ""}`;
  });
  lines.push(...stats, "");
  const shown = t.rows.slice(0, maxRows);
  const esc = (v: Cell) => (v === null ? "" : String(v).replace(/\|/g, "\\|"));
  lines.push(`| ${t.header.map(esc).join(" | ")} |`, `| ${t.header.map(() => "---").join(" | ")} |`, ...shown.map((r) => `| ${t.header.map((_, j) => esc(r[j] ?? null)).join(" | ")} |`));
  if (t.rows.length > maxRows) lines.push("", `…${t.rows.length - maxRows} more rows (pass max_rows to see more).`);
  return lines.join("\n");
}
