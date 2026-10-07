import type { ReactNode } from "react";
import { CtaGroup, Display, Kicker, Lead, Section, Tabs, type Cta, type IconName } from "@/components/ui";

/**
 * HERO 04 · Tabbed demo
 * Centred headline over a working tab set; each tab shows a different view of the product.
 * Best for: products with 2–4 distinct modes, roles or use cases.
 */
export function HeroTabbedDemo({
  kicker,
  title,
  lead,
  primary,
  secondary,
  tabs,
}: {
  kicker?: string;
  title: ReactNode;
  lead: ReactNode;
  primary: Cta;
  secondary?: Cta;
  tabs: { id: string; label: string; icon?: IconName; content: ReactNode }[];
}) {
  return (
    <Section spacing="none" className="pb-16 pt-16 md:pb-24 md:pt-24">
      <div className="flex flex-col items-center gap-6 text-center">
        {kicker && <Kicker>{kicker}</Kicker>}
        <Display className="mx-auto" size="lg">{title}</Display>
        <Lead className="mx-auto">{lead}</Lead>
        <CtaGroup primary={primary} secondary={secondary} size="lg" className="justify-center" />
      </div>
      <div className="mt-14 md:mt-16">
        <Tabs items={tabs} label="Product views" align="center" panelClassName="rounded-xl bg-brand-mesh p-4 md:p-10" />
      </div>
    </Section>
  );
}
