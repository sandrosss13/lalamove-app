# Task 07: Partner marquee and stats row

## Status

complete

## Wave

2

## Description

Builds the two strips that sit between the hero carousel and the bento grid: a **partner logo
marquee** — a continuously scrolling, CSS-only band of CMS-managed partner logos behind an
edge fade — and the **stats row**, four equal cards of a large mono figure over a label.

Both are new components. The marquee replaces the existing `landing-ticker.tsx`, which scrolls
vehicle-type *labels* rather than partner *logos*; the stats row replaces the three
taxonomy-derived figures currently living inside the hero (task-06 removes them from there).
Neither component is composed into the page here — task-14 owns that.

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
accent-hover, on-accent.** It also ships
`src/components/landing/landing-theme-toggle.tsx`, mounted by task-05 in the nav pill — not
this task's concern.

**task-02** extends `src/lib/admin/home-page-content.ts`, the dependency-free shared contract
(no Prisma, no `server-only`, because client landing components import it directly). For this
task it provides:

- a **`partner_marquee`** section type carrying the marquee's eyebrow copy;
- a **`stats`** section type carrying the four figure/label pairs;
- **`HOME_PARTNER_LOGO_BANNER_PLACEMENT = "home_partner_logo"`** — a *new* `Banner.placement`
  key alongside the existing `HOME_HERO_BANNER_PLACEMENT = "home_hero"` and
  `HOME_SECONDARY_BANNER_PLACEMENT = "home_secondary"`. Partner logos are stored as `Banner`
  rows rather than a new Prisma model, because `Banner` already models exactly "an image with
  a placement, sort order, locale and active window". `Banner.placement` is a free-form
  `String` column on purpose, so this is a content convention, not a migration.

## Files to Create

- `src/components/landing/landing-partner-marquee.tsx` — the scrolling partner logo band.
- `src/components/landing/landing-stats.tsx` — the four-card stats grid.

## Files to Modify

None.

## Files to Delete

None. **In particular: do not delete or edit `src/components/landing/landing-ticker.tsx`.**
See below.

## Technical Details

### Reuse or replace `landing-ticker.tsx`? — replace, and leave the old file alone

Read `src/components/landing/landing-ticker.tsx` (47 lines) before writing anything. It is a
good component and it already gets the hard part right:

- It renders **one** label list **twice** (`<TickerRun labels={labels} />` then
  `<TickerRun labels={labels} hidden />`), with `aria-hidden="true"` on the duplicate so
  assistive tech does not read the list out twice.
- The track is `flex w-max animate-ticker`, and `globals.css` defines
  `--animate-ticker: landing-ticker 45s linear infinite` plus
  `@keyframes landing-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }`,
  documented as "The ticker renders its content twice, so translating by exactly half the
  track width loops seamlessly."
- It fades the edges with
  `[mask-image:linear-gradient(to_right,transparent,black_5rem,black_calc(100%-5rem),transparent)]`.

**Decision: build a new component and copy that technique; do not extend `LandingTicker`.**
The two differ in every respect that matters — data source (`useLandingVehicleTypes()` client
fetch of the vehicle taxonomy vs. `Banner` rows at `home_partner_logo`), content (text labels
vs. `<img>` logo tiles), framing (no eyebrow vs. a centred mono eyebrow), and chrome (a
bordered strip with `bg-surface` vs. a bare band on the page background). Generalising one
component over both would mean a `variant` prop plus two disjoint render paths.

**Why the old file stays on disk:** `landing-ticker.tsx`'s only importer is
`src/components/landing/landing-page.tsx`, where it is currently pinned directly under the
hero (`const heroTrailer = (<><LandingBannerStrip … /><LandingTicker /></>)`). That file is
owned by **task-14**, which rewrites the composition wholesale in Wave 3 and is the right
place to unwire and delete the ticker. Deleting it here would break the build for the rest of
Wave 2. Leave it untouched and note in your final report that task-14 should drop it.

### The token rule (applies to every value below)

The handoff is written entirely in dark-theme literals. **Do not put one of those rgba values
into a component.** The page must work in both themes, and the light theme is not "the dark
theme with different opacity" — it is the same *roles* resolved against an inverted palette.

1. **Prefer a task-01 token.** Read the `@theme inline` block in `src/app/globals.css` after
   task-01 lands and use the utility names it actually declares. Existing utilities today:
   `bg-ink`, `text-paper`, `text-muted`, `border-line`, `bg-accent` / `text-accent`. task-01
   adds glass, surface, surface-sunken, border-strong, accent-hover, on-accent.
