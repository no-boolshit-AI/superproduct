import type { ReactNode } from "react";
import { CtaGroup, Display, Kicker, Lead, Section, Stat, type Cta, type StatItem } from "@/components/ui";

/**
 * HERO 06 · Proof-led
 * Headline and actions, then a ruled row of the brief's strongest figures.
 * Best for: established businesses with real numbers to show. Needs 3–4 figures from the brief.
 */
export function HeroStats({
  kicker,
  title,
  lead,
  primary,
  secondary,
  stats,
}: {
  kicker?: string;
  title: ReactNode;
  lead: ReactNode;
  primary: Cta;
  secondary?: Cta;
  stats: StatItem[];
}) {
  return (
    <Section spacing="none" className="pb-14 pt-16 md:pb-20 md:pt-24">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="flex flex-col items-start gap-6 lg:col-span-8">
          {kicker && <Kicker>{kicker}</Kicker>}
          <Display>{title}</Display>
        </div>
        <div className="flex flex-col items-start gap-6 lg:col-span-4 lg:justify-end">
          <Lead>{lead}</Lead>
          <CtaGroup primary={primary} secondary={secondary} />
        </div>
      </div>
      <dl className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.label} className="bg-card p-6 md:p-8">
            <Stat {...s} accent={i === 0} />
          </div>
        ))}
      </dl>
    </Section>
  );
}
