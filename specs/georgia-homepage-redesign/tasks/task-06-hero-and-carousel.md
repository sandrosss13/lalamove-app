# Task 06: Hero and banner carousel

## Status

complete

## Wave

2

## Description

Rewrites the landing hero to the handoff's **centred** hero — spotlight glow, status chip with
a pulsing dot, an oversized display headline, a subhead and two centred CTAs — and builds the
**hero banner carousel** that sits directly beneath it: up to six CMS-managed banners in a
snap-scrolling frame with arrows, pagination dots, touch swipe and a 6-second auto-advance
that stops permanently on first interaction.

Two structural changes come with this. First, the current hero is a two-column layout whose
right column hosts the live quote calculator; the new hero is centred with **no calculator**,
because the calculator moves to its own section below the hero (task-11). Second, the current
hero computes three live stats from the vehicle taxonomy; the new design has no stats in the
hero — they move to the dedicated stats row (task-07). Both are removals from *this*
component only; nothing is deleted from the tree.

## Dependencies

**Depends on:** task-01-theme-tokens-and-toggle.md, task-02-cms-content-contract.md
**Blocks:** task-14-page-composition.md

**Context from dependencies:**

**task-01** lands the landing page's dual palette in `src/app/globals.css`. Today the
`--landing-*` variables in `:root` are light-only (`--landing-ink: #ffffff`,
`--landing-paper: #201f1c`, `--landing-muted: #6b675f`, `--landing-accent: #ff5a1f`,
`--landing-line: #e7e4de`, `--landing-surface: #faf9f6`) and `@custom-variant dark
(&:is(.dark *))` is declared at line 5 of `globals.css` but nothing has ever set `.dark`.
task-01 adds a `.dark`-scoped override carrying the handoff's dark values (page `#08090A`,
foreground `#F4F4F2`, accent `#F58220`) plus **new tokens for the roles this design needs and
the current palette cannot name: glass, surface, surface-sunken, border-strong, accent,
accent-hover, on-accent.** It also ships `src/components/landing/landing-theme-toggle.tsx`,
which task-05 mounts in the nav pill — this task does not touch it.

**task-02** extends `src/lib/admin/home-page-content.ts`, the dependency-free shared contract
(no Prisma, no `server-only`, because client landing components import it directly). For this
task it provides:

- an updated `HeroContent` type and its `DEFAULT_HOME_PAGE_CONTENT.hero` copy, rewritten to
  the handoff's structure (status chip text + mono tag, headline, subhead, two CTAs) in the
  freight voice the existing defaults already use;
- a `hero_carousel` section type for the carousel's own framing copy, if any;
- **`MAX_HERO_BANNERS = 6`**, the cap the handoff specifies, exported as a named constant so
  the renderer, the admin form (task-12) and the data loader all agree on one number;
- `HOME_HERO_BANNER_PLACEMENT = "home_hero"` already exists in that file today and is
  unchanged — the carousel's slides are the active `Banner` rows at that placement.

## Files to Create

- `src/components/landing/landing-hero-carousel.tsx` — `"use client"`. The banner carousel:
  snap track, caption chips, arrows, dots, auto-advance, scroll sync.

## Files to Modify

- `src/components/landing/landing-hero.tsx` — rewritten as a centred, calculator-free,
  stats-free hero. Also **drops `"use client"`** (see below).
- `src/app/globals.css` — **append one `@keyframes` block only** (the status dot pulse). See
  "The one globals.css addition" for the exact constraints.

## Files to Delete

None.

## Technical Details

### What is being removed from the hero — and what must NOT be deleted

Read `src/components/landing/landing-hero.tsx` (132 lines) before writing anything. Today it:

1. Is a `"use client"` component.
2. Imports `LandingQuoteCalculator` from
   `@/components/landing/landing-quote-calculator` and renders it in a right-hand column
   inside `<div id="price-a-load" className="scroll-mt-24">`.
3. Imports `useLandingVehicleTypes` from `@/components/landing/landing-vehicle-types` and
   derives three stats from the taxonomy (`vehicleTypes.length` "Vehicle types",
   `dutyClasses.size` "Duty classes", a hardcoded `24/7` "Dispatch window"), with an
   `EMPTY_STAT = "—"` placeholder for before the fetch lands.
