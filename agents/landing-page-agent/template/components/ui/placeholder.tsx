import { cn } from "@/lib/cn";

/** Visible stand-in for something the brief did not supply (logo, quote, metric, photo). Never replace with invented content. */
export function Placeholder({ label, className, block = false }: { label: string; className?: string; block?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-dashed border-border-strong px-3 py-1.5 text-small text-fg-faint",
        block && "flex min-h-40 w-full bg-card-soft",
        className,
      )}
    >
      [{label}]
    </span>
  );
}
