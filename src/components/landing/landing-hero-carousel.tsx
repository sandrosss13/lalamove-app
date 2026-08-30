"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  DEFAULT_HOME_PAGE_CONTENT,
  MAX_HERO_BANNERS,
  type HeroCarouselContent,
} from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";
// Type-only, so nothing from the page module is pulled into the client bundle
// and the import cycle (the page will render this component) is erased at
// compile time. `LandingBanner` is declared once, there.
import type { LandingBanner } from "@/components/landing/landing-page";

/** Auto-advance cadence, from the design. */
const AUTO_ADVANCE_MS = 6000;

/**
 * Duration of the programmatic slide scroll.
 *
 * A JS constant rather than a read of `--landing-duration-carousel`: the tween
 * below is driven by `performance.now()`, so it would have to parse a CSS
 * string every call to learn nothing it does not already know. The
 * reduced-motion case that the token exists to flatten is handled directly, by
 * skipping the tween altogether.
 */
const SCROLL_MS = 420;

/** Settle window before a swipe is treated as having landed on a slide. */
const SCROLL_SYNC_MS = 90;

/**
 * `cubic-bezier(.16, 1, .3, 1)` — the design's single easing curve, shared with
 * the page-wide scroll reveal. This closed-form ease-out-expo tracks it closely
 * enough for a 420ms scroll; a real bezier solver is not worth the bytes.
 */
function easeOutExpo(progress: number) {
  return progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
}

/**
 * The hero banner carousel: up to `MAX_HERO_BANNERS` CMS-managed slides in a
 * snap-scrolling frame with arrows, dots, native touch swipe and a 6-second
 * auto-advance that stops permanently on the first interaction.
 *
 * Three operations that must never be confused:
 *
 * 1. `goTo` — arrows, dots and auto-advance. Sets the index *and* scrolls.
 * 2. `scrollToIndex` — the eased scroll, nothing else.
 * 3. the debounced scroll listener — sets the index and **never** scrolls.
 *
 * If (3) ever scrolled, a swipe would set the index, which would scroll the
 * track, which would fire more scroll events, which would re-derive the index:
 * a loop that fights the user's finger. The listener is therefore write-only
 * with respect to state, and guards its `setIndex` so an idle settle does not
 * re-render.
 *
 * The dots are rendered from `index` and transitioned in CSS. The prototype
 * paints them imperatively through `document.querySelectorAll` because its
 * preview renderer runs no transitions; that is a documented prototype-only
 * compromise, not the design.
 */
