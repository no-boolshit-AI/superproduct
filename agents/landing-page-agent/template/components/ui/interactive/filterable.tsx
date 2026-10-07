"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type FilterableItem = { id: string; tags: string[]; content: ReactNode };

const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" } as const;

/** Filter chips over a grid. Chips really filter; the count updates for screen readers. */
export function Filterable({
  filters,
  items,
  label,
  allLabel = "All",
  columns = 3,
  className,
}: {
  filters: string[];
  items: FilterableItem[];
  label: string;
  allLabel?: string;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const visible = items.filter((it) => !active || it.tags.includes(active));
  const chip = (on: boolean) =>
    cn("rounded-full border px-4 py-2 text-label transition-colors duration-200", on ? "border-accent bg-accent text-on-accent" : "border-border bg-card text-fg-soft hover:border-border-strong");
  return (
    <div className={cn("flex flex-col gap-8", className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div data-filter-group role="group" aria-label={label} className="flex flex-wrap gap-2">
          <button type="button" data-filter="" aria-pressed={active === null} onClick={() => setActive(null)} className={chip(active === null)}>
            {allLabel}
          </button>
          {filters.map((f) => (
            <button key={f} type="button" data-filter={f} aria-pressed={active === f} onClick={() => setActive(f)} className={chip(active === f)}>
              {f}
            </button>
          ))}
        </div>
        <p aria-live="polite" className="text-small text-fg-muted">
          Showing {visible.length} of {items.length}
        </p>
      </div>
      <div className={cn("grid gap-5", cols[columns])}>
        {items.map((it) => (
          <div key={it.id} data-filter-item hidden={!(!active || it.tags.includes(active))}>
            {it.content}
          </div>
        ))}
      </div>
    </div>
  );
}