4. Renders `content.headline` + an accented `content.headlineHighlight` with an
   `animate-wipe` underline, plus `animate-rise` entrance animations with staggered
   `[animation-delay:…]`.

All four go. Specifically:

- **The quote calculator is removed from the hero. `src/components/landing/landing-quote-calculator.tsx` (412 lines, the live widget that calls `/api/pricing/estimate`) must NOT be deleted or modified.** It is a working feature and it is explicitly kept in this redesign — task-11 restyles it and gives it its own section below the hero, and task-14 composes that section into the page. If you delete it or break its export, task-11 has nothing to restyle. Remove only the *import and the JSX* from this file.
- **The three taxonomy stats are removed from the hero.** The design's stats live in a
  dedicated four-card row built by task-07. Drop the `useLandingVehicleTypes` import,
  `EMPTY_STAT`, and the `<dl>`. Do not delete
  `src/components/landing/landing-vehicle-types.ts` — it is a module-level-deduped fetch
  helper still used by `landing-ticker.tsx` and `landing-vehicles.tsx`.
- With both gone the hero has no hooks and no browser APIs left, so **delete the `"use client"`
  directive** and let it be a server component. The status-dot pulse is pure CSS. This is a
  real win: the hero is above the fold and no longer ships JS.
- The `animate-rise` / `animate-wipe` entrance animations go too. task-14 owns the page-wide
  `data-reveal` IntersectionObserver reveal (750ms, `cubic-bezier(.16,1,.3,1)`), and running
  both would double-animate the hero. **Do not add `data-reveal` attributes yourself either** —
  task-14 decides which elements carry them. Just render the hero un-animated.

### The token rule (applies to every value below)

The handoff is written entirely in dark-theme literals. **Do not put one of those rgba values
into a component.** The page must work in both themes.

1. **Prefer a task-01 token.** Read the `@theme inline` block in `src/app/globals.css` after
   task-01 lands and use the utility names it actually declares. Existing utilities today:
   `bg-ink`, `text-paper`, `text-muted`, `border-line`, `bg-accent` / `text-accent`. task-01
   adds glass, surface, surface-sunken, border-strong, accent-hover, on-accent.
2. **Alpha-of-foreground values** (`rgba(244,244,242,0.62)`, `rgba(255,255,255,0.05)`,
   `rgba(255,255,255,0.1)`) become opacity modifiers on the foreground token:
   `text-paper/62`, `bg-paper/5`, `border-paper/10`. Tailwind v4 accepts arbitrary
   percentages, and these invert for free because `--landing-paper` flips with the theme.
3. **Alpha-of-background values** (the glass chips over imagery, `rgba(8,9,10,0.66)`) become
   `color-mix(in srgb, var(--landing-ink) 66%, transparent)` — which in light theme correctly
   becomes a white scrim over the photo instead of a black one.
4. **Alpha-of-accent values** (the spotlight, the CTA glow) become
   `color-mix(in srgb, var(--landing-accent) 24%, transparent)`.
5. Never write `#F58220`, `#F4F4F2`, `#08090A`, `#0A0B0A`, `#111315` or `rgba(255,255,255,…)`.
6. **Do not add colour tokens to `globals.css`** — task-01 owns them. The single exception is
   the one keyframe block described below.

### The one `globals.css` addition

The status chip's dot pulses on a **2.4s ease-in-out infinite** loop, `opacity .55 → 1`,
`scale 1 → 1.35`. There is no Tailwind built-in with that curve and a keyframe cannot be
expressed as an arbitrary utility, so append this next to the existing `@keyframes
landing-ticker` block (around line 209 of `src/app/globals.css`, which is already documented
as "the one place the project defines keyframes"):

```css
/* The hero status chip's dot, per the design's 2.4s pulse. Declared here
   because this file is the project's only home for keyframes; consumed as an
   arbitrary `animate-[…]` utility rather than a `--animate-*` token, since it
   has exactly one call site. */
@keyframes landing-pulse-dot {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.35);
  }
}
```

Then use `animate-[landing-pulse-dot_2.4s_ease-in-out_infinite]` on the dot.

