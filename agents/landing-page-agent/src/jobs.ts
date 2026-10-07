import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildLandingPage, type AgentEvent, type PageRequest, type PageResult } from "./agent.js";
import { config } from "./config.js";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type Job = {
  id: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  slug?: string;
  request: Omit<PageRequest, "assets">;
  events: { at: string; type: string; text: string }[];
  result?: PageResult;
  error?: string;
};

const MAX_EVENTS = 200;

/** In-memory FIFO queue with bounded concurrency. Job state is mirrored to sites/<slug>/.lpa/job.json. */
export class JobQueue {
  private jobs = new Map<string, Job>();
  private pending: string[] = [];
  private running = new Map<string, AbortController>();

  constructor(private concurrency = config.concurrency) {
    this.restore();
  }

  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  enqueue(request: Omit<PageRequest, "assets">): Job {
    const job: Job = { id: randomUUID(), status: "queued", createdAt: new Date().toISOString(), request, events: [] };
    this.jobs.set(job.id, job);
    this.pending.push(job.id);
    queueMicrotask(() => this.pump());
    return job;
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === "queued") {
      this.pending = this.pending.filter((p) => p !== id);
      job.status = "cancelled";
      job.finishedAt = new Date().toISOString();
      return true;
    }
    const ctrl = this.running.get(id);
    if (ctrl) {
      ctrl.abort();
      return true;
    }
    return false;
  }

  private pump() {
    while (this.running.size < this.concurrency && this.pending.length) {
      const id = this.pending.shift()!;
      void this.run(id);
    }
  }

  private async run(id: string) {
    const job = this.jobs.get(id)!;
    const ctrl = new AbortController();
    this.running.set(id, ctrl);
    job.status = "running";
    job.startedAt = new Date().toISOString();
    const log = (e: AgentEvent) => {
      const text =
        e.type === "text" ? e.text : e.type === "tool" ? e.detail : e.type === "scaffolded" ? e.slug : e.type === "verify" ? JSON.stringify(e) : e.result.status;
      job.events.push({ at: new Date().toISOString(), type: e.type, text });
      if (job.events.length > MAX_EVENTS) job.events.splice(0, job.events.length - MAX_EVENTS);
      if (e.type === "scaffolded") job.slug = e.slug;
      this.persist(job);
    };
    try {
      const result = await buildLandingPage(job.request, { onEvent: log, abortController: ctrl });
      job.result = result;
      job.status = result.status === "aborted" ? "cancelled" : result.ok ? "succeeded" : "failed";
      if (!result.ok) job.error = result.error ?? result.status;
    } catch (err) {
      job.status = ctrl.signal.aborted ? "cancelled" : "failed";
      job.error = (err as Error).message;
    } finally {
      job.finishedAt = new Date().toISOString();
      this.running.delete(id);
      this.persist(job);
      this.pump();
    }
  }

  private persist(job: Job) {
    if (!job.slug) return;
    const dir = path.join(config.sitesDir, job.slug, ".lpa");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "job.json"), JSON.stringify(job, null, 2));
  }

  /** Reload finished jobs after a restart; jobs that were running are marked failed. */
  private restore() {
    if (!existsSync(config.sitesDir)) return;
    for (const slug of readdirSync(config.sitesDir)) {
      const f = path.join(config.sitesDir, slug, ".lpa", "job.json");
      if (!existsSync(f)) continue;
      try {
        const job = JSON.parse(readFileSync(f, "utf8")) as Job;
        if (job.status === "running" || job.status === "queued") {
          job.status = "failed";
          job.error = "Interrupted by server restart";
        }
        this.jobs.set(job.id, job);
      } catch {
        /* skip unreadable job files */
      }
    }
  }
}
