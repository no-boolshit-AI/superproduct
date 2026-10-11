/**
 * Shared by the media tools (images, narration, sound effects, music): the record of what was generated, which also
 * serves as the cache (an identical request on a revision reuses the file instead of paying again), file names, a
 * concurrency pool and FFmpeg helpers.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type MediaType = "image" | "narration" | "sfx" | "music";

/** One generated file. Kept in job.json → media, so the job says what was made, with what, from which prompt. */
export interface MediaEntry {
  type: MediaType;
  /** project-relative path */
  file: string;
  provider: "openai" | "elevenlabs" | "mock";
  model: string;
  /** everything that shapes the output, hashed: an entry with the same key and its file on disk is reused */
  key: string;
  /** image prompt as sent, the narration line, the sound or music prompt */
  prompt: string;
  at: string;
  /** a cached file copied under another name: the file it came from (costs nothing, counts towards no limit) */
  copyOf?: string;
  kind?: string;
  size?: string;
  transparent?: boolean;
  refs?: string[];
  voice?: string;
  frame?: number;
  characters?: number;
  seconds?: number;
  /** narration: where the word timings came from, and the words (kept so a cached line needs no new call) */
  timing?: "elevenlabs" | "estimated";
  words?: { id: string; text: string; start: number; end: number }[];
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}

export interface MediaStore {
  entries: MediaEntry[];
  /** ISO time this run started: per-run limits count entries made after it */
  since: string;
  add(e: MediaEntry): void;
}

export function memoryStore(entries: MediaEntry[] = [], onChange?: () => void): MediaStore {
  return {
    entries,
    since: new Date().toISOString(),
    add(e) {
      const i = entries.findIndex((x) => x.file === e.file && x.type === e.type);
      if (i >= 0) entries.splice(i, 1);
      entries.push(e);
      onChange?.();
    },
  };
}

/** An earlier entry with this key whose file still exists (relative to the project), if any. */
export function cached(store: MediaStore, projectDir: string, key: string): MediaEntry | undefined {
  return [...store.entries].reverse().find((e) => e.key === key && fs.existsSync(path.join(projectDir, e.file)));
}

/** Entries of a type made in this run (cache hits excluded: they are never added). */
export const madeThisRun = (store: MediaStore, type: MediaType) => store.entries.filter((e) => e.type === type && !e.copyOf && e.at >= store.since).length;

export const hashKey = (...parts: unknown[]) => crypto.createHash("sha256").update(parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p ?? null))).join("§")).digest("hex").slice(0, 32);

/** sha1 of a file's bytes, so a reference image that changes invalidates the cache */
export const fileHash = (abs: string) => crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");

/** A file stem: lowercase letters, digits and dashes only (no paths, no extension). */
export function safeName(name: string, fallback = "file"): string {
  return (
    String(name)
      .toLowerCase()
      .replace(/\.[a-z0-9]{2,4}$/i, "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || fallback
  );
}

/** Run async tasks with a concurrency limit, preserving order; a failure becomes an Error value. */
export async function pool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<(R | Error)[]> {
  const out: (R | Error)[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        out[i] = e instanceof Error ? e : new Error(String(e));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/** Duration of an audio or video file in seconds (ffprobe), or null. */
export function mediaDuration(abs: string): number | null {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", abs], { encoding: "utf8" });
  const d = Number(r.stdout?.trim());
  return r.status === 0 && Number.isFinite(d) && d > 0 ? Math.round(d * 1000) / 1000 : null;
}

/** Run FFmpeg quietly; true on success. */
export function ffmpeg(args: string[]): boolean {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8", timeout: 120_000 });
  return r.status === 0;
}

export const writeFileAtomic = (abs: string, data: Buffer | string) => {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, abs);
};
