import { cn } from "@/lib/cn";

/** Brand wordmark: supplied logo, or the brand name with an accent mark. */
export function Wordmark({ name, logoSrc, className }: { name: string; logoSrc?: string; className?: string }) {
  if (logoSrc) return <img src={logoSrc} alt={name} className={cn("h-7 w-auto", className)} />;
  return (
    <span className={cn("inline-flex items-center gap-2.5 whitespace-nowrap font-display text-subheading text-fg", className)}>
      <span aria-hidden className="grid size-7 place-items-center rounded-sm bg-accent">
        <span className="size-2.5 rounded-full bg-on-accent" />
      </span>
      {name}
    </span>
  );
}
