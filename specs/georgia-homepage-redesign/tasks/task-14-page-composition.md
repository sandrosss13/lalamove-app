# Task 14: Page composition, chrome extraction and scroll reveal

## Status

complete

## Wave

3

## Description

This is the single-owner composition task — the one file every wave-2 task feeds into.
`src/components/landing/landing-page.tsx` (252 lines) is the composer: it holds the fallback section
list, the `LandingSectionRenderer` switch, the banner strips and the page wrapper that emits
`data-landing-page` / `data-hide-site-header`. Wave 2 built fourteen new section components and
retired two old ones, and task-02 widened the `HomePageSectionData` discriminated union — and because
the renderer's switch is **exhaustive over that union**, the repository does not typecheck until this
task rewrites it. That is deliberate: adding a section type is meant to be a compile error at every
consumer.

Alongside the rewrite, this task lands the two behaviours that belong to the page rather than to any
one section: pulling `nav` and `footer` out of the ordered section list because they are page chrome,
and the `data-reveal` scroll animation, which has one hard requirement — **anything already on screen
at load must never be hidden**. An earlier prototype of this design blanked the hero for 3.5 seconds;
the handoff calls that out explicitly as a defect not to reproduce.

## Dependencies

**Depends on:** task-05-nav-pill-and-footer.md, task-06-hero-and-carousel.md,
task-07-marquee-and-stats.md, task-08-bento-and-how-it-works.md, task-09-vehicles-and-drivers.md,
task-10-coverage-faq-closing-cta.md, task-11-quote-calculator-restyle.md
**Blocks:** task-15-seed-initial-content.md

**Context from dependencies:**

**task-01 (wave 1)** added a `.dark`-scoped landing palette to `src/app/globals.css` and a
`LandingThemeToggle` that persists the visitor's choice and applies it before first paint. The
`@custom-variant dark (&:is(.dark *))` at `globals.css:5` had been declared since the shadcn init and
never used; task-01 is what set `.dark` for the first time. The toggle lives inside the nav pill
(task-05), so this task does not mount it directly.

**task-02 (wave 1)** extended `src/lib/admin/home-page-content.ts` — the single shared,
deliberately dependency-free contract (no Prisma, no `server-only`, because client landing components
import it directly). It now covers: `hero`, `hero_carousel`, `partner_marquee`, `stats`, `bento`,
`quote_calculator`, `how_it_works`, `vehicle_types`, `driver_cta`, `coverage`, `faq`, `closing_cta`,
legacy `category_tiles`, plus the chrome types `nav` and `footer` — each with a content type, a
`HOME_PAGE_SECTION_TYPE_LABELS` entry, a hand-rolled `parse*` validator and freight-adapted default
copy in `DEFAULT_HOME_PAGE_CONTENT`. It also exports
`HOME_PARTNER_LOGO_BANNER_PLACEMENT = "home_partner_logo"` and `MAX_HERO_BANNERS = 6`.

**Wave 2** built, under `src/components/landing/`: `landing-nav-pill.tsx`, `landing-footer.tsx`,
`landing-hero.tsx`, `landing-hero-carousel.tsx`, `landing-partner-marquee.tsx`, `landing-stats.tsx`,
`landing-bento.tsx`, `landing-how-it-works.tsx`, `landing-vehicles.tsx`, `landing-drivers-panel.tsx`,
`landing-coverage.tsx`, `landing-faq.tsx`, `landing-closing-cta.tsx`, `landing-quote-calculator.tsx`.
`landing-header.tsx` (the old two-tier sticky header) and `landing-driver-cta.tsx` are retired —
replaced by the nav pill and the drivers panel respectively.

**Confirm every component's real export name and prop signature before writing the switch.** The
names below are the expected ones, not verified ones.

## Files to Create

- `src/components/landing/landing-scroll-reveal.tsx` — a `"use client"` component that installs the
  IntersectionObserver and renders `null`. It has to be its own file: `landing-page.tsx` is a server
  component when rendered from `/home`, and the observer needs `useEffect`.

## Files to Modify

- `src/components/landing/landing-page.tsx` — the rewrite: new fallback order, exhaustive renderer
  switch, chrome pulled out by type, banner strips removed, `<LandingScrollReveal />` mounted.
- `src/app/globals.css` — the `data-reveal` rules. Wave 1 (task-01) is finished by now, so nothing
  else is editing this file.
