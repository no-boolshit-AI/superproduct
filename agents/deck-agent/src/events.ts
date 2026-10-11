export type JobEvent =
  | { type: "status"; message: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string; summary: string }
  | { type: "element"; id: string; path: string }
  | { type: "page"; index: number; path: string; layout: string; title: string }
  | { type: "image"; path: string }
  | { type: "review"; pages: number; issues: number }
  | { type: "export"; pdf: string; pages: string[] }
  | { type: "cost"; usd: number; turns: number }
  | { type: "done"; job: JobRecord }
  | { type: "error"; message: string };

export type Emit = (e: JobEvent) => void;

export interface JobOptions {
  brief: string;
  format: "auto" | "deck" | "report";
  theme: "auto" | "strategy" | "corporate" | "executive" | "swiss" | "editorial";
  pages?: number;
  audience?: string;
  language?: string;
  model?: string;
  maxBudgetUsd?: number;
  maxTurns?: number;
  brandPath?: string;
  /** Product folder for brand, voice and facts: a path, the id of one in workspace/products, or "none". Default: PRODUCT_DIR, then the workspace's product/. */
  product?: string;
  inputs?: string[]; // absolute paths of user files (data, documents, images)
}

export interface JobRecord {
  id: string;
  dir: string;
  brief: string;
  options: Omit<JobOptions, "brief" | "inputs">;
  status: "running" | "done" | "error" | "cancelled";
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  costUsd?: number;
  title?: string;
  format?: string;
  theme?: string;
  pdf?: string;
  pages: { index: number; preview: string; png?: string; title?: string; layout?: string }[];
  summary?: string;
  error?: string;
  revisions: { at: string; instructions: string }[];
  /** The product folder the job used (brand, voice, facts), if any. */
  product?: { dir: string; name: string } | null;
  /** Where the brand came from: a brand file or "product folder: <name>". */
  brand?: string;
}
