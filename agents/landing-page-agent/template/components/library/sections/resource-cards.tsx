import type { ReactNode } from "react";
import { Badge, Body, Button, Icon, Section, SectionIntro, Small, Subheading, type Cta, type IconName, type SectionTone } from "@/components/ui";

type Resource = { title: string; excerpt: string; tag: string; status?: string; meta?: string; href?: string; icon?: IconName };

/**
 * SECTION 28 · Resources
 * Article, guide or download cards with category and status ("Coming soon").
 * Best for: content libraries, guides, docs, webinars.
 */
export function ResourceCards({ id, kicker, title, lead, items, more, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; items: Resource[]; more?: Cta; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} align="split" actions={more && <Button href={more.href} variant="secondary" icon={null}>{more.label}</Button>} />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map((r) => {
            const inner = (
              <>
                <div className="grid aspect-[4/3] place-items-center rounded-lg bg-brand-mesh">
                  <Icon name={r.icon ?? "book"} className="size-8 text-accent-text" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{r.tag}</Badge>
                  {r.status && <Badge variant="accent">{r.status}</Badge>}
                </div>
                <Subheading>{r.title}</Subheading>
                <Body>{r.excerpt}</Body>
                {r.meta && <Small className="mt-auto">{r.meta}</Small>}
              </>
            );
            return r.href ? (
              <a key={r.title} href={r.href} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-strong">{inner}</a>
            ) : (
              <article key={r.title} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">{inner}</article>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
