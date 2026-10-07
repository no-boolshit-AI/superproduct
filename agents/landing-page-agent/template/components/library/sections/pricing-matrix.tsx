import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button, Icon, Section, SectionIntro, type Cta, type SectionTone } from "@/components/ui";

type Cell = boolean | string;

/**
 * SECTION 12 · Plan matrix
 * Plans as columns, capabilities as rows, grouped. Pairs well with PricingTiers or replaces it for detail.
 * Best for: products whose plans differ in many specific capabilities.
 */
export function PricingMatrix({
  id,
  kicker,
  title,
  lead,
  plans,
  groups,
  tone = "canvas",
}: {
  id?: string;
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  plans: { name: string; price?: string; cta?: Cta; highlighted?: boolean }[];
  groups: { name: string; rows: { label: string; values: Cell[] }[] }[];
  tone?: SectionTone;
}) {
  const cell = (v: Cell) =>
    typeof v === "boolean" ? (
      v ? <Icon name="check" className="mx-auto size-5 text-link" strokeWidth={2.5} /> : <Icon name="minus" className="mx-auto size-5 text-fg-faint" />
    ) : (
      <span className="text-small text-fg-soft">{v}</span>
    );
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-border-strong">
                <th scope="col" className="w-1/3 py-4" />
                {plans.map((p) => (
                  <th key={p.name} scope="col" className={cn("px-4 py-4 text-center align-bottom", p.highlighted && "bg-accent-soft")}>
                    <span className="block text-subheading text-fg">{p.name}</span>
                    {p.price && <span className="mt-1 block text-small text-fg-muted">{p.price}</span>}
                    {p.cta && <Button href={p.cta.href} variant={p.highlighted ? "primary" : "secondary"} className="mt-3">{p.cta.label}</Button>}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.name}>
                <tr>
                  <th colSpan={plans.length + 1} scope="colgroup" className="pb-2 pt-8 kicker text-link">{g.name}</th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.label} className="border-b border-border">
                    <th scope="row" className="py-4 pr-4 text-body text-fg-soft">{r.label}</th>
                    {r.values.map((v, i) => (
                      <td key={i} className={cn("px-4 py-4 text-center", plans[i]?.highlighted && "bg-accent-soft/60")}>{cell(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </Section>
  );
}
