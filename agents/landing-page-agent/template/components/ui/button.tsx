import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

export type Cta = { label: string; href: string };
export type ButtonVariant = "primary" | "secondary" | "ghost" | "link" | "contrast";

const base =
  "group inline-flex items-center justify-center gap-2 whitespace-nowrap text-label transition-colors duration-200 ease-standard focus-visible:outline-2";

const variants: Record<ButtonVariant, string> = {
  primary: "rounded-button bg-accent text-on-accent shadow-sm hover:bg-accent-hover",
  secondary: "rounded-button border border-border-strong bg-card text-fg hover:border-fg-faint hover:bg-card-soft",
  ghost: "rounded-button text-fg hover:bg-card-soft",
  link: "text-link underline-offset-4 hover:underline",
  /** For accent-coloured sections: foreground-coloured button with accent label. */
  contrast: "rounded-button bg-fg text-accent shadow-sm hover:opacity-90",
};

const sizes = { md: "h-11 px-5", lg: "h-13 px-6" } as const;

/** Link styled as a button. `icon` defaults to an arrow on primary buttons. */
export function Button({
  href,
  children,
  variant = "primary",
  size = "md",
  icon,
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  icon?: IconName | null;
  className?: string;
}) {
  const trailing = icon === undefined ? (variant === "primary" || variant === "link" || variant === "contrast" ? "arrow-right" : null) : icon;
  return (
    <a href={href} className={cn(base, variants[variant], variant !== "link" && sizes[size], className)}>
      <span>{children}</span>
      {trailing && <Icon name={trailing} className="size-4 transition-transform duration-200 ease-standard group-hover:translate-x-0.5" />}
    </a>
  );
}

/** Primary + optional secondary call to action, side by side. */
export function CtaGroup({ primary, secondary, className, size = "md" }: { primary: Cta; secondary?: Cta; className?: string; size?: "md" | "lg" }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <Button href={primary.href} size={size}>{primary.label}</Button>
      {secondary && <Button href={secondary.href} variant="secondary" size={size} icon={null}>{secondary.label}</Button>}
    </div>
  );
}
