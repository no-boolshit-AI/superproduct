"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "../icon";

export type TabItem = { id: string; label: string; description?: string; icon?: IconName; content: ReactNode };

/**
 * Accessible tabs (WAI-ARIA tabs pattern): click or arrow keys switch panels.
 * variant: "pills" (segmented row), "underline" (text row with indicator), "cards" (stacked buttons with descriptions, best vertical).
 */
export function Tabs({
  items,
  label,
  variant = "pills",
  orientation = "horizontal",
  defaultId,
  align = "start",
  className,
  panelClassName,
}: {
  items: TabItem[];
  label: string;
  variant?: "pills" | "underline" | "cards";
  orientation?: "horizontal" | "vertical";
  defaultId?: string;
  /** Horizontal lists only: where the tab row sits. */
  align?: "start" | "center";
  className?: string;
  panelClassName?: string;
}) {
  const [active, setActive] = useState(defaultId ?? items[0]?.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();
  const vertical = orientation === "vertical";

  const move = (i: number) => {
    const n = (i + items.length) % items.length;
    setActive(items[n]!.id);
    refs.current[n]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = vertical ? "ArrowDown" : "ArrowRight";
    const prev = vertical ? "ArrowUp" : "ArrowLeft";
    if (e.key === next) move(i + 1);
    else if (e.key === prev) move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(items.length - 1);
    else return;
    e.preventDefault();
  };

  const list = {
    pills: "inline-flex flex-wrap gap-1 rounded-full border border-border bg-card-soft p-1",
    underline: "flex gap-6 overflow-x-auto border-b border-border no-scrollbar",
    cards: "flex flex-col gap-2",
  }[variant];

  const tab = (selected: boolean) =>
    ({
      pills: cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-label transition-colors duration-200", selected ? "bg-card text-fg shadow-sm" : "text-fg-muted hover:text-fg"),
      underline: cn("-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 py-3 text-label transition-colors duration-200", selected ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"),
      cards: cn("flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors duration-200", selected ? "border-accent-line bg-card shadow-sm" : "border-transparent hover:bg-card-soft"),
    })[variant];

  return (
    <div className={cn(vertical ? "grid gap-8 lg:grid-cols-12 lg:gap-12" : "flex flex-col gap-8", className)}>
      <div
        role="tablist"
        aria-label={label}
        aria-orientation={orientation}
        className={cn(list, vertical && "lg:col-span-5", !vertical && variant === "pills" && (align === "center" ? "self-center" : "self-start"), !vertical && variant === "underline" && align === "center" && "justify-center")}
      >
        {items.map((it, i) => {
          const selected = it.id === active;
          return (
            <button
              key={it.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`${uid}-tab-${it.id}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${it.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(it.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={tab(selected)}
            >
              {it.icon && <Icon name={it.icon} className={cn("size-4 shrink-0", variant === "cards" && "mt-1 size-5", selected ? "text-link" : "")} />}
              {variant === "cards" ? (
                <span className="flex flex-col gap-1">
                  <span className="text-subheading text-fg">{it.label}</span>
                  {it.description && <span className="text-small text-fg-muted">{it.description}</span>}
                </span>
              ) : (
                it.label
              )}
            </button>
          );
        })}
      </div>
      {items.map((it) => (
        <div
          key={it.id}
          role="tabpanel"
          id={`${uid}-panel-${it.id}`}
          aria-labelledby={`${uid}-tab-${it.id}`}
          hidden={it.id !== active}
          tabIndex={0}
          className={cn(vertical && "lg:col-span-7", "animate-fade-up focus-visible:outline-2", panelClassName)}
        >
          {it.content}
        </div>
      ))}
    </div>
  );
}
