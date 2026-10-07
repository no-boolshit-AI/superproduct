import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CheckList, CtaGroup, Display, Kicker, Lead, Section, type Cta } from "@/components/ui";

/**
 * HERO 02 · Split
 * Copy on one side, the product's core visual on the other, on a brand-tinted panel.
 * Best for: SaaS and services where seeing the output sells it.
 */
export function HeroSplit({
  kicker,
  title,
  lead,
  primary,
  secondary,
  points,
  visual,
  reverse = false,
  panel = "mesh",
}: {
  kicker?: string;
  title: ReactNode;
  lead: ReactNode;
  primary: Cta;
  secondary?: Cta;
  points?: string[];
  visual: ReactNode;
  reverse?: boolean;
  panel?: "mesh" | "soft" | "none";
}) {
  return (
    <Section spacing="none" className="py-14 md:py-20">
      <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <div className={cn("flex flex-col items-start gap-6 lg:col-span-6", reverse && "lg:order-2")}>
          {kicker && <Kicker>{kicker}</Kicker>}
          <Display size="lg">{title}</Display>
          <Lead>{lead}</Lead>
          {points && <CheckList items={points} />}
          <CtaGroup primary={primary} secondary={secondary} size="lg" className="mt-2" />
        </div>
        <div
          className={cn(
            "lg:col-span-6",
            panel === "mesh" && "rounded-xl bg-brand-mesh p-6 md:p-10",
            panel === "soft" && "rounded-xl bg-surface p-6 md:p-10",
          )}
        >
          {visual}
        </div>
      </div>
    </Section>
  );
}
