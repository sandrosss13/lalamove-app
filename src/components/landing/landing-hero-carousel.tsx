"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 * Extra wait, on top of `intervalSec`, for a video slide's metadata before
 * auto-advance gives up on its `ended` event and moves on as if it were an
 * image — so a slow or stalled source cannot freeze the carousel.
 */
const VIDEO_METADATA_GRACE_MS = 3000;

/** `HTMLMediaElement.HAVE_METADATA`, without needing a DOM global on the server. */
const HAVE_METADATA = 1;

/**
 * The slide ids whose video source should be loaded: the active slide and its
 * two neighbours (wrapping), so the next swipe or advance finds its video
 * already buffering while slides further away fetch nothing but their poster.
 */
function idsAround(slides: LandingBanner[], center: number): string[] {
  const count = slides.length;
  if (count === 0) return [];

  return [center - 1, center, center + 1].flatMap((position) => {
    const slide = slides[((position % count) + count) % count];
    return slide ? [slide.id] : [];
  });
}

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
  // Memoised so its identity — and every callback and effect keyed on it — is
  // stable across the carousel's own re-renders.
  const slides = useMemo(() => banners.slice(0, MAX_HERO_BANNERS), [banners]);
  const count = slides.length;
  const intervalMs = autoAdvanceMs(content.intervalSec);

  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  // False until the motion preference has been read on the client. Videos
  // wait for it, so the server render (and a reduced-motion visitor) never
  // starts one: until then every slide is its poster image.
  const [motionChecked, setMotionChecked] = useState(false);
  // Mirrors `interactedRef` for rendering: whether auto-advance has ended,
  // which is what lets a video slide go back to looping.
  const [interacted, setInteracted] = useState(false);
  // Slides whose video errored or was refused autoplay; they fall back to
  // their poster image and are timed like an image slide.
  const [failedVideoIds, setFailedVideoIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Slides whose video source has been attached. Grows only, so swiping back
  // to a slide never re-downloads its video.
  const [primedVideoIds, setPrimedVideoIds] = useState<ReadonlySet<string>>(
    () => new Set(idsAround(slides, 0)),
  );

  const trackRef = useRef<HTMLDivElement | null>(null);
  // Mirrors `index` so the auto-advance interval and the click handlers can
  // read the current slide without the interval having to be torn down and
  // recreated on every advance.
  const indexRef = useRef(0);
  const tweenRef = useRef<number | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Once true, auto-advance never runs again for this page view — including
  // across the re-runs of the effect below.
  const interactedRef = useRef(false);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());

  // Prime the neighbourhood of the current slide. Done during render (React's
  // "adjust state when a prop changes" pattern) rather than in an effect, so
  // the source is attached in the same commit the slide becomes active.
  const wantedIds = idsAround(slides, index);
  if (wantedIds.some((id) => !primedVideoIds.has(id))) {
    setPrimedVideoIds(new Set([...primedVideoIds, ...wantedIds]));
  }

  /** Whether a slide renders (and is timed by) a video rather than its image. */
  const playsVideo = useCallback(
    (banner: LandingBanner) =>
      Boolean(banner.videoUrl) &&
      motionChecked &&
      !reducedMotion &&
      !failedVideoIds.has(banner.id),
    [failedVideoIds, motionChecked, reducedMotion],
  );

  const markVideoFailed = useCallback((id: string) => {
    setFailedVideoIds((current) =>
      current.has(id) ? current : new Set([...current, id]),
    );
  }, []);

  // Read in an effect, never during render: there is no `window` on the server.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    setMotionChecked(true);

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
    setInteracted(true);

    if (autoAdvanceRef.current !== null) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
  }, []);

  const activeBanner = count > 0 ? slides[index] : undefined;
  const activeIsVideo = activeBanner ? playsVideo(activeBanner) : false;
  const autoAdvancing = count > 1 && !reducedMotion && !interacted;

  // Auto-advance, one slide at a time. An image slide waits `intervalSec`; a
  // video slide waits for its `ended` event (it is not looping while this
  // runs), falling back to `intervalSec` plus a grace period if its metadata
  // never arrives. Re-armed on every slide change, so a swipe also restarts
  // the clock for the slide it lands on.
  useEffect(() => {
    if (!autoAdvancing || interactedRef.current || !activeBanner) return;

    const advance = () => {
      if (!interactedRef.current) goTo(indexRef.current + 1);
    };

    if (!activeIsVideo) {
      const timer = setTimeout(advance, intervalMs);
      autoAdvanceRef.current = timer;
      return () => {
        clearTimeout(timer);
        if (autoAdvanceRef.current === timer) autoAdvanceRef.current = null;
      };
    }

    const video = videoRefs.current.get(activeBanner.id);
    let fallback: ReturnType<typeof setTimeout> | null = null;
    const clearFallback = () => {
      if (fallback !== null) clearTimeout(fallback);
      if (autoAdvanceRef.current === fallback) autoAdvanceRef.current = null;
      fallback = null;
    };

    if (!video || video.readyState < HAVE_METADATA) {
      fallback = setTimeout(advance, intervalMs + VIDEO_METADATA_GRACE_MS);
      autoAdvanceRef.current = fallback;
    }

    video?.addEventListener("loadedmetadata", clearFallback);
    video?.addEventListener("ended", advance);

    return () => {
      clearFallback();
      video?.removeEventListener("loadedmetadata", clearFallback);
      video?.removeEventListener("ended", advance);
    };
  }, [activeBanner, activeIsVideo, autoAdvancing, goTo, intervalMs]);

  // Only the active slide's video plays; every other one is paused where it
  // is. Autoplay can still be refused (data saver, some in-app browsers): that
  // slide then falls back to its poster and is timed like an image.
  useEffect(() => {
    for (const [id, video] of videoRefs.current) {
      if (activeBanner && id === activeBanner.id) {
        video.play().catch((error: unknown) => {
          // An `AbortError` only means a pause() overtook this play() — a
          // quick navigation, not a broken video.
          if (
            error instanceof DOMException &&
            error.name === "NotAllowedError"
          ) {
            markVideoFailed(id);
          }
        });
      } else {
        video.pause();
      }
    }
  }, [activeBanner, markVideoFailed, primedVideoIds, failedVideoIds]);

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
  // The first slide's headline is the page's `h1`. When it has none, the
  // section's fallback caption takes that role, visually hidden so the slide
  // itself stays clean while the page keeps a top-level heading.
  const firstSlideHasTitle = (slides[0]?.title.trim() ?? "") !== "";
  const pageHeading = content.fallbackCaption?.trim();

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("featuredBanners")}
      className="relative bg-home-night"
    >
      {!firstSlideHasTitle && pageHeading ? (
        <h1 className="sr-only">{pageHeading}</h1>
      ) : null}
      <div className="relative h-[clamp(460px,46vw,620px)] overflow-hidden">
        <div
          ref={trackRef}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((banner, slideIndex) => {
            // The headline is optional: an empty one renders no heading at
            // all, so an image- or video-only slide stays clean.
            const title = banner.title.trim();
            const eyebrow = banner.eyebrow?.trim();
            const body = banner.body?.trim();
            const ctaLabel = banner.ctaLabel?.trim();
            // The slide's best short description, for the image alt and the
            // whole-slide link; empty means the photo is decorative.
            const description = title || eyebrow || body || "";
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
                  alt={description}
                  // The first slide is above the fold; the rest are a swipe
                  // away at best.
                  loading={slideIndex === 0 ? "eager" : "lazy"}
                  fetchPriority={slideIndex === 0 ? "high" : undefined}
                  // Without this a swipe that starts on the photo begins a
                  // native image drag instead of scrolling the track.
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/*
                  The video sits over the image, which stays as the slide's
                  LCP element and as the fallback. It is mounted only once the
                  slide is primed (active or adjacent), so distant slides
                  fetch neither video nor a second copy of the poster.
                */}
                {playsVideo(banner) &&
                banner.videoUrl &&
                primedVideoIds.has(banner.id) ? (
                  <video
                    ref={(element) => {
                      if (element) {
                        videoRefs.current.set(banner.id, element);
                      } else {
                        videoRefs.current.delete(banner.id);
                      }
                    }}
                    src={banner.videoUrl}
                    poster={banner.imageUrl}
                    muted
                    // While auto-advance runs the slide ends and moves on;
                    // after the visitor takes over, it loops in place.
                    loop={!autoAdvancing}
                    playsInline
                    autoPlay={slideIndex === index}
                    preload="metadata"
                    aria-hidden="true"
                    tabIndex={-1}
                    disablePictureInPicture
                    onError={() => markVideoFailed(banner.id)}
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                  />
                ) : null}
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
                    ariaLabel={
                      description || t("openBanner", { index: slideIndex + 1 })
                    }
                    className="absolute inset-0"
                  >
                    <span className="sr-only">
                      {description ||
                        t("openBanner", { index: slideIndex + 1 })}
                    </span>
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
