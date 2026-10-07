import type { ReactNode } from "react";
import { CtaGroup, Kicker, Lead, Section, type Cta } from "@/components/ui";

/**
 * HERO 03 · Editorial
 * An oversized headline across the full container, then lead and actions on a ruled line.
 * Best for: consultancies, studios, opinionated brands; works without any visual.
 */
export function HeroEditorial({
  kicker,
  title,
  lead,
  primary,
  secondary,
  meta,
}: {
  kicker?: string;
  title: ReactNode;
  lead: ReactNode;
  primary: Cta;
  secondary?: Cta;
  /** Short facts shown as a row: "Lisbon", "Since 2019", "12 people". */
  meta?: string[];
}) {
  return (
    <Section spacing="none" className="pb-14 pt-16 md:pb-20 md:pt-28">
      {kicker && <Kicker className="mb-6">{kicker}</Kicker>}
      <h1 className="max-w-5xl text-balance font-display text-display text-fg md:text-hero">{title}</h1>
      <div className="mt-12 grid gap-8 border-t border-border pt-8 md:mt-16 lg:grid-cols-12">
        <Lead className="lg:col-span-6">{lead}</Lead>
        <div className="flex flex-col items-start gap-6 lg:col-span-5 lg:col-start-8 lg:items-end">
          <CtaGroup primary={primary} secondary={secondary} size="lg" />
          {meta && (
            <ul className="flex flex-wrap gap-x-6 gap-y-2 lg:justify-end">
              {meta.map((m) => (
                <li key={m} className="text-small text-fg-muted">{m}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}
