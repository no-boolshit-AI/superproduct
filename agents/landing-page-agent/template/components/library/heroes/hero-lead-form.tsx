import type { ReactNode } from "react";
import { Card, CheckList, Display, EmailCapture, Kicker, Lead, Section, Small, Subheading } from "@/components/ui";

/**
 * HERO 05 · Lead form
 * Promise on the left, a working email form in a raised card on the right.
 * Best for: waitlists, demos, downloads, consultations — when the action is "leave your email".
 */
export function HeroLeadForm({
  kicker,
  title,
  lead,
  points,
  form,
}: {
  kicker?: string;
  title: ReactNode;
  lead: ReactNode;
  points?: string[];
  form: { title: string; action: string; buttonLabel: string; subject?: string; note?: string; footnote?: string };
}) {
  return (
    <Section tone="brand-fade" spacing="none" className="py-14 md:py-24">
      <div className="grid items-center gap-12 lg:grid-cols-12">
        <div className="flex flex-col items-start gap-6 lg:col-span-7">
          {kicker && <Kicker>{kicker}</Kicker>}
          <Display size="lg">{title}</Display>
          <Lead>{lead}</Lead>
          {points && <CheckList items={points} className="mt-2" />}
        </div>
        <Card variant="raised" padding="lg" radius="xl" className="lg:col-span-5">
          <Subheading>{form.title}</Subheading>
          <EmailCapture action={form.action} buttonLabel={form.buttonLabel} subject={form.subject} note={form.note} className="mt-5" />
          {form.footnote && <Small className="mt-4 border-t border-border pt-4">{form.footnote}</Small>}
        </Card>
      </div>
    </Section>
  );
}
