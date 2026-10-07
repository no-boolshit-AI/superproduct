import type { ReactNode } from "react";
import { Badge, CtaGroup, Display, Lead, Section, type Cta } from "@/components/ui";

/**
 * HERO 08 · Spotlight (dark)
 * Dark brand band with a soft glow, centred headline, and a visual lifted on a shadow.
 * Best for: launches, technical or premium products, brands with a dark identity.
 */
export function HeroSpotlight({
  kicker,
  title,
  lead,
  primary,
  secondary,
  visual,
}: {
  kicker?: string;
  title: ReactNode;
  lead: ReactNode;
  primary: Cta;
  secondary?: Cta;
  visual?: ReactNode;
}) {
  return (
    <Section tone="inverse-glow" spacing="none" className="pb-16 pt-20 md:pb-24 md:pt-28">
      <div className="flex flex-col items-center gap-6 text-center">
        {kicker && <Badge variant="outline">{kicker}</Badge>}
        <Display className="mx-auto">{title}</Display>
        <Lead className="mx-auto">{lead}</Lead>
        <CtaGroup primary={primary} secondary={secondary} size="lg" className="justify-center" />
      </div>
      {visual && <div className="mx-auto mt-14 max-w-5xl rounded-xl border border-border bg-card p-2 shadow-lg md:mt-20">{visual}</div>}
    </Section>
  );
}
