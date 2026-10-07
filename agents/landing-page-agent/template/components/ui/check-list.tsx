import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/** List with check marks. `tone="cross"` for things that are excluded. */
export function CheckList({ items, mark = "check", className }: { items: ReactNode[]; mark?: "check" | "cross" | "dot"; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3 text-body text-fg-soft">
          {mark === "dot" ? (
            <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
          ) : (
            <span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", mark === "check" ? "bg-accent-soft text-accent-text" : "bg-card-soft text-fg-faint")}>
              <Icon name={mark === "check" ? "check" : "x"} className="size-3" strokeWidth={2.5} />
            </span>
          )}
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
