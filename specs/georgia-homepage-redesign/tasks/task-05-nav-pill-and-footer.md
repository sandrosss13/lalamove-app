# Task 05: Nav pill and footer

## Status

complete

## Wave

2

## Description

Replaces the landing page's page chrome. The current two-tier sticky header
(`src/components/landing/landing-header.tsx`) is retired in favour of a **floating glass nav
pill** fixed 14px from the top of the viewport, and the current dark "bookend" footer is
rewritten to the handoff's four-column grid footer. The pill is also where the light/dark
theme toggle built in task-01 is mounted — it is the only persistent chrome on the page, so
it is the only sensible home for it. Every label and href in both components comes from the
CMS (`nav` and `footer` section types added by task-02), with the shipped defaults rendering
when no row exists, which is the normal state until task-15 seeds content.

The design ships **no mobile menu** — its nav links simply wrap onto more lines. The handoff
itself flags that as a production gap ("In production consider a proper mobile menu"), so
this task specifies a real disclosure-based mobile menu; see Technical Details for why the
wrap-only behaviour is not acceptable for a `position: fixed` element.

## Dependencies

**Depends on:** task-01-theme-tokens-and-toggle.md, task-02-cms-content-contract.md
**Blocks:** task-14-page-composition.md

**Context from dependencies:**

**task-01** lands the landing page's dual palette in `src/app/globals.css`. Today the
`--landing-*` variables in `:root` are light-only (`--landing-ink: #ffffff`,
`--landing-paper: #201f1c`, `--landing-muted: #6b675f`, `--landing-accent: #ff5a1f`,
`--landing-line: #e7e4de`, `--landing-surface: #faf9f6`) and `@custom-variant dark
(&:is(.dark *))` is declared at line 5 but nothing has ever set `.dark`. task-01 adds a
`.dark`-scoped override of that palette carrying the handoff's dark values (page `#08090A`,
foreground `#F4F4F2`, accent `#F58220`) plus **new tokens for the roles this design needs and
the current palette has no name for: glass, surface, surface-sunken, border-strong, accent,
accent-hover, on-accent.** task-01 also ships
`src/components/landing/landing-theme-toggle.tsx`, exporting a ready-built
`LandingThemeToggle` client component that flips the `.dark` class, persists the choice and
avoids a first-paint flash. **This task mounts that component; it does not build or modify
it.**

**task-02** extends `src/lib/admin/home-page-content.ts` — the dependency-free shared contract
(no Prisma, no `server-only`, because client landing components import it directly) — with two
new *chrome* section types, `nav` and `footer`. Unlike the ordered content sections, these two
are pulled out **by type** rather than rendered in `sortOrder` position; task-14 does that
extraction and passes the content down. task-02 adds their entries to
`HOME_PAGE_SECTION_TYPES`, `HOME_PAGE_SECTION_TYPE_LABELS`, `HomePageSectionContentByType`,
the `parseHomePageSection` switch, and `DEFAULT_HOME_PAGE_CONTENT`, in the freight voice the
existing defaults already use.

## Files to Create

- `src/components/landing/landing-nav-pill.tsx` — `"use client"`. The fixed floating glass
  pill: wordmark, nav links, sign-in link, sign-up button, the task-01 theme toggle, and the
  mobile disclosure menu.

## Files to Modify

- `src/components/landing/landing-footer.tsx` — rewritten to the handoff's grid footer.
  Drops the `bg-ink-strong` / `text-on-strong` / `landing-grain` bookend treatment, drops the
  `LandingWordmark` import, drops the "Dispatch open 24/7" chip, and takes its content from
  the `footer` CMS section type.
## Files to Delete

None. See "Retiring `landing-header.tsx`" — the old header is superseded by this task but is
unwired and deleted by task-14, not here.

## Technical Details

### Retiring `landing-header.tsx`, and where `LandingWordmark` goes

`src/components/landing/landing-header.tsx` (101 lines) exports two things:

