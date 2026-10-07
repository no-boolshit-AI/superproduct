import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Kicker } from "./type";

const tones = {
  canvas: "bg-canvas",
  surface: "bg-surface",
  "brand-fade": "bg-brand-fade",
  "brand-soft": "bg-accent-soft",
  "brand-mesh": "bg-brand-mesh",
  grid: "bg-canvas bg-grid",
  dots: "bg-canvas bg-dots",
  inverse: "bg-inverse tone-inverse",
  "inverse-glow": "bg-inverse-glow tone-inverse",
  "brand-deep": "bg-brand-deep tone-inverse",
  accent: "bg-accent tone-accent",
} as const;

export type SectionTone = keyof typeof tones;

const widths = { page: "container-page", wide: "container-wide", narrow: "container-narrow" } as const;
const spacings = { default: "section-y", tight: "section-y-tight", none: "" } as const;

/**
 * A full-bleed band whose content sits in a centred container.
 * `tone` sets the background; inverse/accent tones flip text and borders for everything inside.
 */
export function Section({
  id,
  tone = "canvas",
  width = "page",
  spacing = "default",
  divider = false,
  className,
  containerClassName,
  children,
}: {
  id?: string;
  tone?: SectionTone;
  width?: keyof typeof widths;
  spacing?: keyof typeof spacings;
  divider?: boolean;
  className?: string;
  containerClassName?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn(tones[tone], spacings[spacing], divider && "border-b border-border", className)}>
      <div className={cn(widths[width], containerClassName)}>{children}</div>
    </section>
  );
}

/** Kicker → H2 → lead, aligned left, centred or split. */
export function SectionIntro({
  kicker,
  title,
  lead,
  align = "left",
  actions,
  className,
}: {
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center" | "split";
  actions?: ReactNode;
  className?: string;
}) {
  const t = <h2 className="text-balance font-display text-heading text-fg md:text-title">{title}</h2>;
  const l = lead ? <p className="max-w-lede text-pretty text-lead text-fg-muted">{lead}</p> : null;
  if (align === "split") {
    return (
      <div className={cn("grid gap-6 lg:grid-cols-12 lg:gap-12", className)}>
        <div className="flex flex-col gap-4 lg:col-span-6">
          {kicker && <Kicker>{kicker}</Kicker>}
          {t}
        </div>
        {(l || actions) && (
          <div className="flex flex-col items-start gap-6 lg:col-span-5 lg:col-start-8 lg:pt-8">
            {l}
            {actions}
          </div>
        )}
      </div>
    );
  }
  const center = align === "center";
  return (
    <div className={cn("flex max-w-3xl flex-col gap-4", center && "mx-auto items-center text-center", className)}>
      {kicker && <Kicker>{kicker}</Kicker>}
      {t}
      {l}
      {actions && <div className="mt-2">{actions}</div>}
    </div>
  );
}
