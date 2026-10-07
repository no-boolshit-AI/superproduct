import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Body, Button, CheckList, Heading, Kicker, Section, SectionIntro, type Cta, type SectionTone } from "@/components/ui";

type Row = { kicker?: string; title: string; body: string; points?: string[]; visual: ReactNode; link?: Cta };

/**
 * SECTION 03 · Alternating rows
 * Text and visual swap sides row by row.
 * Best for: 2–4 major capabilities that each deserve explanation and a visual.
 */
export function FeatureAlternating({ id, kicker, title, lead, rows, tone = "canvas" }: { id?: string; kicker?: string; title?: ReactNode; lead?: ReactNode; rows: Row[]; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        {title && <SectionIntro kicker={kicker} title={title} lead={lead} align="center" />}
        <div className="flex flex-col gap-20 md:gap-28">
          {rows.map((r, i) => (
            <div key={r.title} className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
              <div className={cn("flex flex-col items-start gap-5 lg:col-span-5", i % 2 === 1 && "lg:order-2 lg:col-start-8")}>
                {r.kicker && <Kicker>{r.kicker}</Kicker>}
                <Heading>{r.title}</Heading>
                <Body>{r.body}</Body>
                {r.points && <CheckList items={r.points} />}
                {r.link && <Button href={r.link.href} variant="link">{r.link.label}</Button>}
              </div>
              <div className={cn("rounded-xl bg-card-soft p-4 md:p-8 lg:col-span-7", i % 2 === 1 && "lg:order-1 lg:col-start-1")}>{r.visual}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
