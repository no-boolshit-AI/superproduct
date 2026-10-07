import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export type AccordionItem = { q: string; a: string };

/** Disclosure list on native <details>: works without JavaScript. */
export function Accordion({ items, className, defaultOpen = 0 }: { items: AccordionItem[]; className?: string; defaultOpen?: number | null }) {
  return (
    <div className={cn("divide-y divide-border border-y border-border", className)}>
      {items.map((it, i) => (
        <details key={it.q} className="group" open={i === defaultOpen || undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-subheading text-fg [&::-webkit-details-marker]:hidden">
            {it.q}
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-fg-muted transition-transform duration-200 ease-standard group-open:rotate-45">
              <Icon name="plus" className="size-4" />
            </span>
          </summary>
          <p className="max-w-prose pb-6 text-body text-fg-muted">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