**Constraints:** append this block and nothing else. Do not touch `:root`, `@theme inline`,
the `[data-landing-page]` rules or the reduced-motion blocks — task-01 owns those and other
Wave 2 tasks may be reading them. Note the addition in your final report. (The existing
`@media (prefers-reduced-motion: reduce)` rule already neutralises this animation for
`[data-landing-page] *`, so no extra guard is needed for the pulse.)

### Hero — exact metrics

Section:

- `position: relative; overflow: hidden`
- padding `clamp(120px, 14vw, 190px) clamp(20px, 4vw, 48px) 0` — the top value exists to
  clear the fixed nav pill (task-05), which is `position: fixed; top: 14px`.
- Inner container `max-width: 1200px; margin: 0 auto; text-align: center`.

Spotlight (decorative, `aria-hidden="true"`):

- `position: absolute; top: -360px; left: 50%; margin-left: -550px; width: 1100px; height: 900px`
- `pointer-events: none`
- `background: radial-gradient(closest-side, rgba(245,130,32,0.24), rgba(245,130,32,0.05) 55%, transparent 72%)`
  — token-safe form (note Tailwind arbitrary values need `_` for spaces):

```
bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--landing-accent)_24%,transparent),color-mix(in_srgb,var(--landing-accent)_5%,transparent)_55%,transparent_72%)]
```

Status chip (centred, `inline-flex`):

- padding `7px 8px 7px 14px`, `border-radius: 999px`, `gap: 10px`
- background `rgba(255,255,255,0.05)` → `bg-paper/5`
- border `1px solid rgba(255,255,255,0.1)` → `border border-paper/10`
- text 13px at `rgba(244,244,242,0.72)` → `text-paper/72`
- `margin-bottom: clamp(26px, 3vw, 38px)`
- contents, in order:
  1. a **7px** accent dot, `rounded-full`, `bg-accent`, with the pulse animation above;
  2. the chip text (CMS);
  3. a mono tag: `font-price`, 11px, `letter-spacing: .1em`, uppercase, background
     `rgba(255,255,255,0.08)` → `bg-paper/8`, padding `5px 10px`, `rounded-full` (CMS).

H1:

- `font-size: clamp(42px, 7.4vw, 104px)`, `line-height: .94`, `letter-spacing: -.05em`,
  `font-weight: 600`
- `max-width: 19ch`, `margin: 0 auto clamp(22px, 2.6vw, 30px)`, `text-wrap: balance`
- `font-display` (IBM Plex Sans, already loaded in `src/app/layout.tsx` via
  `next/font/google` — do not use the handoff's bundled `fonts/*.woff2`).

Subhead:

- `font-size: clamp(16px, 1.7vw, 21px)`, `line-height: 1.55`, `text-paper/62`
- `max-width: 52ch`, `margin: 0 auto clamp(30px, 3.4vw, 42px)`, `text-wrap: pretty`

CTA row: `flex flex-wrap justify-center gap-3` (12px), `margin-bottom: clamp(44px, 5vw, 68px)`.

- **Primary:** 15px / 600, background `#F58220` → `bg-accent`, colour `#0A0B0A` → task-01's
  on-accent token, padding `16px 32px`, `rounded-full`, shadow
  `0 10px 30px rgba(245,130,32,0.28)` →
  `shadow-[0_10px_30px_color-mix(in_srgb,var(--landing-accent)_28%,transparent)]`.
- **Secondary:** same size/weight/padding/radius; background `rgba(255,255,255,0.06)` →
  `bg-paper/6`, border `1px solid rgba(255,255,255,0.14)` → `border border-paper/14`, colour
  `text-paper`.

### Hero — CMS content

Import the type and defaults from the shared contract; never redeclare a local copy. Keep the
existing optional-prop-with-default pattern this file already uses:

```ts
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type HeroContent,
} from "@/lib/admin/home-page-content";

export function LandingHero({
  content = DEFAULT_HOME_PAGE_CONTENT.hero,
}: {
  content?: HeroContent;
}) { … }
```

The shape this task was planned against (task-02 is authoritative — read the real type before
writing code):

```ts
type HeroContent = {
  /** Status chip text, e.g. "Now live in 11 Georgian cities". */
  statusText: string;
  /** Mono uppercase tag inside the chip, e.g. "New". */
  statusTag: string;
  headline: string;
  subtext: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
};
```

Today's `HeroContent` has `eyebrow`, `headline`, `headlineHighlight`, `subtext` and the four
CTA fields. If task-02 keeps `headlineHighlight`, render it as an `text-accent` `<span>` inside
the H1 — but **without** the `animate-wipe` underline, which is not in the new design. If
task-02 keeps `eyebrow` and adds no `statusText`, use `eyebrow` as the chip text. Render
whatever fields exist; do not invent a second source of copy.

Link elements, matching the rule used across the landing components: `href` starting with `/`
→ `next/link`'s `<Link>`; anything else (`#anchor`, absolute URL) → a plain `<a>`.

### Carousel — exact metrics

Wrapper: `position: relative; max-width: 1200px; margin: 0 auto` (horizontal page padding
comes from the section).

Frame:

- `position: relative; border-radius: 2rem` → `rounded-[2rem]`
- `overflow: hidden`
- border `1px solid rgba(255,255,255,0.12)` → task-01's border-strong token (or
  `border-paper/12`)
