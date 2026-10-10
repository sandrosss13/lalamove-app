"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { LandingLink } from "@/components/landing/landing-link";
import {
  HERO_INTERVAL_DEFAULT,
  HERO_INTERVAL_MAX,
  HERO_INTERVAL_MIN,
  MAX_HERO_BANNERS,
  type HeroCarouselContent,
} from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";
// Type-only, so nothing from the page module is pulled into the client bundle
// and the import cycle (the page will render this component) is erased at
// compile time. `LandingBanner` is declared once, there.
import type { LandingBanner } from "@/components/landing/landing-page";

const ARROW_CLASSES =
  "grid h-10 w-10 place-items-center rounded-full border border-white/18 bg-home-night/62 text-home-on-night backdrop-blur-glass-chip transition-colors hover:bg-home-night/80";

/**
 * Auto-advance cadence in milliseconds: the authored `intervalSec`, clamped
 * into the contract's range so a stray value can neither strobe the slides nor
 * leave the carousel looking stuck.
 */
function autoAdvanceMs(intervalSec: number | undefined): number {
  const seconds =
    typeof intervalSec === "number" && Number.isFinite(intervalSec)
      ? intervalSec
      : HERO_INTERVAL_DEFAULT;
  return (
    Math.min(HERO_INTERVAL_MAX, Math.max(HERO_INTERVAL_MIN, seconds)) * 1000
  );
}

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
 * full-bleed snap-scrolling frame — photo, scrim, eyebrow tag, headline, body
 * and an optional button per slide — with dots and arrows top-right, native
 * touch swipe, and an auto-advance (`intervalSec`, default six seconds) that
 * stops permanently on the first interaction.
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
  content,
}: {
  banners: LandingBanner[];
  content: HeroCarouselContent;
}) {
  // Sliced defensively even though the admin form and the loader both cap the
  // list: a row inserted straight into the database must not be able to produce
  // a seven-dot carousel.
  const t = useTranslations("landing.landingHeroCarousel");
  const slides = banners.slice(0, MAX_HERO_BANNERS);
  const count = slides.length;
  const intervalMs = autoAdvanceMs(content.intervalSec);

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
    }, intervalMs);
    autoAdvanceRef.current = timer;

    return () => {
      clearInterval(timer);
      if (autoAdvanceRef.current === timer) {
        autoAdvanceRef.current = null;
      }
    };
  }, [count, goTo, intervalMs, reducedMotion]);

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

  // Nothing at all rather than an empty frame: with no banners authored the
  // page simply has no carousel (and the booking card drops its overlap).
  if (count === 0) {
    return null;
  }

  const showControls = count > 1;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("featuredBanners")}
      className="relative bg-home-night"
    >
      <div className="relative h-[clamp(460px,46vw,620px)] overflow-hidden">
        <div
          ref={trackRef}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((banner, slideIndex) => {
            const title = banner.title.trim() || content.fallbackCaption || "";
            const eyebrow = banner.eyebrow?.trim();
            const body = banner.body?.trim();
            const ctaLabel = banner.ctaLabel?.trim();
            // Only the first slide is the page's `h1`; the rest are headings
            // of their own slide, not of the page.
            const Heading = slideIndex === 0 ? "h1" : "h2";

            return (
              <div
                key={banner.id}
                role="group"
                aria-roledescription="slide"
                aria-label={t("slideOf", { index: slideIndex + 1, count })}
                className="relative h-full w-full shrink-0 grow-0 basis-full snap-start bg-home-slide"
              >
                {/*
                  Plain <img> rather than next/image: the URL is uploaded or
                  typed in by a content editor and can point at any host, so it
                  can't be pinned in `remotePatterns` at build time.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={banner.imageUrl}
                  alt=""
                  // The first slide is above the fold; the rest are a swipe
                  // away at best.
                  loading={slideIndex === 0 ? "eager" : "lazy"}
                  fetchPriority={slideIndex === 0 ? "high" : undefined}
                  // Without this a swipe that starts on the photo begins a
                  // native image drag instead of scrolling the track.
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/* Left-weighted scrim so the copy reads on any photo. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(8,9,10,0.82)_0%,rgba(8,9,10,0.55)_38%,rgba(8,9,10,0)_66%)]"
                />
                <div className="absolute inset-0 flex items-center">
                  {/* The bottom padding leaves room for the booking card,
                      which overlaps the hero's lower edge; the top padding
                      keeps the copy clear of the controls on narrow screens.
                      Mkhedruli sets much wider than Plex Latin, so Georgian
                      headlines get a smaller size and a wider measure. */}
                  <div className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,40px)] pt-[clamp(64px,7vw,96px)] pb-[clamp(90px,9vw,120px)] text-home-on-night">
                    {eyebrow ? (
                      <p className="mb-5 inline-flex rounded-full bg-home-accent px-3 py-1.5 font-price text-[11px] tracking-[0.16em] text-home-night uppercase">
                        {eyebrow}
                      </p>
                    ) : null}
                    {title ? (
                      <Heading className="m-0 mb-4 max-w-[14ch] text-[clamp(36px,5.4vw,72px)] leading-[0.98] font-semibold tracking-[-0.045em] text-balance [&:lang(ka)]:max-w-[18ch] [&:lang(ka)]:text-[clamp(30px,4.2vw,56px)] [&:lang(ka)]:leading-[1.08] [&:lang(ka)]:tracking-[-0.02em]">
                        {title}
                      </Heading>
                    ) : null}
                    {body ? (
                      <p className="m-0 max-w-[42ch] text-[clamp(16px,1.5vw,19px)] leading-normal text-pretty text-home-on-night/78">
                        {body}
                      </p>
                    ) : null}
                    {banner.linkUrl && ctaLabel ? (
                      <LandingLink
                        href={banner.linkUrl}
                        className="mt-7 inline-flex items-center rounded-full bg-home-accent px-[22px] py-3 text-[15px] font-semibold text-home-night transition-colors hover:bg-home-accent-hover"
                      >
                        {ctaLabel}
                      </LandingLink>
                    ) : null}
                  </div>
                </div>
                {/* A banner with a link but no button label is still
                    clickable as a whole, as it was before v4. */}
                {banner.linkUrl && !ctaLabel ? (
                  <LandingLink
                    href={banner.linkUrl}
                    ariaLabel={title || undefined}
                    className="absolute inset-0"
                  >
                    <span className="sr-only">{title}</span>
                  </LandingLink>
                ) : null}
              </div>
            );
          })}
        </div>

        {showControls ? (
          <div className="absolute top-[clamp(20px,3vw,32px)] right-[clamp(20px,4vw,40px)] flex items-center gap-2">
            <div className="flex items-center gap-[7px] rounded-full border border-white/14 bg-home-night/62 px-[13px] py-[9px] backdrop-blur-glass-chip">
              {slides.map((banner, dotIndex) => (
                <button
                  key={banner.id}
                  type="button"
                  aria-label={t("goToBanner", { index: dotIndex + 1 })}
                  aria-current={dotIndex === index ? "true" : undefined}
                  onClick={() => {
                    stopAutoAdvance();
                    goTo(dotIndex);
                  }}
                  className={cn(
                    // The active dot stretches rather than swapping element,
                    // so width and colour transition together;
                    // `--landing-duration-dot` is flattened under reduced
                    // motion in `globals.css`.
                    "h-2 flex-none rounded-full border-0 p-0 transition-[width,background-color] duration-[var(--landing-duration-dot)] ease-[var(--landing-ease)]",
                    dotIndex === index
                      ? "w-6 bg-home-accent"
                      : "w-2 bg-home-on-night/55",
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label={t("previousBanner")}
              onClick={() => {
                stopAutoAdvance();
                goTo(indexRef.current - 1);
              }}
              className={ARROW_CLASSES}
            >
              <ChevronLeft aria-hidden="true" className="h-[17px] w-[17px]" />
            </button>
            <button
              type="button"
              aria-label={t("nextBanner")}
              onClick={() => {
                stopAutoAdvance();
                goTo(indexRef.current + 1);
              }}
              className={ARROW_CLASSES}
            >
              <ChevronRight aria-hidden="true" className="h-[17px] w-[17px]" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