2. **Alpha-of-foreground values** (`rgba(255,255,255,0.04)`, `rgba(255,255,255,0.07)`,
   `rgba(244,244,242,0.52)`) become opacity modifiers on the foreground token: `bg-paper/4`,
   `border-paper/7`, `text-paper/52`. Tailwind v4 accepts arbitrary percentages, and these
   invert for free because `--landing-paper` flips with the theme.
3. Never write `#F58220`, `#F4F4F2`, `#08090A` or `rgba(255,255,255,…)`.
4. **Do not add tokens or keyframes to `globals.css` in this task.** task-01 owns the tokens
   and the marquee reuses the keyframe that already exists (below).

The handoff distinguishes a "border hairline" `rgba(255,255,255,0.07)` from a "border subtle"
`rgba(255,255,255,0.08)`. Treat them as one role — task-01's `line` token, i.e.
`border-line` — unless task-01 actually shipped two. A 0.01 alpha difference does not earn a
second token.

### Marquee — exact metrics

Section: padding `clamp(44px, 5vw, 72px) 0 clamp(8px, 1vw, 16px)`. Note the **zero horizontal
padding** — the band is deliberately full-bleed so logos run off both edges under the mask.

Eyebrow (e.g. "Dispatching every day for"):

- `font-price` (IBM Plex Mono — already loaded in `src/app/layout.tsx` via `next/font/google`;
  do not use the handoff's bundled `fonts/*.woff2`)
- 10.5px → `text-[10.5px]`, `letter-spacing: .18em` → `tracking-[0.18em]`, `uppercase`
- colour `rgba(244,244,242,0.36)` → `text-paper/36`
- centred, `margin-bottom: 26px`

Viewport (the masking wrapper):

- `overflow: hidden`
- `mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)`, with the
  `-webkit-mask-image` twin. In Tailwind:
  `[mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]
  [-webkit-mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]`
  (the `#000` here is a mask alpha channel, not a theme colour — it is correct in both themes
  and is not an exception to the token rule).

Track:

- `display: flex; width: max-content` → `flex w-max`
- animation: `translateX(0 → -50%)` over **42s**, `linear`, `infinite`.
  **Reuse the existing keyframe rather than adding one.** `globals.css` already defines
  `@keyframes landing-ticker` with exactly those two frames. The existing
  `--animate-ticker` token is 45s, not 42s, so do **not** use the bare `animate-ticker`
  utility and then try to override the duration (declaration order between a shorthand token
  and an arbitrary `[animation-duration:…]` is not something to rely on). Use the arbitrary
  animation shorthand instead:

  ```
  animate-[landing-ticker_42s_linear_infinite]
  ```

- Pause on hover is a **nice-to-have**: `hover:[animation-play-state:paused]`. Add it; drop it
  if it fights anything.

Tile:

- `width: 180px; height: 66px; margin: 0 10px` → `h-[66px] w-[180px] mx-[10px] flex-none`
- `border-radius: .75rem` → `rounded-xl` (Tailwind v4's `rounded-xl` is `0.75rem`)
- background `rgba(255,255,255,0.04)` → task-01's surface token, or `bg-paper/4`
- border `1px solid rgba(255,255,255,0.07)` → `border border-line`
- `padding: 14px 18px`, `display: flex; align-items: center; justify-content: center`
- Logo: plain `<img>` at `height: 38px; width: 100%; object-fit: contain` →
  `h-[38px] w-full object-contain`.

**Use a plain `<img>`, not `next/image`** — the URL is uploaded or typed by a content editor
and can point at any host, so it cannot be pinned in `remotePatterns` at build time. This is
the same call `LandingBannerStrip` in `landing-page.tsx` already documents; copy its
`// eslint-disable-next-line @next/next/no-img-element` comment and reasoning. Set
`alt={logo.title}` and `loading="lazy"`.

### Marquee — data and the duplicate-list rule

Props: `logos: LandingBanner[]` — the active `Banner` rows at
`HOME_PARTNER_LOGO_BANNER_PLACEMENT`, loaded server-side and passed down by task-14.
`LandingBanner` (`{ id, title, imageUrl, linkUrl }`) is exported today from
`src/components/landing/landing-page.tsx`; import it **type-only**
(`import type { LandingBanner } from "@/components/landing/landing-page"`). If task-02 exports
an equivalent banner type from `home-page-content.ts`, prefer that. **Do not declare a third
copy of the shape.**

- **Zero logos → render nothing at all** (`return null`), not an empty band and not the
  eyebrow on its own. The CMS is unpopulated today, so this is the current live state.
- **Render the one source list twice.** The handoff is explicit: the prototype's
  `v3-partner-1b … -8b` slot ids "are duplicates of 1–8 that exist only because the marquee
  renders the list twice for a seamless loop. In production render one source list twice; do
  not create duplicate assets." Concretely: map `logos` twice inside the same `w-max` flex
  track, and put `aria-hidden="true"` on the second run so screen readers do not read the
  partner list out twice — the pattern `landing-ticker.tsx` already uses. React keys must be
  unique across both runs (e.g. `` `${logo.id}-a` `` / `` `${logo.id}-b` ``).
- The `-50%` keyframe is only seamless because the track holds exactly two identical runs. If
  you render a third run, or pad one run to a different width, the loop visibly jumps.

Framing copy: `partner_marquee` content from the CMS, with the usual optional-prop-with-default
pattern the landing components already use (`LandingHero({ content =
DEFAULT_HOME_PAGE_CONTENT.hero })`):

```ts
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type PartnerMarqueeContent,
} from "@/lib/admin/home-page-content";

export function LandingPartnerMarquee({
  logos,
  content = DEFAULT_HOME_PAGE_CONTENT.partner_marquee,
}: {
  logos: LandingBanner[];
  content?: PartnerMarqueeContent;
}) { … }
```

Expected shape — `{ eyebrow: string }`. task-02 is authoritative; read the real type before
writing code and render whatever fields it actually has.

### Marquee — reduced motion

`globals.css` already flattens animations for `[data-landing-page] *` under
`@media (prefers-reduced-motion: reduce)`:

```css
animation-duration: 0.01ms !important;
animation-iteration-count: 1 !important;
transition-duration: 0.01ms !important;
```

That neutralises the scroll, but it lands the track at its **final** keyframe
(`translateX(-50%)`) with `iteration-count: 1`, i.e. showing the start of the second,
`aria-hidden` run. That is visually identical (the runs are the same list), so it is
acceptable — but confirm it renders as a static, readable row of logos rather than a blank or
half-clipped band, and if it does not, add an explicit
`motion-reduce:animate-none` on the track. Do not edit the global reduced-motion block.

### Stats — exact metrics

Section: padding `clamp(56px, 7vw, 104px) clamp(20px, 4vw, 48px)`, inner `max-width: 1200px`
centred. (task-14 may own the outer section rhythm — if it does, keep the component's own
padding minimal and say so in your report.)

Grid:

- `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px` →
  `grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[14px]`
- **This must be a grid, not a flex row.** The handoff's "lesson learned", carried over
  verbatim: *"for equal-width card rows use `grid-template-columns: repeat(auto-fit,
  minmax(Xpx, 1fr))`, **not** `flex: 1 1 Xpx`. A wrapped flex item with `flex-grow: 1`
  inflates to the full row width and reads as a broken layout. Every card row in this design
  is a grid for that reason."* With four stats at a narrow width, a flex version puts three
  cards on row one and one full-width card on row two — the exact failure the handoff is
  warning about.

Card:

- `min-width: 0` (so a long value cannot blow out its track) → `min-w-0`
- `border-radius: 1.25rem` → `rounded-[1.25rem]`
- background `rgba(255,255,255,0.04)` → task-01's surface token, or `bg-paper/4`
- border `1px solid rgba(255,255,255,0.08)` → `border border-line`
- `padding: 26px 24px`

Value:

- `clamp(30px, 3.4vw, 44px)` → `text-[clamp(30px,3.4vw,44px)]`
- `font-weight: 600`, `letter-spacing: -.04em`, `line-height: 1`
- **`font-price`** — IBM Plex Mono, the design's face for "eyebrows, numerals, ids, captions".

Label:

- 13.5px → `text-[13.5px]`, `line-height: 1.45`
- colour `rgba(244,244,242,0.52)` → `text-paper/52`
- `margin-top: 10px`

Semantics: a `<dl>` with `<dt>`/`<dd>` per stat is the honest markup (the existing hero uses
exactly that today, with the label in a visually-hidden `<dt>`). Render the value visually
first and the label under it; keep the pairing readable to assistive tech.

### Stats — data

Four items from the `stats` CMS content type:

```ts
export function LandingStats({
  content = DEFAULT_HOME_PAGE_CONTENT.stats,
}: {
  content?: StatsContent;
}) { … }
```

Expected shape — `{ items: { value: string; label: string }[] }`. task-02 is authoritative.

- `value` is a **string**, not a number — the design's figures are "54s", "6,400", "24/7".
- An empty `items` array must render an empty grid, not throw. `auto-fit` handles any count;
  do not hardcode four columns.

### Stats — the figures are not this component's problem

The handoff's four stats are **54s** "Median match time in Tbilisi", **11** "Cities across
Georgia", **6,400** "Courier partners", **24/7** "Dispatch and support". Three of those are
courier-product claims this platform does not implement or measure: there is no match-time
metric anywhere in the data, the `GeorgianCity` enum has **25** values rather than 11, and
"6,400 courier partners" is invented. The planning decision was to remove or replace every
such claim.

**This component renders whatever the CMS holds and nothing else.** Do not hardcode the
handoff's numbers as fallbacks, do not compute a figure from the database here, and do not add
a "coming soon" state. task-02 seeds defensible placeholders, and
`specs/georgia-homepage-redesign/action-required.md` — "Confirm the real service-coverage
figures" — asks the user for the true values before launch. Mention in your final report that
this is still open.

### Server vs client components

Both components are **server components**. Neither needs state, effects or browser APIs — the
marquee is CSS-only and the stats are static markup. Do **not** add `"use client"`.

## Acceptance Criteria

- [ ] `src/components/landing/landing-partner-marquee.tsx` and
      `src/components/landing/landing-stats.tsx` exist; neither carries `"use client"`.
- [ ] `src/components/landing/landing-ticker.tsx` is unmodified and still exported.
- [ ] The marquee renders **nothing** (`null`) when there are zero active
      `home_partner_logo` banners.
- [ ] The marquee renders one source list twice inside a single `w-max` flex track, with the
      duplicate run `aria-hidden="true"` and unique React keys across both runs — no duplicate
      `Banner` rows required.
- [ ] The track animates `translateX(0 → -50%)` over **42s** linear infinite, reusing the
      existing `@keyframes landing-ticker` via `animate-[landing-ticker_42s_linear_infinite]`.
      `globals.css` is not modified.
- [ ] The edge fade uses `mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%,
      transparent)` with the `-webkit-` twin.
- [ ] Tiles are 180×66 with `margin: 0 10px`, `rounded-xl`, surface background, hairline
      border and `14px 18px` padding; logos are `object-contain` at 38px height.
- [ ] The eyebrow is mono 10.5px `.18em` uppercase at `text-paper/36`, centred, 26px above the
      band, and its text comes from the `partner_marquee` CMS content.
- [ ] The stats row is `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))` with a
      14px gap — **not** `flex: 1 1 180px`.
- [ ] Stat cards are `rounded-[1.25rem]`, surface background, `border-line`, `26px 24px`
      padding, `min-w-0`.
- [ ] Stat values are `clamp(30px, 3.4vw, 44px)` / 600 / `-.04em` in `font-price`; labels are
      13.5px at `text-paper/52`, 10px below.
- [ ] All four stats come from the `stats` CMS content type; no figure is hardcoded in the
      component.
- [ ] Neither component contains a literal `rgba(255,255,255,…)`, `#F58220`, `#F4F4F2` or
      `#08090A`; every colour resolves from a `--landing-*` token or an opacity modifier on
      one. Both themes render legibly. (The mask gradient's `#000` is an alpha channel, not a
      colour, and is exempt.)