- background `#111315` — the "carousel frame / empty banner backdrop" colour. This is the
  page background lifted slightly; use task-01's surface-sunken token, or
  `bg-[color-mix(in_srgb,var(--landing-paper)_4%,var(--landing-ink))]` if no token fits.
- `height: clamp(260px, 34vw, 480px)` → `h-[clamp(260px,34vw,480px)]`
- shadow `0 40px 90px -30px rgba(0,0,0,0.9)` → `shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]`
  (a black drop shadow is correct on a light ground too; soften with a `dark:` variant only
  if it reads heavy in light theme).

Track:

- `display: flex; height: 100%; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory`
- scrollbar hidden: `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`
- Do **not** set `scroll-behavior: smooth` — the eased scroll is driven in JS (see Behaviour).

Slide: `position: relative; flex: 0 0 100%; width: 100%; height: 100%; scroll-snap-align: start`.

Slide image: plain `<img>`, **not `next/image`** — the URL is typed or uploaded by a content
editor and can point at any host, so it cannot be pinned in `remotePatterns` at build time.
This is the same call `LandingBannerStrip` in `landing-page.tsx` already documents; copy its
`// eslint-disable-next-line @next/next/no-img-element` comment and reasoning. Use
`className="h-full w-full object-cover"`, `alt={banner.title}`, `draggable={false}`, and
`loading="eager"` + `fetchPriority="high"` on index 0 (above the fold) with `loading="lazy"`
on the rest.

If `banner.linkUrl` is set, wrap the image in a link covering the slide (`absolute inset-0`
or a block-level wrapper). Keep `draggable={false}` on the image so a swipe does not start a
native drag.

Caption chip (per slide):

- `position: absolute; left: clamp(16px, 3vw, 32px); bottom: clamp(56px, 6vw, 70px)`
- `inline-flex; align-items: center; gap: 9px; padding: 9px 16px; border-radius: 999px`
- background `rgba(8,9,10,0.66)` → `bg-[color-mix(in_srgb,var(--landing-ink)_66%,transparent)]`
- `backdrop-filter: blur(12px)` → `backdrop-blur-[12px]`
- border `1px solid rgba(255,255,255,0.14)` → `border border-paper/14`
- 13.5px text in `text-paper`, `max-width: calc(100% - 64px)`
- **`pointer-events: none`** — it must never intercept a swipe or a slide link.
- Leading element: a **6px** accent dot, `rounded-full`, `bg-accent`, `flex-none`.
- Content is `banner.title`.

Arrows:

- Two buttons, 42×42 `rounded-full`, `position: absolute; top: 50%; transform: translateY(-50%)`
- left/right inset `clamp(10px, 1.5vw, 18px)`
- background `rgba(8,9,10,0.6)` → `bg-[color-mix(in_srgb,var(--landing-ink)_60%,transparent)]`
- `backdrop-blur-[12px]`, border `1px solid rgba(255,255,255,0.18)` → `border border-paper/18`
- **Icons: `ChevronLeft` / `ChevronRight` from `lucide-react`** (already a dependency,
  `^1.31.0`) sized ~17px. The handoff's `‹` / `›` glyphs are explicitly to be swapped for the
  codebase's icon set ("No icons are used … Swap those for the codebase's icon set (e.g.
  chevron-left/right)"). Do not ship the raw glyphs.
