import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

const sizes = { sm: ["size-9", "size-4"], md: ["size-11", "size-5"], lg: ["size-14", "size-6"] } as const;
const variants = {
  soft: "bg-accent-soft text-accent-text",
  solid: "bg-accent text-on-accent",
  outline: "border border-border bg-card text-fg",
} as const;

/** Icon in a rounded tile. */
export function IconTile({ name, size = "md", variant = "soft", className }: { name: IconName; size?: keyof typeof sizes; variant?: keyof typeof variants; className?: string }) {
  const [box, icon] = sizes[size];
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-md", box, variants[variant], className)}>
      <Icon name={name} className={icon} />
    </span>
  );
}
