"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "../icon";

const widths = {
  1: "w-full",
  2: "w-[86%] md:w-[calc(50%-12px)]",
  3: "w-[86%] md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]",
} as const;

/**
 * Scroll-snap carousel with working arrows, dots, swipe and optional autoplay
 * (paused on hover, focus and reduced motion). Each child is one slide.
 */
export function Carousel({
  children,
  label,
  perView = 1,
  arrows = true,
  dots = true,
  autoplay,
  className,
}: {
  children: ReactNode;
  label: string;
  perView?: 1 | 2 | 3;
  arrows?: boolean;
  dots?: boolean;
  /** Milliseconds between slides; omit for manual only. */
  autoplay?: number;
  className?: string;
}) {
  const slides = Children.toArray(children);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const slideEls = () => Array.from(track.current?.children ?? []) as HTMLElement[];

  const goTo = useCallback((i: number) => {
    const els = slideEls();
    if (!els.length || !track.current) return;
    const n = (i + els.length) % els.length;
    track.current.scrollTo({ left: els[n]!.offsetLeft - els[0]!.offsetLeft, behavior: "smooth" });
    setIndex(n);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const els = slideEls();
      const x = el.scrollLeft;
      let best = 0;
      els.forEach((s, i) => {
        if (Math.abs(s.offsetLeft - els[0]!.offsetLeft - x) < Math.abs(els[best]!.offsetLeft - els[0]!.offsetLeft - x)) best = i;
      });
      setIndex(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!autoplay || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => goTo(index + 1), autoplay);
    return () => window.clearInterval(t);
  }, [autoplay, paused, index, goTo]);

  return (
    <div
      data-carousel
      data-active-index={index}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className={cn("flex flex-col gap-6", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div ref={track} className="flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-1 no-scrollbar">
        {slides.map((s, i) => (
          <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`} className={cn("shrink-0 snap-start", widths[perView])}>
            {s}
          </div>
        ))}
      </div>
      {(arrows || dots) && slides.length > 1 && (
        <div className="flex items-center justify-between gap-4">
          {dots ? (
            <div className="flex gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => goTo(i)}
                  className={cn("h-2 rounded-full transition-all duration-300", i === index ? "w-6 bg-accent" : "w-2 bg-border-strong hover:bg-fg-faint")}
                />
              ))}
            </div>
          ) : (
            <span />
          )}
          {arrows && (
            <div className="flex gap-2">
              <button type="button" data-carousel-prev aria-label="Previous slide" onClick={() => goTo(index - 1)} className="grid size-11 place-items-center rounded-full border border-border-strong text-fg transition-colors hover:bg-card-soft">
                <Icon name="chevron-left" className="size-5" />
              </button>
              <button type="button" data-carousel-next aria-label="Next slide" onClick={() => goTo(index + 1)} className="grid size-11 place-items-center rounded-full border border-border-strong text-fg transition-colors hover:bg-card-soft">
                <Icon name="chevron-right" className="size-5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