- `aria-label="Previous banner"` / `"Next banner"`.

Dots:

- Container: `position: absolute; left: clamp(16px, 3vw, 32px); bottom: clamp(16px, 3vw, 24px)`
  (so it sits *below* the caption chip), `flex; align-items: center; gap: 7px; padding: 8px 12px;
  border-radius: 999px`
- background `rgba(8,9,10,0.62)` → `color-mix(in srgb, var(--landing-ink) 62%, transparent)`,
  `backdrop-blur-[12px]`, border `border-paper/14`
- Each dot: a `<button>`, `flex: 0 0 auto`, height 8px, `rounded-full`, no border, no padding.
  - inactive: width 8px, background `rgba(244,244,242,0.55)` → `bg-paper/55`
  - **active: width 24px, background `#F58220` → `bg-accent`**
  - transition width + background-color over **240ms**.
- `aria-label={`Go to banner ${i + 1}`}` and `aria-current={i === index ? "true" : undefined}`.

Accessibility framing: `role="region"` with `aria-roledescription="carousel"` and an
`aria-label`; each slide `role="group"` `aria-roledescription="slide"`
`aria-label={`${i + 1} of ${count}`}`. Do not build a full APG carousel widget — this level is
proportionate.

### Carousel — behaviour (the critical part)

Props: `banners: LandingBanner[]`. `LandingBanner` (`{ id, title, imageUrl, linkUrl }`) is
exported today from `src/components/landing/landing-page.tsx`; import it **type-only**
(`import type { LandingBanner } from "@/components/landing/landing-page"`) so nothing is
pulled into the client bundle. If task-02 exports an equivalent banner type from
`home-page-content.ts`, prefer that. **Do not declare a third copy of the shape.**

```ts
const slides = banners.slice(0, MAX_HERO_BANNERS);
if (slides.length === 0) return null;
```

- **Zero banners → render nothing at all.** Not an empty frame, not a placeholder. The CMS is
  unpopulated today, so this is the current live state and the page must simply not show a
  carousel. (`MAX_HERO_BANNERS = 6` is exported by task-02; the cap is also enforced in the
  admin form (task-12) and in the loader, but slice defensively here too — a row inserted by
  hand in the database must not produce a seven-dot carousel.)
- **One banner → render the frame and the caption, but no arrows, no dots, no auto-advance.**

State and refs:

- `index: number` — state, the single source of truth for which dot is active.
- `indexRef` — a ref mirroring `index`, so the auto-advance interval can read the current
  value without being torn down and recreated on every advance.
- `trackRef` — the scrolling element.
- `interactedRef` (or state) — set `true` on the first arrow or dot activation.
- `tweenRef` — the in-flight `requestAnimationFrame` id.
- `scrollTimerRef` — the debounce timer id.

Three operations, and they must not be confused:

1. **`goTo(i)`** — used by arrows, dots and auto-advance. Wraps with
   `((i % n) + n) % n`, calls `setIndex(wrapped)` **and** scrolls the track to
   `wrapped * track.clientWidth`.
2. **`scrollToIndex(i)`** — the eased scroll only.
3. **The debounced scroll listener** — derives `Math.round(scrollLeft / clientWidth)` and
   calls **`setIndex` only**.

> **The trap:** if the scroll listener calls `goTo` (or an effect on `index` scrolls
> unconditionally), a user swipe sets the index, which scrolls the track, which fires scroll
> events, which re-derive the index — a feedback loop that fights the user's finger and makes
> the carousel feel possessed. The scroll listener **never** scrolls. Guard `setIndex` with an
> `if (derived !== indexRef.current)` check so an idle re-render is not triggered on every
> settle.

Eased scroll (~420ms, `cubic-bezier(.16, 1, .3, 1)`):

The prototype assigns `t.scrollLeft = idx * t.clientWidth` directly. **Do not copy that.** The
handoff is explicit that this is a workaround because `requestAnimationFrame`,
`scroll-behavior: smooth` and CSS transitions do not run in its preview renderer. Implement a
`requestAnimationFrame` tween:

