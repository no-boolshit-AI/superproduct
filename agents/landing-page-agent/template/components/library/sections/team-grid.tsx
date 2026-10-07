import type { ReactNode } from "react";
import { Avatar, Body, Section, SectionIntro, Small, Subheading, type SectionTone } from "@/components/ui";

/**
 * SECTION 24 · Team
 * People with role and one line each. Real people from the brief only.
 * Best for: services, consultancies, trust-led businesses.
 */
export function TeamGrid({ id, kicker, title, lead, people, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; people: { name: string; role: string; bio?: string; photo?: string }[]; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} />
        <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {people.map((p) => (
            <li key={p.name} className="flex flex-col gap-4">
              <Avatar name={p.name} src={p.photo} size="lg" />
              <div className="flex flex-col gap-1">
                <Subheading>{p.name}</Subheading>
                <Small>{p.role}</Small>
              </div>
              {p.bio && <Body>{p.bio}</Body>}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
