import type { ReactNode } from "react";
import { Avatar, Body, Section, SectionIntro, Small, type SectionTone } from "@/components/ui";

type T = { quote: string; name: string; role: string; photo?: string };

/**
 * SECTION 16 · Testimonial wall
 * Masonry columns of short quotes.
 * Best for: many short, real quotes (6+) — breadth of voices over one hero quote.
 */
export function TestimonialWall({ id, kicker, title, lead, items, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; items: T[]; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} align="center" />
        <div className="columns-1 gap-5 md:columns-2 lg:columns-3">
          {items.map((t) => (
            <figure key={t.name + t.quote.slice(0, 12)} className="mb-5 break-inside-avoid rounded-xl border border-border bg-card p-6">
              <Body strong>“{t.quote}”</Body>
              <figcaption className="mt-5 flex items-center gap-3">
                <Avatar name={t.name} src={t.photo} size="sm" />
                <span className="flex flex-col">
                  <span className="text-label text-fg">{t.name}</span>
                  <Small>{t.role}</Small>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Section>
  );
}
