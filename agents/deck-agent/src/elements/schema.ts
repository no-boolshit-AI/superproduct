import { z } from "zod";

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,47}$/)
  .describe("Element id, kebab-case, unique in this document, e.g. 'revenue-by-segment'. Re-using an id overwrites that element.");

const color = z
  .string()
  .describe("Theme token (accent, accent-2, dark, node, muted, pos, neg, warn, c1…c8) or a hex colour. Prefer tokens so the theme stays consistent.");

export const numberFormat = z
  .object({
    decimals: z.number().int().min(0).max(4).optional().describe("Fixed decimals (default: as precise as the data)"),
    prefix: z.string().max(8).optional().describe("e.g. '$', '€'"),
    suffix: z.string().max(14).optional().describe("e.g. '%', 'bn', ' pp', 'x'"),
    thousands: z.boolean().optional().describe("Thousands separators (default on for ≥10,000)"),
  })
  .describe("How values are printed. Values are given as they should read: 12.5 with suffix '%' prints 12.5%.");

const aspect = z.number().min(0.4).max(8).optional().describe("Width/height ratio used only when the element sits in a slot with no fixed height");

export const chartShape = {
  id,
  type: z
    .enum(["column", "bar", "stacked-column", "stacked-bar", "grouped-column", "grouped-bar", "line", "area", "waterfall", "donut", "scatter", "mekko"])
    .describe(
      "column: one series over time/categories. bar: ranked horizontal bars (long labels). stacked-*/grouped-*: several series. line/area: trends. waterfall: bridge from start to end via deltas. donut: shares of a whole (≤6). scatter: x/y (+size = bubble). mekko: segment size × share.",
    ),
  categories: z.array(z.string()).optional().describe("X-axis labels (or bar labels / donut segment labels / mekko columns). Keep them short."),
  series: z
    .array(z.object({ name: z.string(), values: z.array(z.number().nullable()), color: color.optional() }))
    .optional()
    .describe("One entry per data series, values aligned with categories. null = gap."),
  number: numberFormat.optional(),
  highlight: z.array(z.number().int().min(0)).optional().describe("Category indexes (0-based) drawn in the accent colour; all others turn grey. Use it to point at the message."),
  highlight_series: z.number().int().min(0).optional().describe("Series index drawn in the accent colour (grouped/line); others grey."),
  sort: z.enum(["none", "asc", "desc"]).optional().describe("Sort single-series column/bar charts by value"),
  data_labels: z.enum(["auto", "all", "none", "ends", "inside"]).optional().describe("Value labels. Default auto (on for bars/columns, ends for lines). Consulting charts label data directly instead of using an axis."),
  value_axis: z.boolean().optional().describe("Show the value axis with ticks (default off for column/bar, on for line/scatter)"),
  gridlines: z.boolean().optional(),
  y_min: z.number().optional(),
  y_max: z.number().optional(),
  x_title: z.string().optional(),
  y_title: z.string().optional(),
  legend: z.enum(["auto", "top", "right", "none"]).optional().describe("auto: direct labels at the right for stacked/line charts, top row otherwise"),
  totals: z.boolean().optional().describe("Stacked charts: total above each column (default on)"),
  percent: z.boolean().optional().describe("Stacked charts: normalise each column to 100%"),
  cagr: z
    .object({ from: z.number().int().min(0), to: z.number().int().min(0), label: z.string().optional() })
    .optional()
    .describe("Growth arrow between two categories (indexes), labelled with the computed CAGR unless you pass a label like '+8% p.a.'. Categories should be consecutive years."),
  reference_line: z.object({ value: z.number(), label: z.string().optional() }).optional().describe("Dashed target/benchmark/average line"),
  steps: z
    .array(z.object({ label: z.string(), value: z.number(), kind: z.enum(["start", "delta", "subtotal", "end"]).optional() }))
    .optional()
    .describe("Waterfall only. First step defaults to start, last to end (its value is checked against the running total). Deltas are signed."),
  palette: z.object({ total: color.optional(), increase: color.optional(), decrease: color.optional() }).optional().describe("Waterfall colours"),
  points: z
    .array(z.object({ label: z.string(), x: z.number(), y: z.number(), size: z.number().positive().optional(), group: z.string().optional(), highlight: z.boolean().optional() }))
    .optional()
    .describe("Scatter/bubble only"),
  x_number: numberFormat.optional().describe("Scatter x-axis number format"),
  quadrants: z
    .object({ x: z.number().optional(), y: z.number().optional(), labels: z.array(z.string()).max(4).optional() })
    .optional()
    .describe("Scatter: dashed quadrant lines at x/y with corner labels [top-left, top-right, bottom-left, bottom-right]"),
  center_label: z.string().optional().describe("Donut: big text in the hole (default: total)"),
  center_sublabel: z.string().optional(),
  widths: z.array(z.number().positive()).optional().describe("Mekko: column sizes (e.g. market size per segment), aligned with categories"),
  width_number: numberFormat.optional().describe("Mekko: format for the column sizes"),
  aspect,
};

const step = z.object({
  title: z.string(),
  text: z.string().optional(),
  value: z.string().optional().describe("Optional figure shown with the step, e.g. '€2.4bn' or '12k'"),
  icon: z.string().optional().describe("Icon name from the icon list"),
  highlight: z.boolean().optional(),
});

