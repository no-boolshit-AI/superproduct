import type { ReactNode } from "react";
import { Body, Icon, Section, SectionIntro, Small, type IconName, type SectionTone } from "@/components/ui";

type Integration = { name: string; category?: string; src?: string; icon?: IconName };

/**
 * SECTION 19 · Integrations
 * Intro on the left; a grid of named tiles (supplied logos, or icons + names) on the right.
 * Best for: products that connect to tools the brief names.
 */
export function IntegrationsGrid({ id, kicker, title, lead, items, note, tone = "surface" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; items: Integration[]; note?: string; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="grid items-center gap-12 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-5">
          <SectionIntro kicker={kicker} title={title} lead={lead} />
          {note && <Body>{note}</Body>}
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-7">
          {items.map((it) => (
            <li key={it.name} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-card-soft">
                {it.src ? <img src={it.src} alt="" className="size-6 object-contain" /> : <Icon name={it.icon ?? "plug"} className="size-5 text-fg-soft" />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-label text-fg">{it.name}</span>
                {it.category && <Small className="truncate">{it.category}</Small>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
