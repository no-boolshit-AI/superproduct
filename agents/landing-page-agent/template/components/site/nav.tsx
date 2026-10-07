"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Wordmark } from "@/components/ui/wordmark";
import type { SiteConfig } from "@/site.config";

/** Sticky top bar with a working mobile menu. Content in the centred page container. */
export function Nav({ site }: { site: SiteConfig }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={cn("sticky top-0 z-50 border-b transition-colors duration-200", scrolled || open ? "border-line bg-canvas/90 backdrop-blur-md" : "border-transparent bg-canvas")}>
      <nav aria-label="Main" className="container-page flex h-18 items-center justify-between gap-6">
        <a href="#top" aria-label={`${site.brand.name} home`} className="shrink-0">
          <Wordmark name={site.brand.name} logoSrc={site.brand.logoSrc} />
        </a>
        <ul className="hidden items-center gap-1 lg:flex">
          {site.nav.links.map((l) => (
            <li key={l.label}>
              <a href={l.href} className="rounded-button px-3 py-2 text-label text-ink-soft transition-colors hover:bg-surface hover:text-ink">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Button href={site.nav.cta.href} className="hidden sm:inline-flex">
            {site.nav.cta.label}
          </Button>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="grid size-11 place-items-center rounded-button text-ink hover:bg-surface lg:hidden"
          >
            <Icon name={open ? "x" : "grid"} className="size-5" />
          </button>
        </div>
      </nav>
      <div id="mobile-menu" hidden={!open} className="border-t border-line bg-canvas lg:hidden">
        <ul className="container-page flex flex-col py-3">
          {site.nav.links.map((l) => (
            <li key={l.label}>
              <a href={l.href} onClick={() => setOpen(false)} className="block rounded-button px-2 py-3 text-subheading text-ink hover:bg-surface">
                {l.label}
              </a>
            </li>
          ))}
          <li className="pt-3 sm:hidden">
            <Button href={site.nav.cta.href} className="w-full">
              {site.nav.cta.label}
            </Button>
          </li>
        </ul>
      </div>
    </header>
  );
}
