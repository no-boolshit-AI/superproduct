"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Body, CheckList, Heading, Section, SectionIntro, type SectionTone } from "@/components/ui";

type Step = { id: string; label: string; title: string; body: string; points?: string[]; visual?: ReactNode };

/**
 * SECTION 09 · Interactive stepper
 * A horizontal row of steps; selecting one (click or arrow keys) shows its detail. Progress bar follows.
 * Best for: a 3–5 step method where each step has substance.
 */
export function ProcessStepper({ id, kicker, title, lead, steps, tone = "surface" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; steps: Step[]; tone?: SectionTone }) {
  const [active, setActive] = useState(0);
  const uid = useId();
  const step = steps[active]!;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (i: number, focus = false) => {
    const n = (i + steps.length) % steps.length;
    setActive(n);
    if (focus) refs.current[n]?.focus();
  };
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} align="center" />
        <div className="flex flex-col gap-8">
          <div role="tablist" aria-label="Steps" className="grid gap-3 sm:grid-cols-2 lg:grid-flow-col lg:auto-cols-fr">
            {steps.map((s, i) => (
              <button
                key={s.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="tab"
                type="button"
                id={`${uid}-tab-${s.id}`}
                aria-selected={i === active}
                aria-controls={`${uid}-panel`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => select(i)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") select(i + 1, true);
                  else if (e.key === "ArrowLeft") select(i - 1, true);
                  else if (e.key === "Home") select(0, true);
                  else if (e.key === "End") select(steps.length - 1, true);
                  else return;
                  e.preventDefault();
                }}
                className={cn("flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors", i === active ? "border-accent-line bg-card shadow-sm" : "border-border hover:bg-card")}
              >
                <span className="h-1 w-full overflow-hidden rounded-full bg-border">
                  <span className={cn("block h-full rounded-full bg-accent transition-all duration-500", i <= active ? "w-full" : "w-0")} />
                </span>
                <span className="kicker text-fg-faint">Step {i + 1}</span>
                <span className="text-label text-fg">{s.label}</span>
              </button>
            ))}
          </div>
          <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${step.id}`} className="grid items-center gap-10 rounded-xl border border-border bg-card p-6 md:p-10 lg:grid-cols-2">
            <div key={step.id} className="flex animate-fade-up flex-col gap-4">
              <Heading>{step.title}</Heading>
              <Body>{step.body}</Body>
              {step.points && <CheckList items={step.points} />}
            </div>
            {step.visual && <div className="min-w-0">{step.visual}</div>}
          </div>
        </div>
      </div>
    </Section>
  );
}
