"use client";

import { useState, type ReactNode } from "react";
import { Button, Card, Kicker, RangeField, Section, SectionIntro, Small, type Cta, type SectionTone } from "@/components/ui";

type Input = { id: string; label: string; min: number; max: number; step?: number; defaultValue: number; unit?: string };

/**
 * SECTION 25 · Calculator
 * Working sliders; the result is the product of the inputs times a factor
 * (e.g. hours/week × people × 46 weeks). State the assumption in `assumption`.
 * Best for: time or money saved, capacity, sizing — only with a formula the brief supports.
 */
export function RoiCalculator({
  id,
  kicker,
  title,
  lead,
  inputs,
  factor = 1,
  result,
  assumption,
  cta,
  tone = "surface",
}: {
  id?: string;
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  inputs: Input[];
  /** Multiplier applied to the product of all inputs. */
  factor?: number;
  result: { label: string; prefix?: string; suffix?: string; decimals?: number };
  assumption: string;
  cta?: Cta;
  tone?: SectionTone;
}) {
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(inputs.map((i) => [i.id, i.defaultValue])));
  const total = inputs.reduce((acc, i) => acc * (values[i.id] ?? 0), factor);
  const formatted = total.toLocaleString("en", { maximumFractionDigits: result.decimals ?? 0 });
  return (
    <Section id={id} tone={tone}>
      <div className="grid items-center gap-12 lg:grid-cols-12">
        <SectionIntro kicker={kicker} title={title} lead={lead} className="lg:col-span-5" />
        <Card variant="raised" padding="lg" radius="xl" className="lg:col-span-6 lg:col-start-7">
          <div className="flex flex-col gap-8">
            {inputs.map((i) => (
              <RangeField
                key={i.id}
                label={i.label}
                min={i.min}
                max={i.max}
                step={i.step}
                value={values[i.id] ?? i.defaultValue}
                onChange={(v) => setValues((s) => ({ ...s, [i.id]: v }))}
                format={(v) => `${v.toLocaleString("en")}${i.unit ? ` ${i.unit}` : ""}`}
              />
            ))}
            <div className="flex flex-col gap-2 rounded-lg bg-accent-soft p-6">
              <Kicker>{result.label}</Kicker>
              <p data-calculator-result className="font-display text-display tabular-nums text-ink">
                {result.prefix}
                {formatted}
                {result.suffix}
              </p>
              <Small className="text-muted">{assumption}</Small>
            </div>
            {cta && <Button href={cta.href} className="self-start">{cta.label}</Button>}
          </div>
        </Card>
      </div>
    </Section>
  );
}
