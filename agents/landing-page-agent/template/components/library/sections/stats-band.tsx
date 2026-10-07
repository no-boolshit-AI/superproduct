import type { ReactNode } from "react";
import { Section, Stat, Title, type SectionTone, type StatItem } from "@/components/ui";

/**
 * SECTION 13 · Figures band
 * A short statement and 3–4 figures from the brief on a tinted or dark band.
 * Best for: real, sourced numbers only. Skip the section if the brief has none.
 */
export function StatsBand({ id, title, stats, source, tone = "brand-soft" }: { id?: string; title?: ReactNode; stats: StatItem[]; source?: string; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone} spacing="tight">
      <div className="flex flex-col gap-10">
        {title && <Title className="max-w-2xl">{title}</Title>}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Stat key={s.label} {...s} className="border-l-2 border-accent pl-5" />
          ))}
        </div>
        {source && <p className="text-small text-fg-muted">{source}</p>}
      </div>
    </Section>
  );
}