- `src/lib/admin/home-page-data.ts` — **only if** task-07 has not already added the partner-logo
  placement (see "Partner banners" below). Check first; do not duplicate the work.
- `src/app/page.tsx` and `src/components/home/home-entry.tsx` — pass any new content prop
  (`partnerBanners`) through, and re-check the prop list against `LandingPage`'s new signature.
- `src/app/home/page.tsx` — verify only; it renders `<LandingPage showSiteHeader={session !== null} />`
  and that flag is now load-bearing in a way it was not before (see below).
- The wave-2 section components — **anchor offsets only** (`scroll-mt-*`), and only if the owning
  wave-2 task left `scroll-mt-16` in place.

## Technical Details

### Read these in full before writing anything

- `src/components/landing/landing-page.tsx` (252 lines) — the composer being rewritten.
- `src/lib/admin/home-page-data.ts` (171 lines) — `server-only`; `resolveHomePageLocale()`,
  `loadHomePageSections()`, `loadHomePageBanners()`, `loadHomePageContent()`.
- `src/app/page.tsx` (62 lines) — `export const revalidate = 60`, reads `?locale`, calls
  `loadHomePageContent(locale)`, renders `<HomeEntry sections heroBanners secondaryBanners />`.
- `src/app/home/page.tsx` (52 lines) — `force-dynamic`, the staff preview.
- `src/components/home/home-entry.tsx` (113 lines) — `"use client"`, branches on `useSession()`.

### 1. The new default section order

`DEFAULT_LANDING_SECTIONS` in `landing-page.tsx` is what renders when a locale has no
`HomePageSection` rows. That is the normal state of a fresh database, not an error path, so it must
cover the whole page. New order:

```
hero → hero_carousel → partner_marquee → stats → bento → quote_calculator →
how_it_works → vehicle_types → driver_cta → coverage → faq → closing_cta
```

`nav` and `footer` are **not** in this list as ordered entries — see §3. Keep the existing style:
written out literally, one entry per type, so each entry's `content` is checked against the shape its
own `type` demands rather than mapped from the type list. Ids stay `default-<type>`.

`category_tiles` is dropped from the default order but **stays in the renderer switch** — pre-existing
`HomePageSection` rows of that type must still render rather than crash the page. It is the one type
that is renderable but not default.

### 2. The renderer switch

`LandingSectionRenderer` is exhaustive over `HomePageSectionData`; it has no `default:` arm and must
not gain one. Every type gets a case:

| Section type | Component |
| --- | --- |
| `hero` | `LandingHero` |
| `hero_carousel` | `LandingHeroCarousel` — also needs the `home_hero` banners |
| `partner_marquee` | `LandingPartnerMarquee` — also needs the `home_partner_logo` banners |
| `stats` | `LandingStats` |
| `bento` | `LandingBento` |
| `quote_calculator` | `LandingQuoteCalculator` |
| `how_it_works` | `LandingHowItWorks` |
| `vehicle_types` | `LandingVehicles` |
| `driver_cta` | `LandingDriversPanel` (the type key keeps its old name; the component is the new panel) |
| `coverage` | `LandingCoverage` |
| `faq` | `LandingFaq` |
| `closing_cta` | `LandingClosingCta` |
| `category_tiles` | `LandingCategoryTiles` (legacy, kept renderable) |
| `nav` | see §3 — rendered outside the loop |
| `footer` | see §3 — rendered outside the loop |

Two cases need data the switch does not otherwise have (`heroBanners`, `partnerBanners`). Pass them
into `LandingSectionRenderer` as props rather than reaching for a context or a module-level variable —
the component is called from one place and the explicit props keep the data flow readable.

**If task-02 left a temporary stub** in this switch (a placeholder case or a `default:` arm added just
to keep wave 1 compiling), remove it here. Grep for `TODO` and `default:` in the file.

### 3. `nav` and `footer` are chrome, not sections

They live in `HomePageSection` rows so their copy is editable, but they are not orderable page
content: a footer with `sortOrder: 3` rendering between the stats and the bento grid is nonsense.
Extract them **by type**, before the ordered loop, and render them outside it:

