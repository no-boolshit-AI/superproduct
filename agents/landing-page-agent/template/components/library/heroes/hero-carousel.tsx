import type { ReactNode } from "react";
import { Body, Carousel, CtaGroup, Display, Kicker, Lead, Section, Subheading, type Cta } from "@/components/ui";

/**
 * HERO 10 · Use-case carousel
 * Promise on the left; a working carousel of use cases (each with its own visual) on the right.
 * Best for: horizontal products with several audiences or scenarios.
 */
export function HeroCarousel({
  kicker,
  title,
  lead,
  primary,
  secondary,
  slides,
}: {
  kicker?: string;
  title: ReactNode;
  lead: ReactNode;
  primary: Cta;
  secondary?: Cta;
  slides: { label: string; title: string; body: string; visual?: ReactNode }[];
}) {
  return (
    <Section spacing="none" className="py-14 md:py-20">
      <div className="grid items-center gap-12 lg:grid-cols-12">
        <div className="flex flex-col items-start gap-6 lg:col-span-5">
          {kicker && <Kicker>{kicker}</Kicker>}
          <Display size="lg">{title}</Display>
          <Lead>{lead}</Lead>
          <CtaGroup primary={primary} secondary={secondary} size="lg" className="mt-2" />
        </div>
        <div className="min-w-0 lg:col-span-7">
          <Carousel label="Use cases" autoplay={6000}>
            {slides.map((s) => (
              <div key={s.title} className="flex h-full flex-col gap-6 rounded-xl bg-brand-mesh p-6 md:p-8">
                <div className="flex flex-col gap-2">
                  <Kicker>{s.label}</Kicker>
                  <Subheading>{s.title}</Subheading>
                  <Body>{s.body}</Body>
                </div>
                {s.visual}
              </div>
            ))}
          </Carousel>
        </div>
      </div>
    </Section>
  );
}
