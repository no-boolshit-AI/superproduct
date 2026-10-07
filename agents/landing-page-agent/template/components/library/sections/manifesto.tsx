import type { ReactNode } from "react";
import { Body, Kicker, Section, type SectionTone } from "@/components/ui";

/**
 * SECTION 21 · Manifesto
 * Large numbered statements split by rules. Typography is the visual.
 * Best for: beliefs, principles, "how we work" — opinionated brands.
 */
export function Manifesto({ id, kicker, statements, tone = "inverse" }: { id?: string; kicker?: string; statements: { statement: string; detail?: string }[]; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      {kicker && <Kicker className="mb-10">{kicker}</Kicker>}
      <ol className="divide-y divide-border border-y border-border">
        {statements.map((s, i) => (
          <li key={s.statement} className="grid gap-4 py-8 md:grid-cols-12 md:gap-8 md:py-10">
            <span className="font-display text-subheading tabular-nums text-link md:col-span-1">{String(i + 1).padStart(2, "0")}</span>
            <p className="text-balance font-display text-heading text-fg md:col-span-7 md:text-title">{s.statement}</p>
            {s.detail && <Body className="md:col-span-4 md:pt-2">{s.detail}</Body>}
          </li>
        ))}
      </ol>
    </Section>
  );
}
