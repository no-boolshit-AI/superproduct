import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, Section, SectionIntro, type SectionTone } from "@/components/ui";

type Cell = boolean | string;

/**
 * SECTION 10 · Comparison table
 * The product against the status quo or a named alternative, row by row.
 * Best for: switching decisions ("instead of spreadsheets", "vs. hiring an agency").
 */
export function ComparisonTable({
  id,
  kicker,
  title,
  lead,
  columns,
  rows,
  tone = "canvas",
}: {
  id?: string;
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  /** [our column, their column], e.g. ["With us", "Doing it in-house"]. */
  columns: [string, string];
  rows: { label: string; ours: Cell; theirs: Cell }[];
  tone?: SectionTone;
}) {
  const cell = (v: Cell, ours: boolean) =>
    typeof v === "boolean" ? (
      <span className={cn("inline-grid size-7 place-items-center rounded-full", v ? (ours ? "bg-accent text-on-accent" : "bg-card-soft text-fg") : "bg-card-soft text-fg-faint")}>
        <Icon name={v ? "check" : "minus"} className="size-4" strokeWidth={2.5} />
        <span className="sr-only">{v ? "Yes" : "No"}</span>
      </span>
    ) : (
      <span className={cn("text-body", ours ? "text-fg" : "text-fg-muted")}>{v}</span>
    );
  return (
    <Section id={id} tone={tone}>
      <div className="flex flex-col section-gap">
        <SectionIntro kicker={kicker} title={title} lead={lead} align="center" />
        <div className="mx-auto w-full max-w-4xl overflow-x-auto">
          <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th scope="col" className="w-2/5 pb-4 text-label text-fg-muted" />
                <th scope="col" className="rounded-t-lg bg-accent-soft px-6 py-4 text-label text-accent-text">{columns[0]}</th>
                <th scope="col" className="px-6 py-4 text-label text-fg-muted">{columns[1]}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label}>
                  <th scope="row" className="border-t border-border py-5 pr-6 text-label text-fg">{r.label}</th>
                  <td className={cn("border-t border-accent-line bg-accent-soft/60 px-6 py-5", i === rows.length - 1 && "rounded-b-lg")}>{cell(r.ours, true)}</td>
                  <td className="border-t border-border px-6 py-5">{cell(r.theirs, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}
