import { cn } from "@/lib/cn";

export type StatItem = { value: string; label: string; detail?: string };

/** A figure from the brief with its caption. */
export function Stat({ value, label, detail, accent = false, className }: StatItem & { accent?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className={cn("font-display text-title tabular-nums md:text-display", accent ? "text-link" : "text-fg")}>{value}</p>
      <p className="text-label text-fg">{label}</p>
      {detail && <p className="text-small text-fg-muted">{detail}</p>}
    </div>
  );
}
