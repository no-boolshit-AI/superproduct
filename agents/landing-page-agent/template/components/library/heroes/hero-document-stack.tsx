import type { ReactNode } from "react";
import { CheckList, CtaGroup, Display, DocSheet, Kicker, Lead, Section, type Cta } from "@/components/ui";

type Doc = { title: string; meta?: string; sections: { heading: string; lines: string[] }[] };

/**
 * HERO 09 · Deliverables stack
 * Promise and outcomes on the left; a fanned stack of the documents the customer receives on the right.
 * Best for: services, audits, reports, consulting, training — anything whose output is a document.
 */
export function HeroDocumentStack({
  kicker,
  title,
  lead,
  outcomes,
  primary,
  secondary,
  documents,
}: {
  kicker?: string;
  title: ReactNode;
  lead: ReactNode;
  outcomes: string[];
  primary: Cta;
  secondary?: Cta;
  /** 1–3 documents; the first is shown on top. */
  documents: Doc[];
}) {
  const docs = documents.slice(0, 3);
  const offsets = ["z-30", "z-20 -rotate-3 translate-x-6 translate-y-6", "z-10 rotate-3 -translate-x-6 translate-y-10"];
  return (
    <Section tone="surface" spacing="none" className="py-14 md:py-24">
      <div className="grid items-center gap-14 lg:grid-cols-12">
        <div className="flex flex-col items-start gap-6 lg:col-span-6">
          {kicker && <Kicker>{kicker}</Kicker>}
          <Display size="lg">{title}</Display>
          <Lead>{lead}</Lead>
          <CheckList items={outcomes} />
          <CtaGroup primary={primary} secondary={secondary} size="lg" className="mt-2" />
        </div>
        <div className="relative grid min-h-96 place-items-center lg:col-span-6">
          {docs.map((d, i) => (
            <DocSheet key={d.title} {...d} className={`absolute w-full max-w-sm ${offsets[i]}`} />
          ))}
          <div aria-hidden className="invisible w-full max-w-sm">
            {docs[0] && <DocSheet {...docs[0]} />}
          </div>
        </div>
      </div>
    </Section>
  );
}
