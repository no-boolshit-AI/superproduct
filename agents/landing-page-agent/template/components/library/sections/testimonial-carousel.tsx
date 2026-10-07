import type { ReactNode } from "react";
import { Avatar, Carousel, QuoteText, Section, SectionIntro, Small, type SectionTone } from "@/components/ui";

type T = { quote: string; name: string; role: string; photo?: string };

/**
 * SECTION 15 · Testimonial carousel
 * One large quote per slide with working arrows and dots. Real quotes only.
 * Best for: 2–6 strong quotes from named customers.
 */
export function TestimonialCarousel({ id, kicker, title, items, tone = "surface" }: { id?: string; kicker?: string; title?: ReactNode; items: T[]; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        {title && <SectionIntro kicker={kicker} title={title} />}
        <Carousel label="Testimonials">
          {items.map((t) => (
            <figure key={t.name + t.quote.slice(0, 12)} className="flex flex-col gap-8 md:pr-24">
              <QuoteText>“{t.quote}”</QuoteText>
              <figcaption className="flex items-center gap-4">
                <Avatar name={t.name} src={t.photo} />
                <span className="flex flex-col">
                  <span className="text-label text-fg">{t.name}</span>
                  <Small>{t.role}</Small>
                </span>
              </figcaption>
            </figure>
          ))}
        </Carousel>
      </div>
    </Section>
  );
}
