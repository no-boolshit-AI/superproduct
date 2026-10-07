import type { ReactNode } from "react";
import { IconTile, KeyValues, Section, SectionIntro, type IconName, type SectionTone } from "@/components/ui";

/**
 * SECTION 29 · Spec sheet
 * Grouped key/value rows: data handling, security, terms, technical specs, what's included.
 * Best for: factual detail that buyers check before signing.
 */
export function SpecSheet({ id, kicker, title, lead, groups, tone = "inverse" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; groups: { icon?: IconName; name: string; rows: { key: string; value: string }[] }[]; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="grid gap-12 lg:grid-cols-12">
        <SectionIntro kicker={kicker} title={title} lead={lead} className="lg:sticky lg:top-28 lg:col-span-4 lg:self-start" />
        <div className="flex flex-col gap-12 lg:col-span-7 lg:col-start-6">
          {groups.map((g) => (
            <div key={g.name} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                {g.icon && <IconTile name={g.icon} size="sm" variant="outline" />}
                <p className="text-subheading text-fg">{g.name}</p>
              </div>
              <KeyValues rows={g.rows} />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
