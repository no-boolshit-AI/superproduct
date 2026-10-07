"use client";

import { cn } from "@/lib/cn";

/** Segmented control (radio group). Controlled: use inside a client component. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string; note?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex gap-1 rounded-full border border-border bg-card-soft p-1", className)}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(o.value)}
            className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-label transition-colors", checked ? "bg-card text-fg shadow-sm" : "text-fg-muted hover:text-fg")}
          >
            {o.label}
            {o.note && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-micro text-accent-text">{o.note}</span>}
          </button>
        );
      })}
    </div>
  );
}
