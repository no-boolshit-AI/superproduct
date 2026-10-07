import type { ReactNode } from "react";
import { Badge, Body, Carousel, IconTile, Section, SectionIntro, Subheading, type IconName, type SectionTone } from "@/components/ui";

type CardItem = { title: string; body: string; icon?: IconName; tag?: string; visual?: ReactNode };

/**
 * SECTION 06 · Card carousel
 * A working horizontal carousel of cards with arrows and dots.
 * Best for: 4–10 use cases, examples or modules that don't need to be seen at once.
 */
export function FeatureCarousel({ id, kicker, title, lead, cards, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; cards: CardItem[]; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} align="split" />
        <Carousel label={typeof title === "string" ? title : "Cards"} perView={3}>
          {cards.map((c) => (
            <article key={c.title} className="flex h-full flex-col gap-5 rounded-xl border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-4">
                {c.icon && <IconTile name={c.icon} />}
                {c.tag && <Badge>{c.tag}</Badge>}
              </div>
              {c.visual}
              <Subheading>{c.title}</Subheading>
              <Body>{c.body}</Body>
            </article>
          ))}
        </Carousel>
      </div>
    </Section>
  );
}
