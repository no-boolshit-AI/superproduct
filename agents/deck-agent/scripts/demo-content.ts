/** Sample documents used by `npm run demo`, the tests and the layout gallery. All companies and numbers are fictional. */
import type { ElementSpec } from "../src/elements/types.js";
import type { DocMeta, PageSpec } from "../src/layouts.js";

export interface DemoDoc {
  doc: DocMeta;
  elements: ElementSpec[];
  pages: PageSpec[];
}

const SRC = "Northwind management accounts; team analysis (illustrative data)";

export function strategyDeck(theme: DocMeta["theme"] = "strategy"): DemoDoc {
  return {
    doc: {
      format: "deck",
      theme,
      title: "Returning Northwind to profitable growth",
      subtitle: "Diagnostic and recommended path, 2026–2029",
      client: "Northwind Retail Group",
      author: "Strategy team",
      date: "October 2026",
      confidentiality: "Confidential and proprietary. Any use of this material without specific permission is strictly prohibited.",
      language: "en",
    },
    elements: [
      {
        kind: "chart", id: "revenue-growth", type: "column",
        categories: ["2019", "2020", "2021", "2022", "2023", "2024", "2025"],
        series: [{ name: "Revenue", values: [3.1, 3.3, 3.6, 4.0, 4.3, 4.35, 4.38] }],
        number: { decimals: 1 },
        highlight: [5, 6],
        cagr: { from: 0, to: 4 },
      },
      {
        kind: "chart", id: "ebit-bridge", type: "waterfall",
        steps: [
          { label: "EBIT 2023", value: 312 },
          { label: "Volume", value: 46 },
          { label: "Price / mix", value: 38 },
          { label: "Input costs", value: -71 },
          { label: "Wages", value: -52 },
          { label: "Store opex", value: -24 },
          { label: "EBIT 2025", value: 249, kind: "end" },
        ],
        number: { decimals: 0 },
      },
      {
        kind: "chart", id: "revenue-mix", type: "donut",
        categories: ["Grocery", "Home & living", "Apparel", "Online marketplace", "Services"],
        series: [{ name: "2025", values: [2.05, 0.96, 0.61, 0.53, 0.23] }],
        number: { decimals: 1, suffix: "bn" },
        center_label: "€4.4bn", center_sublabel: "revenue 2025",
      },
      {
        kind: "chart", id: "margin-by-segment", type: "bar",
        categories: ["Online marketplace", "Services", "Grocery", "Home & living", "Apparel"],
        series: [{ name: "EBIT margin", values: [11.8, 9.4, 5.1, 3.2, -1.6] }],
        number: { decimals: 1, suffix: "%" },
        highlight: [0, 1],
      },
      {
        kind: "kpis", id: "kpis-2025", style: "plain",
        items: [
          { value: "€4.38bn", label: "Revenue 2025", delta: "+0.7% vs. 2024", sentiment: "neutral", trend: "flat" },
          { value: "5.7%", label: "EBIT margin", delta: "−1.6 pp vs. 2023", trend: "down", sentiment: "negative" },
          { value: "€182m", label: "Free cash flow", delta: "−24% vs. 2023", trend: "down", sentiment: "negative" },
          { value: "61", label: "Net promoter score", delta: "+4 pts", trend: "up", sentiment: "positive", highlight: true },
        ],
      },
      {
        kind: "chart", id: "like-for-like", type: "line",
        categories: ["Q1 24", "Q2 24", "Q3 24", "Q4 24", "Q1 25", "Q2 25", "Q3 25", "Q4 25"],
        series: [
          { name: "Northwind", values: [2.1, 1.4, 0.8, 0.2, -0.4, -0.9, -0.6, -1.1] },
          { name: "Market", values: [1.8, 1.9, 2.2, 2.0, 2.4, 2.1, 2.3, 2.5] },
        ],
        number: { decimals: 1, suffix: "%" },
        highlight_series: 0,
        reference_line: { value: 0 },
      },
      {
        kind: "diagram", id: "priority-matrix", type: "matrix",
        x_axis: { label: "Ease of implementation", low: "Hard", high: "Easy" },
        y_axis: { label: "EBIT impact", low: "Low", high: "High" },
        quadrants: [
          { title: "Major projects", text: "Plan carefully, stage-gate" },
          { title: "Quick wins", text: "Launch within 6 months", highlight: true },
          { title: "Deprioritise", text: "Park or drop" },
          { title: "Fill-ins", text: "Bundle into BAU" },
        ],
        items: [
          { label: "Assortment pruning", x: 78, y: 82, highlight: true },
          { label: "Dynamic pricing", x: 64, y: 70, highlight: true },
          { label: "Store format reset", x: 22, y: 86 },
          { label: "Marketplace scale-up", x: 35, y: 66 },
          { label: "Indirect procurement", x: 84, y: 40 },
          { label: "Loyalty relaunch", x: 58, y: 30 },
          { label: "Apparel exit", x: 18, y: 38 },
        ],
      },
      {
        kind: "diagram", id: "plan-phases", type: "process",
        steps: [
          { title: "Diagnose", text: "Baseline by category and store; size the profit pools; agree targets", icon: "search" },
          { title: "Design", text: "Detail the four moves; business cases; owner per initiative", icon: "layers" },
          { title: "Pilot", text: "Test in 40 stores and two categories; refine the playbook", icon: "target", highlight: true },
          { title: "Scale", text: "Roll out in three waves; transformation office tracks value weekly", icon: "rocket" },
          { title: "Sustain", text: "Embed in budgeting, incentives and capability building", icon: "refresh" },
        ],
      },
      {
        kind: "diagram", id: "roadmap", type: "roadmap",
        periods: ["Q1 27", "Q2 27", "Q3 27", "Q4 27", "Q1 28", "Q2 28", "Q3 28", "Q4 28"],
        rows: [
          { label: "Commercial", group: true, bars: [{ start: 0, end: 8 }] },
          { label: "Assortment pruning", bars: [{ start: 0, end: 3, label: "Wave 1–2" }, { start: 3, end: 5, label: "Wave 3", color: "c3" }] },
          { label: "Dynamic pricing", bars: [{ start: 1, end: 6, label: "Pilot → national" }], milestones: [{ at: 6, label: "Go-live" }] },
          { label: "Operations", group: true, bars: [{ start: 0, end: 8 }] },
          { label: "Store format reset", bars: [{ start: 2, end: 8, label: "120 stores" }] },
          { label: "Procurement", bars: [{ start: 0, end: 4, label: "Indirect spend" }] },
          { label: "Enablers", group: true, bars: [{ start: 0, end: 8 }] },
          { label: "Transformation office", bars: [{ start: 0, end: 8, label: "Weekly value tracking", color: "c4" }] },
        ],
        now: 0.5,
      },
      {
        kind: "table", id: "options", header: "line",
        columns: [
          { label: "Option", width: 2.2 },
          { label: "EBIT uplift, €m", type: "number", width: 1.1 },
          { label: "Capex, €m", type: "number", width: 1 },
          { label: "Time to impact", width: 1.1, align: "center" },
          { label: "Strategic fit", type: "harvey", width: 1 },
          { label: "Risk", type: "rag", width: 0.7 },
        ],
        rows: [
          { cells: ["A. Fix the core (pricing, assortment, cost)", 145, 40, "6–12 months", 4, "g"], style: "highlight" },
          { cells: ["B. Scale the online marketplace", 60, 85, "18–24 months", 3, "a"] },
          { cells: ["C. Reset 120 store formats", 55, 210, "24–36 months", 3, "a"] },
          { cells: ["D. Exit apparel", 18, 5, "12 months", 2, "r"] },
          { cells: ["Total, recommended (A + B + C)", 260, 335, "", null, null], style: "total" },
        ],
      },
      {
        kind: "diagram", id: "ebit-tree", type: "tree",
        nodes: [
          { id: "ebit", label: "EBIT uplift", value: "€260m", operator: "+" },
          { id: "rev", parent: "ebit", label: "Gross margin", value: "+€170m", operator: "+" },
          { id: "cost", parent: "ebit", label: "Operating cost", value: "+€90m", operator: "+" },
          { id: "price", parent: "rev", label: "Pricing & promotions", value: "+€75m", highlight: true },
          { id: "assort", parent: "rev", label: "Assortment & private label", value: "+€55m" },
          { id: "mkt", parent: "rev", label: "Marketplace take rate", value: "+€40m" },
          { id: "stores", parent: "cost", label: "Store labour scheduling", value: "+€50m" },
          { id: "proc", parent: "cost", label: "Indirect procurement", value: "+€40m" },
        ],
      },
      {
        kind: "chart", id: "market-map", type: "scatter",
        points: [
          { label: "Grocery", x: 2.1, y: 1.5, size: 2050 },
          { label: "Home & living", x: 3.4, y: 0.9, size: 960 },
          { label: "Apparel", x: -1.2, y: 0.4, size: 610 },
          { label: "Marketplace", x: 14.5, y: 1.2, size: 530, highlight: true },
          { label: "Services", x: 8.2, y: 0.7, size: 230, highlight: true },
        ],
        x_title: "Market growth 2025–29, % p.a.",
        y_title: "Relative market share",
        x_number: { decimals: 0, suffix: "%" },
        number: { decimals: 1, suffix: "x" },
        quadrants: { x: 4, y: 1, labels: ["Defend", "Invest", "Exit / harvest", "Build"] },
      },
      {
        kind: "chart", id: "channel-mix", type: "stacked-column",
        categories: ["2021", "2022", "2023", "2024", "2025", "2029 target"],
        series: [
          { name: "Stores", values: [3.1, 3.3, 3.4, 3.35, 3.3, 3.4] },
          { name: "Online (own)", values: [0.4, 0.5, 0.6, 0.65, 0.68, 0.95] },
          { name: "Marketplace", values: [0.1, 0.2, 0.3, 0.35, 0.4, 0.95] },
        ],
        number: { decimals: 1 },
        cagr: { from: 4, to: 5, label: "+6% p.a." },
      },
    ],
    pages: [
      { layout: "cover", slots: { kicker: "Board of Directors · Strategy review", date: "October 2026", confidentiality: "default" } },
      {
        layout: "executive-summary",
        title: "Northwind can restore a 9% EBIT margin by 2029 if it fixes the core first and funds growth from the savings",
        slots: {
          points: `- **Growth has stalled while costs kept rising.** Revenue grew 6% a year in 2019–23 but only 0.7% in 2025; EBIT fell from €312m to €249m.
- **The decline is concentrated.** Apparel and home & living earn 3% or less; grocery is stable; marketplace and services earn 9–12% but are sub-scale.
- **Four moves add €260m EBIT.** Pricing and assortment, store labour, procurement, and scaling the marketplace, sequenced so early savings fund later investment.
- **The plan needs €335m capex over three years** and pays back in 2.4 years; the apparel exit is optional and decided in Q2 2027.
- **We ask the board to approve** the transformation office, the pilot budget of €40m and the 2027 wave plan.`,
        },
        source: SRC,
      },
      { layout: "agenda", title: "Agenda", slots: { items: "Where we stand — performance and root causes\nWhat we recommend — four moves\nHow we get there — roadmap, investment, governance\nDecisions requested today", active: "1" } },
      { layout: "section", title: "Where we stand", slots: { number: "01", intro: "Performance since 2019 and what is driving the decline" } },
      {
        layout: "exhibit",
        title: "Revenue grew 6% a year until 2023, but growth has stalled for the last two years",
        subtitle: "Group revenue, € bn",
        slots: { element: "revenue-growth", takeaway: "Without action, 2026 revenue is expected to be flat while costs keep rising 3–4% a year" },
        source: SRC,
      },
      {
        layout: "chart-takeaways",
        title: "Input costs and wages wiped out volume and price gains, cutting EBIT by €63m in two years",
        subtitle: "EBIT bridge 2023–25, € m",
        slots: {
          element: "ebit-bridge",
          takeaways: `- **Cost inflation is the main driver.** Input costs and wages took €123m, twice the commercial gains.
- **Price did not keep up.** Northwind passed through 45% of cost inflation vs. ~70% for peers.
- **Store opex keeps creeping up** as volumes per store fall.`,
        },
        source: SRC,
        notes: ["Before one-off items (restructuring €14m in 2024)"],
      },
      {
        layout: "two-column",
        title: "Most profit already comes from segments that are small today: marketplace and services",
        slots: { left_title: "Revenue mix 2025", left: "revenue-mix", right_title: "EBIT margin by segment, 2025", right: "margin-by-segment", highlight: "right" },
        source: SRC,
      },
      {
        layout: "kpi-dashboard",
        title: "Like-for-like sales have trailed the market for six quarters while customers still rate us well",
        slots: { kpis: "kpis-2025", main: "### Like-for-like sales growth, % vs. prior year\n\n<x-el id=\"like-for-like\"></x-el>\n\n---\n\n### What we hear from customers\n\n- Value perception is the top reason for switching (38% of lapsed customers)\n- Range is seen as **too broad and too similar** to discounters\n- Service and store staff remain a clear strength (NPS +4 pts)" },
        source: "Northwind finance; customer survey Q3 2025, n = 2,400 (illustrative)",
      },
      { layout: "section", title: "What we recommend", slots: { number: "02", intro: "Four moves that fix the core and fund growth" } },
      {
        layout: "columns",
        title: "Four moves add €260m EBIT by 2029, with the core fixes funding the growth moves",
        slots: {
          columns: `icon: coin
big: +€75m
### Price & promotions
Close the price-perception gap on 600 key value items; cut promotion depth by a third.\n\n- Owner: Chief Commercial Officer\n- Run-rate by Q4 2027
---
icon: layers
big: +€55m
### Assortment & private label
Prune 18% of SKUs; raise private-label share from 24% to 32%.\n\n- Owner: Chief Merchandising Officer\n- Run-rate by Q2 2028
---
icon: people
big: +€50m
### Store labour
Demand-based scheduling and self-checkout in the 200 largest stores.\n\n- Owner: COO\n- Run-rate by Q4 2028
---
icon: rocket
big: +€80m
highlight
### Marketplace & procurement
Scale third-party sellers to 2.5x and renegotiate indirect spend.\n\n- Owner: CDO and CPO\n- Run-rate by Q4 2028`,
          style: "line",
          footer: "The two core fixes on the left deliver 60% of the value within 18 months and fund the growth moves",
        },
        source: SRC,
      },
      {
        layout: "chart-takeaways",
        title: "Pricing and assortment are quick wins; the store reset is the largest but hardest move",
        slots: { element: "priority-matrix", takeaways: "- Start with the two **quick wins**: they deliver 50% of the value in year one\n- Stage-gate the **store format reset** after the pilot\n- Decide on **apparel** in Q2 2027 once pruning results are in", takeaways_title: "Implications" },
        source: "Team analysis based on management workshops (illustrative)",
      },
      {
        layout: "exhibit",
        title: "A five-phase programme moves from diagnosis to scale in 18 months",
        slots: { element: "plan-phases" },
      },
      {
        layout: "exhibit",
        title: "Commercial moves start immediately; store resets ramp up from Q3 2027",
        slots: { element: "roadmap" },
        source: "Team analysis",
      },
      {
        layout: "exhibit",
        title: "Fixing the core delivers the most value for the least capital and risk",
        subtitle: "Assessment of strategic options",
        slots: { element: "options", takeaway: "Recommendation: pursue A immediately, B and C stage-gated; decide on D in Q2 2027" },
        source: SRC,
        notes: ["Run-rate EBIT uplift in 2029 vs. 2025 baseline", "Harvey balls: fit with the 2030 ambition (full = strong fit)"],
      },
      {
        layout: "exhibit",
        title: "Gross margin levers account for two-thirds of the uplift",
        subtitle: "EBIT uplift by driver, 2029 run-rate",
        slots: { element: "ebit-tree" },
        source: SRC,
      },
      {
        layout: "chart-takeaways",
        title: "Marketplace and services sit in the fastest-growing markets and deserve investment",
        subtitle: "Bubble size = 2025 revenue",
        slots: { element: "market-map", takeaways: "- **Invest:** marketplace and services grow 8–15% a year\n- **Defend:** grocery is the cash engine\n- **Harvest:** apparel shrinks and loses share" },
        source: "Euromonitor-style market model; team analysis (illustrative)",
      },
      {
        layout: "exhibit",
        title: "Marketplace and own online grow to 30% of sales by 2029",
        subtitle: "Revenue by channel, € bn",
        slots: { element: "channel-mix" },
        source: SRC,
      },
      { layout: "statement", title: "What it adds up to", slots: { number: "9.1%", statement: "EBIT margin in 2029, up from 5.7% today", support: "€260m additional EBIT, €335m capex, payback in 2.4 years" } },
      {
        layout: "closing",
        title: "Decisions requested today",
        slots: {
          message: "Decisions requested today",
          body: "1. Approve the transformation office and its leadership\n2. Release the €40m pilot budget\n3. Endorse the 2027 wave plan and the Q2 2027 apparel decision point",
          contacts: "**Jane Doe**\nProgramme lead\njane.doe@example.com\n---\n**John Smith**\nCFO office\njohn.smith@example.com",
        },
      },
    ],
  };
}

