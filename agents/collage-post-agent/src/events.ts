export type JobEvent =
  | { type: "status"; message: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string; summary: string }
  | { type: "image"; path: string; source: "generated" | "commons"; label: string }
  | { type: "render"; images: string[]; warnings: number }
  | { type: "cost"; usd: number; turns: number }
  | { type: "done"; job: JobRecord }
  | { type: "error"; message: string };

export type Emit = (e: JobEvent) => void;

export interface JobRecord {
  id: string;
  dir: string;
  brief: string;
  options: Record<string, unknown>;
  status: "running" | "done" | "error" | "cancelled";
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  costUsd?: number;
  slides: { html: string; png: string }[];
  zip?: string;
  caption?: string;
  error?: string;
  revisions: { at: string; instructions: string }[];
}