- `LandingHeader` — the two-tier sticky header. Imported **only** by `landing-page.tsx`.
- `LandingWordmark` — an orange-square arrow glyph plus a `Lalamove<span
  class="text-accent">/</span>Clone` split-colour lockup, wrapped in a `<Link href="/">`.
  Imported by `landing-header.tsx` itself and by `landing-footer.tsx`.

**Decision: `LandingWordmark` is not preserved anywhere. Delete it with the file.** The
reasons, so this is not re-litigated:

1. The new design's wordmark is **plain text** — "16px / 700 / `letter-spacing: -0.035em`"
   in the pill and "18px / 700" in the footer brand block. There is no icon in the design at
   all ("No icons are used — the design relies on typography, dots, and the `‹`/`›` glyphs").
   The square-arrow glyph is not part of this design language.
2. The two surviving call sites differ in size, weight and tracking, so a shared component
   would exist purely to hold a `variant` prop for two consumers.
3. The brand string itself becomes CMS content in this task (`nav.brand` and
   `footer.brandName`), so it can no longer be hardcoded inside a shared component anyway.

So: the pill renders its own text wordmark, and the footer renders its own text brand block.

**Do not delete `landing-header.tsx`, and do not touch `src/components/landing/landing-page.tsx`.**
`landing-page.tsx` still imports `LandingHeader`, and that file is owned by task-14, which
rewrites it wholesale in Wave 3. Deleting the header here would leave a dangling import and
break the typecheck for every other Wave 2 task running in parallel. Instead: read
`landing-header.tsx` (all 101 lines) for the nav structure and anchor hrefs you are carrying
over, leave it byte-identical on disk, and state in your final message that task-14 must swap
`LandingHeader` for `LandingNavPill` and then delete both `landing-header.tsx` and its
`LandingWordmark` export.

This is exactly how task-07 treats `landing-ticker.tsx` and task-09 treats
`landing-driver-cta.tsx` — superseded components stay on disk through Wave 2 and are unwired
in one place, by the task that owns composition. **No Wave 2 task edits `landing-page.tsx`.**

Note the consequence for your component's API: task-14 will render `<LandingNavPill />` and
pass it CMS content, but to keep the seam simple the `content` prop must be optional with a
default, exactly like `LandingHero({ content = DEFAULT_HOME_PAGE_CONTENT.hero })` does today.

### The token rule (applies to every value below)

The design handoff is written entirely in dark-theme literals. **Do not put a single one of
those rgba values into a component.** The page must work in both themes, and the light theme
is not "the dark theme with different opacity" — it is the same *roles* resolved against an
inverted palette.

