import type { ReactNode } from "react";
import { Badge, CtaGroup, Display, Lead, Section, Small, type Cta } from "@/components/ui";

/**
 * HERO 01 · Centred statement
 * Headline, lead and actions centred; an optional wide visual underneath.
 * Best for: products with one clear promise and a strong product visual.
 */
export function HeroCentered({
  kicker,
  title,
  lead,
  primary,
  secondary,
  note,
  visual,
  backdrop = "fade",
}: {
  kicker?: string;
  title: ReactNode;
  lead: ReactNode;
  primary: Cta;
  secondary?: Cta;
  /** Small reassurance under the buttons ("Free · No card needed"). */
  note?: string;
  visual?: ReactNode;
  backdrop?: "plain" | "grid" | "dots" | "fade";
}) {
  const tone = { plain: "canvas", grid: "grid", dots: "dots", fade: "brand-fade" } as const;
  return (
    <Section tone={tone[backdrop]} spacing="none" className="pb-16 pt-16 md:pb-24 md:pt-24">
      <div className="flex flex-col items-center gap-6 text-center">
        {kicker && <Badge variant="accent">{kicker}</Badge>}
        <Display className="mx-auto">{title}</Display>
        <Lead className="mx-auto">{lead}</Lead>
        <CtaGroup primary={primary} secondary={secondary} size="lg" className="justify-center" />
        {note && <Small>{note}</Small>}
      </div>
      {visual && <div className="mx-auto mt-14 max-w-5xl md:mt-20">{visual}</div>}
    </Section>
  );
}
