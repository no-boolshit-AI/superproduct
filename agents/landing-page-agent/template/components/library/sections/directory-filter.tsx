import type { ReactNode } from "react";
import { Badge, Body, Button, Filterable, Icon, Section, SectionIntro, Subheading, type Cta, type IconName, type SectionTone } from "@/components/ui";

type Entry = { title: string; body: string; tags: string[]; icon?: IconName; status?: string; href?: string };

/**
 * SECTION 18 · Filterable directory
 * Chips that really filter a grid of entries (tools, courses, locations, resources, partners).
 * Best for: catalogues of 6+ items across 2–6 categories.
 */
export function DirectoryFilter({ id, kicker, title, lead, filters, entries, more, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; filters: string[]; entries: Entry[]; more?: Cta; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} align="split" actions={more && <Button href={more.href} variant="secondary" icon="arrow-up-right">{more.label}</Button>} />
        <Filterable
          label="Filter by category"
          filters={filters}
          items={entries.map((e) => ({
            id: e.title,
            tags: e.tags,
            content: (
              <a href={e.href ?? "#"} className="group flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-6 transition-colors hover:border-border-strong">
                <div className="flex items-start justify-between gap-3">
                  {e.icon ? <Icon name={e.icon} className="size-6 text-link" /> : <span />}
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {e.status && <Badge variant="accent">{e.status}</Badge>}
                    {e.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </span>
                </div>
                <Subheading>{e.title}</Subheading>
                <Body>{e.body}</Body>
                <Icon name="arrow-up-right" className="mt-auto size-5 text-fg-faint transition-colors group-hover:text-link" />
              </a>
            ),
          }))}
        />
      </div>
    </Section>
  );
}