```ts
// cubic-bezier(.16, 1, .3, 1) — the design's single easing curve, used here and
// by the page-wide scroll reveal. Closed-form approximation is fine; an exact
// bezier solver is not worth the bytes for a 420ms scroll.
const EASE_OUT_EXPO = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const SCROLL_MS = 420;

function scrollToIndex(i: number, animate: boolean) {
  const track = trackRef.current;
  if (!track) return;

  const target = i * track.clientWidth;

  if (!animate) {
    track.scrollLeft = target;
    return;
  }

  cancelAnimationFrame(tweenRef.current);       // never run two tweens at once
  const start = track.scrollLeft;
  const startedAt = performance.now();

  const step = (now: number) => {
    const t = Math.min(1, (now - startedAt) / SCROLL_MS);
    track.scrollLeft = start + (target - start) * EASE_OUT_EXPO(t);
    if (t < 1) tweenRef.current = requestAnimationFrame(step);
  };

  tweenRef.current = requestAnimationFrame(step);
}
```

Auto-advance:

- `setInterval(…, 6000)`, created once per mount, advancing `goTo(indexRef.current + 1)` so
  the last slide wraps to the first.
- **Any user interaction — an arrow or a dot — cancels auto-advance permanently for the
  session.** Clear the interval and set `interactedRef.current = true`; never restart it, not
  on blur, not on mouseleave, not on a later render.
- Not started at all when `slides.length < 2` or when reduced motion is preferred.
- Cleared in the effect's cleanup.

Touch swipe: comes free from `overflow-x: auto` + `scroll-snap-type: x mandatory`. Do not add
pointer-event handlers or a drag library.

Scroll sync: one `scroll` listener on the track, debounced ~**90ms** (`clearTimeout` +
`setTimeout` on each event), deriving the index as above. Attach it with `{ passive: true }`.
**Remove the listener, clear the interval, clear the debounce timer and cancel any in-flight
`requestAnimationFrame` on unmount.**

Reduced motion:

- Read it in an effect, never during render (there is no `window` on the server):

```ts
const [reducedMotion, setReducedMotion] = useState(false);

useEffect(() => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  setReducedMotion(query.matches);
  const onChange = () => setReducedMotion(query.matches);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}, []);
```

- When true: **no auto-advance** and **no easing** (jump with a direct `scrollLeft`
  assignment). Arrows and dots keep working.
- `globals.css` already flattens CSS animations and transitions under
  `@media (prefers-reduced-motion: reduce)` for `[data-landing-page] *`, which covers the dot
  width/colour transition — but it cannot touch JS-driven scrolling or a `setInterval`, which
  is exactly why this check exists.

Dots are **state-driven**. The prototype paints them imperatively with
`document.querySelectorAll('[data-dot]')` because CSS transitions do not advance in its
renderer; that is listed under *Known prototype-only compromises*. **Do not query the DOM to
style the dots.** Render them from `index` with a Tailwind `transition-[width,background-color]
duration-240` (or `duration-[240ms]`).

### Server vs client components

- `landing-hero.tsx` — **server component** after this task (remove `"use client"`).
- `landing-hero-carousel.tsx` — `"use client"`.

The two are separate files and separate sections; the hero does not import the carousel.
task-14 composes them (and decides the carousel's placement, section padding and any
`data-reveal` attributes).

## Acceptance Criteria

- [ ] `landing-hero.tsx` is centred, has no quote calculator, no taxonomy stats, no
      `useLandingVehicleTypes` import, and no `"use client"` directive.
- [ ] `src/components/landing/landing-quote-calculator.tsx` is byte-identical to before this
      task and still exports `LandingQuoteCalculator`.
- [ ] Hero section padding-top is `clamp(120px, 14vw, 190px)` so content clears the fixed nav
      pill; the spotlight is `1100×900` at `top: -360px; left: 50%; margin-left: -550px` and is
      `pointer-events: none`.
- [ ] The status chip renders a 7px accent dot pulsing 2.4s ease-in-out infinite
      (opacity .55→1, scale 1→1.35), the CMS chip text, and a mono uppercase tag.
- [ ] H1 is `clamp(42px, 7.4vw, 104px)` / `.94` / `-.05em` / 600 / `19ch` / balanced; subhead
      is `clamp(16px, 1.7vw, 21px)` / 1.55 / `52ch` / pretty.
