"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Body, Icon, Section, SectionIntro, Subheading, type SectionTone } from "@/components/ui";

type Item = { id: string; title: string; body: string; visual: ReactNode };

/**
 * SECTION 05 · Accordion with changing visual
 * Opening an item swaps the visual beside it. One item is open at a time.
 * Best for: 3–5 steps or capabilities where each has its own picture.
 */
export function FeatureAccordionVisual({ id, kicker, title, lead, items, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; items: Item[]; tone?: SectionTone }) {
  const [open, setOpen] = useState(items[0]?.id);
  const uid = useId();
  const current = items.find((i) => i.id === open) ?? items[0];
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} />
        <div className="grid items-start gap-10 lg:grid-cols-12">
          <div className="divide-y divide-border border-y border-border lg:col-span-5">
            {items.map((it) => {
              const expanded = it.id === open;
              return (
                <div key={it.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`${uid}-${it.id}`}
                    onClick={() => setOpen(it.id)}
                    className="flex w-full items-center justify-between gap-6 py-5 text-left"
                  >
                    <Subheading as="p" className={cn(!expanded && "text-fg-muted")}>{it.title}</Subheading>
                    <Icon name="chevron-down" className={cn("size-5 shrink-0 text-fg-muted transition-transform duration-200", expanded && "rotate-180")} />
                  </button>
                  <div id={`${uid}-${it.id}`} role="region" hidden={!expanded} className="pb-6">
                    <Body>{it.body}</Body>
                    <div className="mt-6 lg:hidden">{it.visual}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden rounded-xl bg-brand-mesh p-6 md:p-10 lg:col-span-7 lg:block">
            <div key={current?.id} className="animate-fade-up">{current?.visual}</div>
          </div>
        </div>
      </div>
    </Section>
  );
}
