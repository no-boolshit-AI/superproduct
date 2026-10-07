import type { ReactNode } from "react";
import { CheckList, Section, SectionIntro, Subheading, type SectionTone } from "@/components/ui";

/**
 * SECTION 20 · Before / after
 * Two columns: the situation today and the situation with the product.
 * Best for: change-led products and services; makes the value concrete without metrics.
 */
export function BeforeAfter({ id, kicker, title, lead, before, after, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; before: { label: string; items: string[] }; after: { label: string; items: string[] }; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} align="center" />
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-6 rounded-xl border border-border bg-card-soft p-6 md:p-10">
            <Subheading className="text-fg-muted">{before.label}</Subheading>
            <CheckList items={before.items} mark="cross" />
          </div>
          <div className="tone-light flex flex-col gap-6 rounded-xl border border-accent-line bg-accent-soft p-6 md:p-10">
            <Subheading>{after.label}</Subheading>
            <CheckList items={after.items} />
          </div>
        </div>
      </div>
    </Section>
  );
}