export function LandingHeroCarousel({
  banners,
  content = DEFAULT_HOME_PAGE_CONTENT.hero_carousel,
}: {
  banners: LandingBanner[];
  content?: HeroCarouselContent;
}) {
  // Sliced defensively even though the admin form and the loader both cap the
  // list: a row inserted straight into the database must not be able to produce
  // a seven-dot carousel.
  const slides = banners.slice(0, MAX_HERO_BANNERS);
  const count = slides.length;

  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  // Mirrors `index` so the auto-advance interval and the click handlers can
  // read the current slide without the interval having to be torn down and
  // recreated on every advance.
  const indexRef = useRef(0);
  const tweenRef = useRef<number | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Once true, auto-advance never runs again for this page view — including
  // across the re-runs of the effect below.
  const interactedRef = useRef(false);

  // Read in an effect, never during render: there is no `window` on the server.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);

    const handleChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  /** The eased scroll, and nothing else. Never sets state. */
  const scrollToIndex = useCallback((target: number, animate: boolean) => {
    const track = trackRef.current;
    if (!track) return;

    // Two tweens running at once would fight over `scrollLeft`, so an in-flight
    // one is always cancelled first — including on the unanimated path, where a
    // leftover frame would otherwise scroll away from the position just set.
    if (tweenRef.current !== null) {
      cancelAnimationFrame(tweenRef.current);
      tweenRef.current = null;
    }

    const to = target * track.clientWidth;

    if (!animate) {
      track.scrollLeft = to;
      return;
    }

    const from = track.scrollLeft;
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / SCROLL_MS);
      track.scrollLeft = from + (to - from) * easeOutExpo(progress);
      tweenRef.current = progress < 1 ? requestAnimationFrame(step) : null;
    };

    tweenRef.current = requestAnimationFrame(step);
  }, []);

  /**
   * Move to a slide. Wraps in both directions, so `-1` lands on the last slide
   * and `count` lands on the first.
   */
  const goTo = useCallback(
    (target: number) => {
      if (count === 0) return;

      const wrapped = ((target % count) + count) % count;
      indexRef.current = wrapped;
      setIndex(wrapped);
      scrollToIndex(wrapped, !reducedMotion);
    },
    [count, reducedMotion, scrollToIndex],
  );

  /** The first arrow or dot press ends auto-advance for good. */
  const stopAutoAdvance = useCallback(() => {
    interactedRef.current = true;

    if (autoAdvanceRef.current !== null) {
      clearInterval(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
  }, []);

  // Auto-advance. The dependencies change only when the banner list or the
  // motion preference does — never on an advance — so the interval is created
  // once and survives every slide change.
  useEffect(() => {
    if (count < 2 || reducedMotion || interactedRef.current) return;

    const timer = setInterval(() => {
      goTo(indexRef.current + 1);
    }, AUTO_ADVANCE_MS);
    autoAdvanceRef.current = timer;

    return () => {
      clearInterval(timer);
      if (autoAdvanceRef.current === timer) {
        autoAdvanceRef.current = null;
      }
    };
  }, [count, goTo, reducedMotion]);

  // Scroll sync: keeps the dots honest after a touch swipe. Debounced so it
  // reads the settled position rather than every frame of the gesture.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const handleScroll = () => {
      if (scrollTimerRef.current !== null) {
        clearTimeout(scrollTimerRef.current);
      }

      scrollTimerRef.current = setTimeout(() => {
        scrollTimerRef.current = null;

        const width = track.clientWidth;
        if (width === 0) return;

        const derived = Math.min(
          count - 1,
          Math.max(0, Math.round(track.scrollLeft / width)),
        );

        // Only on a real change: our own tween fires this listener too, and
        // re-rendering on every settle would be pure churn.
        if (derived === indexRef.current) return;

        indexRef.current = derived;
        setIndex(derived);
      }, SCROLL_SYNC_MS);
    };

    track.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      track.removeEventListener("scroll", handleScroll);
      if (scrollTimerRef.current !== null) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    };
  }, [count]);

  // A tween in flight when the component goes away would keep touching a
  // detached node until it finished.
  useEffect(() => {
    return () => {
      if (tweenRef.current !== null) {
        cancelAnimationFrame(tweenRef.current);
        tweenRef.current = null;
      }
    };
  }, []);

  // Nothing at all rather than an empty frame: with no banners authored — the
  // state the CMS is in today — the page simply has no carousel.
  if (count === 0) {
    return null;
  }

  const showControls = count > 1;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured banners"
      className="relative mx-auto w-full max-w-[1200px]"
    >
      <div className="relative h-[clamp(260px,34vw,480px)] overflow-hidden rounded-[2rem] border border-line-strong bg-frame shadow-frame">
        <div
          ref={trackRef}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((banner, slideIndex) => {
            const caption = banner.title.trim() || content.fallbackCaption;

            /*
              Plain <img> rather than next/image: the URL is typed in or
              uploaded by a content editor and can point at any host, so it
              can't be pinned in `remotePatterns` at build time. Same call the
              admin banners table makes.
            */
            const image = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={banner.imageUrl}
                alt={banner.title}
                // The first slide is above the fold; the rest are one swipe
                // away at best.
                loading={slideIndex === 0 ? "eager" : "lazy"}
                fetchPriority={slideIndex === 0 ? "high" : undefined}
                // Without this a swipe starting on the image begins a native
                // image drag instead of scrolling the track.
                draggable={false}
                className="h-full w-full object-cover"
              />
            );

            return (
              <div
                key={banner.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${slideIndex + 1} of ${count}`}
                className="relative h-full w-full shrink-0 grow-0 basis-full snap-start"
              >
                {banner.linkUrl ? (
                  <Link href={banner.linkUrl} className="block h-full w-full">
                    {image}
                  </Link>
                ) : (
                  image
                )}

                {/*
                  The glass chips over the imagery — this caption, the arrows
                  and the dots — are the one place the page does not flip with
                  the theme: they sit on a photograph, which is dark-ish in
                  either theme, so `glass-image*` keeps its dark scrim and the
                  foreground comes from `on-strong` (the "text on a dark panel"
                  token, near-white in both themes) rather than from `paper`,
                  which would go dark-on-dark in the light theme.

                  `pointer-events-none` so it can never swallow a swipe or a
                  click on the slide's own link.
                */}
                {caption ? (
                  <span className="pointer-events-none absolute bottom-[clamp(56px,6vw,70px)] left-[clamp(16px,3vw,32px)] inline-flex max-w-[calc(100%-64px)] items-center gap-[9px] rounded-full border border-on-strong/14 bg-glass-image-strong px-4 py-[9px] text-[13.5px] text-on-strong backdrop-blur-glass-chip">
                    <span
                      aria-hidden="true"
                      className="h-[6px] w-[6px] flex-none rounded-full bg-accent"
                    />
                    {caption}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        {showControls ? (
          <>
            <button
              type="button"
              aria-label="Previous banner"
              onClick={() => {
                stopAutoAdvance();
                goTo(indexRef.current - 1);
              }}
              className="absolute top-1/2 left-[clamp(10px,1.5vw,18px)] grid h-[42px] w-[42px] -translate-y-1/2 place-items-center rounded-full border border-on-strong/18 bg-glass-image text-on-strong backdrop-blur-glass-chip transition-colors hover:bg-glass-image-strong"
            >
              <ChevronLeft aria-hidden="true" className="h-[17px] w-[17px]" />
            </button>

            <button
              type="button"
              aria-label="Next banner"
              onClick={() => {
                stopAutoAdvance();
                goTo(indexRef.current + 1);
              }}
              className="absolute top-1/2 right-[clamp(10px,1.5vw,18px)] grid h-[42px] w-[42px] -translate-y-1/2 place-items-center rounded-full border border-on-strong/18 bg-glass-image text-on-strong backdrop-blur-glass-chip transition-colors hover:bg-glass-image-strong"
            >
              <ChevronRight aria-hidden="true" className="h-[17px] w-[17px]" />
            </button>

            {/* Below the caption chip, not beside it. */}
            <div className="absolute bottom-[clamp(16px,3vw,24px)] left-[clamp(16px,3vw,32px)] flex items-center gap-[7px] rounded-full border border-on-strong/14 bg-glass-image px-3 py-2 backdrop-blur-glass-chip">
              {slides.map((banner, dotIndex) => (
                <button
                  key={banner.id}
                  type="button"
                  aria-label={`Go to banner ${dotIndex + 1}`}
                  aria-current={dotIndex === index ? "true" : undefined}
                  onClick={() => {
                    stopAutoAdvance();
                    goTo(dotIndex);
                  }}
                  className={cn(
                    // The active dot stretches rather than swapping for a
                    // different element, so width and colour can transition
                    // together. `--landing-duration-dot` is flattened by the
                    // reduced-motion block in `globals.css`.
                    "h-2 flex-none rounded-full border-0 p-0 transition-[width,background-color] duration-[var(--landing-duration-dot)] ease-[var(--landing-ease)]",
                    dotIndex === index
                      ? "w-6 bg-accent"
                      : "w-2 bg-on-strong/55",
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
