/*
 * STARTER PAGE — replace this file entirely.
 * It only shows how imports work. Compose the real page from library sections
 * (components/library) and your own sections (components/custom).
 */
import { site } from "@/site.config";
import { Footer, Nav } from "@/components/site";
import { CtaGroup, Display, Lead, Section } from "@/components/ui";

export default function Page() {
  return (
    <>
      <Nav site={site} />
      <main id="top">
        <Section id="section" tone="surface">
          <div className="flex flex-col items-start gap-6">
            <Display size="lg">Starter page.</Display>
            <Lead>Write PLAN.md, call set_brand, then build the sections.</Lead>
            <CtaGroup primary={{ label: "Primary action", href: "#" }} secondary={{ label: "Secondary", href: "#" }} />
          </div>
        </Section>
      </main>
      <Footer site={site} />
    </>
  );
}