1. **Prefer a task-01 token.** Read the `@theme inline` block in `src/app/globals.css` after
   task-01 has landed and use the utility names it actually declares. The roles you need
   here: page background (`ink`), foreground (`paper`), muted text (`muted`), border
   (`line`), accent (`accent`), glass (the nav pill's translucent backdrop), on-accent.
   Existing utilities today are `bg-ink`, `text-paper`, `text-muted`, `border-line`,
   `bg-accent` / `text-accent`; task-01 adds the rest.
2. **For a text/border/background tint the design expresses as an alpha of the foreground**
   (`rgba(244,244,242,0.66)`, `rgba(255,255,255,0.08)`, `rgba(255,255,255,0.09)`), use a
   Tailwind opacity modifier on the foreground token: `text-paper/66`, `bg-paper/8`,
   `border-paper/9`. Tailwind v4 accepts arbitrary percentages. These invert for free,
   because `--landing-paper` flips with the theme.
3. **For anything else with no token**, derive it with `color-mix` against a token rather
   than hardcoding, e.g. `bg-[color-mix(in_srgb,var(--landing-paper)_5%,transparent)]`.
   Never write `rgba(255,255,255,…)` or `#F4F4F2` / `#08090A` / `#F58220` literals.
4. **Do not add tokens to `globals.css` in this task.** task-01 owns that file.

### Nav pill — exact metrics

Outer wrapper (the fixed positioner):

- `position: fixed; top: 14px; left: 0; right: 0; z-index: 50`
- `display: flex; justify-content: center; padding: 0 16px`
- **`pointer-events: none`** — so the transparent gutter either side of the pill does not
  swallow clicks on the page behind it.

The pill itself:

- **`pointer-events: auto`** (re-enabled on the pill only)
- `display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: center`
- `padding: 8px 8px 8px 18px`
- `border-radius: 999px` → `rounded-full`
- background: glass — dark value `rgba(16,18,20,0.72)`; use task-01's glass token
- `backdrop-filter: blur(18px) saturate(140%)` → `backdrop-blur-[18px] backdrop-saturate-[1.4]`
- border: `1px solid rgba(255,255,255,0.09)` → `border border-paper/9`
- shadow: `0 8px 30px rgba(0,0,0,0.45)` → `shadow-[0_8px_30px_rgba(0,0,0,0.45)]` is acceptable
  here (a black drop shadow reads correctly on a light ground too), but soften it in light
  theme if it looks heavy — a `dark:` variant is available now that task-01 has landed `.dark`.

Contents, in order:

| Element | Metrics |
|---|---|
| Wordmark | 16px / 700 / `letter-spacing: -0.035em`, `margin-right: 14px`. Wrapped in `<Link href="/">`. Text is `content.brand`. |
| Nav links | 13.5px, colour `rgba(244,244,242,0.66)` → `text-paper/66`, `padding: 9px 14px`, `border-radius: 999px`. Hover: background `rgba(255,255,255,0.08)` → `hover:bg-paper/8`, colour `text-paper`. |
| Sign in | Same as a nav link, plus `margin-left: 6px`. |
| Sign up | 13.5px / 600, background `#F4F4F2` (i.e. the **foreground** token — `bg-paper`), colour `#08090A` (the **background** token — `text-ink`), `padding: 10px 20px`, `border-radius: 999px`, `margin-left: 2px`. This is the inverted button: in light theme it correctly becomes dark-on-light. |
| Theme toggle | `LandingThemeToggle` from task-01, placed **between the last nav link/sign-in and the Sign up button**. |

The handoff's default link set is How it works (`#how`), For Drivers (`#drivers`), Coverage
(`#coverage`), Help (`#faq`), Sign in (`#signin`), Sign up (`#signup`). **Do not hardcode
these.** They come from `DEFAULT_HOME_PAGE_CONTENT.nav`, which task-02 authors against this
codebase's real routes (`/sign-in`, `/sign-up`, and the section anchor ids task-14 assigns).

### Nav pill — CMS content

Import the type and defaults from the shared contract; never redeclare a local copy:

```ts
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type NavContent,
} from "@/lib/admin/home-page-content";

export function LandingNavPill({
  content = DEFAULT_HOME_PAGE_CONTENT.nav,
}: {
  content?: NavContent;
}) { … }
```

The expected shape (confirm against task-02's actual export before writing code — task-02 is
authoritative, this is the shape this task was planned against):

```ts
type NavContent = {
  brand: string;
  links: { label: string; href: string }[];
  signInLabel: string;
  signInHref: string;
  signUpLabel: string;
  signUpHref: string;
};
```

`links` may legitimately be empty (a half-finished edit in the admin) — render the pill with
just the wordmark, toggle and buttons rather than crashing.

**Link element choice**, matching the rule the current footer already uses: `href` starting
with `/` → `next/link`'s `<Link>`; anything else (a `#anchor`, an absolute URL) → a plain
`<a>`. Add `rel="noreferrer"` on absolute `http(s)` hrefs.

### Nav pill — the mobile menu (required, not in the design)

The handoff's pill wraps its links instead of collapsing. Reproducing that is not acceptable
here, and the handoff says so itself ("The nav has no mobile menu; links wrap instead" is
listed under *Known prototype-only compromises*, and *Responsive behaviour* says "In
production consider a proper mobile menu"). Concretely: at 360px, a wordmark + five links + a
sign-up button + a theme toggle wrap to four rows, roughly 200px tall. Because the pill is
`position: fixed`, that block never scrolls away — it permanently occludes the top third of
the hero on the phones most of this page's traffic will arrive on.

Specification:

- From the `sm` breakpoint up (640px), render the links inline exactly as above.
- Below `sm`, the pill shows only: wordmark, theme toggle, and a disclosure button.
- Disclosure button: 36×36 `rounded-full`, `bg-paper/8`, lucide `Menu` icon when closed and
  `X` when open (`lucide-react` is already a dependency, `^1.31.0`). It carries
  `aria-expanded={open}`, `aria-controls={panelId}` (from `useId()`), and an `aria-label`
  that changes with state ("Open menu" / "Close menu").
- Panel: rendered inside the same `pointer-events: none` fixed wrapper, directly beneath the
  pill, `pointer-events: auto`, `id={panelId}`, same glass background / blur / border as the
  pill but `rounded-3xl` and `padding: 14px`, links stacked in a column at the same 13.5px
  with a comfortable 44px tap target, sign-in and sign-up at the bottom.
- Closes on: link activation, `Escape` keydown, and a click outside the panel. On close,
  return focus to the disclosure button.
- The panel is only mounted while `open` is true.
- Do **not** trap focus or mark the rest of the page inert — this is a disclosure, not a
  modal dialog. Use `aria-expanded` + `aria-controls` and nothing heavier. (The FAQ accordion
  in `src/components/landing/landing-faq.tsx` is the codebase's existing example of this
  exact `useId` / `aria-expanded` / `aria-controls` pattern — follow it.)

`useState`/`useId`/`useEffect` make this a client component: put `"use client"` at the top.
`LandingThemeToggle` is a client component anyway, so nothing is lost.

### Footer — exact metrics

Read the current `src/components/landing/landing-footer.tsx` (123 lines) first. What to
**keep** from it:

- The `href.startsWith("/") ? <Link> : <a>` rendering rule.
- The `merchantOrigin()` handling for driver sign-up (see below).
- `<nav aria-label={column.title}>` around each column with a heading — good semantics, keep
  the structure.

What to **drop**: `landing-grain`, `bg-ink-strong`, `text-on-strong` (the whole dark-bookend
treatment — the new footer sits on the ordinary page background), the `LandingWordmark`
import, the hardcoded `FOOTER_COLUMNS` array, and the "Dispatch open 24/7" chip.

New structure and metrics:

- `<footer>`: `border-top: 1px solid rgba(255,255,255,0.08)` → `border-t border-paper/8`;
  padding `clamp(44px, 5vw, 72px)` top … `36px` bottom; horizontal padding
  `clamp(20px, 4vw, 48px)`; inner `max-width: 1200px` centred.
- **One grid** for the brand block *and* the link columns:
  `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 28px` →
  `grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-7`.
- **The brand block spans `grid-column: 1 / -1`** → `col-[1/-1]`. **This is load-bearing.**
  The handoff calls it out explicitly: *"The brand block spans `grid-column: 1 / -1` (its own
  row) so the four link columns always resolve to four equal tracks — this is load-bearing;
  putting the brand block in the track flow orphans the last column."* With five items in an
  `auto-fit` track list the brand takes a track and the fourth link column wraps alone onto
  the next row. Do not "simplify" this into two nested grids or a flex row.
- Brand: name 18px / 700; blurb 14px at `rgba(244,244,242,0.45)` → `text-paper/45`,
  `max-width: 30ch`.
- Column heading: mono (`font-price`, which is IBM Plex Mono in this codebase), 10px,
  `letter-spacing: .18em`, uppercase, `rgba(244,244,242,0.35)` → `text-paper/35`.
- Column links: 14px at `rgba(244,244,242,0.6)` → `text-paper/60`, list `gap: 11px`
  (`gap-[11px]`), hover → `text-paper`.
- Bottom bar: `border-top: 1px solid rgba(255,255,255,0.08)`, `padding-top: 24px`, mono 11px,
  `letter-spacing: .08em`, `text-paper/35`. Copyright left, legal links right (the design
  shows "Privacy · Terms · Cookies").

The handoff's default columns are Product / Business / Couriers / Company. **Do not hardcode
them** — they come from `DEFAULT_HOME_PAGE_CONTENT.footer`.

### Footer — CMS content

Expected shape (again: confirm against task-02's actual export):

```ts
type FooterContent = {
  brandName: string;
  brandBlurb: string;
  columns: { title: string; links: { label: string; href: string }[] }[];
  copyright: string;
  legalLinks: { label: string; href: string }[];
};
```

```ts
export function LandingFooter({
  content = DEFAULT_HOME_PAGE_CONTENT.footer,
}: {
  content?: FooterContent;
}) { … }
```

An empty `columns` array or an empty `links` array must render an empty region, not throw.

**The `©` year.** The current footer computes `new Date().getFullYear()`. The design hardcodes
"© 2026 Lalamove Georgia". Since `copyright` is now a CMS string, render it verbatim — do not
splice a computed year into authored copy, or a content manager cannot correct it. Note this
in your final report so task-15 seeds a sensible string.

### Footer — the `href: "#"` placeholders, and real static pages

Today's footer has five dead links: About, Careers, Contact (Company column) and Terms,
Privacy (Legal column), all `href: "#"`. **Do not reproduce a `#` placeholder in this
component.**

The app *does* have a real destination for these: `src/app/(public)/pages/[slug]/page.tsx`
serves published `StaticPage` rows from the back office's Static Pages section at
`/pages/{slug}` (unpublished, unknown slug and unknown locale all `notFound()` identically).
So About / Contact / Terms / Privacy should point at `/pages/about`, `/pages/contact`,
`/pages/terms`, `/pages/privacy` once those rows exist.

This component renders whatever href the CMS gives it — it must not rewrite or filter hrefs.
So the actual wiring is a defaults question owned by task-02 and a seeding question owned by
task-15. **Your job here:** render hrefs verbatim, and state in your final report which of
the shipped `footer` defaults still point at `#` so task-02/task-15 can fix them. If a `#`
default is still there when you implement, leave it — do not paper over it with a link to a
page that does not exist yet.

### Footer — driver sign-up and `merchantOrigin()`

The current footer computes, at module scope:

```ts
const DRIVER_SIGN_UP_HREF = merchantOrigin()
  ? `${merchantOrigin()}/sign-up`
  : "/sign-up";
```

Driver registration lives on the merchant host; the landing page is client-host-only, where
`/sign-up` offers CLIENT registration only. **This behaviour must survive.** Where a driver
signs up is deployment configuration, not content — the same reasoning
`DriverCtaContent`'s doc comment in `home-page-content.ts` already gives for why the driver
CTA's button target is deliberately not editable.

Resolve it with a sentinel: if a footer link's `href` is exactly `"@driver-sign-up"`,
substitute `DRIVER_SIGN_UP_HREF` at render time. Keep the `merchantOrigin()` import from
`@/lib/host` and the module-scope constant (its doc comment explains why module scope is safe
in both server and browser contexts — keep that comment). Document the sentinel in a comment
on the resolver. The resolver is inert for every other href, so if task-02's defaults do not
yet use the sentinel nothing breaks — say so in your final report.

### Server vs client components

- `landing-nav-pill.tsx` — `"use client"` (theme toggle + mobile disclosure state).
- `landing-footer.tsx` — **stays a server component.** It has no interactivity. Do not add
  `"use client"`; it currently has none and there is no reason to add one.

## Acceptance Criteria

- [ ] `src/components/landing/landing-nav-pill.tsx` exists, exports `LandingNavPill`, is a
      client component, and renders correctly with **no props** (falling back to
      `DEFAULT_HOME_PAGE_CONTENT.nav`).
- [ ] The pill is `position: fixed; top: 14px`, horizontally centred, `z-index: 50`, with
      `pointer-events: none` on the wrapper and `pointer-events: auto` on the pill — clicking
      the gutter beside the pill activates the page underneath, not the nav.
- [ ] The pill's glass background, 18px blur / 140% saturation, hairline border, shadow,
      `8px 8px 8px 18px` padding and 6px gap match the handoff.
- [ ] `LandingThemeToggle` from `src/components/landing/landing-theme-toggle.tsx` is mounted
      in the pill and switches the page theme.
- [ ] Below 640px the links collapse into an accessible disclosure menu: a button with
      `aria-expanded` and `aria-controls`, a panel mounted only when open, closing on link
      click, `Escape` and outside click, with focus returned to the button.
- [ ] `src/components/landing/landing-header.tsx` and `src/components/landing/landing-page.tsx`
      are both byte-identical to how you found them, and the final message tells task-14 to
      swap in `LandingNavPill` and delete the header file plus its `LandingWordmark` export.
- [ ] Neither the new pill nor the new footer imports `LandingWordmark`; each renders its own
      text brand from CMS content.
- [ ] The footer is one grid at `repeat(auto-fit, minmax(150px, 1fr))` with `gap: 28px`, and
      the brand block carries `grid-column: 1 / -1`.
- [ ] Column headings are mono 10px `.18em` uppercase; column links are 14px with an 11px
      gap; the bottom bar is mono 11px `.08em`.
- [ ] Every string and href in both components comes from the `nav` / `footer` CMS content,
      with defaults from `DEFAULT_HOME_PAGE_CONTENT`. No hardcoded label, no `href: "#"`.
- [ ] Driver sign-up still resolves through `merchantOrigin()` when the host split is enabled.
- [ ] No component contains a literal `rgba(255,255,255,…)`, `#F4F4F2`, `#08090A` or
      `#F58220`; every colour resolves from a `--landing-*` token, an opacity modifier on one,
      or a `color-mix` against one. Both themes render legibly.
- [ ] `pnpm check` (lint + typecheck) passes.

## Notes

- **The landing page must keep emitting `data-landing-page` and (for signed-out visitors)
  `data-hide-site-header`.** Those attributes live on the wrapper `<div>` in
  `landing-page.tsx`, which you are not restructuring — just do not remove them.
  `data-hide-site-header` is what hides the root layout's global `<header>`; without it the
  app's site header stacks on top of the floating pill.
- `globals.css` already defines the landing focus ring once, for every landing control:
  `[data-landing-page] a:focus-visible, [data-landing-page] button:focus-visible { outline:
  2px solid var(--landing-accent); outline-offset: 4px; }`. Do not add per-component focus
  styles — and do not remove focus outlines from the pill's links to keep the shape tidy.
- The landing page uses **zero shadcn primitives** — every control is hand-styled with the
  landing tokens. Do not reach for `src/components/ui/*` here; that set is pinned light-only
  and is for the admin/onboarding surfaces.
- Design source: `UI:UX/homepage/design_handoff_georgia_homepage/README.md`, sections
  **1. Floating nav pill** and **13. Footer**. The `README.md` wins wherever it disagrees with
  `Home-Georgia-v3.dc.html`. The prototype's inline styles are a runtime limitation of its
  preview renderer and must not be reproduced — everything here is Tailwind v4 utilities.
- **No media queries in the layout.** Everything is fluid via `clamp()` and `auto-fit`. The
  one deliberate exception is the mobile menu's `sm:` breakpoint, which is a behaviour change
  (disclosure vs. inline), not a layout tweak.
- **Equal-width card rows are grids, never flex.** The handoff's "lesson learned": use
  `grid-template-columns: repeat(auto-fit, minmax(Xpx, 1fr))`, **not** `flex: 1 1 Xpx` — a
  wrapped flex item with `flex-grow: 1` inflates to the full row width and reads as a broken
  layout. This is why the footer is one grid.
- The brand name itself ("Lalamove Georgia" throughout the handoff) is unconfirmed — see
  `specs/georgia-homepage-redesign/action-required.md`, "Confirm the brand name for the page".
  It is CMS content in both components, so a wrong seeded default is a one-field fix, not a
  code change.
