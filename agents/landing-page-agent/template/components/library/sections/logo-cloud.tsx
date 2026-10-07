import { cn } from "@/lib/cn";
import { Placeholder, Section, Small } from "@/components/ui";

/**
 * SECTION 14 · Logo cloud
 * Customer or partner logos in a grid, or a slow marquee. Only logos the brief supplies.
 * With no logos, renders labelled placeholders — or leave the section out.
 */
export function LogoCloud({ id, label, logos = [], layout = "grid", placeholders = 6 }: { id?: string; label: string; logos?: { name: string; src?: string }[]; layout?: "grid" | "marquee"; placeholders?: number }) {
  const items = logos.length ? logos : Array.from({ length: placeholders }, (_, i) => ({ name: `Logo ${i + 1}` }));
  const render = (l: { name: string; src?: string }, decorative = false) =>
    !logos.length ? (
      <Placeholder label="Customer logo" />
    ) : l.src ? (
      <img src={l.src} alt={decorative ? "" : l.name} className="h-8 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0" />
    ) : (
      <span className="font-display text-subheading text-fg-faint">{l.name}</span>
    );
  return (
    <Section id={id} spacing="tight">
      <Small className="mb-8 text-center">{label}</Small>
      {layout === "marquee" ? (
        <div className="fade-x overflow-hidden">
          <ul className="flex w-max animate-marquee items-center gap-16 hover:[animation-play-state:paused]">
            {[...items, ...items].map((l, i) => (
              <li key={i} aria-hidden={i >= items.length || undefined} className="flex h-10 items-center">
                {render(l, i >= items.length)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className={cn("grid grid-cols-2 items-center justify-items-center gap-x-8 gap-y-10 sm:grid-cols-3", items.length > 4 && "lg:grid-cols-6")}>
          {items.map((l, i) => (
            <li key={i} className="flex h-10 items-center">{render(l)}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}