export function strategyReport(theme: DocMeta["theme"] = "strategy"): DemoDoc {
  const lorem = (topic: string) =>
    `Across the 1,200 companies in our sample, ${topic} explains more of the gap between leaders and laggards than any other factor. Leaders reinvested a larger share of their savings, moved earlier, and kept a tighter link between strategy and budget.\n\nThe pattern holds across sectors and regions, although the size of the effect varies. Companies that acted in the first year of a downturn recovered faster and captured more share when demand returned.`;
  return {
    doc: {
      format: "report",
      theme,
      title: "The resilience premium",
      subtitle: "How European mid-caps outperformed through the 2023–25 slowdown",
      client: "Research report",
      author: "Northwind Institute",
      date: "October 2026",
      running_title: "The resilience premium",
      language: "en",
    },
    elements: [
      {
        kind: "kpis", id: "numbers", style: "plain", columns: 2,
        items: [
          { value: "1,200", label: "European mid-caps analysed, 2015–25" },
          { value: "+7.4 pp", label: "Annual TSR premium of resilient companies", highlight: true },
          { value: "18%", label: "of companies qualify as 'resilient'" },
          { value: "2.1x", label: "Faster recovery to pre-downturn EBITDA" },
        ],
      },
      {
        kind: "chart", id: "tsr-gap", type: "line",
        categories: ["2019", "2020", "2021", "2022", "2023", "2024", "2025"],
        series: [
          { name: "Resilient", values: [100, 104, 121, 128, 136, 151, 166] },
          { name: "Others", values: [100, 92, 105, 103, 101, 108, 114] },
        ],
        number: { decimals: 0 },
        highlight_series: 0,
      },
      {
        kind: "chart", id: "levers", type: "bar",
        categories: ["Cut cost early and deep", "Protected R&D budgets", "Divested weak units", "Raised prices first", "Increased capex", "Hired in the downturn"],
        series: [{ name: "Share of resilient companies", values: [71, 64, 52, 47, 33, 29] }],
        number: { decimals: 0, suffix: "%" },
        highlight: [0, 1],
      },
      {
        kind: "table", id: "sector-table", header: "line", density: "compact",
        columns: [
          { label: "Sector", width: 1.8 },
          { label: "Companies", type: "number" },
          { label: "Resilient share", type: "bar", number: { suffix: "%" }, width: 1.6 },
          { label: "TSR premium", type: "delta", number: { suffix: " pp", decimals: 1 } },
        ],
        rows: [
          { cells: ["Industrials", 310, 21, 8.2] },
          { cells: ["Consumer", 240, 15, 6.1] },
          { cells: ["Technology", 180, 24, 9.7] },
          { cells: ["Healthcare", 150, 19, 5.4] },
          { cells: ["Materials", 170, 12, 4.9] },
          { cells: ["Services", 150, 16, 6.6] },
          { cells: ["All sectors", 1200, 18, 7.4], style: "total" },
        ],
      },
      {
        kind: "diagram", id: "playbook", type: "pyramid",
        steps: [
          { title: "Act early", text: "Move within the first two quarters of a slowdown" },
          { title: "Reallocate", text: "Shift 10–15% of budgets to growth pockets" },
          { title: "Protect the core", text: "Defend pricing, customers and key talent" },
          { title: "Build the cash buffer", text: "Working capital and capex discipline before the downturn" },
        ],
      },
    ],
    pages: [
      { layout: "cover", slots: { kicker: "Research report", date: "October 2026", presenter: "Northwind Institute" } },
      { layout: "contents", title: "Contents", slots: {} },
      {
        layout: "summary",
        title: "Executive summary",
        slots: {
          lead: "Resilient mid-caps delivered a total shareholder return premium of 7.4 percentage points a year through the slowdown. They were not luckier; they moved earlier, cut deeper and reinvested faster.",
          findings: `- **Resilience pays.** The 18% of companies we classify as resilient outperformed peers by 7.4 pp TSR a year.
- **Speed matters more than size.** Acting in the first two quarters doubled the odds of recovery.
- **Leaders cut and invested at the same time.** 64% protected R&D while cutting overhead by more than 10%.
- **The premium persists.** Five years later, resilient companies still trade at a 1.4x multiple premium.`,
          body: lorem("speed of response") + "\n\n" + lorem("reallocation"),
        },
      },
      { layout: "numbers", title: "The study in numbers", slots: { kpis: "numbers", body: "Based on financial data for 1,200 listed European companies with revenue of €0.5–5bn, 2015–25. Resilience is defined by revenue and EBITDA development through the 2023–25 slowdown relative to sector peers." } },
      { layout: "chapter", title: "What sets resilient companies apart", slots: { number: "1", standfirst: "Resilient companies prepared before the downturn, moved early when it came and kept investing in growth throughout.", body: lorem("preparation") } },
      {
        layout: "article",
        title: "Resilient companies pulled away within two years",
        slots: {
          body: "### A widening gap\n\n" + lorem("the timing of the response") + "\n\n### Not just a sector story\n\n" + lorem("sector mix"),
          exhibit: "tsr-gap",
          exhibit_title: "Resilient companies have outperformed by 52 index points since 2019",
          exhibit_subtitle: "Total shareholder return, index 2019 = 100",
          exhibit_source: "Northwind Institute mid-cap database (illustrative)",
          exhibit_height: "290",
        },
      },
      {
        layout: "exhibit-page",
        title: "Cutting cost early and protecting R&D were the most common moves among resilient companies",
        subtitle: "Share of resilient companies using each lever, %",
        slots: { element: "levers", commentary: lorem("early cost action") + "\n\n" + lorem("protecting R&D") },
        source: "Northwind Institute survey of 240 executives (illustrative)",
        notes: ["Multiple answers possible"],
      },
      { layout: "chapter", title: "A playbook for the next downturn", slots: { number: "2", standfirst: "Four moves, in order, separate the companies that recover fastest." } },
      {
        layout: "article",
        title: "Four moves, in order",
        slots: {
          body: lorem("sequencing") + "\n\n" + lorem("governance"),
          exhibit: "playbook",
          exhibit_title: "Resilience is built before the downturn and exploited during it",
          exhibit_subtitle: "The resilience playbook",
          exhibit_source: "Northwind Institute",
          exhibit_height: "330",
          columns: "2",
        },
      },
      {
        layout: "article",
        title: "Every sector has resilient leaders",
        slots: {
          standfirst: "Technology and industrials have the highest share of resilient companies, but the premium is positive in every sector.",
          exhibit: "sector-table",
          exhibit_title: "The resilience premium is positive in all six sectors",
          exhibit_subtitle: "Resilient share of companies and annual TSR premium, 2019–25",
          exhibit_source: "Northwind Institute mid-cap database (illustrative)",
          exhibit_height: "250",
          body: lorem("sector differences"),
          aside: "**Methodology**\n\nResilient companies grew revenue and EBITDA faster than the sector median in both 2023 and 2024 and recovered pre-downturn EBITDA by 2025.",
        },
      },
      { layout: "back-cover", slots: { body: "**About the Northwind Institute**\n\nThe Northwind Institute is the research arm of Northwind Partners. This report is illustrative sample content created to demonstrate the deck agent.\n\ncontact@example.com", disclaimer: "All companies and figures in this document are fictional and for demonstration only." } },
    ],
  };
}