- [ ] Both CTAs match the specified metrics, including the primary's accent glow.
- [ ] `src/components/landing/landing-hero-carousel.tsx` exists, is a client component, and
      **renders `null` when given zero banners** — no empty frame.
- [ ] The carousel renders at most `MAX_HERO_BANNERS` (6) slides, even if handed more.
- [ ] With one banner: no arrows, no dots, no auto-advance.
- [ ] Auto-advance runs every 6000ms and wraps last → first; the first arrow or dot click
      stops it permanently for the session.
- [ ] Arrows step ±1 with `((i % n) + n) % n` wrap; dots jump to an absolute index; touch
      swipe works via native snap scrolling.
- [ ] Programmatic scrolling is a `requestAnimationFrame` tween of ~420ms on
      `cubic-bezier(.16,1,.3,1)` — **not** a direct `scrollLeft` assignment (except under
      reduced motion).
- [ ] The active dot is 24×8 in the accent colour and animates width + colour over ~240ms,
      driven by React state — no `document.querySelectorAll`.
- [ ] The debounced (~90ms) scroll listener sets the index but never scrolls; swiping does not
      produce a scroll/index feedback loop.
- [ ] `prefers-reduced-motion: reduce` disables auto-advance and easing.
- [ ] Unmounting clears the interval, the debounce timer, the `requestAnimationFrame` and the
      scroll listener.
- [ ] Arrows use lucide `ChevronLeft` / `ChevronRight`, not `‹` / `›`.
- [ ] `globals.css` gained exactly one appended `@keyframes landing-pulse-dot` block and
      nothing else.
- [ ] No component contains a literal `rgba(255,255,255,…)`, `#F58220`, `#F4F4F2`, `#08090A`,
      `#0A0B0A` or `#111315`; every colour resolves from a `--landing-*` token, an opacity
      modifier on one, or a `color-mix` against one. Both themes render legibly.
- [ ] `pnpm check` (lint + typecheck) passes.

## Notes

- **No media queries.** Everything in this design is fluid via `clamp()` and `auto-fit`; there
  are no breakpoints in the hero or the carousel.
- **Equal-width card rows are grids, never flex.** The handoff's "lesson learned": use
  `grid-template-columns: repeat(auto-fit, minmax(Xpx, 1fr))`, **not** `flex: 1 1 Xpx` — a
  wrapped flex item with `flex-grow: 1` inflates to the full row width and reads as a broken
  layout. Not directly load-bearing in this task (the hero is a centred column and the
  carousel is a snap track), but it applies to anything you add.
- **Do not use the handoff's bundled `fonts/*.woff2`.** `src/app/layout.tsx` already loads IBM
  Plex Sans and IBM Plex Mono via `next/font/google` and exposes them as the `font-display` /
  `font-body` / `font-price` utilities — exactly what the design asks for. `font-price` is the
  mono face; use it for the status-chip tag.
- **The landing page uses zero shadcn primitives** — every control is hand-styled with the
  landing tokens. Do not reach for `src/components/ui/*`; that set is pinned light-only and
  belongs to the admin/onboarding surfaces.
- `globals.css` already defines the landing focus ring once for every landing control
  (`[data-landing-page] a:focus-visible, [data-landing-page] button:focus-visible`). Do not add
  per-component focus styles and do not suppress the outline on the carousel controls.
- The handoff's hero copy — "Book a courier in twelve seconds", "matched in under a minute",
  "Now live in 11 Georgian cities" — is courier-product marketing this freight platform does
  not implement, and is replaced by task-02's freight-voice defaults. This component renders
  whatever the CMS holds; do not reintroduce the handoff's strings as fallbacks. Recommended
  real banner asset size is 2400×900 (JPG/WebP) — see
  `specs/georgia-homepage-redesign/action-required.md`, "Supply or approve the marketing
  photography".
- Design source: `UI:UX/homepage/design_handoff_georgia_homepage/README.md`, sections
  **2. Hero** and **3. Hero banner carousel**, plus *Interactions & Behavior → Hero carousel*.
  The `README.md` wins wherever it disagrees with `Home-Georgia-v3.dc.html`.
