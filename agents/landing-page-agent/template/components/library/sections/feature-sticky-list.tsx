import type { ReactNode } from "react";
import { Body, Button, Kicker, Section, Subheading, Title, type Cta, type SectionTone } from "@/components/ui";

/**
 * SECTION 07 · Sticky intro, scrolling list
 * The title and action stay pinned while a numbered list scrolls past.
 * Best for: principles, reasons, long lists of benefits (5–8 items).
 */
export function FeatureStickyList({ id, kicker, title, lead, cta, items, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; cta?: Cta; items: { title: string; body: string }[]; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="flex flex-col items-start gap-5 lg:sticky lg:top-28 lg:col-span-5 lg:self-start">
          {kicker && <Kicker>{kicker}</Kicker>}
          <Title>{title}</Title>
          {lead && <Body>{lead}</Body>}
          {cta && <Button href={cta.href} className="mt-2">{cta.label}</Button>}
        </div>
        <ol className="flex flex-col gap-4 lg:col-span-6 lg:col-start-7">
          {items.map((it, i) => (
            <li key={it.title} className="flex gap-6 rounded-xl border border-border bg-card p-6 md:p-8">
              <span className="font-display text-heading tabular-nums text-link">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex flex-col gap-2">
                <Subheading>{it.title}</Subheading>
                <Body>{it.body}</Body>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
