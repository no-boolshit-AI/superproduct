import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Browser-style frame for screenshots and product visuals. */
export function BrowserFrame({ children, url, src, alt, className }: { children?: ReactNode; url?: string; src?: string; alt?: string; className?: string }) {
  return (
    <div className={cn("tone-light overflow-hidden rounded-lg border border-line bg-canvas shadow-lg", className)}>
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </span>
        {url && <span className="truncate rounded-sm bg-canvas px-3 py-1 text-micro text-muted">{url}</span>}
      </div>
      {src ? <img src={src} alt={alt ?? ""} className="block h-auto w-full" /> : children}
    </div>
  );
}

/** A document preview: title, meta and a few sections. For reports, briefs, playbooks, contracts. */
export function DocSheet({ title, meta, sections, className }: { title: string; meta?: string; sections: { heading: string; lines: string[] }[]; className?: string }) {
  return (
    <div className={cn("tone-light rounded-md border border-line bg-canvas p-6 shadow-md", className)}>
      <p className="font-display text-subheading">{title}</p>
      {meta && <p className="mt-1 text-micro text-muted">{meta}</p>}
      <div className="mt-5 flex flex-col gap-4">
        {sections.map((s) => (
          <div key={s.heading} className="flex flex-col gap-1.5">
            <p className="text-micro text-accent-text">{s.heading}</p>
            {s.lines.map((l) => (
              <p key={l} className="text-small text-ink-soft">{l}</p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One chat message. */
export function ChatBubble({ from, children, align = "left", className }: { from: string; children: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <div className={cn("flex max-w-md flex-col gap-1", align === "right" && "ml-auto items-end", className)}>
      <span className="text-micro text-fg-faint">{from}</span>
      <div className={cn("rounded-lg px-4 py-3 text-small", align === "right" ? "bg-accent text-on-accent" : "border border-line bg-canvas text-ink")}>{children}</div>
    </div>
  );
}

/** Initials avatar, or a supplied photo. */
export function Avatar({ name, src, size = "md", className }: { name: string; src?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = { sm: "size-8 text-micro", md: "size-11 text-label", lg: "size-16 text-subheading" }[size];
  if (src) return <img src={src} alt={name} className={cn("rounded-full object-cover", box, className)} />;
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text", box, className)}>
      {initials}
    </span>
  );
}

/** Image with rounded corners, or a labelled placeholder when no src is supplied. */
export function Media({ src, alt, label = "Image", className }: { src?: string; alt?: string; label?: string; className?: string }) {
  if (src) return <img src={src} alt={alt ?? ""} className={cn("h-full w-full rounded-lg object-cover", className)} />;
  return (
    <div className={cn("grid min-h-56 w-full place-items-center rounded-lg border border-dashed border-border-strong bg-card-soft text-small text-fg-faint", className)}>
      [{label}]
    </div>
  );
}

/** Key/value rows split by thin rules: specs, terms, data handling. */
export function KeyValues({ rows, className }: { rows: { key: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border border-y border-border", className)}>
      {rows.map((r) => (
        <div key={r.key} className="grid gap-1 py-4 sm:grid-cols-3 sm:gap-6">
          <dt className="text-label text-fg">{r.key}</dt>
          <dd className="text-body text-fg-muted sm:col-span-2">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
