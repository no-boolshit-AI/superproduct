// Sample product visuals for the gallery (fictional company "Orbit"). Not part of generated sites.
import { BrowserFrame, ChatBubble, DocSheet, KeyValues, Badge } from "@/components/ui";

export function SampleDashboard({ title = "Weekly operations" }: { title?: string }) {
  const rows = [
    ["Invoice matching", "Finance", "Automated", "2.5 h"],
    ["Supplier onboarding", "Procurement", "In review", "1.0 h"],
    ["Shift handover notes", "Operations", "Automated", "3.0 h"],
    ["Customer refunds", "Support", "Manual", "—"],
  ];
  return (
    <BrowserFrame url="app.orbit.example/workflows">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-subheading text-ink">{title}</p>
          <Badge variant="accent">Live</Badge>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[["Workflows", "24"], ["Hours saved", "38"], ["Needs review", "3"]].map(([k, v]) => (
            <div key={k} className="rounded-md border border-line p-3">
              <p className="text-micro text-muted">{k}</p>
              <p className="font-display text-heading text-ink">{v}</p>
            </div>
          ))}
        </div>
        <div className="divide-y divide-line rounded-md border border-line">
          {rows.map((r) => (
            <div key={r[0]} className="grid grid-cols-4 gap-2 px-3 py-2.5 text-small">
              <span className="text-ink">{r[0]}</span>
              <span className="text-muted">{r[1]}</span>
              <span className="text-accent-text">{r[2]}</span>
              <span className="text-right text-muted">{r[3]}</span>
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}

export function SampleChat() {
  return (
    <div className="tone-light flex flex-col gap-3 rounded-lg bg-canvas p-5 shadow-md">
      <ChatBubble from="Dana · Ops lead">Can we stop copying supplier invoices into the ledger by hand?</ChatBubble>
      <ChatBubble from="Orbit" align="right">Yes. I matched 212 of last month's 230 invoices automatically. 18 need a person.</ChatBubble>
      <ChatBubble from="Dana · Ops lead">Send me the 18.</ChatBubble>
    </div>
  );
}

export function SampleDoc() {
  return (
    <DocSheet
      title="Automation brief"
      meta="Supplier invoices · prepared for Finance"
      sections={[
        { heading: "Task", lines: ["Match supplier invoices to purchase orders", "2.5 hours a week today"] },
        { heading: "Recommendation", lines: ["Automate matching; keep exceptions with a person"] },
        { heading: "Next step", lines: ["Two-week pilot with last quarter's invoices"] },
      ]}
    />
  );
}

export function SampleSpecs() {
  return (
    <div className="tone-light rounded-lg bg-canvas p-5 shadow-md">
      <KeyValues rows={[{ key: "Runs on", value: "Your cloud or ours" }, { key: "Data kept", value: "30 days" }, { key: "Approvals", value: "Required for payments" }]} />
    </div>
  );
}
