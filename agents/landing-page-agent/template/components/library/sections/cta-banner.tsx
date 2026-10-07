import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button, Lead, Section, Small, type Cta } from "@/components/ui";

/**
 * SECTION 26 · Closing banner
 * The main action again, on a brand-coloured or deep panel inside the container.
 * Best for: the last section before the footer.
 */
export function CtaBanner({ id, title, lead, primary, secondary, note, style = "accent" }: { id?: string; title: ReactNode; lead?: ReactNode; primary: Cta; secondary?: Cta; note?: string; style?: "accent" | "deep" | "soft" }) {
  const panel = { accent: "bg-accent tone-accent", deep: "bg-brand-deep tone-inverse", soft: "bg-brand-mesh tone-light" }[style];
  return (
    <Section id={id}>
      <div className={cn("flex flex-col items-start gap-8 overflow-hidden rounded-xl p-8 md:flex-row md:items-end md:justify-between md:p-14", panel)}>
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 className="text-balance font-display text-heading text-fg md:text-title">{title}</h2>
          {lead && <Lead>{lead}</Lead>}
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <div className="flex flex-wrap gap-3">
            <Button href={primary.href} size="lg" variant={style === "accent" ? "contrast" : "primary"}>{primary.label}</Button>
            {secondary && <Button href={secondary.href} size="lg" variant="secondary" icon={null}>{secondary.label}</Button>}
          </div>
          {note && <Small>{note}</Small>}
        </div>
      </div>
    </Section>
  );
}
