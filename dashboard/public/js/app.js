// The superproduct dashboard: what the agents are doing, what they made, the product they work for, and setup.
// Reads everything from the local server (dashboard/server.mjs), which reads the kit and the workspace.

import { markdown } from "./markdown.js";
import { ago, bytes, capitalize, duration, esc, html, icon, mascot, money, palette, plural, raw, when, words } from "./ui.js";

const TOKEN = document.querySelector('meta[name="dashboard-token"]')?.content ?? "";
const main = document.getElementById("main");
const layer = document.getElementById("layer");
const enc = encodeURIComponent;

// ---------------------------------------------------------------- the agents, in plain words

const AGENTS = {
  "landing-page": { name: "Landing page", tagline: "Landing pages in your brand, built, click-tested and screenshotted.", ask: "Build a landing page for our new plan." },
  carousel: { name: "LinkedIn carousel", tagline: "Document carousels with hero numbers, ready to post.", ask: "Make a LinkedIn carousel about our spring offer, portrait, 5 slides." },
  explainer: { name: "Explainer video", tagline: "Short videos that teach one idea. You approve a storyboard first.", ask: "A 45-second explainer video on what our product does, for the LinkedIn feed." },
  deck: { name: "Presentation", tagline: "Decks and reports from your brief and your data, as a PDF.", ask: "A board deck on Q3 from these two spreadsheets." },
  "collage-post": { name: "Collage post", tagline: "Editorial collage posts and carousels for Instagram and LinkedIn.", ask: "A collage post about the history of our city, 5 slides." },
  dev: { name: "App changes", tagline: "Features on your GitHub repos: tested commits and a draft pull request.", ask: "Add CSV export to the invoices page in acme/shop." },
};
const agentOf = (id) => S.data?.agents.find((a) => a.id === id);
const agentName = (id) => AGENTS[id]?.name ?? agentOf(id)?.title ?? id;
const agentTagline = (id) => AGENTS[id]?.tagline ?? (agentOf(id)?.summary ?? "").split(/(?<=\.)\s/)[0];

const STATUS = {
  ready: ["Ready", "pill-ready"],
  working: ["Working on it", "pill-working"],
  question: ["Has a question", "pill-question"],
  failed: ["Didn't finish", "pill-failed"],
  stopped: ["Stopped", "pill-failed"],
  cancelled: ["Cancelled", "pill-muted"],
  unknown: ["No result", "pill-muted"],
};
const statusLabel = (run) => (run.status === "question" && run.rawStatus === "storyboard" ? "Storyboard to review" : (STATUS[run.status] ?? STATUS.unknown)[0]);
const statusPill = (run, size = "") =>
  html`<span class="pill ${size} ${(STATUS[run.status] ?? STATUS.unknown)[1]}">${run.status === "working" ? raw('<span class="dot dot-pulse"></span>') : ""}${statusLabel(run)}</span>`;

const CONN_ICONS = { claude: "sparkle", openai: "image", elevenlabs: "wave", github: "branch", heygen: "mic", context7: "book" };
const CONN_COPY = {
  openai: "Generated pictures: imagery in carousels and decks, the collage pieces in collage posts (required there), and illustrations in explainer videos.",
  elevenlabs: "Narration with word-timed captions, a music bed and sound effects for explainer videos.",
  github: "Lets the dev agent push branches and open draft pull requests. Without it, it falls back to the GitHub CLI login or your SSH keys.",
  heygen: "Another narration voice for explainer videos, when ElevenLabs isn't set.",
  context7: "Higher rate limits for the library docs the dev agent looks up while it codes.",
};

// ---------------------------------------------------------------- small helpers

const prefs = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`sp.${k}`);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`sp.${k}`, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  },
};

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", "x-dashboard-token": TOKEN }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The dashboard answered ${res.status}`);
  return data;
}

function toast(message, { error = false } = {}) {
  const el = document.createElement("div");
  el.className = `toast${error ? " toast-error" : ""}`;
  el.innerHTML = String(html`${icon(error ? "alert" : "check", 16)}<span>${message}</span>`);
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), error ? 6000 : 2600);
}

async function copy(text, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.append(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
  toast(what);
}

const cmd = (text) => html`<div class="cmd"><code>${text}</code><button type="button" data-action="copy" data-text="${text}" title="Copy" aria-label="Copy command">${icon("copy", 15)}</button></div>`;
const runHref = (run) => `#/work/${enc(run.agent)}/${enc(run.id)}`;
const tileStyle = (id) => `--tile:${palette(id).tile[0]}`;
const spendOf = (runs) => runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
/** "3 made · $4.20", without a spend when no run recorded one. */
const madeLine = (runs) => `${runs.length} made${runs.some((r) => r.costUsd != null) ? ` · ${money(spendOf(runs))}` : ""}`;
const kitCd = () => `cd "${S.data.kit}"`;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// ---------------------------------------------------------------- state, routing, rendering

const S = {
  data: null,
  files: null,
  filesKey: "",
  rendered: "",
  ui: { work: { agent: "all", status: "all", q: "" }, files: { kind: "all", q: "" }, docs: "all", openConn: null, openAgent: null, claudeVar: "ANTHROPIC_API_KEY", installQueue: [] },
};

function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [p, query = ""] = h.split("?");
  const parts = p.split("/").filter(Boolean).map((x) => {
    try {
      return decodeURIComponent(x);
    } catch {
      return x;
    }
  });
  const [view = "home", ...rest] = parts;
  return { view: VIEWS[view] ? view : "home", rest, params: new URLSearchParams(query), hash: h };
}

/** Values typed into the page survive a re-render: inputs, textareas and <details> marked data-keep. */
function snapshot() {
  const out = {};
  for (const el of main.querySelectorAll("[data-keep]")) out[el.dataset.keep] = el.tagName === "DETAILS" ? el.open : el.type === "checkbox" || el.type === "radio" ? el.checked : el.value;
  return out;
}
function restore(saved) {
  for (const el of main.querySelectorAll("[data-keep]")) {
    const v = saved[el.dataset.keep];
    if (v === undefined) continue;
    if (el.tagName === "DETAILS") el.open = v;
    else if (el.type === "checkbox" || el.type === "radio") el.checked = v;
    else el.value = v;
  }
}

