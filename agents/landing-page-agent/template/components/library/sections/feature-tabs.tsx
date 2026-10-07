import type { ReactNode } from "react";
import { Body, CheckList, Heading, Section, SectionIntro, Tabs, type IconName, type SectionTone } from "@/components/ui";

type Item = { id: string; label: string; description?: string; icon?: IconName; title: string; body: string; points?: string[]; visual?: ReactNode };

/**
 * SECTION 04 · Vertical tabs
 * A list of working tabs on the left; the selected capability's detail and visual on the right.
 * Best for: 3–6 modules, roles or workflows a visitor wants to compare one at a time.
 */
export function FeatureTabs({ id, kicker, title, lead, items, tone = "surface" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; items: Item[]; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} />
        <Tabs
          label={typeof title === "string" ? title : "Features"}
          variant="cards"
          orientation="vertical"
          items={items.map((it) => ({
            id: it.id,
            label: it.label,
            description: it.description,
            icon: it.icon,
            content: (
              <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 md:p-8">
                <Heading>{it.title}</Heading>
                <Body>{it.body}</Body>
                {it.points && <CheckList items={it.points} />}
                {it.visual}
              </div>
            ),
          }))}
        />
      </div>
    </Section>
  );
}
