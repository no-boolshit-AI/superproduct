/**
 * HTTP API
 *   POST   /pages            { brief, slug?, model?, maxBudgetUsd?, product?: "none" } → 202 { id, statusUrl, previewUrl }
 *   GET    /pages            list jobs
 *   GET    /pages/:id        job status, recent events, result
 *   DELETE /pages/:id        cancel a queued or running job
 *   GET    /preview/:slug/*  the built static site
 *   GET    /health
 * Set LPA_API_TOKEN to require `Authorization: Bearer <token>` on /pages.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { z } from "zod";
import { config } from "./config.js";
import { JobQueue } from "./jobs.js";

const app = new Hono();
const queue = new JobQueue();

const PageBody = z.object({
  brief: z.string().trim().min(20, "brief is too short").max(20_000),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{1,48}$/, "slug: lowercase letters, digits and dashes")
    .optional(),
  model: z.string().max(64).optional(),
  maxBudgetUsd: z.number().positive().max(50).optional(),
  /** "none" builds without the product folder; otherwise the server's product folder (PRODUCT_DIR / product/) applies. */
  product: z.literal("none").optional(),
});

if (config.apiToken) app.use("/pages/*", bearerAuth({ token: config.apiToken }));
if (config.apiToken) app.use("/pages", bearerAuth({ token: config.apiToken }));

app.get("/health", (c) => c.json({ ok: true }));

app.post("/pages", async (c) => {
  const parsed = PageBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  const job = queue.enqueue(parsed.data);
  const base = new URL(c.req.url).origin;
  return c.json({ id: job.id, status: job.status, statusUrl: `${base}/pages/${job.id}` }, 202);
});

app.get("/pages", (c) =>
  c.json(
    queue.list().map((j) => ({ id: j.id, status: j.status, slug: j.slug, createdAt: j.createdAt, finishedAt: j.finishedAt, ok: j.result?.ok })),
  ),
);

app.get("/pages/:id", (c) => {
  const job = queue.get(c.req.param("id"));
  if (!job) return c.json({ error: "not found" }, 404);
  const base = new URL(c.req.url).origin;
  return c.json({
    ...job,
    events: job.events.slice(-50),
    previewUrl: job.result?.buildOk && job.slug ? `${base}/preview/${job.slug}/` : undefined,
  });
});

app.delete("/pages/:id", (c) => (queue.cancel(c.req.param("id")) ? c.json({ ok: true }) : c.json({ error: "not cancellable" }, 409)));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
};

// Static preview. Next's export uses absolute asset paths (/_next/…, /assets/…),
// so the active preview is remembered in a cookie and root-relative requests are
// resolved against that site.
app.get("/preview/:slug/*", (c) => {
  const slug = c.req.param("slug");
  if (!/^[a-z0-9-]+$/.test(slug)) return c.notFound();
  const root = path.join(config.sitesDir, slug, "out");
  const rel = decodeURIComponent(c.req.path.slice(`/preview/${slug}`.length)) || "/";
  const res = sendFile(root, rel);
  res.headers.append("set-cookie", `lpa_preview=${slug}; Path=/; SameSite=Lax`);
  return res;
});
app.get("/preview/:slug", (c) => c.redirect(`/preview/${c.req.param("slug")}/`));
app.get("*", (c) => {
  const fromRef = (c.req.header("referer") ?? "").match(/\/preview\/([a-z0-9-]+)\//)?.[1];
  const fromCookie = (c.req.header("cookie") ?? "").match(/(?:^|;\s*)lpa_preview=([a-z0-9-]+)/)?.[1];
  const slug = fromRef ?? fromCookie;
  if (!slug) return c.notFound();
  return sendFile(path.join(config.sitesDir, slug, "out"), decodeURIComponent(c.req.path));
});

function sendFile(root: string, rel: string): Response {
  let file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) return new Response("Forbidden", { status: 403 });
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!existsSync(file)) return new Response("Not found", { status: 404 });
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" } });
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Landing page agent API on http://localhost:${info.port}${config.apiToken ? " (bearer auth on)" : " (no auth: set LPA_API_TOKEN)"}`);
});
