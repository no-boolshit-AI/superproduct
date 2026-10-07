import type { ReactNode } from "react";
import { Body, CtaGroup, Display, IconTile, Kicker, Lead, Section, Subheading, type Cta, type IconName } from "@/components/ui";

/**
 * HERO 07 · Bento
 * The headline lives inside a bento grid with one visual tile and three capability tiles.
 * Best for: platforms with several capabilities worth seeing at once.
 */
export function HeroBento({
  kicker,
  title,
  lead,
  primary,
  secondary,
  visual,
  tiles,
}: {
  kicker?: string;
  title: ReactNode;
  lead: ReactNode;
  primary: Cta;
  secondary?: Cta;
  visual: ReactNode;
  tiles: { icon: IconName; title: string; body: string }[];
}) {
  return (
    <Section spacing="none" className="py-10 md:py-14">
      <div className="grid gap-4 lg:grid-cols-6">
        <div className="flex flex-col items-start justify-between gap-10 rounded-xl bg-surface p-8 md:p-12 lg:col-span-4">
          <div className="flex flex-col items-start gap-5">
            {kicker && <Kicker>{kicker}</Kicker>}
            <Display size="lg">{title}</Display>
            <Lead>{lead}</Lead>
          </div>
          <CtaGroup primary={primary} secondary={secondary} size="lg" />
        </div>
        <div className="grid min-h-72 place-items-center overflow-hidden rounded-xl bg-brand-mesh p-6 lg:col-span-2">{visual}</div>
        {tiles.slice(0, 3).map((t) => (
          <div key={t.title} className="flex flex-col gap-4 rounded-xl border border-border p-6 lg:col-span-2">
            <IconTile name={t.icon} />
            <Subheading>{t.title}</Subheading>
            <Body>{t.body}</Body>
          </div>
        ))}
      </div>
    </Section>
  );
}
