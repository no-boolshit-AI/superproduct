import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Body, IconTile, Section, SectionIntro, Subheading, type IconName, type SectionTone } from "@/components/ui";

type Tile = { title: string; body: string; icon?: IconName; visual?: ReactNode; size?: "wide" | "tall" | "normal"; emphasis?: boolean };

/**
 * SECTION 02 · Bento grid
 * Tiles of different sizes; wide/tall tiles carry a visual. One tile can be emphasised in the brand colour.
 * Best for: 4–7 capabilities where one or two matter more than the rest.
 */
export function FeatureBento({ id, kicker, title, lead, tiles, tone = "canvas" }: { id?: string; kicker?: string; title: ReactNode; lead?: ReactNode; tiles: Tile[]; tone?: SectionTone }) {
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} align="split" />
        <div className="grid auto-rows-[minmax(14rem,auto)] gap-4 md:grid-cols-3">
          {tiles.map((t) => (
            <div
              key={t.title}
              className={cn(
                "flex flex-col justify-between gap-6 overflow-hidden rounded-xl p-6 md:p-8",
                t.size === "wide" && "md:col-span-2",
                t.size === "tall" && "md:row-span-2",
                t.emphasis ? "bg-accent tone-accent" : "border border-border bg-card-soft",
              )}
            >
              <div className="flex flex-col gap-3">
                {t.icon && <IconTile name={t.icon} variant={t.emphasis ? "outline" : "soft"} />}
                <Subheading>{t.title}</Subheading>
                <Body className="max-w-md">{t.body}</Body>
              </div>
              {t.visual && <div className="min-w-0">{t.visual}</div>}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
