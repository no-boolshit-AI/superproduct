import type { ReactNode } from "react";
import { Accordion, Body, Button, Section, SectionIntro, type AccordionItem, type Cta, type SectionTone } from "@/components/ui";

/**
 * SECTION 17 · FAQ
 * Title and a contact nudge on the left; a working accordion on the right.
 * Best for: real objections and practical questions from the brief.
 */
export function FaqSplit({ id, kicker, title, lead, items, contact, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; items: AccordionItem[]; contact?: { text: string; cta: Cta }; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="flex flex-col items-start gap-6 lg:col-span-4">
          <SectionIntro kicker={kicker} title={title} lead={lead} />
          {contact && (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-card-soft p-6">
              <Body>{contact.text}</Body>
              <Button href={contact.cta.href} variant="link">{contact.cta.label}</Button>
            </div>
          )}
        </div>
        <Accordion items={items} className="lg:col-span-7 lg:col-start-6" />
      </div>
    </Section>
  );
}
