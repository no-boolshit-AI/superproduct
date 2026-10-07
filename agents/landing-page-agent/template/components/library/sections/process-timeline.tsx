import type { ReactNode } from "react";
import { Badge, Body, Section, SectionIntro, Subheading, type SectionTone } from "@/components/ui";

/**
 * SECTION 08 · Vertical timeline
 * Numbered steps on a connecting line, each with an optional duration or deliverable badge.
 * Best for: onboarding, delivery process, curriculum, implementation plan (3–7 steps).
 */
export function ProcessTimeline({
  id,
  kicker,
  title,
  lead,
  steps,
  tone = "canvas",
}: {
  id?: string;
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  steps: { title: string; body: string; meta?: string }[];
  tone?: SectionTone;
}) {
  return (
    <Section id={id} tone={tone}>
      <div className="grid gap-12 lg:grid-cols-12">
        <SectionIntro kicker={kicker} title={title} lead={lead} className="lg:col-span-4" />
        <ol className="relative flex flex-col gap-10 lg:col-span-7 lg:col-start-6">
          <span aria-hidden className="absolute bottom-4 left-5 top-4 w-px bg-border" />
          {steps.map((s, i) => (
            <li key={s.title} className="relative flex gap-6">
              <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border border-accent-line bg-accent-soft text-label text-accent-text">{i + 1}</span>
              <div className="flex flex-col items-start gap-2 pt-1.5">
                <Subheading>{s.title}</Subheading>
                <Body>{s.body}</Body>
                {s.meta && <Badge variant="accent" className="mt-1">{s.meta}</Badge>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