- [ ] `pnpm check` (lint + typecheck) passes.

## Notes

- **No media queries.** Everything in this design is fluid via `clamp()` and `auto-fit`; there
  are no breakpoints in either component.
- **The landing page uses zero shadcn primitives** — every control is hand-styled with the
  landing tokens. Do not reach for `src/components/ui/*`; that set is pinned light-only and
  belongs to the admin/onboarding surfaces.
- Partner logo assets are 360×96 transparent PNG/SVG per the handoff; up to eight are expected.
  None exist yet — see `specs/georgia-homepage-redesign/action-required.md`, "Supply or approve
  the marketing photography". The marquee simply does not render until they land, which is the
  correct behaviour.
- Uploading those logos is task-12's job (the admin banner form gains real Supabase upload via
  task-04's `site-media` bucket). This task only reads the rows.
- `globals.css` already defines the landing focus ring once for every landing control
  (`[data-landing-page] a:focus-visible, [data-landing-page] button:focus-visible`). Neither
  component here has a focusable control unless you make the logo tiles links — if a
  `logo.linkUrl` is present and you choose to link the tile, do not suppress that outline.
- Design source: `UI:UX/homepage/design_handoff_georgia_homepage/README.md`, sections
  **4. Partner logo marquee** and **5. Stats row**, plus *Interactions & Behavior → Marquee*.
  The `README.md` wins wherever it disagrees with `Home-Georgia-v3.dc.html`. The prototype's
  inline styles are a limitation of its preview renderer and must not be reproduced —
  everything here is Tailwind v4 utilities.
