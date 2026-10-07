"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge, Button, CheckList, Section, SectionIntro, Segmented, Small, Subheading, type Cta, type SectionTone } from "@/components/ui";

type Price = { amount: string; period?: string };
type Plan = {
  name: string;
  description: string;
  /** One price, or monthly/yearly prices to enable the billing toggle. */
  price: Price | { monthly: Price; yearly: Price };
  prefix?: string;
  features: string[];
  cta: Cta;
  highlighted?: boolean;
  badge?: string;
};

/**
 * SECTION 11 · Pricing tiers
 * 2–4 plan cards; a working monthly/yearly toggle appears when plans have both prices.
 * Best for: published prices. Never invent prices — use only the brief's.
 */
export function PricingTiers({ id, kicker, title, lead, plans, yearlyNote, footnote, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; plans: Plan[]; yearlyNote?: string; footnote?: string; tone?: SectionTone }) {
  const hasToggle = plans.some((p) => "monthly" in p.price);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const priceOf = (p: Plan): Price => ("monthly" in p.price ? p.price[billing] : p.price);
  const cols = { 1: "", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 xl:grid-cols-4" }[Math.min(plans.length, 4) as 1 | 2 | 3 | 4];
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <div className="flex flex-col items-center gap-8">
          <SectionIntro kicker={kicker} title={title} lead={lead} align="center" />
          {hasToggle && (
            <Segmented
              label="Billing period"
              value={billing}
              onChange={setBilling}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly", note: yearlyNote },
              ]}
            />
          )}
        </div>
        <div className={cn("grid items-stretch gap-5", cols)}>
          {plans.map((p) => {
            const price = priceOf(p);
            return (
              <div
                key={p.name}
                data-plan={p.name}
                className={cn("flex flex-col gap-6 rounded-xl border p-6 md:p-8", p.highlighted ? "border-accent bg-card shadow-brand" : "border-border bg-card")}
              >
                <div className="flex items-center justify-between gap-3">
                  <Subheading>{p.name}</Subheading>
                  {p.badge && <Badge variant="solid">{p.badge}</Badge>}
                </div>
                <Small>{p.description}</Small>
                <p className="flex items-baseline gap-1.5">
                  {p.prefix && <span className="text-small text-fg-muted">{p.prefix}</span>}
                  <span data-price className="font-display text-title tabular-nums text-fg">{price.amount}</span>
                  {price.period && <span className="text-small text-fg-muted">{price.period}</span>}
                </p>
                <Button href={p.cta.href} variant={p.highlighted ? "primary" : "secondary"} className="w-full">
                  {p.cta.label}
                </Button>
                <CheckList items={p.features} className="border-t border-border pt-6" />
              </div>
            );
          })}
        </div>
        {footnote && <Small className="text-center">{footnote}</Small>}
      </div>
    </Section>
  );
}
