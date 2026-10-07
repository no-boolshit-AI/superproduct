import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants = {
  neutral: "bg-card-soft text-fg-soft border border-border",
  accent: "bg-accent-soft text-accent-text border border-accent-line",
  solid: "bg-accent text-on-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  outline: "border border-border-strong text-fg-soft",
} as const;

/** Small status or category label. */
export function Badge({ children, variant = "neutral", className }: { children: ReactNode; variant?: keyof typeof variants; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-micro", variants[variant], className)}>{children}</span>;
}
