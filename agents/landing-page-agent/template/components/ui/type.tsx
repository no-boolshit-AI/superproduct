import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type P = { children: ReactNode; className?: string };

/** The page's single H1. size "xl" = hero scale, "lg" = display scale. */
export function Display({ children, size = "xl", className }: P & { size?: "xl" | "lg" }) {
  return (
    <h1 className={cn("max-w-headline text-balance font-display text-fg", size === "xl" ? "text-display md:text-hero" : "text-title md:text-display", className)}>
      {children}
    </h1>
  );
}

/** Section title (H2). */
export function Title({ children, className }: P) {
  return <h2 className={cn("text-balance font-display text-heading text-fg md:text-title", className)}>{children}</h2>;
}

/** Block title (H3). */
export function Heading({ children, className, as: Tag = "h3" }: P & { as?: "h2" | "h3" | "h4" }) {
  return <Tag className={cn("text-balance font-display text-heading text-fg", className)}>{children}</Tag>;
}

/** Item title (H3/H4, 20px). */
export function Subheading({ children, className, as: Tag = "h3" }: P & { as?: "h3" | "h4" | "p" }) {
  return <Tag className={cn("font-display text-subheading text-fg", className)}>{children}</Tag>;
}

/** Intro paragraph, 20px. */
export function Lead({ children, className }: P) {
  return <p className={cn("max-w-lede text-pretty text-lead text-fg-muted", className)}>{children}</p>;
}

/** Body copy. */
export function Body({ children, className, strong = false }: P & { strong?: boolean }) {
  return <p className={cn("text-pretty text-body", strong ? "text-fg-soft" : "text-fg-muted", className)}>{children}</p>;
}

export function Small({ children, className }: P) {
  return <p className={cn("text-small text-fg-muted", className)}>{children}</p>;
}

export function Label({ children, className }: P) {
  return <span className={cn("text-label text-fg", className)}>{children}</span>;
}

/** Small uppercase label above a title, in the accent text colour. */
export function Kicker({ children, className }: P) {
  return <p className={cn("kicker text-link", className)}>{children}</p>;
}

/** A number, price or short value at title scale. */
export function Figure({ children, className, accent = false }: P & { accent?: boolean }) {
  return <p className={cn("font-display text-heading tabular-nums md:text-title", accent ? "text-link" : "text-fg", className)}>{children}</p>;
}

/** Quotation set in the accent face. */
export function QuoteText({ children, className }: P) {
  return <blockquote className={cn("text-balance font-accent text-heading text-fg md:text-title", className)}>{children}</blockquote>;
}
