// Gallery of the reference library with sample content for a fictional company ("Orbit").
// Built by `npm run gallery`; never copied into generated sites.
import type { ReactNode } from "react";
import { site } from "@/site.config";
import { Footer, Nav } from "@/components/site";
import {
  BeforeAfter, CaseStudy, ComparisonTable, CtaBanner, DirectoryFilter, FaqSplit, FeatureAccordionVisual, FeatureAlternating, FeatureBento,
  FeatureCarousel, FeatureIconGrid, FeatureStickyList, FeatureTabs, HeroBento, HeroCarousel, HeroCentered, HeroDocumentStack, HeroEditorial,
  HeroLeadForm, HeroSplit, HeroSpotlight, HeroStats, HeroTabbedDemo, IntegrationsGrid, LogoCloud, Manifesto, NewsletterSignup, PricingMatrix,
  PricingTiers, ProcessStepper, ProcessTimeline, PullQuote, ResourceCards, RoiCalculator, SpecSheet, StatsBand, TeamGrid, TestimonialCarousel,
  TestimonialWall, VideoFeature,
} from "@/components/library";
import { SampleChat, SampleDashboard, SampleDoc, SampleSpecs } from "./gallery-visuals";

const cta = { label: "Book a walkthrough", href: "#" };
const cta2 = { label: "See pricing", href: "#" };

function Item({ n, name, children }: { n: string; name: string; children: ReactNode }) {
  return (
    <>
      <div className="border-y border-line bg-subtle">
        <p className="container-page py-2 font-mono text-micro text-muted">
          {n} · {name}
        </p>
      </div>
      <div data-gallery-item={name}>{children}</div>
    </>
  );
}

