import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants = {
  /** Thin border on the section background. */
  outline: "border border-border bg-card",
  /** Tinted fill, no border. */
  soft: "bg-card-soft",
  /** White card lifted with a soft shadow. */
  raised: "border border-border bg-card shadow-md",
  /** Brand-tinted card for the one thing you want noticed. */
  brand: "tone-light border border-accent-line bg-accent-soft",
} as const;

const pads = { none: "", sm: "p-5", md: "p-6 md:p-8", lg: "p-8 md:p-10" } as const;
const radii = { md: "rounded-md", lg: "rounded-lg", xl: "rounded-xl" } as const;

export function Card({
  children,
  variant = "outline",
  padding = "md",
  radius = "lg",
  className,
}: {
  children: ReactNode;
  variant?: keyof typeof variants;
  padding?: keyof typeof pads;
  radius?: keyof typeof radii;
  className?: string;
}) {
  return <div className={cn(variants[variant], pads[padding], radii[radius], className)}>{children}</div>;
}