const isBusy = () => {
  if (layer.childElementCount) return true;
  const a = document.activeElement;
  if (a && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
  return [...main.querySelectorAll("video")].some((v) => !v.paused);
};

let renderSeq = 0;
async function render({ force = false } = {}) {
  if (!S.data) return;
  const r = route();
  document.body.dataset.route = r.view;
  for (const a of document.querySelectorAll("[data-nav]")) {
    if (a.dataset.nav === r.view) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const view = VIEWS[r.view];
  const key = `${r.hash}|${view.key ? view.key(r) : ""}`;
  if (!force && key === S.rendered) return patchTasks();
  if (!force && key.split("|")[0] === S.rendered.split("|")[0] && isBusy()) return patchTasks();
  const sameRoute = S.rendered.split("|")[0] === r.hash;
  const seq = ++renderSeq;
  const saved = sameRoute ? snapshot() : {};
  let out;
  try {
    out = await view.render(r);
  } catch (e) {
    out = html`<div class="card empty"><h2>Something went wrong</h2><p>${e.message}</p><a class="btn btn-outline" href="#/">Back to Home</a></div>`;
  }
  if (seq !== renderSeq) return;
  main.innerHTML = String(out);
  S.rendered = key;
  restore(saved);
  if (!sameRoute) {
    window.scrollTo(0, 0);
    document.title = view.title ? `${view.title(r)} · superproduct` : "superproduct";
  }
  view.after?.(r, { sameRoute });
  patchTasks();
}

let pollTimer;
async function refresh() {
  clearTimeout(pollTimer);
  try {
    const data = await api("/api/state");
    S.data = data;
    await render();
    onTasks();
  } catch (e) {
    if (!S.data) main.innerHTML = String(html`<div class="card empty"><h2>The dashboard server isn't answering</h2><p>Start it again with ${raw("<code>node scripts/dashboard.mjs</code>")}, then reload this page.</p></div>`);
  }
  const active = S.data?.tasks.some((t) => t.status === "running") || S.data?.runs.some((r) => r.status === "working");
  pollTimer = setTimeout(refresh, document.hidden ? 15000 : active ? 1500 : 4000);
}
document.addEventListener("visibilitychange", () => !document.hidden && refresh());
window.addEventListener("hashchange", () => {
  closeLayer({ navigate: false });
  render({ force: true });
});

// ---------------------------------------------------------------- tasks (installs, self-tests)

const latestTask = (agent) => S.data.tasks.filter((t) => t.agent === agent).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

function taskBlock(agent) {
  const t = latestTask(agent);
  if (!t) return "";
  const label = t.action === "install" ? "Installing" : "Self-test";
  const state =
    t.status === "running"
      ? html`<span class="status-text"><span class="spinner"></span>${label}… ${t.action === "install" ? "this takes a few minutes" : ""}</span>`
      : t.status === "done"
        ? html`<span class="status-text"><span class="dot dot-green"></span>${t.action === "install" ? "Installed" : "Self-test passed"} ${ago(t.endedAt)}</span>`
        : html`<span class="status-text"><span class="dot dot-red"></span>${t.action === "install" ? "Install failed" : "Self-test failed"}${t.code != null ? ` (exit ${t.code})` : ""}</span>`;
  return String(html`<div class="stack" style="gap:8px">${state}<div class="log" data-log>${t.log.join("\n") || "Starting…"}</div></div>`);
}

function patchTasks() {
  for (const el of main.querySelectorAll("[data-task-agent]")) {
    const next = taskBlock(el.dataset.taskAgent);
    if (el.dataset.html === next) continue;
    el.dataset.html = next;
    el.innerHTML = next;
    const log = el.querySelector("[data-log]");
    if (log) log.scrollTop = log.scrollHeight;
  }
}

/** Runs the queued installs one after another ("Install everything that's missing"). */
function onTasks() {
  const q = S.ui.installQueue;
  if (!q.length || S.data.tasks.some((t) => t.status === "running")) return;
  const next = q.shift();
  startTask("install", next);
}

async function startTask(action, agent) {
  try {
    await api("/api/tasks", { action, agent });
    toast(action === "install" ? `Installing ${agentName(agent)}…` : `Testing ${agentName(agent)}…`);
    refresh();
  } catch (e) {
    toast(e.message, { error: true });
  }
}

// ---------------------------------------------------------------- overlays

function openLayer(content, { kind = "modal", label = "Dialog" } = {}) {
  const cls = kind === "drawer" ? "overlay drawer-overlay" : kind === "lightbox" ? "overlay lightbox" : "overlay";
  layer.innerHTML = String(html`<div class="${cls}" data-action="close-layer-backdrop" role="dialog" aria-modal="true" aria-label="${label}">${content}</div>`);
  document.body.style.overflow = "hidden";
  setTimeout(() => layer.querySelector("[autofocus], input:not([type=hidden]), textarea, button")?.focus(), 30);
}
/** Close the open modal, drawer or viewer. A document drawer has its own address, so closing it goes back to Knowledge. */
function closeLayer({ navigate = true } = {}) {
  if (!layer.childElementCount) return;
  for (const v of layer.querySelectorAll("video")) v.pause();
  layer.innerHTML = "";
  document.body.style.overflow = "";
  S.viewer = null;
  if (navigate && route().view === "knowledge" && route().rest.length) location.hash = "#/knowledge";
}

// ---------------------------------------------------------------- Home

function summarySentence(d) {
  const week = Date.now() - 7 * 864e5;
  const ready = d.runs.filter((r) => r.status === "ready" && Date.parse(r.updatedAt) > week).length;
  const working = d.runs.filter((r) => r.status === "working").length;
  const questions = d.runs.filter((r) => r.status === "question" && r.agent !== "dev").length + Math.max(d.pending.length, d.runs.filter((r) => r.status === "question" && r.agent === "dev").length);
  const parts = [];
  if (ready) parts.push(`${words(ready)} ${ready === 1 ? "thing is" : "things are"} ready`);
  if (working) parts.push(`${words(working)} ${working === 1 ? "agent is" : "agents are"} working`);
  if (questions) parts.push(questions === 1 ? "one agent has a question" : `${words(questions)} agents have questions`);
  if (!parts.length)
    return d.runs.length ? `${capitalize(words(d.runs.length))} ${plural(d.runs.length, "thing")} made so far. Your agents are ready when you are.` : "Nothing made yet. Ask for your first piece of work and it shows up here.";
  return `${capitalize(parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0])}.`;
}

function attentionItems(d) {
  const items = [];
  for (const r of d.runs.filter((r) => r.status === "question" && r.rawStatus === "storyboard"))
    items.push(html`<div class="question">${mascot(r.agent, 44)}<div class="grow"><div class="title">${agentName(r.agent)}: the storyboard is ready for you</div><div class="sub">${r.title}</div></div><a class="btn btn-dark btn-sm" href="${runHref(r)}">Review</a></div>`);
  for (const p of d.pending)
    items.push(
      html`<div class="question">${mascot("dev", 44)}<div class="grow"><div class="title">${agentName("dev")}: ${p.kind === "approval" ? "a plan to approve" : `${p.questions?.length ?? 1} ${plural(p.questions?.length ?? 1, "question")} for you`}</div><div class="sub">${p.scope ?? ""}${p.context ? ` · ${p.context}` : ""}</div></div><button class="btn btn-dark btn-sm" data-action="answer" data-id="${p.id}">Answer</button></div>`,
    );
  const recent = Date.now() - 3 * 864e5;
  for (const r of d.runs.filter((r) => (r.status === "failed" || r.status === "stopped") && Date.parse(r.updatedAt) > recent))
    items.push(html`<div class="question">${mascot(r.agent, 44)}<div class="grow"><div class="title">${agentName(r.agent)} ${r.status === "stopped" ? "stopped before it finished" : "didn't finish"}</div><div class="sub">${r.title}</div></div><a class="btn btn-outline btn-sm" href="${runHref(r)}">See why</a></div>`);
  return items;
}

const FEATURED_DOCS = ["brand/voice.md", "knowledge/facts.md", "@offerings", "strategy/audiences.md", "BRIEF.md", "brand/messaging.md", "brand/guidelines.md"];
const DOC_NAMES = {
  "BRIEF.md": ["Product brief", "The page every agent reads first"],
  "README.md": ["About this folder", "How the product folder works"],
  "brand/voice.md": ["Brand voice", "How you sound"],
  "brand/messaging.md": ["Messaging", "What you say, and how"],
  "brand/guidelines.md": ["Design guidelines", "How it looks"],
  "knowledge/facts.md": ["Product facts", "What the agents may state"],
  "knowledge/faq.md": ["FAQ", "What people ask"],
  "knowledge/glossary.md": ["Glossary", "Your words and what they mean"],
  "knowledge/open-questions.md": ["Open questions", "Things still to decide"],
  "knowledge/company.md": ["Company", "Who's behind it"],
  "strategy/audiences.md": ["Who it's for", "Your audience"],
  "strategy/positioning.md": ["Positioning", "Why you, and not the others"],
  "strategy/competitors.md": ["Competitors", "Who else people look at"],
  "strategy/vision.md": ["Vision", "Where you're going"],
  "strategy/business-model.md": ["Business model", "How it makes money"],
  "gtm/strategy.md": ["Go-to-market", "How you reach people"],
  "gtm/channels.md": ["Channels", "Where you show up"],
  "gtm/sales-pitch.md": ["Sales pitch", "The short version"],
  "development/architecture.md": ["Architecture", "How the product is built"],
  "development/roadmap.md": ["Roadmap", "What's next"],
  "development/research.md": ["Research", "What you've learned"],
  "development/metrics.md": ["Metrics", "What you measure"],
};
const GROUPS = [
  ["", "The basics"],
  ["brand", "Brand"],
  ["knowledge", "Knowledge"],
  ["offerings", "Offers"],
  ["strategy", "Strategy"],
  ["gtm", "Go-to-market"],
  ["development", "Development"],
  ["decisions", "Decisions"],
];
const groupOf = (p) => (p.includes("/") ? p.split("/")[0] : "");
const docName = (doc) => DOC_NAMES[doc.path]?.[0] ?? doc.title;
const docSub = (doc) => DOC_NAMES[doc.path]?.[1] ?? (GROUPS.find(([g]) => g === groupOf(doc.path))?.[1] ?? "") + (doc.updated ? ` · updated ${when(doc.updated, { short: true })}` : "");
const TRUST = { verified: ["Verified", "pill-ready"], draft: ["Draft", "pill-outline"], template: ["Empty", "pill-muted"] };
const trustPill = (status) => (TRUST[status] ? html`<span class="pill ${TRUST[status][1]}">${TRUST[status][0]}</span>` : "");

function docRow(doc) {
  return html`<li><a class="panel-row" href="#/knowledge/${doc.path.split("/").map(enc).join("/")}">${icon("doc", 22)}<div class="grow"><div class="title">${docName(doc)}</div><div class="sub">${docSub(doc)}</div></div>${trustPill(doc.status)}</a></li>`;
}

function knowledgePanel(p) {
  if (!p.name)
    return html`<section class="card"><div class="panel-head"><span class="label-caps">Knowledge</span></div><div class="card-pad stack" style="gap:12px"><p class="muted">No product folder yet. The agents work for one product: its brand, voice and facts live in <code>workspace/product/</code>.</p><a class="btn btn-lime" href="#/setup/product" style="justify-self:start">Set up your product</a></div></section>`;
  const rows = [];
  for (const f of FEATURED_DOCS) {
    if (rows.length >= 4) break;
    if (f === "@offerings") {
      const offers = p.docs.filter((d) => d.path.startsWith("offerings/"));
      if (!offers.length) continue;
      const status = offers.every((d) => d.status === "verified") ? "verified" : offers.some((d) => d.status === "template") ? "template" : "draft";
      rows.push(html`<li><a class="panel-row" href="#/knowledge?group=offerings">${icon("doc", 22)}<div class="grow"><div class="title">Plans and offers</div><div class="sub">Your ${words(offers.length)} ${plural(offers.length, "offer")}</div></div>${trustPill(status)}</a></li>`);
      continue;
    }
    const doc = p.docs.find((d) => d.path === f);
    if (doc) rows.push(docRow(doc));
  }
  return html`<section class="card">
    <div class="panel-head"><span class="label-caps">Knowledge</span><span class="count">${p.docs.length} ${plural(p.docs.length, "document")}</span></div>
    <ul class="panel-list">${rows}</ul>
    <div class="panel-foot"><span class="muted">${p.name}</span><a class="link" href="#/knowledge">Open knowledge</a></div>
  </section>`;
}

function connState(c) {
  if (c.state === "connected") return html`<span class="status-text"><span class="dot dot-green"></span>Connected</span>`;
  if (c.state === "partial") return html`<span class="status-text" title="${c.detail}"><span class="dot dot-amber"></span>Partly connected</span>`;
  return html`<span class="btn btn-outline btn-sm">Connect</span>`;
}

function connectionsPanel(d) {
  const shown = d.connections.filter((c) => ["claude", "openai", "elevenlabs", "github"].includes(c.id));
  const ok = shown.filter((c) => c.state === "connected").length;
  return html`<section class="card">
    <div class="panel-head"><span class="label-caps">Connections</span><span class="count">${ok} of ${shown.length} connected</span></div>
    <ul class="panel-list">${shown.map(
      (c) => html`<li><a class="panel-row" href="#/setup/connections?open=${c.id}"><span class="icon-tile">${icon(CONN_ICONS[c.id], 22)}</span><div class="grow"><div class="title">${c.label}</div><div class="sub">${c.role}</div></div>${connState(c)}</a></li>`,
    )}</ul>
    <div class="panel-foot"><span class="muted">Keys stay in each agent's .env</span><a class="link" href="#/setup/connections">Manage</a></div>
  </section>`;
}

function latestCards(d) {
  const seen = new Set();
  const latest = d.runs.filter((r) => !seen.has(r.agent) && seen.add(r.agent));
  const rank = { question: 0, working: 1 };
  latest.sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2) || b.updatedAt.localeCompare(a.updatedAt));
  const cards = latest.slice(0, 4).map(
    (r) => html`<a class="card agent-card" href="${runHref(r)}">${mascot(r.agent, 96)}<div class="text"><h3>${agentName(r.agent)}</h3><div class="sub" title="${r.title}">${r.title}</div></div>${statusPill(r)}</a>`,
  );
  for (const a of d.agents.filter((a) => !seen.has(a.id))) {
    if (cards.length >= 4) break;
    cards.push(html`<button class="card agent-card empty" type="button" data-action="new-request" data-agent="${a.id}">${mascot(a.id, 96)}<div class="text"><h3>${agentName(a.id)}</h3><div class="sub">Nothing yet</div></div><span class="pill pill-outline">${icon("plus", 14)}Ask for one</span></button>`);
  }
  return cards;
}

const home = {
  title: () => "Home",
  key: () => {
    const d = S.data;
    return JSON.stringify([d.runs.map((r) => [r.id, r.status, r.updatedAt, r.title]), d.agents.map((a) => a.ready), d.connections.map((c) => c.state), d.pending.map((p) => p.id), d.product.docs.length, d.product.name, prefs.get("name", "")]);
  },
  render() {
    const d = S.data;
    const name = prefs.get("name", d.user) || "";
    const notReady = d.agents.filter((a) => !a.ready);
    const items = attentionItems(d);
    const onboarded = prefs.get("onboarded", false);
    return html`
      <section class="greeting">
        <div><h1>${greeting()}${name ? `, ${name}` : ""}</h1><p class="lede">${summarySentence(d)}</p></div>
        <button class="btn btn-orange btn-lg" type="button" data-action="new-request">New request</button>
      </section>
      ${!onboarded
        ? html`<div class="banner">${icon("sparkle", 22)}<div class="grow"><strong>Welcome to your dashboard.</strong> <span class="muted">A two-minute setup checks your keys, installs and product folder.</span></div><a class="btn btn-dark btn-sm" href="#/setup">Start setup</a><button class="btn btn-ghost btn-icon btn-sm" type="button" data-action="dismiss-welcome" aria-label="Dismiss">${icon("x", 16)}</button></div>`
        : notReady.length
          ? html`<div class="banner banner-amber">${icon("alert", 22)}<div class="grow"><strong>${notReady.length === 1 ? `${agentName(notReady[0].id)} needs` : `${words(notReady.length)} agents need`} setting up.</strong> <span class="muted">${notReady[0].problems[0] ?? ""}</span></div><a class="btn btn-outline btn-sm" href="#/setup/agents">Fix it</a></div>`
          : ""}
      ${items.length ? html`<section class="questions" aria-label="Waiting for you">${items}</section>` : ""}
      <section class="agent-cards" aria-label="Latest work">${latestCards(d)}</section>
      <div class="panels">${knowledgePanel(d.product)}${connectionsPanel(d)}</div>
      ${d.runs.length > 4 ? html`<p class="muted" style="margin-top:28px;text-align:center"><a class="link" href="#/work">See all ${d.runs.length} pieces of work</a></p>` : ""}`;
  },
};

// ---------------------------------------------------------------- Work

const STATUS_FILTERS = [
  ["all", "All", () => true],
  ["ready", "Ready", (r) => r.status === "ready"],
  ["active", "In progress", (r) => r.status === "working"],
  ["question", "Needs you", (r) => r.status === "question"],
  ["issues", "Didn't finish", (r) => ["failed", "stopped", "cancelled", "unknown"].includes(r.status)],
];

function workCard(r) {
  return html`<a class="card work-card" href="${runHref(r)}">
    <div class="thumb" style="${tileStyle(r.agent)}">${r.thumb ? html`<img src="${r.thumb}" alt="" loading="lazy">` : mascot(r.agent, 88, { bare: true })}</div>
    <div class="body">
      <div class="agent-line">${mascot(r.agent, 20, { bare: true })}${agentName(r.agent)}</div>
      <div class="title">${r.title}</div>
      <div class="meta"><span>${ago(r.updatedAt)}${r.costUsd != null ? ` · ${money(r.costUsd)}` : ""}</span>${statusPill(r, "pill-sm")}</div>
    </div>
  </a>`;
}

function filteredRuns() {
  const f = S.ui.work;
  const test = STATUS_FILTERS.find(([k]) => k === f.status)?.[2] ?? (() => true);
  const q = f.q.trim().toLowerCase();
  return S.data.runs.filter((r) => (f.agent === "all" || r.agent === f.agent) && test(r) && (!q || `${r.title} ${agentName(r.agent)} ${r.id}`.toLowerCase().includes(q)));
}