export default function Page() {
  return (
    <>
      <Nav site={site} />
      <main id="top">
        <Item n="HERO 01" name="HeroCentered">
          <HeroCentered kicker="New · Approvals" title={<>Operations that run<br /> while you sleep.</>} lead="Orbit turns the repetitive work between your tools into reviewed, reliable workflows." primary={cta} secondary={cta2} note="Free pilot · No card needed" visual={<SampleDashboard />} />
        </Item>
        <Item n="HERO 02" name="HeroSplit">
          <HeroSplit kicker="For finance teams" title="Close the month without the copy-paste." lead="Invoices matched, exceptions flagged, approvals routed." points={["Works with your ledger", "Every change logged", "People approve payments"]} primary={cta} secondary={cta2} visual={<SampleChat />} />
        </Item>
        <Item n="HERO 03" name="HeroEditorial">
          <HeroEditorial kicker="Orbit · Operations studio" title="We automate the work nobody put in the job description." lead="A small team of operators and engineers who rebuild your busiest workflows, then hand them back." primary={cta} secondary={cta2} meta={["Lisbon & remote", "Since 2021", "40 workflows shipped"]} />
        </Item>
        <Item n="HERO 04" name="HeroTabbedDemo">
          <HeroTabbedDemo
            title="One workspace, three ways in."
            lead="Pick the view that matches your job."
            primary={cta}
            tabs={[
              { id: "ops", label: "Operations", icon: "workflow", content: <SampleDashboard /> },
              { id: "finance", label: "Finance", icon: "receipt", content: <div className="mx-auto max-w-md"><SampleDoc /></div> },
              { id: "it", label: "IT", icon: "shield-check", content: <div className="mx-auto max-w-xl"><SampleSpecs /></div> },
            ]}
          />
        </Item>
        <Item n="HERO 05" name="HeroLeadForm">
          <HeroLeadForm kicker="Free audit" title="Find the three workflows worth automating." lead="Send us your work email. We reply within two days with a short, specific brief." points={["No sales call required", "Written brief you can keep", "Plain answer when automation isn't worth it"]} form={{ title: "Get your audit", action: "mailto:hello@orbit.example", buttonLabel: "Request audit", subject: "Audit request", note: "We only use your email to send the brief.", footnote: "Replies come from a person, not a sequence." }} />
        </Item>
        <Item n="HERO 06" name="HeroStats">
          <HeroStats kicker="Orbit for operations" title="Less busywork. Same team." lead="Workflows that run in your tools, with people approving what matters." primary={cta} secondary={cta2} stats={[{ value: "38 h", label: "Saved per week", detail: "Median across pilots" }, { value: "212", label: "Invoices matched" }, { value: "3", label: "Exceptions to review" }, { value: "14 days", label: "Typical pilot" }]} />
        </Item>
        <Item n="HERO 07" name="HeroBento">
          <HeroBento kicker="Platform" title="Every handoff, handled." lead="Automate the steps between your tools and keep a person in the loop." primary={cta} visual={<div className="w-full max-w-xs"><SampleSpecs /></div>} tiles={[{ icon: "workflow", title: "Workflows", body: "Build from templates or describe the task in plain words." }, { icon: "shield-check", title: "Approvals", body: "Nothing pays, sends or deletes without sign-off." }, { icon: "line-chart", title: "Reporting", body: "See hours saved and exceptions per team." }]} />
        </Item>
        <Item n="HERO 08" name="HeroSpotlight">
          <HeroSpotlight kicker="Orbit 2.0" title="Your operations, on autopilot." lead="New approvals, audit trails and a self-hosted option." primary={cta} secondary={cta2} visual={<SampleDashboard title="All teams" />} />
        </Item>
        <Item n="HERO 09" name="HeroDocumentStack">
          <HeroDocumentStack kicker="Operations audit" title="Walk away with a plan, not a pitch." lead="Two weeks with your team, three documents you keep." outcomes={["A map of where time goes", "Three workflows rebuilt", "A playbook per workflow"]} primary={cta} documents={[{ title: "Automation brief", meta: "Finance", sections: [{ heading: "Task", lines: ["Invoice matching", "2.5 h/week"] }, { heading: "Verdict", lines: ["Automate with approvals"] }] }, { title: "Time map", meta: "Operations", sections: [{ heading: "Top tasks", lines: ["Handover notes · 3 h", "Supplier emails · 2 h"] }] }, { title: "Playbook", meta: "Support", sections: [{ heading: "Steps", lines: ["Trigger", "Checks", "Owner"] }] }]} />
        </Item>
        <Item n="HERO 10" name="HeroCarousel">
          <HeroCarousel kicker="Use cases" title="Built for the teams in the middle." lead="Finance, operations and support share the same handoffs." primary={cta} slides={[{ label: "Finance", title: "Invoice matching", body: "Exceptions only.", visual: <SampleDoc /> }, { label: "Operations", title: "Shift handovers", body: "Notes written for you.", visual: <SampleChat /> }, { label: "IT", title: "Access reviews", body: "Quarterly, automatic.", visual: <SampleSpecs /> }]} />
        </Item>

        <Item n="SECTION 01" name="FeatureIconGrid">
          <FeatureIconGrid kicker="Capabilities" title="Everything a workflow needs." lead="Six building blocks, one place to manage them." items={[{ icon: "workflow", title: "Triggers", body: "Start on a form, an email, a schedule or a webhook." }, { icon: "shield-check", title: "Approvals", body: "People sign off where money or data moves." }, { icon: "database", title: "Connectors", body: "Read and write to the tools you already use." }, { icon: "bot", title: "Agents", body: "Hand fuzzy steps to an agent with clear limits." }, { icon: "line-chart", title: "Reporting", body: "Hours saved and exceptions, per team." }, { icon: "lock", title: "Audit trail", body: "Every run and change, logged." }]} />
        </Item>
        <Item n="SECTION 02" name="FeatureBento">
          <FeatureBento kicker="Platform" title="Small pieces, big leverage." lead="Mix and match; start with one workflow." tiles={[{ title: "Workflow builder", body: "Describe the task; get a draft workflow to review.", icon: "wand", size: "wide", visual: <SampleChat /> }, { title: "Approvals", body: "One click, with context.", icon: "shield-check", size: "tall", emphasis: true }, { title: "Connectors", body: "Ledger, CRM, inbox, drive.", icon: "plug" }, { title: "Self-hosting", body: "Run it in your own cloud.", icon: "server" }]} />
        </Item>
        <Item n="SECTION 03" name="FeatureAlternating">
          <FeatureAlternating kicker="How it helps" title="From inbox to done." rows={[{ kicker: "Capture", title: "Requests arrive in one place.", body: "Emails, forms and tickets become structured tasks.", points: ["Deduplicated", "Assigned automatically"], visual: <SampleDashboard />, link: { label: "How capture works", href: "#" } }, { kicker: "Decide", title: "People approve what matters.", body: "Clear summaries; one-click approvals.", visual: <SampleChat /> }]} />
        </Item>
        <Item n="SECTION 04" name="FeatureTabs">
          <FeatureTabs kicker="Modules" title="Pick the module you need first." items={[{ id: "a", label: "Invoices", description: "Match and route", icon: "receipt", title: "Invoice matching", body: "Match invoices to purchase orders and route exceptions.", points: ["Three-way match", "Exceptions queue"], visual: <SampleDoc /> }, { id: "b", label: "Handovers", description: "Shift notes", icon: "repeat", title: "Shift handovers", body: "Notes drafted from the day's activity.", visual: <SampleChat /> }, { id: "c", label: "Access", description: "Quarterly reviews", icon: "lock", title: "Access reviews", body: "Owners confirm who still needs access.", visual: <SampleSpecs /> }]} />
        </Item>
        <Item n="SECTION 05" name="FeatureAccordionVisual">
          <FeatureAccordionVisual kicker="Under the hood" title="What happens on every run." items={[{ id: "1", title: "Read", body: "Orbit reads the new item from the source tool.", visual: <SampleDashboard /> }, { id: "2", title: "Check", body: "Rules and an agent check it against your policy.", visual: <SampleDoc /> }, { id: "3", title: "Ask", body: "Anything unusual goes to a person with context.", visual: <SampleChat /> }]} />
        </Item>
        <Item n="SECTION 06" name="FeatureCarousel">
          <FeatureCarousel kicker="Templates" title="Start from a template." lead="Twelve workflows teams launch first." cards={[{ title: "Invoice matching", body: "Finance · 2 days to set up", icon: "receipt", tag: "Finance" }, { title: "Supplier onboarding", body: "Procurement · 3 days", icon: "handshake", tag: "Procurement" }, { title: "Shift handovers", body: "Operations · 1 day", icon: "repeat", tag: "Ops" }, { title: "Refund approvals", body: "Support · 2 days", icon: "wallet", tag: "Support" }, { title: "Access reviews", body: "IT · 1 day", icon: "lock", tag: "IT" }]} />
        </Item>
        <Item n="SECTION 07" name="FeatureStickyList">
          <FeatureStickyList kicker="Why Orbit" title="Six reasons teams switch." lead="None of them are about AI hype." cta={cta} items={[{ title: "Your tools stay", body: "We connect what you have." }, { title: "People stay in charge", body: "Approvals by default." }, { title: "You can leave", body: "Export everything, any time." }, { title: "Priced per workflow", body: "Not per seat." }, { title: "Self-hosting", body: "Run it in your cloud." }]} />
        </Item>
        <Item n="SECTION 08" name="ProcessTimeline">
          <ProcessTimeline kicker="Pilot" title="Two weeks from call to live workflow." steps={[{ title: "Kick-off", body: "We map the workflow with the people who run it.", meta: "Day 1" }, { title: "Build", body: "A first version runs on last month's data.", meta: "Days 2–7" }, { title: "Review", body: "Your team checks every exception.", meta: "Days 8–12" }, { title: "Go live", body: "We switch it on and stay close.", meta: "Day 14" }]} />
        </Item>
        <Item n="SECTION 09" name="ProcessStepper">
          <ProcessStepper kicker="Method" title="Four steps, no surprises." steps={[{ id: "1", label: "Map", title: "Map the work", body: "Where time actually goes.", points: ["Interviews", "Tool logs"], visual: <SampleDashboard /> }, { id: "2", label: "Pick", title: "Pick three tasks", body: "Biggest time, lowest risk.", visual: <SampleDoc /> }, { id: "3", label: "Rebuild", title: "Rebuild them", body: "Hands-on with your team.", visual: <SampleChat /> }, { id: "4", label: "Hand back", title: "Hand back", body: "Playbooks and ownership.", visual: <SampleSpecs /> }]} />
        </Item>
        <Item n="SECTION 10" name="ComparisonTable">
          <ComparisonTable kicker="Compare" title="Orbit vs. another spreadsheet." columns={["With Orbit", "Spreadsheet + email"]} rows={[{ label: "Runs without someone remembering", ours: true, theirs: false }, { label: "Approvals with context", ours: true, theirs: "By email" }, { label: "Audit trail", ours: true, theirs: false }, { label: "Setup time", ours: "2 weeks", theirs: "Ongoing" }]} />
        </Item>
        <Item n="SECTION 11" name="PricingTiers">
          <PricingTiers kicker="Pricing" title="Priced per workflow." lead="Start with one. Add more when it pays." yearlyNote="2 months free" plans={[{ name: "Starter", description: "One workflow, one team.", price: { monthly: { amount: "€290", period: "/month" }, yearly: { amount: "€2,900", period: "/year" } }, features: ["1 workflow", "Approvals", "Email support"], cta: { label: "Start pilot", href: "#" } }, { name: "Team", description: "Up to five workflows.", price: { monthly: { amount: "€990", period: "/month" }, yearly: { amount: "€9,900", period: "/year" } }, features: ["5 workflows", "Agents", "Priority support"], cta: { label: "Start pilot", href: "#" }, highlighted: true, badge: "Most chosen" }, { name: "Self-hosted", description: "Your cloud, your rules.", price: { amount: "Custom" }, features: ["Unlimited workflows", "SSO", "Dedicated engineer"], cta: { label: "Talk to us", href: "#" } }]} footnote="Prices exclude VAT." />
        </Item>
        <Item n="SECTION 12" name="PricingMatrix">
          <PricingMatrix kicker="Compare plans" title="What's in each plan." plans={[{ name: "Starter", price: "€290/mo" }, { name: "Team", price: "€990/mo", highlighted: true }, { name: "Self-hosted", price: "Custom" }]} groups={[{ name: "Workflows", rows: [{ label: "Workflows included", values: ["1", "5", "Unlimited"] }, { label: "Agents", values: [false, true, true] }] }, { name: "Security", rows: [{ label: "SSO", values: [false, false, true] }, { label: "Audit log", values: [true, true, true] }] }]} />
        </Item>
        <Item n="SECTION 13" name="StatsBand">
          <StatsBand title="What a typical pilot changes." stats={[{ value: "38 h", label: "Saved per week" }, { value: "92%", label: "Runs with no exception" }, { value: "14 days", label: "To go live" }, { value: "0", label: "New tools to learn" }]} source="Sample figures for the gallery." />
        </Item>
        <Item n="SECTION 14" name="LogoCloud">
          <LogoCloud label="Teams already running workflows with Orbit" />
        </Item>
        <Item n="SECTION 15" name="TestimonialCarousel">
          <TestimonialCarousel kicker="Customers" title="In their words." items={[{ quote: "We stopped losing Monday mornings to invoice matching.", name: "Sample Person", role: "Finance lead (sample)" }, { quote: "The approvals are the part my auditors like most.", name: "Example Name", role: "Controller (sample)" }]} />
        </Item>
        <Item n="SECTION 16" name="TestimonialWall">
          <TestimonialWall kicker="Customers" title="Short and to the point." items={[{ quote: "Setup took two weeks, as promised.", name: "Sample A", role: "Ops (sample)" }, { quote: "Our handovers are finally readable.", name: "Sample B", role: "Shift lead (sample)" }, { quote: "I approve refunds from my phone now, with context.", name: "Sample C", role: "Support (sample)" }, { quote: "No new tool for the team to learn.", name: "Sample D", role: "IT (sample)" }, { quote: "Month-end used to take a week. Now it takes three days, and nobody stays late.", name: "Sample E", role: "Controller (sample)" }, { quote: "The exceptions queue is the first thing I open.", name: "Sample F", role: "AP clerk (sample)" }]} />
        </Item>
        <Item n="SECTION 17" name="FaqSplit">
          <FaqSplit kicker="FAQ" title="Questions we get." items={[{ q: "Do we need new tools?", a: "No. Orbit connects to what you already use." }, { q: "Who approves payments?", a: "A person, always. Orbit prepares; you decide." }, { q: "Can we self-host?", a: "Yes, on the Self-hosted plan." }]} contact={{ text: "Something else on your mind?", cta: { label: "Email the team", href: "mailto:hello@orbit.example" } }} />
        </Item>
        <Item n="SECTION 18" name="DirectoryFilter">
          <DirectoryFilter kicker="Library" title="Workflow templates." lead="Filter by team." filters={["Finance", "Operations", "IT"]} entries={[{ title: "Invoice matching", body: "Match invoices to purchase orders.", tags: ["Finance"], icon: "receipt" }, { title: "Expense checks", body: "Flag policy breaches.", tags: ["Finance"], icon: "wallet" }, { title: "Shift handovers", body: "Draft notes from activity.", tags: ["Operations"], icon: "repeat" }, { title: "Stock alerts", body: "Reorder before you run out.", tags: ["Operations"], icon: "package", status: "Coming soon" }, { title: "Access reviews", body: "Quarterly owner sign-off.", tags: ["IT"], icon: "lock" }]} more={{ label: "All templates", href: "#" }} />
        </Item>
        <Item n="SECTION 19" name="IntegrationsGrid">
          <IntegrationsGrid kicker="Connectors" title="Works with your stack." lead="Read and write to the tools you already pay for." items={[{ name: "Ledger", category: "Accounting", icon: "receipt" }, { name: "CRM", category: "Sales", icon: "users" }, { name: "Inbox", category: "Email", icon: "mail" }, { name: "Drive", category: "Files", icon: "file" }, { name: "Chat", category: "Messaging", icon: "message" }, { name: "Webhooks", category: "Custom", icon: "plug" }]} note="Need something else? Webhooks and an API cover the rest." />
        </Item>
        <Item n="SECTION 20" name="BeforeAfter">
          <BeforeAfter kicker="The change" title="Monday morning, before and after." before={{ label: "Today", items: ["Invoices copied by hand", "Approvals lost in email", "No idea where time goes"] }} after={{ label: "With Orbit", items: ["Invoices matched overnight", "Approvals in one place, with context", "Hours saved, per team"] }} />
        </Item>
        <Item n="SECTION 21" name="Manifesto">
          <Manifesto kicker="How we work" statements={[{ statement: "Automate the boring part, not the judgement.", detail: "People approve anything that moves money or data." }, { statement: "Use the tools you already have.", detail: "No rip-and-replace." }, { statement: "Leave whenever you want.", detail: "Everything exports." }]} />
        </Item>
        <Item n="SECTION 22" name="PullQuote">
          <PullQuote quote="The best automation is the one your team forgets is there." name="Sample Founder" role="Co-founder, Orbit (sample)" />
        </Item>
        <Item n="SECTION 23" name="CaseStudy">
          <CaseStudy kicker="Case study" customer="Sample Co." title="Month-end close in three days instead of eight." challenge="Invoices were matched by hand across two systems." approach="Orbit matched them nightly and queued exceptions." stats={[{ value: "3 days", label: "Close time" }, { value: "92%", label: "Auto-matched" }, { value: "0", label: "New tools" }]} visual={<SampleDoc />} link={{ label: "Read the case study", href: "#" }} />
        </Item>
        <Item n="SECTION 24" name="TeamGrid">
          <TeamGrid kicker="Team" title="The people you'll work with." people={[{ name: "Ana Sample", role: "Operations lead", bio: "Ran finance ops for ten years." }, { name: "Ben Example", role: "Engineer", bio: "Builds the connectors." }, { name: "Cleo Demo", role: "Designer" }, { name: "Dev Placeholder", role: "Support" }]} />
        </Item>
        <Item n="SECTION 25" name="RoiCalculator">
          <RoiCalculator kicker="Calculator" title="How much time is on the table?" lead="Move the sliders to match your team." inputs={[{ id: "hours", label: "Hours per person per week", min: 1, max: 10, defaultValue: 3, unit: "h" }, { id: "people", label: "People doing this work", min: 1, max: 50, defaultValue: 8 }]} factor={46} result={{ label: "Hours a year", suffix: " h" }} assumption="Assumes 46 working weeks a year." cta={cta} />
        </Item>
        <Item n="SECTION 26" name="CtaBanner">
          <CtaBanner title="Start with one workflow." lead="Two weeks, one team, a written result." primary={cta} secondary={cta2} note="No card needed." />
        </Item>
        <Item n="SECTION 27" name="NewsletterSignup">
          <NewsletterSignup kicker="Field notes" title="One automation idea a week." lead="Short, specific, no hype." action="mailto:hello@orbit.example" buttonLabel="Subscribe" subject="Subscribe" note="Unsubscribe any time." />
        </Item>
        <Item n="SECTION 28" name="ResourceCards">
          <ResourceCards kicker="Guides" title="Read before you automate." more={{ label: "All guides", href: "#" }} items={[{ title: "Pick your first workflow", excerpt: "A one-page method.", tag: "Guide", meta: "6 min read", icon: "compass" }, { title: "Approvals that work", excerpt: "Who signs what.", tag: "Guide", meta: "8 min read", icon: "shield-check" }, { title: "Self-hosting", excerpt: "Run Orbit in your cloud.", tag: "Docs", status: "Coming soon", icon: "server" }, { title: "Agents with limits", excerpt: "Where they help.", tag: "Essay", status: "Coming soon", icon: "bot" }]} />
        </Item>
        <Item n="SECTION 29" name="SpecSheet">
          <SpecSheet kicker="Security" title="What happens to your data." lead="The short version, in plain words." groups={[{ icon: "lock", name: "Storage", rows: [{ key: "Region", value: "EU by default" }, { key: "Retention", value: "30 days for run data" }] }, { icon: "shield-check", name: "Access", rows: [{ key: "SSO", value: "Self-hosted plan" }, { key: "Approvals", value: "Required for payments" }] }]} />
        </Item>
        <Item n="SECTION 30" name="VideoFeature">
          <VideoFeature kicker="Demo" title="See a workflow run end to end." lead="Three minutes, no voice-over." videoTitle="Orbit demo" />
        </Item>
      </main>
      <Footer site={site} />
    </>
  );
}
