import type { ReactNode } from "react";
import { EmailCapture, Section, SectionIntro, type SectionTone } from "@/components/ui";

/**
 * SECTION 27 · Email signup
 * A working email form beside a short promise (newsletter, waitlist, lesson by email).
 * `action` must be a mailto: address or a form endpoint from the brief.
 */
export function NewsletterSignup({ id, kicker, title, lead, action, buttonLabel, subject, note, tone = "surface" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; action: string; buttonLabel: string; subject?: string; note?: string; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone} spacing="tight">
      <div className="grid items-center gap-8 lg:grid-cols-12">
        <SectionIntro kicker={kicker} title={title} lead={lead} className="lg:col-span-6" />
        <EmailCapture action={action} buttonLabel={buttonLabel} subject={subject} note={note} className="lg:col-span-5 lg:col-start-8" />
      </div>
    </Section>
  );
}
