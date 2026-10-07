import type { ReactNode } from "react";
import { Badge, Body, Button, Heading, Kicker, Section, Stat, type Cta, type SectionTone, type StatItem } from "@/components/ui";

/**
 * SECTION 23 · Case study
 * Challenge → approach → result, with the customer's real figures and a visual.
 * Best for: one documented customer story from the brief.
 */
export function CaseStudy({
  id,
  kicker,
  customer,
  title,
  challenge,
  approach,
  stats,
  visual,
  link,
  tone = "canvas",
}: {
  id?: string;
  kicker?: string;
  customer: string;
  title: ReactNode;
  challenge: string;
  approach: string;
  stats: StatItem[];
  visual?: ReactNode;
  link?: Cta;
  tone?: SectionTone;
}) {
  return (
    <Section id={id} tone={tone}>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid lg:grid-cols-12">
          <div className="flex flex-col items-start gap-6 p-6 md:p-12 lg:col-span-7">
            {kicker && <Kicker>{kicker}</Kicker>}
            <Badge variant="outline">{customer}</Badge>
            <Heading as="h2" className="md:text-title">{title}</Heading>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-label text-fg">The challenge</p>
                <Body>{challenge}</Body>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-label text-fg">What changed</p>
                <Body>{approach}</Body>
              </div>
            </div>
            <div className="grid w-full gap-6 border-t border-border pt-6 sm:grid-cols-3">
              {stats.map((s, i) => (
                <Stat key={s.label} {...s} accent={i === 0} />
              ))}
            </div>
            {link && <Button href={link.href} variant="link">{link.label}</Button>}
          </div>
          <div className="grid place-items-center bg-brand-mesh p-6 md:p-10 lg:col-span-5">{visual}</div>
        </div>
      </div>
    </Section>
  );
}