function workGrid() {
  const runs = filteredRuns();
  if (!S.data.runs.length)
    return html`<div class="hero hero-slim"><div class="hero-inner"><span class="eyebrow">Nothing yet</span><h1 style="font-size:clamp(30px,4vw,46px)">Your first piece of <span class="serif">work</span></h1><p class="lede">Ask Claude in this folder for a carousel, a deck, a video or a page. It writes the brief, runs the agent, and the result shows up here.</p><button class="btn btn-lime btn-lg" data-action="new-request">New request</button></div></div>`;
  if (!runs.length) return html`<div class="card empty"><h2>Nothing matches</h2><p>Try another filter, or clear the search.</p></div>`;
  return html`<div class="work-grid">${runs.map(workCard)}</div>`;
}

const work = {
  title: (r) => (r.rest.length >= 2 ? (S.run?.title ?? "Work") : "Work"),
  key: (r) => {
    if (r.rest.length >= 2) {
      const run = S.data.runs.find((x) => x.agent === r.rest[0] && x.id === r.rest.slice(1).join("/"));
      return JSON.stringify([run?.status, run?.updatedAt, S.data.pending.map((p) => p.id)]);
    }
    return JSON.stringify([S.data.runs.map((x) => [x.id, x.status, x.updatedAt]), S.ui.work.agent, S.ui.work.status]);
  },
  after(r) {
    if (r.rest.length >= 2 && S.runDocs?.length) loadDoc(0);
  },
  render(r) {
    if (r.rest.length >= 2) return runView(r);
    const d = S.data;
    const f = S.ui.work;
    const withRuns = d.agents.filter((a) => d.runs.some((x) => x.agent === a.id));
    const needs = d.runs.filter((x) => x.status === "question").length + d.pending.length;
    const week = d.runs.filter((x) => Date.parse(x.createdAt) > Date.now() - 7 * 864e5).length;
    return html`
      <div class="page-head">
        <div><span class="eyebrow">Work</span><h1>Everything your agents <em class="serif">made</em></h1><p class="lede">Newest first. Open one to watch, read or download it, or to ask for changes.</p></div>
        <div class="stats">
          <div class="stat"><div class="n">${d.runs.length}</div><div class="l">pieces of work</div></div>
          <div class="stat"><div class="n">${week}</div><div class="l">this week</div></div>
          <div class="stat"><div class="n">${money(spendOf(d.runs))}</div><div class="l">Claude spend</div></div>
          ${needs ? html`<div class="stat"><div class="n">${needs}</div><div class="l">need you</div></div>` : ""}
        </div>
      </div>
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Agent">
          <button class="chip" type="button" data-action="work-filter" data-key="agent" data-value="all" aria-pressed="${f.agent === "all"}">All agents <span class="count">${d.runs.length}</span></button>
          ${withRuns.map((a) => html`<button class="chip" type="button" data-action="work-filter" data-key="agent" data-value="${a.id}" aria-pressed="${f.agent === a.id}">${mascot(a.id, 22, { bare: true })}${agentName(a.id)} <span class="count">${d.runs.filter((x) => x.agent === a.id).length}</span></button>`)}
        </div>
        <label class="search"><span class="sr-only">Search work</span>${icon("search", 18)}<input class="input" type="search" placeholder="Search titles" value="${f.q}" data-input="work-q" data-keep="work-q"></label>
      </div>
      <div class="segmented" role="group" aria-label="Status" style="margin-bottom:22px">${STATUS_FILTERS.map(([k, label]) => html`<button type="button" data-action="work-filter" data-key="status" data-value="${k}" aria-pressed="${f.status === k}">${label}</button>`)}</div>
      <div id="work-grid">${workGrid()}</div>`;
  },
};

// ---------------------------------------------------------------- one run

const FILE_ICONS = { image: "image", video: "film", audio: "wave", pdf: "doc", markdown: "doc", html: "globe", archive: "archive", data: "grid", text: "doc", other: "doc" };
const VIEWABLE = new Set(["image", "video", "pdf", "markdown", "html", "text", "audio"]);

function revisePrompt(run) {
  return `Revise the ${agentName(run.agent).toLowerCase()} "${run.title}" (${run.agent} job ${run.id}): `;
}

function cliFor(a, run, kind) {
  const id = run.id.split("/").at(-1);
  const at = `cd ${a.dir} && `;
  if (kind === "approve") return `${at}${a.command} --approve ${id}`;
  if (kind === "revise") {
    if (["collage-post", "deck", "explainer"].includes(a.id)) return `${at}${a.command} --revise ${id} "<what to change>"`;
    if (a.id === "carousel") return `${at}npm run render -- ${id}   # after editing slides/*.html`;
    if (a.id === "landing-page") return `${at}${a.command} -f <brief> -s ${id} --replace`;
    if (a.id === "dev") return `${at}npm run agent -- revise ${id}`;
  }
  return `${at}${a.command} --file <brief>`;
}

function nextCard(run, d) {
  const a = agentOf(run.agent);
  const ref = `the ${agentName(run.agent).toLowerCase()} "${run.title}" (${run.agent} job ${run.id})`;
  const changeBox = (template, placeholder) =>
    html`<div class="field"><label for="change">${placeholder}</label><textarea class="textarea" id="change" data-keep="change" placeholder="e.g. shorter intro, warmer colours, swap slide 3 and 4" style="min-height:80px"></textarea></div><button class="btn btn-lime" type="button" data-action="copy-change" data-template="${template}">${icon("copy", 16)}Copy the request for Claude</button>`;
  const howTo = html`<p class="hint">Paste it into Claude Code (or Cowork) opened in this folder. It runs the agent and the new version shows up here.</p>`;
  if (run.status === "question" && run.rawStatus === "storyboard")
    return html`<section class="card side-card"><h2>Your turn: the storyboard</h2>
      <p class="muted">Look at the frames and the notes. The video is only built after you approve, so changes are cheap now.</p>
      <button class="btn btn-dark" type="button" data-action="copy" data-text="${`Approve the storyboard of ${ref} and build the video.`}" data-what="Approval copied: paste it into Claude">${icon("check", 16)}Copy “approve and build”</button>
      ${changeBox(`Change the storyboard of ${ref}: `, "Or ask for changes")}${howTo}
      <details class="more" data-keep="cli-q"><summary>${icon("chevron", 14)}Run it yourself</summary><div>${cmd(cliFor(a, run, "approve"))}${cmd(cliFor(a, run, "revise"))}</div></details></section>`;
  if (run.status === "question") {
    const items = d.pending;
    return html`<section class="card side-card"><h2>Waiting for your answer</h2><p class="muted">The dev agent paused for a decision.</p>${items.length ? items.map((p) => html`<button class="btn btn-dark" type="button" data-action="answer" data-id="${p.id}">${icon("message", 16)}${p.kind === "approval" ? "Review the plan" : "Answer the questions"}</button>`) : html`<p class="hint">The question will show up here as soon as the agent writes it.</p>`}</section>`;
  }
  if (run.status === "working")
    return html`<section class="card side-card"><h2>Working on it</h2>${run.activity ? html`<div class="activity">${run.activity}</div>` : ""}<p class="muted">Started ${ago(run.createdAt)}. You can close this page; the run carries on and the result appears here.</p></section>`;
  if (run.status === "failed" || run.status === "stopped" || run.status === "unknown")
    return html`<section class="card side-card"><h2>${run.status === "stopped" ? "It stopped before finishing" : run.status === "unknown" ? "No result recorded" : "It didn't finish"}</h2>
      ${run.error ? html`<div class="callout callout-red">${run.error}</div>` : ""}
      <p class="muted">${run.status === "stopped" ? "Nothing changed in its folder for half an hour: the process most likely ended." : "Claude can read the log, fix the brief or the setup and try again."}</p>
      <button class="btn btn-dark" type="button" data-action="copy" data-text="${`The ${run.agent} run ${run.id} didn't finish. Read its log and record, fix the brief or the setup, and run it again.`}" data-what="Copied: paste it into Claude">${icon("copy", 16)}Copy “find out why”</button>${howTo}</section>`;
  return html`<section class="card side-card"><h2>Happy with it?</h2>
    ${changeBox(revisePrompt(run), "Ask for changes")}${howTo}
    <details class="more" data-keep="cli-r"><summary>${icon("chevron", 14)}Run it yourself</summary><div>${cmd(cliFor(a, run, "revise"))}${run.agent === "explainer" ? cmd(`cd ${a.dir} && npm run render -- ${run.id} --format mov`) : ""}</div></details>
    <p class="hint">Nothing is published for you: post, deploy or share it when you're ready.</p></section>`;
}