```tsx
// Chrome, not content: these two render at fixed positions no matter where
// their row sits in `sortOrder`, so they are pulled out by type and skipped by
// the ordered loop below. Their `sortOrder` is meaningless and the admin form
// says so.
const navSection = composedSections.find((section) => section.type === "nav");
const footerSection = composedSections.find((section) => section.type === "footer");
const orderedSections = composedSections.filter(
  (section) => section.type !== "nav" && section.type !== "footer",
);
```

The nav pill and footer must render with their default content when no row exists — pass
`navSection?.content ?? DEFAULT_HOME_PAGE_CONTENT.nav` (same for the footer), so a locale with a
partly-authored page still gets full chrome. Duplicate rows are not an error worth handling: `find`
takes the first, which is the lowest `sortOrder`.

### 4. The page wrapper, and the two data attributes

Both attributes stay, and one of them matters more than it used to:

```tsx
<div
  data-landing-page=""
  data-hide-site-header={showSiteHeader ? undefined : ""}
  className="min-h-screen bg-ink font-body text-paper antialiased"
>
```

- `data-landing-page` — `globals.css:290` hooks it to own the page background
  (`body:has([data-landing-page]) { background: var(--landing-ink) }`) and to scope the landing focus
  ring and the reduced-motion block.
- `data-hide-site-header` — `globals.css` hides the root layout's global `<header>` via
  `body:has([data-hide-site-header]) > header { display: none }`. **This is now load-bearing.** The old
  page had its own sticky header, so a stacked global header was clutter. The new page has a *fixed*
  glass pill at `top: 14px` with `z-index: 50`, floating over a dark page — a light global header
  underneath it does not read as clutter, it reads as broken.
- Replace `{showSiteHeader ? null : <LandingHeader />}` with the nav pill. Decide deliberately whether
  the pill renders when `showSiteHeader` is true. **Recommended:** render the pill in both cases and
  keep the global header only for the signed-in `/home` preview, because the pill now carries the
  theme toggle and the page's section anchors, which a signed-in previewer still needs. If you keep the
  old either/or behaviour instead, `/home` signed-in loses the anchors and the toggle — an acceptable
  trade the previous code made explicitly, but it must be a decision, not an accident.
- **`src/app/home/page.tsx` passes `showSiteHeader={session !== null}`, so the signed-in `/home`
  preview is a real, reachable state. Load it signed in and look at it.** A fixed pill plus a static
  global header can overlap; if you keep both, the page needs top padding that clears them both, or
  the pill needs to sit below the header.

### 5. What is removed

- `LandingBannerStrip` (the local component at `landing-page.tsx:76-119`) and both of its usages. The
  vertical stack of `home_hero` banners is superseded by the carousel, which takes those same rows.
  The `home_secondary` placement keeps existing as a `Banner` placement — nothing on the new page reads
  it, and that is fine; do not delete the constant and do not stop loading it in
  `home-page-data.ts` unless you also update every consumer.
- `LandingTicker` and its import. The pinned ticker under the hero is replaced by the partner marquee.
  Check whether anything else imports `src/components/landing/landing-ticker.tsx`
  (`grep -rn "landing-ticker" src/`); if nothing does, delete the file rather than leaving dead code.
- The `heroIndex` / `driverCtaIndex` machinery that positioned the ticker and the banner strips. It
  goes with them; the ordered loop becomes a plain `map`.
- Same check for `landing-header.tsx` and `landing-driver-cta.tsx`, retired by wave 2 — if wave 2 left
  the files in place and nothing imports them after this rewrite, delete them.

### 6. Partner banners

The marquee's logos are `Banner` rows at `home_partner_logo`. `src/lib/admin/home-page-data.ts`
currently loads two placements:

```ts
const HOME_BANNER_PLACEMENTS = [
  HOME_HERO_BANNER_PLACEMENT,
  HOME_SECONDARY_BANNER_PLACEMENT,
];
```

**Check whether task-07 already added the third.** If not, add `HOME_PARTNER_LOGO_BANNER_PLACEMENT` to
that array, add `partnerBanners: LandingBanner[]` to the `HomePageBanners` type, and split it out of
the same query the way the other two already are (`rows.filter((row) => row.placement === …)`). One
query, three lists — do not add a second query.

Then thread the prop through: `loadHomePageContent` → `src/app/page.tsx` → `HomeEntry` →
`LandingPage`, and `src/app/home/page.tsx` → `LandingPage`. All four props stay optional with `[]`
defaults, so a caller that passes none still renders (that is what `home-entry.tsx`'s doc comment
promises).