export const diagramShape = {
  id,
  type: z
    .enum(["process", "timeline", "roadmap", "matrix", "pyramid", "funnel", "tree", "cycle"])
    .describe(
      "process: sequential steps (chevrons). timeline: dated milestones. roadmap: Gantt of workstreams × periods. matrix: 2×2 with optional plotted items. pyramid: hierarchy/levels. funnel: conversion stages. tree: issue tree / value driver tree. cycle: recurring loop.",
    ),
  style: z.string().optional().describe("process: chevron (default) | boxes | numbered"),
  steps: z.array(step).optional().describe("process, cycle, pyramid (top level first), funnel (widest first; numeric value strings size the stages)"),
  events: z.array(z.object({ date: z.string(), title: z.string(), text: z.string().optional(), highlight: z.boolean().optional() })).optional().describe("timeline"),
  periods: z.array(z.string()).optional().describe("roadmap: column labels, e.g. ['Q1 25','Q2 25',…]"),
  rows: z
    .array(
      z.object({
        label: z.string(),
        group: z.boolean().optional().describe("Bold group header row (its bars draw thin)"),
        bars: z.array(z.object({ start: z.number().min(0), end: z.number().min(0), label: z.string().optional(), color: color.optional() })).optional().describe("start/end in period units, end exclusive: {start:0,end:2} covers the first two periods; fractions allowed"),
        milestones: z.array(z.object({ at: z.number().min(0), label: z.string().optional() })).optional(),
      }),
    )
    .optional()
    .describe("roadmap rows (workstreams)"),
  now: z.number().optional().describe("roadmap: position of a 'Today' line in period units"),
  x_axis: z.object({ label: z.string(), low: z.string().optional(), high: z.string().optional() }).optional().describe("matrix"),
  y_axis: z.object({ label: z.string(), low: z.string().optional(), high: z.string().optional() }).optional().describe("matrix"),
  quadrants: z
    .array(z.object({ title: z.string(), text: z.string().optional(), highlight: z.boolean().optional() }))
    .optional()
    .describe("matrix: exactly 4, order top-left, top-right, bottom-left, bottom-right"),
  items: z
    .array(z.object({ label: z.string(), x: z.number().min(0).max(100), y: z.number().min(0).max(100), size: z.number().positive().optional(), highlight: z.boolean().optional() }))
    .optional()
    .describe("matrix: plotted items, x/y in 0–100"),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        parent: z.string().optional().describe("Parent node id; omit for the single root"),
        label: z.string(),
        value: z.string().optional(),
        note: z.string().optional(),
        operator: z.string().optional().describe("Driver trees: symbol joining this node's children, e.g. '×' or '+'"),
        highlight: z.boolean().optional(),
      }),
    )
    .optional()
    .describe("tree: flat list of nodes with parent ids (left-to-right tree)"),
  center: z.string().optional().describe("cycle: label in the middle"),
  aspect,
};

export const tableShape = {
  id,
  columns: z
    .array(
      z.object({
        label: z.string(),
        align: z.enum(["left", "right", "center"]).optional(),
        width: z.number().positive().optional().describe("Relative width (default 1)"),
        type: z
          .enum(["text", "number", "harvey", "rag", "check", "bar", "delta"])
          .optional()
          .describe("number: formatted, right-aligned. harvey: 0–4 Harvey ball. rag: g/a/r status dot. check: ✓/✗. bar: inline bar + value. delta: signed, green/red."),
        number: numberFormat.optional(),
      }),
    )
    .min(1),
  rows: z
    .array(
      z.object({
        cells: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
        style: z.enum(["normal", "total", "group", "highlight"]).optional().describe("group: a full-width sub-header row (first cell only)"),
      }),
    )
    .min(1),
  header: z.enum(["line", "filled"]).optional().describe("line (default, consulting) or filled header row"),
  zebra: z.boolean().optional(),
  density: z.enum(["compact", "normal", "spacious"]).optional(),
  aspect,
};

export const kpiShape = {
  id,
  items: z
    .array(
      z.object({
        value: z.string().describe("Formatted headline figure, e.g. '€4.2bn', '+18%', '3.1x'"),
        label: z.string().describe("What it measures, ≤ 8 words"),
        delta: z.string().optional().describe("Change vs. comparison, e.g. '+2.3 pp vs. 2024'"),
        trend: z.enum(["up", "down", "flat"]).optional(),
        sentiment: z.enum(["positive", "negative", "neutral"]).optional().describe("Colour of the delta (a falling cost is positive)"),
        note: z.string().optional(),
        spark: z.array(z.number()).optional().describe("Optional sparkline values"),
        highlight: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(12),
  style: z.enum(["tiles", "plain", "cards"]).optional().describe("tiles: tinted boxes. plain: rule on top, no box (most consulting). cards: outlined."),
  columns: z.number().int().min(1).max(6).optional(),
  aspect,
};

export const PREVIEW_SIZES = {
  deck: { full: [1168, 440], wide: [1168, 300], "two-thirds": [720, 440], half: [560, 400], third: [360, 320], strip: [1168, 150] },
  report: { full: [662, 380], tall: [662, 620], half: [316, 300], strip: [662, 130] },
} as const;

export const previewSize = z
  .enum(["full", "wide", "two-thirds", "half", "third", "strip", "tall"])
  .optional()
  .describe("Size of the preview render only (the final size always comes from the page slot it is placed in). Pick the size closest to its slot.");