function detailsCard(run) {
  const rec = run.record ?? {};
  const rows = [
    ["Agent", agentName(run.agent)],
    ["Status", statusLabel(run)],
    ["Started", when(run.createdAt)],
    ["Last change", ago(run.updatedAt)],
    ["Claude spend", money(run.costUsd)],
    ["Length", duration(rec.durationSec)],
    ["Size", rec.width && rec.height ? `${rec.width} × ${rec.height}` : rec.format],
    ["Frames", rec.frames ?? rec.storyboard?.frames],
    ["Pages", rec.pages],
    ["Theme", rec.theme],
    ["Product", rec.product?.name ?? (typeof rec.brand === "string" ? rec.brand.replace(/^product folder:\s*/, "") : null)],
    ["Revisions", rec.revisions?.length || null],
    ["Branch", rec.branch],
    ["Pull request", /^https:\/\//.test(rec.publish?.prUrl ?? "") ? raw(`<a class="link" href="${esc(rec.publish.prUrl)}" target="_blank" rel="noopener">Open on GitHub</a>`) : null],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "");
  return html`<section class="card side-card"><h2>Details</h2><dl class="kv">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>${run.costUsd != null ? html`<p class="hint">Claude only. OpenAI and ElevenLabs bill separately.</p>` : ""}</section>`;
}

function filesCard(run) {
  return html`<section class="card side-card"><div class="spread"><h2>Files</h2><span class="muted">${run.files.length}</span></div>
    <ul class="file-list">${run.files.map(
      (f, i) => html`<li class="file-row">${f.key ? raw('<span class="key-dot" title="Key file"></span>') : raw('<span style="width:6px"></span>')}${icon(FILE_ICONS[f.kind], 17)}${VIEWABLE.has(f.kind) ? html`<button class="name link" style="text-decoration:none;font-weight:400;text-align:left" type="button" data-action="view-run-file" data-index="${i}">${f.name}</button>` : html`<a class="name" href="${f.url}?download">${f.name}</a>`}<span class="size">${bytes(f.size)}</span><a class="btn btn-ghost btn-icon btn-sm" href="${f.url}?download" aria-label="Download ${f.name}">${icon("download", 15)}</a></li>`,
    )}</ul>
    <div class="row row-wrap"><button class="btn btn-outline btn-sm" type="button" data-action="reveal" data-path="${run.folder}">${icon("folder", 16)}Show in folder</button><button class="btn btn-ghost btn-sm" type="button" data-action="copy" data-text="${run.folder}" data-what="Folder path copied">${icon("copy", 15)}Copy path</button></div></section>`;
}

function attentionCard(run) {
  const rec = run.record ?? {};
  const ph = rec.placeholders ?? [];
  const warn = rec.warnings ?? [];
  if (!ph.length && !warn.length) return "";
  return html`<section class="card side-card"><h2>Check before you share</h2>
    ${ph.length ? html`<div class="callout callout-amber"><strong>Placeholders to fill</strong><ul>${ph.map((p) => html`<li>${typeof p === "string" ? p : JSON.stringify(p)}</li>`)}</ul></div>` : ""}
    ${warn.length ? html`<div class="callout"><strong>Notes from the agent</strong><ul>${warn.map((w) => html`<li>${typeof w === "string" ? w : JSON.stringify(w)}</li>`)}</ul></div>` : ""}</section>`;
}

function previewBlock(run) {
  const p = run.primary;
  const gallery = (g) => html`<div class="gallery">${g.items.map((f, i) => html`<button type="button" data-action="view-gallery" data-gallery="${g.name}" data-index="${i}" aria-label="Open ${f.name}"><img src="${f.url}" alt="${f.name}" loading="lazy"></button>`)}</div>`;
  if (run.site)
    return html`<section class="card preview"><div class="spread" style="padding:12px 16px;background:var(--surface)"><div class="segmented" role="group" aria-label="Preview size"><button type="button" data-action="site-width" data-width="100%" aria-pressed="true">Desktop</button><button type="button" data-action="site-width" data-width="390px" aria-pressed="false">Phone</button></div><a class="btn btn-outline btn-sm" href="${run.site}" target="_blank" rel="noopener">${icon("external", 15)}Open the page</a></div><div style="display:grid;justify-items:center;background:var(--surface-sunk)"><iframe id="site-frame" src="${run.site}" title="Landing page preview" loading="lazy"></iframe></div>${run.galleries.length ? gallery(run.galleries[0]) : ""}</section>`;
  if (!p) return html`<section class="card preview" style="display:grid;place-items:center;padding:48px">${mascot(run.agent, 120)}<p class="muted" style="margin-top:12px">No preview for this one. The files are on the right.</p></section>`;
  if (p.kind === "video") return html`<section class="card preview"><video controls preload="metadata" playsinline ${run.thumb ? raw(`poster="${esc(run.thumb)}"`) : ""} src="${p.url}"></video></section>`;
  if (p.kind === "pdf") return html`<section class="card preview"><iframe src="${p.url}#view=FitH" title="PDF preview"></iframe></section>`;
  if (p.kind === "gallery") return html`<section class="card preview">${gallery(run.galleries[0])}</section>`;
  return html`<section class="card preview"><img src="${p.url}" alt="Preview" data-action="view-url" data-url="${p.url}"></section>`;
}

function docsBlock(run) {
  if (!run.docs.length) return "";
  const order = (f) => (run.rawStatus === "storyboard" && f.name === "storyboard.md" ? 0 : /^(post|caption)\.md$/i.test(f.name) ? 1 : /^brief\.md$/i.test(f.name) ? 9 : 5);
  const docs = [...run.docs].sort((a, b) => order(a) - order(b));
  S.runDocs = docs;
  return html`<section class="card" style="overflow:hidden"><div class="tabs" role="tablist">${docs.map((f, i) => html`<button type="button" role="tab" data-action="doc-tab" data-index="${i}" aria-selected="${i === 0}">${f.name}</button>`)}</div><div class="doc-body md" id="doc-body"><div class="loading"><span class="spinner"></span></div></div></section>`;
}

async function loadDoc(i) {
  const f = S.runDocs?.[i];
  const box = document.getElementById("doc-body");
  if (!f || !box) return;
  for (const b of main.querySelectorAll('[data-action="doc-tab"]')) b.setAttribute("aria-selected", String(Number(b.dataset.index) === i));
  try {
    const text = await (await fetch(f.url)).text();
    box.innerHTML = markdown(text, { base: f.url });
  } catch {
    box.textContent = "Couldn't read this file.";
  }
}

async function runView(r) {
  const [agentId, ...rest] = r.rest;
  S.runDocs = [];
  const run = await api(`/api/run?agent=${enc(agentId)}&id=${enc(rest.join("/"))}`).catch((e) => ({ error: e.message }));
  if (run.error) return html`<a class="back" href="#/work">${icon("back", 16)}All work</a><div class="card empty"><h2>Not found</h2><p>${run.error}</p></div>`;
  S.run = run;
  const galleriesBelow = run.primary?.kind === "pdf" || (run.primary?.kind === "video" && run.galleries.length) || (run.primary?.kind === "image" && run.galleries.length);
  return html`
    <a class="back" href="#/work">${icon("back", 16)}All work</a>
    <header class="run-head">${mascot(run.agent, 72)}<div class="grow"><span class="eyebrow">${agentName(run.agent)}</span><h1>${run.title}</h1>
      <div class="meta-line">${statusPill(run)}<span>${icon("clock", 15)}${when(run.createdAt)}</span>${run.costUsd != null ? html`<span>${icon("wallet", 15)}${money(run.costUsd)} Claude</span>` : ""}<span class="mono subtle" style="font-size:12.5px">${run.id}</span></div></div></header>
    <div class="run-grid">
      <div class="stack" style="gap:22px">
        ${previewBlock(run)}
        ${galleriesBelow ? run.galleries.map((g) => html`<section class="card"><div class="spread" style="padding:16px 20px 0"><h2 style="font-size:16px">${g.name === "png" ? "Pages and slides" : g.name}</h2><span class="muted">${g.items.length}</span></div>${html`<div class="gallery">${g.items.map((f, i) => html`<button type="button" data-action="view-gallery" data-gallery="${g.name}" data-index="${i}" aria-label="Open ${f.name}"><img src="${f.url}" alt="${f.name}" loading="lazy"></button>`)}</div>`}</section>`) : ""}
        ${run.record?.summary ? html`<section class="card card-pad"><h2 style="font-size:16px;margin-bottom:12px">What the agent says</h2><div class="md">${raw(markdown(run.record.summary))}</div></section>` : ""}
        ${docsBlock(run)}
      </div>
      <aside class="run-side">${nextCard(run, S.data)}${attentionCard(run)}${detailsCard(run)}${filesCard(run)}</aside>
    </div>`;
}

// ---------------------------------------------------------------- viewer (lightbox)

function viewer(items, index) {
  S.viewer = { items, index };
  showViewer();
}
async function showViewer() {
  const { items, index } = S.viewer;
  const f = items[index];
  const many = items.length > 1;
  let stage;
  if (f.kind === "image") stage = html`<img src="${f.url}" alt="${f.name}">`;
  else if (f.kind === "video") stage = html`<video src="${f.url}" controls autoplay playsinline></video>`;
  else if (f.kind === "audio") stage = html`<audio src="${f.url}" controls autoplay></audio>`;
  else if (f.kind === "pdf" || f.kind === "html") stage = html`<iframe src="${f.url}" title="${f.name}"></iframe>`;
  else if (f.kind === "markdown" || f.kind === "text") stage = html`<div class="doc md" id="viewer-doc"><div class="loading"><span class="spinner"></span></div></div>`;
  else stage = html`<div class="doc" style="text-align:center;padding:48px">${icon(FILE_ICONS[f.kind], 48)}<p style="margin:16px 0">${f.name} · ${bytes(f.size)}</p><a class="btn btn-lime" href="${f.url}?download">${icon("download", 16)}Download</a></div>`;
  openLayer(
    html`<div class="lightbox-frame">
      <div class="lightbox-bar"><span class="grow">${f.name}${many ? html` <span class="subtle">· ${index + 1} of ${items.length}</span>` : ""}${f.runTitle ? html` <span class="subtle">· ${f.runTitle}</span>` : ""}</span>
        ${f.run ? html`<a class="btn btn-ghost btn-sm" href="#/work/${enc(f.agent)}/${enc(f.run)}">Open the work</a>` : ""}
        <a class="btn btn-ghost btn-sm" href="${f.url}?download">${icon("download", 16)}Download</a>
        <button class="btn btn-ghost btn-icon btn-sm" type="button" data-action="close-layer" aria-label="Close">${icon("x", 18)}</button></div>
      <div class="lightbox-stage">${stage}${many ? html`<button class="lightbox-nav prev" type="button" data-action="viewer-step" data-step="-1" aria-label="Previous">${icon("back", 20)}</button><button class="lightbox-nav next" type="button" data-action="viewer-step" data-step="1" aria-label="Next">${icon("next", 20)}</button>` : ""}</div>
    </div>`,
    { kind: "lightbox", label: f.name },
  );
  if (f.kind === "markdown" || f.kind === "text") {
    const text = await (await fetch(f.url)).text().catch(() => "Couldn't read this file.");
    const box = document.getElementById("viewer-doc");
    if (box) box.innerHTML = f.kind === "markdown" ? markdown(text, { base: f.url }) : `<pre>${esc(text)}</pre>`;
  }
}

// ---------------------------------------------------------------- Files

const FILE_FILTERS = [
  ["all", "Everything", () => true],
  ["image", "Pictures", (f) => f.kind === "image"],
  ["video", "Videos", (f) => f.kind === "video" || f.kind === "audio"],
  ["pdf", "PDFs", (f) => f.kind === "pdf"],
  ["markdown", "Captions and docs", (f) => f.kind === "markdown"],
  ["other", "Other", (f) => !["image", "video", "audio", "pdf", "markdown"].includes(f.kind)],
];

function fileTile(f, i, run) {
  const kind = { image: "Picture", video: "Video", audio: "Audio", pdf: "PDF", markdown: "Text", html: "Page", archive: "ZIP" }[f.kind] ?? f.name.split(".").pop().toUpperCase();
  const visual = f.kind === "image" ? html`<img src="${f.url}" alt="" loading="lazy">` : f.kind === "video" && run?.thumb ? html`<img src="${run.thumb}" alt="" loading="lazy" style="filter:brightness(.8)"><span style="position:absolute;display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.9)">${icon("play", 22)}</span>` : icon(FILE_ICONS[f.kind], 40);
  return html`<button class="file-tile" type="button" data-action="view-file" data-index="${i}"><div class="thumb" style="${tileStyle(f.agent)}">${visual}<span class="pill pill-sm pill-outline kind">${kind}</span></div><div class="body"><div class="name" title="${f.name}">${f.group ? `${f.group}/` : ""}${f.name}</div><div class="sub">${bytes(f.size)}</div></div></button>`;
}

const files = {
  title: () => "Files",
  key: () => JSON.stringify([S.data.runs.map((r) => [r.id, r.updatedAt]), S.ui.files.kind]),
  async render() {
    const k = JSON.stringify(S.data.runs.map((r) => [r.id, r.updatedAt]));
    if (!S.files || S.filesKey !== k) {
      S.files = await api("/api/files");
      S.filesKey = k;
    }
    const f = S.ui.files;
    const test = FILE_FILTERS.find(([key]) => key === f.kind)?.[2] ?? (() => true);
    const q = f.q.trim().toLowerCase();
    const shown = S.files.filter((x) => test(x) && (!q || `${x.name} ${x.runTitle}`.toLowerCase().includes(q)));
    S.shownFiles = shown;
    const runs = new Map(S.data.runs.map((r) => [`${r.agent}/${r.id}`, r]));
    const groups = new Map();
    shown.forEach((x, i) => {
      const key = `${x.agent}/${x.run}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push([x, i]);
    });
    const total = S.files.reduce((s, x) => s + (x.size ?? 0), 0);
    return html`
      <div class="page-head"><div><span class="eyebrow">Files</span><h1>Every file, <em class="serif">in one place</em></h1><p class="lede">${S.files.length} files from ${S.data.runs.length} pieces of work, ${bytes(total)} in all. Click one to view it.</p></div></div>
      <div class="toolbar"><div class="segmented" role="group" aria-label="Type">${FILE_FILTERS.map(([key, label]) => html`<button type="button" data-action="files-filter" data-value="${key}" aria-pressed="${f.kind === key}">${label}</button>`)}</div>
        <label class="search"><span class="sr-only">Search files</span>${icon("search", 18)}<input class="input" type="search" placeholder="Search files" value="${f.q}" data-input="files-q" data-keep="files-q"></label></div>
      ${shown.length
        ? [...groups.entries()].map(([key, list]) => {
            const run = runs.get(key);
            return html`<div class="group-head"><div class="row">${mascot(list[0][0].agent, 32)}<div><h2>${list[0][0].runTitle}</h2><div class="muted" style="font-size:13.5px">${agentName(list[0][0].agent)} · ${run ? ago(run.updatedAt) : ""} · ${list.length} ${plural(list.length, "file")}</div></div></div>${run ? html`<a href="${runHref(run)}">Open the work</a>` : ""}</div>
              <div class="file-grid">${list.map(([x, i]) => fileTile(x, i, run))}</div>`;
          })
        : html`<div class="card empty"><h2>No files here yet</h2><p>${S.files.length ? "Try another type, or clear the search." : "What your agents make shows up here."}</p></div>`}`;
  },
};

// ---------------------------------------------------------------- Agents

function readyPill(a) {
  return a.ready ? html`<span class="pill pill-ready">Ready</span>` : html`<span class="pill pill-question">Needs setup</span>`;
}

const CHECK_HELP = {
  installed: (a) => html`<button class="btn btn-lime btn-sm" type="button" data-action="task" data-task="install" data-agent="${a.id}">${icon("box", 15)}Install</button>`,
  env: (a) => html`<button class="btn btn-outline btn-sm" type="button" data-action="create-env" data-agent="${a.id}">Create it</button>`,
  keys: () => html`<a class="btn btn-outline btn-sm" href="#/setup/connections">Add keys</a>`,
  claude: () => html`<a class="btn btn-outline btn-sm" href="#/setup/connections?open=claude">Connect Claude</a>`,
  chromium: (a) => html`<button class="btn btn-outline btn-sm" type="button" data-action="task" data-task="install" data-agent="${a.id}">Install</button>`,
  "hyperframes-chrome": (a) => html`<button class="btn btn-outline btn-sm" type="button" data-action="task" data-task="install" data-agent="${a.id}">Install</button>`,
  docker: () => html`<button class="btn btn-outline btn-sm" type="button" data-action="refresh-tools">Check again</button>`,
  ffmpeg: () => html`<button class="btn btn-outline btn-sm" type="button" data-action="copy" data-text="brew install ffmpeg" data-what="Command copied">Copy install command</button>`,
  node22: () => html`<a class="btn btn-outline btn-sm" href="https://nodejs.org/en/download" target="_blank" rel="noopener">Get Node</a>`,
};
const CHECK_TEXT = {
  installed: ["Installed", "Its packages and setup steps (npm install)"],
  env: ["Settings file", "Its .env, where keys and settings live"],
  keys: ["Required keys", ""],
  claude: ["Claude", ""],
  chromium: ["Chromium", "The browser it renders with"],
  docker: ["Docker", "Each run gets its own container: start Docker Desktop"],
  ffmpeg: ["FFmpeg", "Encodes the video"],
  node22: ["Node 22 or newer", ""],
  "hyperframes-chrome": ["HyperFrames' Chrome", "The browser that renders the frames"],
};

function checklist(a) {
  return html`<ul class="checklist">${a.checks.map((c) => {
    const [label, sub] = CHECK_TEXT[c.id] ?? [c.label, ""];
    const detail = c.ok ? (c.id === "claude" ? a.claude : sub) : c.problem;
    return html`<li class="check"><span class="tick ${c.ok ? "tick-ok" : "tick-no"}">${icon(c.ok ? "check" : "x", 14)}</span><div class="grow"><div>${label}</div>${detail ? html`<div class="sub">${detail}</div>` : ""}</div>${!c.ok && CHECK_HELP[c.id] ? CHECK_HELP[c.id](a) : ""}</li>`;
  })}</ul>`;
}

function agentTile(a) {
  const runs = S.data.runs.filter((r) => r.agent === a.id);
  return html`<a class="card agent-tile" href="#/agents/${a.id}"><div class="spread">${mascot(a.id, 72)}${readyPill(a)}</div><div><h2>${agentName(a.id)}</h2><p style="margin-top:6px">${agentTagline(a.id)}</p></div>
    <div class="foot"><span>${runs.length ? madeLine(runs) : "Nothing made yet"}</span><span>${runs[0] ? `Last ${ago(runs[0].updatedAt)}` : ""}</span></div></a>`;
}

async function settingsForm(id) {
  const s = await api(`/api/agents/${enc(id)}/settings`);
  const groups = new Map();
  for (const item of s.items) {
    const g = item.group || "Settings";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(item);
  }
  return html`<form data-form="settings" data-agent="${id}" class="stack" style="gap:6px">
    <p class="hint">Saved to <code>${s.file}</code>${s.exists ? "" : " (created from .env.example when you save)"}. Leave a key empty to keep it; blank a setting to use the default.</p>
    ${[...groups.entries()].map(
      ([g, items]) => html`<div class="settings-group"><h3>${g}</h3>${items.map(
        (it) => html`<div class="setting"><div><div class="name">${it.name}</div>${it.description ? html`<div class="desc">${it.description}</div>` : ""}</div><div>${
          it.secret
            ? html`<div class="input-wrap"><input class="input" type="password" name="${it.name}" data-secret="1" autocomplete="off" spellcheck="false" placeholder="${it.set ? "•••••••• saved, type to replace" : "Not set"}"><button type="button" class="reveal" data-action="reveal-input" aria-label="Show">${icon("eye", 16)}</button></div>${it.set ? html`<label class="hint row" style="gap:6px;margin-top:6px"><input type="checkbox" name="${it.name}__clear"> Remove it</label>` : ""}`
            : html`<input class="input" type="text" name="${it.name}" value="${it.current ?? ""}" data-orig="${it.current ?? ""}" placeholder="${it.value ? `Default: ${it.value}` : "Empty"}" autocomplete="off" spellcheck="false">`
        }</div></div>`,
      )}</div>`,
    )}
    <div class="row" style="justify-content:flex-end;padding-top:10px"><button class="btn btn-ghost" type="button" data-action="close-settings">Cancel</button><button class="btn btn-lime" type="submit">Save settings</button></div>
  </form>`;
}

function agentView(id) {
  const a = agentOf(id);
  if (!a) return html`<a class="back" href="#/agents">${icon("back", 16)}All agents</a><div class="card empty"><h2>No agent called ${id}</h2></div>`;
  const runs = S.data.runs.filter((r) => r.agent === id);
  const ask = AGENTS[id]?.ask;
  return html`
    <a class="back" href="#/agents">${icon("back", 16)}All agents</a>
    <header class="run-head">${mascot(id, 96)}<div class="grow"><span class="eyebrow">Agent · ${id}</span><h1>${agentName(id)}</h1><p class="muted" style="font-size:16.5px;max-width:70ch">${agentTagline(id)}</p>
      <div class="meta-line" style="margin-top:12px">${readyPill(a)}<span>${madeLine(runs)}${runs.some((r) => r.costUsd != null) ? " Claude spend" : ""}</span>${runs[0] ? html`<span>Last ${ago(runs[0].updatedAt)}</span>` : ""}</div></div>
      <button class="btn btn-orange" type="button" data-action="new-request" data-agent="${id}">New request</button></header>
    <div class="two-col">
      <div class="stack" style="gap:22px">
        <section class="card card-pad stack" style="gap:16px"><h2>Recent work</h2>${runs.length ? html`<div class="work-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${runs.slice(0, 6).map(workCard)}</div>${runs.length > 6 ? html`<button class="link" type="button" data-action="work-for" data-agent="${id}" style="justify-self:start">See all ${runs.length}</button>` : ""}` : html`<p class="muted">Nothing yet.</p>`}</section>
        <section class="card card-pad stack" style="gap:14px"><h2>How to use it</h2>
          ${ask ? html`<p class="muted">Ask Claude in this folder, in your own words. For example:</p><div class="example"><span class="grow">“${ask}”</span><button class="btn btn-ghost btn-icon btn-sm" type="button" data-action="copy" data-text="${ask}" aria-label="Copy">${icon("copy", 15)}</button></div>` : ""}
          <details class="more" data-keep="howto"><summary>${icon("chevron", 14)}Run it yourself</summary><div>${cmd(a.example ? `cd ${a.dir} && ${a.example}` : `cd ${a.dir} && ${a.command} --file <brief>`)}${a.web ? html`<p class="hint">Its own web app: run this, then open <a class="link" href="${a.web.url}" target="_blank" rel="noopener">${a.web.url}</a></p>${cmd(`node scripts/agents.mjs web ${id}`)}` : ""}<p class="hint">Full guide: <code>${a.skill}</code> and <code>${a.dir}/README.md</code></p></div></details>
          <details class="more"><summary>${icon("chevron", 14)}What it does, in detail</summary><div><p class="muted">${a.summary}</p></div></details>
        </section>
      </div>
      <div class="stack" style="gap:22px">
        <section class="card card-pad stack" style="gap:12px"><div class="spread"><h2>Ready to work?</h2><button class="btn btn-ghost btn-sm" type="button" data-action="refresh-tools">${icon("refresh", 15)}Check again</button></div>${checklist(a)}
          <div class="row row-wrap">${a.checks.find((c) => c.id === "installed")?.ok ? html`<button class="btn btn-outline btn-sm" type="button" data-action="task" data-task="test" data-agent="${id}">${icon("flask", 15)}Run the free self-test</button>` : ""}</div>
          <div data-task-agent="${id}"></div></section>
        <section class="card card-pad stack" style="gap:12px"><div class="spread"><h2>Keys</h2><a class="link" href="#/setup/connections">Manage</a></div>
          <ul class="key-list">${a.keys.map((k) => html`<li><span><code>${k.name}</code> <span class="muted">${k.required ? "required" : "optional"}</span></span><span class="status-text"><span class="dot ${k.set ? "dot-green" : ""}"></span>${k.set ? (k.source === "shell" ? "From your shell" : "Saved") : "Not set"}</span></li>`)}</ul>
          ${a.claudeAuth === "login-or-key" ? html`<p class="hint">Uses your Claude Code login when no Claude key is set.</p>` : ""}</section>
        <section class="card card-pad stack" style="gap:12px" id="settings-card"><div class="spread"><h2>Settings</h2>${a.hasExample ? html`<button class="btn btn-outline btn-sm" type="button" data-action="edit-settings" data-agent="${id}">${icon("sliders", 15)}Edit</button>` : ""}</div><p class="hint">Budget per run, models, image quality, ports: everything in its <code>.env</code>.</p><div id="settings-form"></div></section>
      </div>
    </div>`;
}

const agents = {
  title: (r) => (r.rest[0] ? agentName(r.rest[0]) : "Agents"),
  key: (r) => JSON.stringify([S.data.agents.map((a) => [a.ready, a.checks.map((c) => c.ok), a.keys.map((k) => k.set)]), S.data.runs.map((x) => [x.id, x.status]), r.rest[0]]),
  render(r) {
    if (r.rest[0]) return agentView(r.rest[0]);
    const ready = S.data.agents.filter((a) => a.ready).length;
    return html`<div class="page-head"><div><span class="eyebrow">Agents</span><h1>${capitalize(words(S.data.agents.length))} specialists, <em class="serif">one brand</em></h1><p class="lede">Each makes one kind of thing, in your product's brand and voice. ${ready === S.data.agents.length ? "All of them are ready." : `${capitalize(words(ready))} of ${words(S.data.agents.length)} are ready.`}</p></div><a class="btn btn-outline" href="#/setup/agents">${icon("sliders", 16)}Set up agents</a></div>
      <div class="agents-grid">${S.data.agents.map(agentTile)}</div>`;
  },
};

// ---------------------------------------------------------------- Knowledge

async function openDoc(p) {
  openLayer(html`<div class="drawer"><div class="drawer-head"><div class="grow"><span class="eyebrow">Product folder</span></div><button class="btn btn-ghost btn-icon btn-sm" type="button" data-action="close-layer" aria-label="Close">${icon("x", 18)}</button></div><div class="drawer-body"><div class="loading"><span class="spinner"></span></div></div></div>`, { kind: "drawer", label: "Document" });
  try {
    const doc = await api(`/api/doc?path=${enc(p)}`);
    const known = S.data.product.docs.find((d) => d.path === p) ?? { path: p, title: doc.data.title ?? p };
    const body = layer.querySelector(".drawer-body");
    const head = layer.querySelector(".drawer-head .grow");
    if (!body) return;
    head.innerHTML = String(html`<span class="eyebrow">${p}</span><h2>${docName(known)}</h2>`);
    const meta = [doc.data.status ? trustPill(doc.data.status) : "", doc.data.updated ? html`<span class="muted">Updated ${when(doc.data.updated, { short: true })}</span>` : "", doc.data.review ? html`<span class="muted">Reviewed ${doc.data.review}</span>` : ""];
    body.innerHTML = String(html`<div class="row row-wrap" style="margin-bottom:18px">${meta}<span class="grow"></span><button class="btn btn-outline btn-sm" type="button" data-action="reveal" data-path="${doc.file}">${icon("folder", 15)}Show in folder</button></div>
      ${doc.data.status === "draft" ? html`<div class="callout callout-amber" style="margin-bottom:18px">A draft: the agents treat it as direction, never as facts to quote.</div>` : ""}
      <div class="md">${raw(markdown(doc.body, { base: doc.url }))}</div>`);
  } catch (e) {
    const body = layer.querySelector(".drawer-body");
    if (body) body.textContent = e.message;
  }
}

const knowledge = {
  title: () => "Knowledge",
  key: (r) => JSON.stringify([S.data.product.name, S.data.product.docs.map((d) => [d.path, d.status]), S.ui.docs, r.params.get("group")]),
  render(r) {
    const p = S.data.product;
    if (!p.name) return knowledgeEmpty();
    const counts = { verified: 0, draft: 0, template: 0, ...p.counts };
    const filter = S.ui.docs;
    const docs = p.docs.filter((d) => filter === "all" || d.status === filter);
    const groups = GROUPS.map(([g, label]) => [g, label, docs.filter((d) => groupOf(d.path) === g)]).concat([["~", "Other", docs.filter((d) => !GROUPS.some(([g]) => g === groupOf(d.path)))]]).filter(([, , list]) => list.length);
    return html`
      <div class="page-head"><div><span class="eyebrow">Knowledge</span><h1>Your product, <em class="serif">as the agents know it</em></h1><p class="lede">Every agent reads this folder before it works: brand, voice, facts and offers. Verified documents are facts; drafts are direction.</p></div></div>
      <section class="card product-head">${p.logo ? html`<img class="logo" src="${p.logo}" alt="${p.name}">` : mascot("default", 56)}
        <div class="grow"><h2>${p.name}</h2><p class="muted">${p.tagline ?? p.oneLiner ?? ""}</p></div>
        <div class="row row-wrap">${p.ok ? html`<span class="pill pill-ready">${icon("check", 14)}Check passed</span>` : html`<span class="pill pill-failed">${p.errors ?? 0} ${plural(p.errors ?? 0, "problem")}</span>`}${p.warnings ? html`<span class="pill pill-question">${p.warnings} ${plural(p.warnings, "warning")}</span>` : ""}${p.website ? html`<a class="btn btn-outline btn-sm" href="${p.website}" target="_blank" rel="noopener">${icon("globe", 15)}Website</a>` : ""}<button class="btn btn-ghost btn-sm" type="button" data-action="reveal" data-path="${p.absDir}">${icon("folder", 15)}Folder</button></div>
      </section>
      <div class="toolbar"><div class="segmented" role="group" aria-label="Trust">${[["all", `All ${p.docs.length}`], ["verified", `Verified ${counts.verified}`], ["draft", `Draft ${counts.draft}`], ["template", `Empty ${counts.template}`]].map(([k, l]) => html`<button type="button" data-action="docs-filter" data-value="${k}" aria-pressed="${filter === k}">${l}</button>`)}</div>
        <button class="btn btn-outline btn-sm" type="button" data-action="copy" data-text="We changed something about the product: <what changed, or a link>. Update the product folder." data-what="Copied: paste it into Claude and fill in the change">${icon("copy", 15)}Ask Claude to update it</button></div>
      <div class="doc-groups">${groups.map(([g, label, list]) => html`<section class="card" id="group-${g || "basics"}"><div class="panel-head"><span class="label-caps">${label}</span><span class="count">${list.length}</span></div><ul class="panel-list">${list.map(docRow)}</ul></section>`)}</div>`;
  },
  after(r) {
    const g = r.params.get("group");
    if (g) document.getElementById(`group-${g}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (r.rest.length) openDoc(r.rest.join("/"));
  },
};

function knowledgeEmpty() {
  return html`<div class="hero hero-slim"><div class="hero-inner"><span class="eyebrow">Knowledge</span><h1 style="font-size:clamp(30px,4vw,48px)">Tell the agents about <span class="serif">your product</span></h1><p class="lede">Brand, voice, facts and offers live in one folder that every agent reads. Claude fills it in from your website and documents.</p><a class="btn btn-lime btn-lg" href="#/setup/product">Set up your product</a></div></div>`;
}

// ---------------------------------------------------------------- Setup

const STEPS = [
  ["welcome", "Welcome"],
  ["product", "Your product"],
  ["connections", "Connections"],
  ["agents", "Agents"],
  ["done", "Start working"],
];

function stepper(current) {
  const at = STEPS.findIndex(([k]) => k === current);
  return html`<ol class="stepper">${STEPS.map(([k, label], i) => html`<li><a href="#/setup/${k}" class="${i < at ? "done" : ""}" ${i === at ? raw('aria-current="step"') : ""}><span class="n">${i < at ? icon("check", 14) : i + 1}</span>${label}</a></li>`)}</ol>`;
}
const stepNav = (back, next, nextLabel = "Continue") =>
  html`<div class="setup-nav">${back ? html`<a class="btn btn-ghost" href="#/setup/${back}">${icon("back", 16)}Back</a>` : html`<span></span>`}<a class="btn btn-lime" href="#/setup/${next}">${nextLabel}${icon("next", 16)}</a></div>`;

function welcomeStep() {
  const name = prefs.get("name", S.data.user) || "";
  const ready = S.data.agents.filter((a) => a.ready).length;
  return html`<section class="hero"><div class="hero-inner">
    <span class="eyebrow">superproduct · setup</span>
    <h1>Your agents, <span class="serif">ready to work</span></h1>
    <p class="lede">${capitalize(words(S.data.agents.length))} AI agents make carousels, collage posts, decks, explainer videos, landing pages and app features for your product. This takes a few minutes: your product, your keys, then a quick check of each agent.</p>
    <form class="prompt-box" data-form="name"><div class="grow"><label for="your-name">What should we call you?</label><input id="your-name" name="name" value="${name}" placeholder="Your first name" autocomplete="given-name" data-keep="name"></div><button class="btn-round-lime" type="submit" aria-label="Continue">${icon("up", 22)}</button></form>
    <div class="hero-actions"><button class="btn btn-lime btn-lg" type="button" data-action="save-name">Let's start</button><button class="btn btn-glass btn-lg" type="button" data-action="skip-setup">Skip for now</button></div>
    <p class="hero-note">${ready} of ${S.data.agents.length} agents are ready already · keys stay on this computer</p>
  </div></section>`;
}

function productStep() {
  const p = S.data.product;
  const body = p.name
    ? html`<div class="card product-head" style="margin:0">${p.logo ? html`<img class="logo" src="${p.logo}" alt="">` : mascot("default", 56)}<div class="grow"><h2>${p.name}</h2><p class="muted">${p.tagline ?? ""}</p></div>${p.ok ? html`<span class="pill pill-ready">${icon("check", 14)}Check passed</span>` : html`<span class="pill pill-failed">${p.errors} ${plural(p.errors ?? 0, "problem")}</span>`}</div>
      <div class="stats"><div class="stat"><div class="n">${p.counts.verified ?? 0}</div><div class="l">verified documents</div></div><div class="stat"><div class="n">${p.counts.draft ?? 0}</div><div class="l">drafts</div></div><div class="stat"><div class="n">${p.counts.template ?? 0}</div><div class="l">still empty</div></div><div class="stat"><div class="n">${p.offerings ?? 0}</div><div class="l">offers</div></div></div>
      <p class="muted">Every agent reads this folder: ${p.dir}/. To change something, tell Claude (“we changed our prices: &lt;link&gt;”) or browse it under <a class="link" href="#/knowledge">Knowledge</a>.</p>`
    : html`<div class="callout callout-amber">No product folder yet. The agents still run, on neutral built-in defaults.</div>
      <form class="stack" style="gap:14px" data-form="product-prompt"><div class="field"><label for="p-site">Your website</label><input class="input" id="p-site" name="site" placeholder="https://yourcompany.com" data-keep="p-site"></div><div class="field"><label for="p-more">Anything else Claude should read?</label><input class="input" id="p-more" name="more" placeholder="our pitch deck in ~/Documents, our LinkedIn page" data-keep="p-more"></div><button class="btn btn-lime" type="submit" style="justify-self:start">${icon("copy", 16)}Copy the request for Claude</button></form>
      <p class="hint">Paste it into Claude Code opened in this folder. It captures your sources, measures your brand from the site, writes the brief, facts, offers and voice, and marks guesses as drafts.</p>`;
  return html`<section class="card setup-card"><header><span class="eyebrow">Step 2 · Your product</span><h1>The product the agents <em class="serif">work for</em></h1><p>Brand colours, fonts and logo, how you sound, the facts they may state and what you sell: all in one folder, read by every agent.</p></header>${body}${stepNav("welcome", "connections")}</section>`;
}

function connBody(c) {
  const agentsUsing = c.agents;
  if (c.id === "claude") {
    const v = S.ui.claudeVar;
    const takers = agentsUsing.filter((pa) => pa.vars.some((x) => x.name === v));
    const lacking = new Set(S.data.agents.filter((a) => !a.claude).map((a) => a.id));
    return html`<div class="conn-body">
      <p class="muted">Every agent thinks and writes with Claude. Most can use your Claude Code login on this computer (your subscription). The collage agent needs an API key, and the dev agent a subscription token or an API key, because its runs happen in containers.</p>
      <ul class="checklist">${S.data.agents.map((a) => html`<li class="check"><span class="tick ${a.claude ? "tick-ok" : "tick-no"}">${icon(a.claude ? "check" : "x", 14)}</span>${mascot(a.id, 28)}<div class="grow">${agentName(a.id)}<div class="sub">${a.claude ?? (a.claudeAuth === "key" ? "Needs an API key" : a.claudeAuth === "token-or-key" ? "Needs a subscription token or an API key" : "Log in to Claude Code, or add a key")}</div></div></li>`)}</ul>
      <div class="segmented" role="group" aria-label="Kind of credential"><button type="button" data-action="claude-var" data-value="ANTHROPIC_API_KEY" aria-pressed="${v === "ANTHROPIC_API_KEY"}">API key</button><button type="button" data-action="claude-var" data-value="CLAUDE_CODE_OAUTH_TOKEN" aria-pressed="${v === "CLAUDE_CODE_OAUTH_TOKEN"}">Subscription token</button></div>
      ${v === "ANTHROPIC_API_KEY" ? html`<p class="hint">A pay-as-you-go key from <a class="link" href="${c.url}" target="_blank" rel="noopener">platform.claude.com</a>. Where it's saved it takes precedence over your subscription login, and is billed per use, so save it only where it's needed.</p>` : html`<p class="hint">Your subscription as a token. Run this in a terminal and paste what it prints:</p>${cmd("claude setup-token")}`}
      ${keyForm(v, takers.map((pa) => pa.id), (id) => lacking.has(id), takers)}
    </div>`;
  }
  const v = c.vars[0];
  return html`<div class="conn-body"><p class="muted">${CONN_COPY[c.id] ?? c.role}</p>${keyForm(v, agentsUsing.map((pa) => pa.id), () => true, agentsUsing, c.url)}</div>`;
}

function keyForm(name, ids, preselect, perAgent, url) {
  if (!ids.length) return html`<p class="hint">No agent uses ${name}.</p>`;
  const setIn = perAgent.filter((pa) => pa.vars.some((x) => x.name === name && x.set)).map((pa) => pa.id);
  return html`<form class="stack" style="gap:14px" data-form="key" data-var="${name}">
    ${setIn.length ? html`<div class="callout"><span class="status-text"><span class="dot dot-green"></span>Saved for ${setIn.map(agentName).join(", ")}</span></div>` : ""}
    <div class="field"><label for="k-${name}">${setIn.length ? "Replace it" : "Paste it"} <span class="muted mono" style="font-weight:500">${name}</span></label>
      <div class="input-group"><div class="input-wrap"><input class="input" id="k-${name}" type="password" name="value" autocomplete="off" spellcheck="false" placeholder="Paste the key" data-keep="k-${name}"><button type="button" class="reveal" data-action="reveal-input" aria-label="Show the key">${icon("eye", 16)}</button></div><button class="btn btn-lime" type="submit">Save</button></div>
      ${url ? html`<span class="hint">Get one at <a class="link" href="${url}" target="_blank" rel="noopener">${url.replace(/^https:\/\//, "")}</a>. It goes into each chosen agent's .env and is never shown again.</span>` : html`<span class="hint">It goes into each chosen agent's .env and is never shown again.</span>`}</div>
    <div class="field"><span class="label">Save it for</span><div class="chips">${ids.map((id) => html`<label class="chip"><input type="checkbox" name="agents" value="${id}" ${preselect(id) ? raw("checked") : ""} data-keep="ka-${name}-${id}">${mascot(id, 22, { bare: true })}${agentName(id)}</label>`)}</div></div>
    ${setIn.length ? html`<button class="link" type="button" data-action="remove-key" data-var="${name}" data-agents="${setIn.join(",")}" style="justify-self:start;color:var(--red-ink);text-decoration-color:currentColor">Remove it from ${setIn.length === 1 ? agentName(setIn[0]) : `all ${setIn.length} agents`}</button>` : ""}
  </form>`;
}

function connectionsStep(r) {
  const asked = r.params.get("open");
  if (asked && S.ui.openParam !== r.hash) {
    S.ui.openConn = asked;
    S.ui.openParam = r.hash;
  }
  if (S.ui.openConn === null) S.ui.openConn = S.data.connections.find((c) => c.state !== "connected")?.id ?? "claude";
  const label = { connected: ["Connected", "pill-ready"], partial: ["Partly", "pill-question"], missing: ["Not connected", "pill-outline"] };
  return html`<section class="card setup-card"><header><span class="eyebrow">Step 3 · Connections</span><h1>Connect the services <em class="serif">they use</em></h1><p>Claude does the thinking and writing. OpenAI makes pictures, ElevenLabs voices and music, GitHub takes code changes. Only Claude is essential; the rest add to what the agents can do.</p></header>
    <div>${S.data.connections.map((c) => {
      const open = S.ui.openConn === c.id;
      const [l, cls] = c.state === "missing" && !c.required && !c.essential ? ["Optional", "pill-muted"] : label[c.state];
      return html`<div class="conn ${open ? "open" : ""}" id="conn-${c.id}"><button type="button" data-action="toggle-conn" data-id="${c.id}" aria-expanded="${open}"><span class="icon-tile">${icon(CONN_ICONS[c.id], 22)}</span><div class="grow"><div class="title">${c.label}</div><div class="sub">${c.role} · ${c.detail}</div></div><span class="pill ${cls}">${l}</span>${icon("down", 18)}</button>${open ? connBody(c) : ""}</div>`;
    })}</div>
    <p class="hint">Keys are written to <code>agents/&lt;agent&gt;/.env</code> on this computer, which git ignores. The dashboard never shows them again; it only says which are set.</p>
    ${stepNav("product", "agents")}</section>`;
}

function agentsStep() {
  const missing = S.data.agents.filter((a) => !a.checks.find((c) => c.id === "installed")?.ok).map((a) => a.id);
  const running = S.data.tasks.some((t) => t.status === "running");
  if (S.ui.openAgent === null) S.ui.openAgent = S.data.agents.find((a) => !a.ready)?.id ?? "";
  return html`<section class="card setup-card"><header><span class="eyebrow">Step 4 · Agents</span><h1>Check each <em class="serif">agent</em></h1><p>Each agent needs its packages installed, its keys, and sometimes a program on this computer (Chromium, Docker, FFmpeg). Installing and the self-tests cost nothing.</p></header>
    <div class="row row-wrap">${missing.length ? html`<button class="btn btn-lime" type="button" data-action="install-missing" data-agents="${missing.join(",")}" ${running ? raw("disabled") : ""}>${icon("box", 16)}Install the ${missing.length === 1 ? "missing agent" : `${missing.length} missing agents`}</button>` : html`<span class="pill pill-ready">${icon("check", 14)}All installed</span>`}<button class="btn btn-outline" type="button" data-action="refresh-tools">${icon("refresh", 16)}Check again</button>${S.data.coworkVm ? html`<span class="hint">In Cowork: install and run agents in a terminal on your computer.</span>` : ""}</div>
    <div>${S.data.agents.map((a) => {
      const open = S.ui.openAgent === a.id;
      return html`<div class="setup-agent"><header data-action="toggle-agent" data-id="${a.id}" role="button" tabindex="0" aria-expanded="${open}">${mascot(a.id, 48)}<div class="grow"><div class="title">${agentName(a.id)}</div><div class="sub">${a.ready ? agentTagline(a.id) : a.problems.join(" · ")}</div></div>${readyPill(a)}${icon(open ? "down" : "chevron", 18)}</header>
        ${open ? html`<div class="body">${checklist(a)}<div class="row row-wrap">${a.checks.find((c) => c.id === "installed")?.ok ? html`<button class="btn btn-outline btn-sm" type="button" data-action="task" data-task="test" data-agent="${a.id}">${icon("flask", 15)}Run the free self-test</button>` : ""}<a class="btn btn-ghost btn-sm" href="#/agents/${a.id}">${icon("sliders", 15)}Settings and budget</a></div><div data-task-agent="${a.id}"></div></div>` : ""}</div>`;
    })}</div>
    ${stepNav("connections", "done")}</section>`;
}

function doneStep() {
  const ready = S.data.agents.filter((a) => a.ready);
  return html`<section class="hero hero-slim"><div class="hero-inner"><span class="eyebrow">Step 5 · Start working</span><h1 style="font-size:clamp(34px,5vw,58px)">You're <span class="serif">set</span></h1><p class="lede">${ready.length === S.data.agents.length ? "Every agent is ready." : `${capitalize(words(ready.length))} of ${S.data.agents.length} agents are ready; the others can wait until you need them.`} From here, you ask and they make.</p></div></section>
    <section class="card setup-card" style="margin-top:22px"><div class="stack" style="gap:18px">
      <div class="stack" style="gap:10px"><h2>1. Open Claude in this folder</h2><p class="muted">Claude Code in a terminal, or Cowork in the Claude desktop app with this folder connected.</p>${cmd(`${kitCd()} && claude`)}</div>
      <div class="stack" style="gap:10px"><h2>2. Ask for what you need</h2><p class="muted">In your own words. Claude picks the agent, writes the brief, runs it with a budget and checks the result.</p>
        <div class="examples">${Object.entries(AGENTS).filter(([id]) => agentOf(id)).map(([id, a]) => html`<div class="example">${mascot(id, 32)}<span class="grow">“${a.ask}”</span><button class="btn btn-ghost btn-icon btn-sm" type="button" data-action="copy" data-text="${a.ask}" aria-label="Copy">${icon("copy", 15)}</button></div>`)}</div></div>
      <div class="stack" style="gap:10px"><h2>3. Watch it here</h2><p class="muted">Results land in Work and Files. When an agent has a question (a storyboard to approve, a plan to review), it shows up on Home.</p></div>
      <div class="setup-nav"><a class="btn btn-ghost" href="#/setup/agents">${icon("back", 16)}Back</a><button class="btn btn-lime btn-lg" type="button" data-action="finish-setup">Go to Home${icon("next", 16)}</button></div>
    </div></section>`;
}

const setup = {
  title: () => "Setup",
  key: (r) => JSON.stringify([S.data.agents.map((a) => [a.ready, a.claude, a.checks.map((c) => c.ok), a.keys.map((k) => k.set)]), S.data.connections.map((c) => [c.state, c.detail]), S.data.product.name, S.data.tasks.map((t) => [t.id, t.status]), S.ui.openConn, S.ui.openAgent, S.ui.claudeVar, r.rest[0]]),
  render(r) {
    const step = STEPS.some(([k]) => k === r.rest[0]) ? r.rest[0] : "welcome";
    const body = { welcome: welcomeStep, product: productStep, connections: () => connectionsStep(r), agents: agentsStep, done: doneStep }[step]();
    return html`${step === "welcome" ? "" : stepper(step)}${body}`;
  },
  after(r, { sameRoute }) {
    const open = r.params.get("open");
    if (open && !sameRoute) document.getElementById(`conn-${open}`)?.scrollIntoView({ block: "center" });
  },
};

const VIEWS = { home, work, files, agents, knowledge, setup };

// ---------------------------------------------------------------- new request

const ROUTES = [
  ["explainer", /video|explainer|animat|reel|motion|tiktok|shorts|youtube/i],
  ["collage-post", /collage|instagram|cut-?out|editorial post|torn paper/i],
  ["carousel", /carousel|linkedin/i],
  ["deck", /deck|presentation|slides?\b|report|board|qbr|pitch/i],
  ["landing-page", /landing|website|web ?page|\bpage\b|\bsite\b/i],
  ["dev", /implement|\bfix\b|bug|feature|repo|github|pull request|\bapp\b|codebase/i],
];

function newRequest(agent) {
  S.request = { agent: agent ?? null, auto: !agent };
  openLayer(
    html`<form class="modal" data-form="request">
      <div class="modal-head"><div><h2>New request</h2><p>Describe what you need. Claude writes the brief and runs the right agent.</p></div><button class="btn btn-ghost btn-icon btn-sm" type="button" data-action="close-layer" aria-label="Close">${icon("x", 18)}</button></div>
      <div class="modal-body">
        <div class="field"><label for="req-text">What should your agents make?</label><textarea class="textarea" id="req-text" name="text" autofocus placeholder="A LinkedIn carousel about our winter offer: three numbers, portrait, five slides." data-input="request-text"></textarea></div>
        <div class="field"><span class="label">Who makes it?</span><div class="chips" id="req-agents">${requestChips()}</div></div>
        <div class="callout" id="req-how">${requestHow()}</div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" type="button" data-action="close-layer">Cancel</button><button class="btn btn-lime" type="button" data-action="copy-request">${icon("copy", 16)}Copy for Claude</button></div>
    </form>`,
    { label: "New request" },
  );
}
function requestChips() {
  const cur = S.request.agent;
  return html`<button class="chip" type="button" data-action="req-agent" data-value="" aria-pressed="${!cur}">${icon("sparkle", 16)}Let Claude choose</button>${S.data.agents.map((a) => html`<button class="chip" type="button" data-action="req-agent" data-value="${a.id}" aria-pressed="${cur === a.id}">${mascot(a.id, 22, { bare: true })}${agentName(a.id)}</button>`)}`;
}
function requestHow() {
  const a = S.request.agent && agentOf(S.request.agent);
  return html`<strong>How it runs:</strong> paste the request into Claude Code or Cowork opened in this folder. It writes the brief, runs ${a ? `the ${agentName(a.id).toLowerCase()} agent` : "the right agent"} with a budget, and the result shows up here.${a && !a.ready ? html`<div style="margin-top:8px;color:var(--amber-ink)">${agentName(a.id)} isn't ready yet: <a class="link" href="#/agents/${a.id}">see what it needs</a>.</div>` : ""}${a?.web ? html`<div class="hint" style="margin-top:8px">Or use its own app: <code>node scripts/agents.mjs web ${a.id}</code> → ${a.web.url}</div>` : ""}`;
}
function refreshRequest() {
  const chips = document.getElementById("req-agents");
  const how = document.getElementById("req-how");
  if (chips) chips.innerHTML = String(requestChips());
  if (how) how.innerHTML = String(requestHow());
}

// ---------------------------------------------------------------- dev-agent questions

function answerModal(id) {
  const item = S.data.pending.find((p) => p.id === id);
  if (!item) return toast("That question was already answered", { error: true });
  const isApproval = item.kind === "approval";
  const question = (q) => {
    const defaults = [].concat(q.default ?? []);
    if (q.secretEnv)
      return html`<div class="callout callout-amber">This one is a secret. Add <code>${q.secretEnv}=…</code> to <code>${item.secretsFile ?? "the project's secrets.env"}</code> yourself, then tick the box.<label class="row" style="margin-top:10px;gap:8px"><input type="checkbox" name="q:${q.id}" value="__in_secrets_file__"> I added it</label></div>`;
    const opts = q.options ?? [];
    return html`${opts.length ? html`<div class="stack" style="gap:8px">${opts.map((o) => html`<label class="example" style="cursor:pointer"><input type="${q.multiSelect ? "checkbox" : "radio"}" name="q:${q.id}" value="${o.label}" ${defaults.includes(o.label) ? raw("checked") : ""}><span class="grow"><strong>${o.label}</strong>${o.description ? html`<div class="hint">${o.description}</div>` : ""}</span></label>`)}</div>` : ""}
      ${!opts.length || q.allowOther ? html`<input class="input" name="other:${q.id}" placeholder="${opts.length ? "Or your own answer" : "Your answer"}" value="${!opts.length && typeof q.default === "string" ? q.default : ""}">` : ""}`;
  };
  openLayer(
    html`<form class="modal modal-wide" data-form="answer" data-id="${item.id}" data-kind="${item.kind}">
      <div class="modal-head"><div><span class="eyebrow">${agentName("dev")} · ${item.scope ?? ""}</span><h2 style="margin-top:6px">${isApproval ? "Approve the plan?" : "Questions from the dev agent"}</h2>${item.context ? html`<p>${item.context}</p>` : ""}</div><button class="btn btn-ghost btn-icon btn-sm" type="button" data-action="close-layer" aria-label="Close">${icon("x", 18)}</button></div>
      <div class="modal-body">
        ${isApproval
          ? html`<p class="muted">The agent wrote a product requirements document and a milestone plan. Read them, then approve, ask for changes, or cancel the run.</p><div class="row row-wrap">${item.prdUrl ? html`<button class="btn btn-outline" type="button" data-action="view-url" data-url="${item.prdUrl}" data-name="PRD.md">${icon("doc", 16)}Read the PRD</button>` : ""}${item.planUrl ? html`<button class="btn btn-outline" type="button" data-action="view-url" data-url="${item.planUrl}" data-name="PLAN.md">${icon("doc", 16)}Read the plan</button>` : ""}</div><div class="field"><label for="feedback">Changes you want (for “Ask for changes”)</label><textarea class="textarea" id="feedback" name="feedback"></textarea></div>`
          : (item.questions ?? []).map((q) => html`<fieldset class="stack" style="gap:10px;border:0;padding:0;margin:0"><legend style="font-weight:600;margin-bottom:8px">${q.header ? html`<span class="eyebrow" style="display:block;margin-bottom:4px">${q.header}</span>` : ""}${q.question}</legend>${question(q)}</fieldset>`)}
      </div>
      <div class="modal-foot">${isApproval ? html`<button class="btn btn-ghost" type="submit" data-decision="cancel" style="color:var(--red-ink)">Cancel the run</button><button class="btn btn-outline" type="submit" data-decision="revise">Ask for changes</button><button class="btn btn-lime" type="submit" data-decision="approve">${icon("check", 16)}Approve</button>` : html`<button class="btn btn-ghost" type="button" data-action="close-layer">Later</button><button class="btn btn-lime" type="submit">Send answers</button>`}</div>
    </form>`,
    { label: "Answer the dev agent" },
  );
}

// ---------------------------------------------------------------- actions

const ACTIONS = {
  "new-request": (el) => newRequest(el.dataset.agent),
  "close-layer": () => closeLayer(),
  "close-layer-backdrop": (el, e) => e.target === el && closeLayer(),
  copy: (el) => copy(el.dataset.text, el.dataset.what ?? "Copied"),
  "copy-change": (el) => {
    const text = el.closest(".side-card")?.querySelector("textarea")?.value.trim();
    if (!text) return toast("Write what should change first", { error: true });
    copy(`${el.dataset.template}${text}`, "Copied: paste it into Claude");
  },
  "copy-request": () => {
    const text = layer.querySelector("#req-text")?.value.trim();
    if (!text) return toast("Describe what you need first", { error: true });
    const a = S.request.agent;
    copy(a ? `${text}\n\n(Use the ${a} agent.)` : text, "Copied: paste it into Claude Code in this folder");
    closeLayer();
  },
  "req-agent": (el) => {
    S.request.agent = el.dataset.value || null;
    S.request.auto = false;
    refreshRequest();
  },
  "dismiss-welcome": () => {
    prefs.set("onboarded", true);
    render({ force: true });
  },
  "work-filter": (el) => {
    S.ui.work[el.dataset.key] = el.dataset.value;
    render({ force: true });
  },
  "work-for": (el) => {
    S.ui.work = { agent: el.dataset.agent, status: "all", q: "" };
    location.hash = "#/work";
  },
  "files-filter": (el) => {
    S.ui.files.kind = el.dataset.value;
    render({ force: true });
  },
  "docs-filter": (el) => {
    S.ui.docs = el.dataset.value;
    render({ force: true });
  },
  "doc-tab": (el) => loadDoc(Number(el.dataset.index)),
  "view-run-file": (el) => {
    const run = S.run;
    const items = run.files.filter((f) => VIEWABLE.has(f.kind));
    const f = run.files[Number(el.dataset.index)];
    viewer(items, items.indexOf(f));
  },
  "view-gallery": (el) => {
    const g = S.run.galleries.find((x) => x.name === el.dataset.gallery);
    viewer(g.items, Number(el.dataset.index));
  },
  "view-url": (el) => {
    const url = el.dataset.url;
    const name = el.dataset.name ?? url.split("/").pop();
    viewer([{ url, name, kind: /\.md$/i.test(name) ? "markdown" : "image" }], 0);
  },
  "view-file": (el) => viewer(S.shownFiles, Number(el.dataset.index)),
  "viewer-step": (el) => {
    const v = S.viewer;
    v.index = (v.index + Number(el.dataset.step) + v.items.length) % v.items.length;
    showViewer();
  },
  "site-width": (el) => {
    const frame = document.getElementById("site-frame");
    if (frame) frame.style.width = el.dataset.width;
    for (const b of el.parentElement.children) b.setAttribute("aria-pressed", String(b === el));
  },
  reveal: async (el) => {
    try {
      await api("/api/reveal", { path: el.dataset.path });
    } catch (e) {
      toast(e.message, { error: true });
    }
  },
  task: (el) => startTask(el.dataset.task, el.dataset.agent),
  "install-missing": (el) => {
    S.ui.installQueue = el.dataset.agents.split(",");
    onTasks();
  },
  "refresh-tools": async () => {
    toast("Checking this computer…");
    await api("/api/tools/refresh", {}).catch((e) => toast(e.message, { error: true }));
    refresh();
  },
  "create-env": async (el) => {
    try {
      await api(`/api/agents/${enc(el.dataset.agent)}/settings`, { values: {} });
      toast("Created its .env from .env.example");
      refresh();
    } catch (e) {
      toast(e.message, { error: true });
    }
  },
  "edit-settings": async (el) => {
    const box = document.getElementById("settings-form");
    box.innerHTML = '<div class="loading"><span class="spinner"></span></div>';
    try {
      box.innerHTML = String(await settingsForm(el.dataset.agent));
      el.hidden = true;
    } catch (e) {
      box.textContent = e.message;
    }
  },
  "close-settings": () => {
    document.getElementById("settings-form").innerHTML = "";
    const b = main.querySelector('[data-action="edit-settings"]');
    if (b) b.hidden = false;
  },
  "reveal-input": (el) => {
    const input = el.parentElement.querySelector("input");
    input.type = input.type === "password" ? "text" : "password";
  },
  "toggle-conn": (el) => {
    S.ui.openConn = S.ui.openConn === el.dataset.id ? "" : el.dataset.id;
    render({ force: true });
  },
  "toggle-agent": (el) => {
    S.ui.openAgent = S.ui.openAgent === el.dataset.id ? "" : el.dataset.id;
    render({ force: true });
  },
  "claude-var": (el) => {
    S.ui.claudeVar = el.dataset.value;
    render({ force: true });
  },
  "remove-key": async (el) => {
    const agents = el.dataset.agents.split(",");
    try {
      await api("/api/keys", { name: el.dataset.var, value: "", agents });
      toast(`Removed ${el.dataset.var}`);
      refresh();
    } catch (e) {
      toast(e.message, { error: true });
    }
  },
  "save-name": () => saveName(),
  "skip-setup": () => {
    prefs.set("onboarded", true);
    location.hash = "#/";
  },
  "finish-setup": () => {
    prefs.set("onboarded", true);
    location.hash = "#/";
  },
  answer: (el) => answerModal(el.dataset.id),
};

function saveName() {
  const v = main.querySelector('[name="name"]')?.value.trim();
  if (v !== undefined) prefs.set("name", v);
  location.hash = "#/setup/product";
}

const KEY_CHECKS = {
  ANTHROPIC_API_KEY: (v) => (v.startsWith("sk-ant-oat") ? "That's a subscription token: switch to “Subscription token” above." : null),
  CLAUDE_CODE_OAUTH_TOKEN: (v) => (v.startsWith("sk-ant-api") ? "That's an API key: switch to “API key” above." : null),
};

const FORMS = {
  name: () => saveName(),
  "product-prompt": (form) => {
    const site = form.site.value.trim();
    if (!site) return toast("Add your website first", { error: true });
    const more = form.more.value.trim();
    copy(`Set up the product folder from ${site}${more ? `, ${more}` : ""}.`, "Copied: paste it into Claude Code in this folder");
  },
  key: async (form) => {
    const name = form.dataset.var;
    const value = form.value.value.trim();
    const agents = [...form.querySelectorAll('input[name="agents"]:checked')].map((i) => i.value);
    if (!value) return toast("Paste the key first", { error: true });
    if (/\s/.test(value)) return toast("A key can't contain spaces: check what you pasted", { error: true });
    const problem = KEY_CHECKS[name]?.(value);
    if (problem) return toast(problem, { error: true });
    if (!agents.length) return toast("Choose at least one agent", { error: true });
    try {
      await api("/api/keys", { name, value, agents });
      form.value.value = "";
      toast(`Saved for ${agents.map(agentName).join(", ")}`);
      refresh();
    } catch (e) {
      toast(e.message, { error: true });
    }
  },
  settings: async (form) => {
    const values = {};
    for (const input of form.querySelectorAll("input.input")) {
      const clear = form.querySelector(`[name="${CSS.escape(input.name)}__clear"]`);
      if (input.dataset.secret) {
        if (clear?.checked) values[input.name] = null;
        else if (input.value.trim()) values[input.name] = input.value.trim();
      } else if (input.value !== input.dataset.orig) values[input.name] = input.value;
    }
    if (!Object.keys(values).length) return toast("Nothing changed");
    try {
      await api(`/api/agents/${enc(form.dataset.agent)}/settings`, { values });
      toast(`Saved ${Object.keys(values).length} ${plural(Object.keys(values).length, "setting")}`);
      ACTIONS["close-settings"]();
      refresh();
    } catch (e) {
      toast(e.message, { error: true });
    }
  },
  answer: async (form, submitter) => {
    const id = form.dataset.id;
    let payload;
    if (form.dataset.kind === "approval") {
      const decision = submitter?.dataset.decision ?? "approve";
      const feedback = form.feedback?.value.trim();
      if (decision === "revise" && !feedback) return toast("Write the changes you want first", { error: true });
      payload = { decision, feedback: feedback || undefined };
    } else {
      const item = S.data.pending.find((p) => p.id === id);
      const answers = {};
      for (const q of item?.questions ?? []) {
        const picked = [...form.querySelectorAll(`[name="q:${CSS.escape(q.id)}"]:checked`)].map((i) => i.value);
        const other = form.querySelector(`[name="other:${CSS.escape(q.id)}"]`)?.value.trim();
        const all = other ? [...picked, other] : picked;
        answers[q.id] = q.multiSelect ? all : (all[0] ?? "");
      }
      payload = { answers };
    }
    try {
      await api(`/api/relay/${enc(id)}`, payload);
      closeLayer();
      toast("Sent. The agent carries on.");
      refresh();
    } catch (e) {
      toast(e.message, { error: true });
    }
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  if (el.dataset.action !== "close-layer-backdrop") e.preventDefault();
  fn(el, e);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && layer.childElementCount) closeLayer();
  if (S.viewer && layer.querySelector(".lightbox") && (e.key === "ArrowRight" || e.key === "ArrowLeft")) ACTIONS["viewer-step"]({ dataset: { step: e.key === "ArrowRight" ? 1 : -1 } });
  const t = e.target.closest?.('[role="button"][data-action]');
  if (t && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    ACTIONS[t.dataset.action]?.(t, e);
  }
});
document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  FORMS[form.dataset.form]?.(form, e.submitter);
});
document.addEventListener("input", (e) => {
  const key = e.target.dataset?.input;
  if (key === "work-q") {
    S.ui.work.q = e.target.value;
    document.getElementById("work-grid").innerHTML = String(workGrid());
  } else if (key === "files-q") {
    S.ui.files.q = e.target.value;
    clearTimeout(S.filesTimer);
    S.filesTimer = setTimeout(async () => {
      const pos = e.target.selectionStart;
      await render({ force: true });
      const input = main.querySelector('[data-input="files-q"]');
      input?.focus();
      input?.setSelectionRange(pos, pos);
    }, 200);
  } else if (key === "request-text" && S.request?.auto) {
    const hit = ROUTES.find(([, re]) => re.test(e.target.value))?.[0] ?? null;
    if (hit !== S.request.agent && (!hit || agentOf(hit))) {
      S.request.agent = hit;
      refreshRequest();
    }
  }
});

// ---------------------------------------------------------------- start

(async () => {
  try {
    S.data = await api("/api/state");
  } catch {
    /* refresh() shows the message */
  }
  if (S.data && !prefs.get("onboarded", false) && !S.data.runs.length && !location.hash) location.hash = "#/setup";
  refresh();
})();