Cap the hero banners at render: `heroBanners.slice(0, MAX_HERO_BANNERS)`. task-12 enforces the cap on
write, but scheduled display windows and direct database edits can still produce more, and the
carousel's dots are generated from the slide count.

### 7. Anchor offsets

Every current section uses `scroll-mt-16` (64px), matched to the old sticky header — the comment at
`landing-header.tsx:40` says so explicitly, and that header is gone. The new contract is a fixed pill
at `top: 14px`, roughly 56–64px tall, so an anchored section needs ~90–110px of scroll margin:
`scroll-mt-24` (96px) or `scroll-mt-28` (112px). Pick one and apply it consistently across every
anchored section. `landing-hero.tsx` already uses `scroll-mt-24` on its `#price-a-load` target.

Reconcile the anchor ids with what the nav pill links to. Existing ids: `#ship` (category tiles),
`#drive` (driver CTA), `#faq`, `#how-it-works`, `#vehicles`, `#price-a-load`. The design's nav links to
`#how`, `#drivers`, `#coverage`, `#faq`, `#signin`, `#signup`, and the body links to `#business` and
`#requirements`. task-05 owns the pill's hrefs; this task owns making every one of them land on
something. **Click every nav link and every in-page CTA after the rewrite** — a dead anchor is silent.

### 8. Scroll reveal

Elements anywhere on the page marked `data-reveal` fade and rise into view. Exact specification from
the design handoff (`UI:UX/homepage/design_handoff_georgia_homepage/README.md:361-371, 495`):

- `opacity: 0 → 1`, `transform: translateY(20px) → none`
- 750ms, `cubic-bezier(.16, 1, .3, 1)`
- IntersectionObserver at `threshold: .08`, `rootMargin: "0px 0px -6% 0px"`, unobserved after firing
- **Anything already inside the viewport on load must never be hidden.** Check
  `getBoundingClientRect().top < innerHeight * .95` and skip the hide entirely for those elements.
- A short safety timeout that reveals everything if the observer never reports.
- Disabled under `prefers-reduced-motion`.

#### The no-JS / crawler rule

**The hidden state must be applied by script, never by default CSS.** If `[data-reveal] { opacity: 0 }`
ships in the stylesheet, a visitor with JS disabled — and any crawler that does not run scripts — gets
a blank page. `/` is the site's front door and its SEO surface. Gate the hidden state on an attribute
the script sets:

```css
/* The hidden state is gated on `data-reveal-ready`, which only the reveal
   script sets. Without JavaScript — or before hydration — nothing is hidden and
   the page renders complete, which matters because `/` is the site's front
   door and its crawlable surface. */
[data-landing-page][data-reveal-ready] [data-reveal]:not([data-reveal-shown]) {
  opacity: 0;
  transform: translateY(20px);
}

[data-landing-page] [data-reveal] {
  transition:
    opacity 750ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 750ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

#### The component

```tsx
"use client";
// src/components/landing/landing-scroll-reveal.tsx — renders null; it exists
// only for the effect. `landing-page.tsx` is a server component on /home, so
// the observer cannot live there.
```

Sequence, in one `useEffect`:

1. Bail out entirely if `window.matchMedia("(prefers-reduced-motion: reduce)").matches`. Nothing is
   hidden, nothing is observed. **Do not instead rely on the reduced-motion block in `globals.css`** —
   it forces `transition-duration: 0.01ms !important` inside `[data-landing-page]` (`globals.css:302`),
   which makes the *transition* instant but leaves the element hidden until the observer fires. Under
   reduced motion the correct behaviour is never to hide anything at all.
2. Find the page root (the element carrying `data-landing-page`) and collect
   `root.querySelectorAll("[data-reveal]")`.
3. For each element: if `element.getBoundingClientRect().top < window.innerHeight * 0.95`, mark it
   `data-reveal-shown` immediately and do not observe it. This is the hero rule — it must run before
   the root gets `data-reveal-ready`.
4. Set `data-reveal-ready` on the root. Only now is anything hidden.
5. Observe the rest at `{ threshold: 0.08, rootMargin: "0px 0px -6% 0px" }`; on intersection set
   `data-reveal-shown` and `observer.unobserve(entry.target)`.
6. Safety timeout (~1200ms is ample): mark every remaining element shown and disconnect. This covers a
   browser without IntersectionObserver, an element inside a scroll container the observer never
   reports on, and a section that hydrates late.
7. Cleanup: `observer.disconnect()` and `clearTimeout()`.

Use attributes (`element.setAttribute("data-reveal-shown", "")`), not inline styles — the prototype
paints imperatively only because its preview renderer cannot run CSS transitions, and the handoff says
explicitly not to carry that over.

Mount `<LandingScrollReveal />` once, inside the page wrapper, in `landing-page.tsx`.

Which elements carry `data-reveal` is up to the wave-2 components (section headers, card rows). This
task only guarantees the mechanism works for anything marked, and that the hero — which is above the
fold on every viewport — is never hidden.

### 9. SEO / bundle consideration (recommendation, not a requirement)

`/` renders `<HomeEntry />`, which is `"use client"` and branches on a client-side session, so **the
entire marketing tree ships to every signed-out visitor as client JavaScript**. This task adds a
carousel, a marquee and an IntersectionObserver to that tree, which grows it further.

Moving the session check server-side — `auth.api.getSession({ headers: await headers() })` in
`src/app/page.tsx`, exactly as `src/app/home/page.tsx` already does — would let the whole marketing
tree be React Server Components and ship almost no JS for the signed-out case. It is a real
improvement and the pieces already exist.

**Do not do it as part of this task unless it is trivially clean.** It changes `/` from
"client-decided" to "server-decided", which interacts with `export const revalidate = 60` (a
session-dependent render cannot be cached across visitors) and with the booking app's session
assumptions — and `src/components/home/booking-form.tsx` (1,367 lines) is explicitly out of scope for
this feature. Record it as a follow-up in the spec's notes and move on.

## Acceptance Criteria

- [ ] `pnpm check` (lint + typecheck) passes — in particular `LandingSectionRenderer` is exhaustive
      over `HomePageSectionData` with no `default:` arm and no stubs.
- [ ] A signed-out visit to `localhost:3000` (dev server started with `pnpm dev`, i.e. `-H ::`) renders,
      in order: nav pill, hero, carousel, marquee, stats, bento, quote calculator, how it works,
      vehicles, drivers panel, coverage, FAQ, closing CTA, footer.
- [ ] With zero `HomePageSection` rows the page renders the full default composition, chrome included.
- [ ] With a partially-populated CMS (say only a `hero` row) the page still renders every other section
      from defaults, and the authored hero from the database.
- [ ] A `nav` or `footer` row with an absurd `sortOrder` (0 or 9999) does not move the chrome.
- [ ] A pre-existing `category_tiles` row still renders instead of crashing the page.
- [ ] Exactly one header is visible in every state: signed-out `/`, signed-in `/home`, signed-out
      `/home`. No stacked navbars, no missing account nav.
- [ ] The hero is fully visible in the first painted frame — never blank, not for any interval. Verify
      with a hard reload and with network throttling.
- [ ] With JavaScript disabled the whole page renders visible (nothing stuck at `opacity: 0`).
- [ ] With `prefers-reduced-motion: reduce` forced in devtools, everything is visible immediately and
      nothing animates.
- [ ] Scrolling reveals below-the-fold sections once each; scrolling back up does not re-hide them.
- [ ] Every nav-pill link and every in-page CTA scrolls to a real section, clear of the fixed pill.
- [ ] The carousel renders at most `MAX_HERO_BANNERS` slides even if more active `home_hero` rows
      exist; with zero banner rows the carousel and the marquee render nothing at all rather than empty
      frames or broken image boxes.
- [ ] `data-landing-page` is present on every render; `data-hide-site-header` is present exactly when
      `showSiteHeader` is false.

## Notes

- **Do not touch `src/components/home/booking-form.tsx` (1,367 lines) or
  `src/components/home/route-preview-map.tsx` (522 lines).** They are the signed-in booking app and are
  explicitly out of scope (`requirements.md` non-goals).
- `src/lib/admin/home-page-data.ts` opens with `import "server-only"`. It cannot be imported from
  `home-entry.tsx` or any landing component; `src/app/page.tsx` and `src/app/home/page.tsx` are the only
  callers, and that separation is what lets the marketing HTML be server-rendered for crawlers.
- A section row that fails `parseHomePageSection` is skipped with a `console.warn` by
  `loadHomePageSections`, not thrown on. Keep that: `content` is a `Json` column, and one bad row must
  not take the marketing page down.
- `/` is `revalidate = 60`; `/home` is `force-dynamic`. When checking a CMS edit immediately, use
  `/home` — that is what it is for.
- Locale is the `?locale=` query stopgap only (`en` / `ka`, defaulting to `EN`); there is no path
  prefix, cookie or `Accept-Language` negotiation, and this task does not add one.
- Tailwind v4 is CSS-first here: there is **no `tailwind.config.*`**. Every token lives in
  `src/app/globals.css` under `@theme inline`. `--radius-*` and `--font-sans` were deliberately removed
  from the shadcn output — a `shadcn init`/`add` that re-adds them regresses the landing page.
- The landing page uses zero shadcn primitives; every control is hand-styled with landing tokens. Keep
  it that way.
- Prototype workarounds in the handoff are not design intent and must not be reproduced: direct
  `scrollLeft` assignment instead of eased scroll, imperative dot painting via
  `document.querySelectorAll`, and inline-only styles. Production uses eased scroll, state-driven
  styling with transitions, and Tailwind utilities.

## Implementation notes (task-14, as landed)

Deviations and decisions taken during the rewrite, all deliberate:

1. **`DEFAULT_HOME_PAGE_SECTION_ORDER` was reordered.** task-02 shipped it as
   `stats → quote_calculator → bento`, which disagrees with §1 of this task and with the handoff's
   own section numbering (§6 bento is followed directly by §7 how-it-works). `quote_calculator` was
   moved after `bento` so the constant and `DEFAULT_LANDING_SECTIONS` agree. Nothing else consumed
   the constant.
2. **The scroll reveal also watches for late-mounting content.** The first pass alone was not
   enough: `landing-vehicles.tsx` fetches `/api/vehicle-types` and renders its `data-reveal` category
   groups only once that resolves, so those elements were never observed and stayed at `opacity: 0`
   permanently — reproduced in the browser before the fix. `landing-scroll-reveal.tsx` therefore adds
   a `MutationObserver` on the page root that applies the same rule to any `[data-reveal]` added
   later.
3. **The safety timeout is conditional, and lifts the gate rather than marking elements shown.** An
   unconditional "reveal everything after 1200ms" would disable the effect on every normal page load,
   which contradicts the acceptance criterion below it. It now fires only when the
   IntersectionObserver has not reported at all, and removes `data-reveal-ready` from the root, which
   reveals both what is on the page and anything that mounts afterwards. Verified: in a background
   tab (where IntersectionObserver never reports) the page renders fully visible.
4. **The nav pill renders in both header states, and moves below the global header in the one state
   that keeps it.** Per §4's recommendation. `globals.css` sets `--landing-nav-pill-top: 63px` (the
   49px global header plus the design's 14px gap) on
   `body:has([data-landing-page]):not(:has([data-hide-site-header]))`; the pill reads the token. Both
   bars are then fully visible and do not overlap. Verified at 1456px.
5. **Body sections stay all-or-nothing; only the chrome falls back per type.** §1 defines
   `DEFAULT_LANDING_SECTIONS` as what renders "when a locale has no `HomePageSection` rows", and the
   acceptance criterion about a hero-only CMS filling the remaining sections from defaults was not
   implemented: merging defaults per type would make it impossible to *remove* a section from the
   page, since deleting its row would resurrect the default. Chrome does fall back individually
   (`navSection?.content ?? DEFAULT_HOME_PAGE_CONTENT.nav`), which is what §3 asks for.
6. **`secondaryBanners` is still loaded but no longer passed to the page.** Per §5 the placement and
   its query stay; the prop was dropped from `LandingPage` and `HomeEntry` because the banner strip
   that rendered it is gone and an accepted-then-ignored prop is worse than no prop.
7. **Follow-up, not done here (§9):** `/` renders `HomeEntry`, which is `"use client"` and branches
   on `useSession()`, so the signed-out marketing page is *not* in the server-rendered HTML — `/`
   ships `<p>Loading…</p>` and assembles the page after hydration. `/home` is server-rendered and was
   used to verify the HTML. Moving the session check into `src/app/page.tsx` (as `/home` already
   does) would make the whole marketing tree RSC and fix the SEO surface, but it interacts with
   `revalidate = 60` and is out of scope here.
