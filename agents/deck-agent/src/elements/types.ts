/** Plain data types for element specs. Shared by the zod schemas (Node) and the in-browser runtime. */

export interface NumberFormat {
  decimals?: number;
  prefix?: string;
  suffix?: string;
  thousands?: boolean;
}

export interface Series {
  name: string;
  values: (number | null)[];
  color?: string;
}

export type ChartType =
  | "column"
  | "bar"
  | "stacked-column"
  | "stacked-bar"
  | "grouped-column"
  | "grouped-bar"
  | "line"
  | "area"
  | "waterfall"
  | "donut"
  | "scatter"
  | "mekko";

export interface ChartSpec {
  kind: "chart";
  id: string;
  type: ChartType;
  categories?: string[];
  series?: Series[];
  number?: NumberFormat;
  highlight?: number[];
  highlight_series?: number;
  sort?: "none" | "asc" | "desc";
  data_labels?: "auto" | "all" | "none" | "ends" | "inside";
  value_axis?: boolean;
  gridlines?: boolean;
  y_min?: number;
  y_max?: number;
  x_title?: string;
  y_title?: string;
  legend?: "auto" | "top" | "right" | "none";
  totals?: boolean;
  percent?: boolean;
  cagr?: { from: number; to: number; label?: string };
  reference_line?: { value: number; label?: string };
  steps?: { label: string; value: number; kind?: "start" | "delta" | "subtotal" | "end" }[];
  points?: { label: string; x: number; y: number; size?: number; group?: string; highlight?: boolean }[];
  quadrants?: { x?: number; y?: number; labels?: string[] };
  x_number?: NumberFormat;
  center_label?: string;
  center_sublabel?: string;
  widths?: number[];
  width_number?: NumberFormat;
  palette?: { total?: string; increase?: string; decrease?: string };
  aspect?: number;
}

export interface DiagramStep {
  title: string;
  text?: string;
  value?: string;
  icon?: string;
  highlight?: boolean;
}

export type DiagramType = "process" | "timeline" | "roadmap" | "matrix" | "pyramid" | "funnel" | "tree" | "cycle";

export interface DiagramSpec {
  kind: "diagram";
  id: string;
  type: DiagramType;
  style?: string;
  steps?: DiagramStep[];
  events?: { date: string; title: string; text?: string; highlight?: boolean }[];
  periods?: string[];
  rows?: {
    label: string;
    group?: boolean;
    bars?: { start: number; end: number; label?: string; color?: string }[];
    milestones?: { at: number; label?: string }[];
  }[];
  now?: number;
  x_axis?: { label: string; low?: string; high?: string };
  y_axis?: { label: string; low?: string; high?: string };
  quadrants?: { title: string; text?: string; highlight?: boolean }[];
  items?: { label: string; x: number; y: number; size?: number; highlight?: boolean }[];
  nodes?: { id: string; parent?: string; label: string; value?: string; note?: string; operator?: string; highlight?: boolean }[];
  center?: string;
  aspect?: number;
}

export type CellValue = string | number | boolean | null;

export interface TableSpec {
  kind: "table";
  id: string;
  columns: {
    label: string;
    align?: "left" | "right" | "center";
    width?: number;
    type?: "text" | "number" | "harvey" | "rag" | "check" | "bar" | "delta";
    number?: NumberFormat;
  }[];
  rows: { cells: CellValue[]; style?: "normal" | "total" | "group" | "highlight" }[];
  header?: "line" | "filled";
  zebra?: boolean;
  density?: "compact" | "normal" | "spacious";
  aspect?: number;
}

export interface KpiSpec {
  kind: "kpis";
  id: string;
  items: {
    value: string;
    label: string;
    delta?: string;
    trend?: "up" | "down" | "flat";
    sentiment?: "positive" | "negative" | "neutral";
    note?: string;
    spark?: number[];
    highlight?: boolean;
  }[];
  style?: "tiles" | "plain" | "cards";
  columns?: number;
  aspect?: number;
}

export type ElementSpec = ChartSpec | DiagramSpec | TableSpec | KpiSpec;

export interface MountResult {
  id: string;
  width: number;
  height: number;
  warnings: string[];
}
