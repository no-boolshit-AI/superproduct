import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Body, IconTile, Section, SectionIntro, Subheading, type IconName, type SectionTone } from "@/components/ui";

/**
 * SECTION 01 · Icon grid
 * Intro plus a 2–4 column grid of capabilities, each with an icon.
 * Best for: 4–9 parallel capabilities of similar weight.
 */
export function FeatureIconGrid({
  id,
  kicker,
  title,
  lead,
  items,
  columns = 3,
  tone = "canvas",
}: {
  id?: string;
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  items: { icon: IconName; title: string; body: string }[];
  columns?: 2 | 3 | 4;
  tone?: SectionTone;
}) {
  const cols = { 2: "md:grid-cols-2", 3: "md:grid-cols-2 lg:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} />
        <div className={cn("grid gap-x-10 gap-y-12", cols)}>
          {items.map((it) => (
            <div key={it.title} className="flex flex-col gap-4">
              <IconTile name={it.icon} />
              <Subheading>{it.title}</Subheading>
              <Body>{it.body}</Body>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
