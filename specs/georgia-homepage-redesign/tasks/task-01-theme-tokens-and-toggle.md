# Task 01: Landing theme tokens and the light/dark toggle

## Status

complete

## Wave

1

## Description

The redesigned homepage ships in two themes. The design handoff
(`UI:UX/homepage/design_handoff_georgia_homepage/README.md`) is dark — page `#08090A`, accent
`#F58220` — while today's landing page is light (`--landing-ink: #ffffff`, accent `#ff5a1f`).
Rather than picking one, both become themes of the same new layout: the existing `--landing-*`
values *are* the light theme, the handoff's palette becomes a dark override, and a pill button
in the nav pill switches between them. The choice is persisted in `localStorage` and applied by
an inline script in `<head>` **before first paint**, so the page never flashes the wrong theme.

This task owns every token the seven wave-2 section tasks (task-05 … task-11) will paint with,
so it must land the *complete* set in one pass: colours, the four named gradients, the three
shadows, the blur, and the motion durations. Nothing downstream is allowed to edit
`src/app/globals.css`, which is why this is a Wave 1 task on its own.

This is genuinely new ground for the repo. `globals.css` line 5 declares
`@custom-variant dark (&:is(.dark *))` but **nothing has ever set the `.dark` class**, and the
app has three surfaces (admin back office, driver hub, driver/fleet onboarding wizards) that are
deliberately pinned to a light palette. Turning `.dark` on globally would visibly repaint all
three. Read the warnings in Technical Details carefully — a naive implementation of this task
breaks four other product surfaces.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-05-nav-pill-and-footer, task-06-hero-and-carousel, task-07-marquee-and-stats,
task-08-bento-and-how-it-works, task-09-vehicles-and-drivers, task-10-coverage-faq-closing-cta,
task-11-quote-calculator-restyle

**Context from dependencies:** None — this is a foundation task. What it *produces* matters to
everything downstream, so be precise with the token names below: seven parallel tasks will write
`bg-glass`, `text-subtle`, `border-line-strong`, `shadow-pill` etc. against exactly the names in
this file, and a rename after the fact means seven concurrent edits. **task-05 imports and places
`<LandingThemeToggle />` inside the floating nav pill** — this task only builds and exports the
component; it does not mount it anywhere.

## Files to Create

- `src/components/landing/landing-theme-toggle.tsx` — `"use client"` pill button that flips the
  `dark` class on `document.documentElement`, writes `localStorage`, and reflects the current
  state. Exported for task-05 to place inside the nav pill.

## Files to Modify

- `src/app/globals.css` — narrow the `dark` custom variant; add the new light-theme token values
  to `:root`; add the scoped dark-theme block; register the new `--color-*`, `--shadow-*`,
  `--blur-*` and `--animate-*` mappings under `@theme inline`; add the status-dot pulse keyframes;
  extend the `prefers-reduced-motion` block.
- `src/app/layout.tsx` — add the synchronous pre-paint theme script to `<head>` and
  `suppressHydrationWarning` to `<html>`.

## Technical Details

### Read this first

Read all 377 lines of `src/app/globals.css` before touching it. It is unusually heavily
commented, and the comments are load-bearing: they record *why* `--radius-*` and `--font-sans`
were removed from the shadcn output, why `--color-muted` resolves through a fallback chain, and
why the admin and onboarding surfaces pin their own `--background`. Match that commenting
density — every block you add should say why, not what.

Key facts about the file as it stands:

- Line 5: `@custom-variant dark (&:is(.dark *));`
- Lines 7–79: `:root`, containing (in order) `--background`/`--foreground`, the eight
  `--landing-*` values, the two `--onboarding-*` values, and the shadcn token set.
- Lines 81–86: `@media (prefers-color-scheme: dark) { :root { --background; --foreground } }` —
  pre-existing, Next.js starter leftover. Leave it alone.
- Lines 88–185: `@theme inline`, where `--color-ink`, `--color-surface`, `--color-paper`,
  `--color-muted`, `--color-accent`, `--color-line`, `--color-ink-strong`, `--color-on-strong`,
  the three font families and the three `--animate-*` names are mapped.
- Lines 187–229: `@keyframes landing-rise`, `landing-wipe`, `landing-ticker`,
  `onboarding-fade-up`.
- Lines 235–266: `@utility landing-grain`, `landing-grid`, `landing-hazard`.
- Lines 287–301: `body:has([data-hide-site-header]) > header { display: none }`,
  `body:has([data-landing-page]) { background: var(--landing-ink) }`, and the landing focus ring.
- Lines 303–311: the landing `prefers-reduced-motion` block.
- Lines 325–341: `body:has([data-admin-surface]), body:has([data-onboarding-surface])` — pins
  `--background`/`--foreground` and defines `--admin-accent`/`--admin-muted`.

---

### ⚠️ Warning 1 — the landing tokens are NOT landing-only

`--landing-*` is a misleading prefix. Grep confirms these utilities are used well outside
`src/components/landing/`:

| Utility | Non-landing consumers |
|---|---|
| `bg-ink`, `bg-surface`, `text-paper`, `border-line`, `bg-accent`, `text-accent` | `src/app/account/page.tsx`, `src/components/account-profile-form.tsx`, `src/components/account-password-card.tsx`, `src/components/account-sidebar.tsx`, `src/components/home/booking-form.tsx`, `src/components/home/route-preview-map.tsx` |
| `text-muted` (→ `var(--admin-muted, var(--landing-muted))`) | 83 files: the whole admin back office, the driver hub, both onboarding wizards, the account pages, the booking app |

`booking-form.tsx` and `route-preview-map.tsx` are the **signed-in booking app and are explicitly
out of scope for this whole feature — do not touch them, and do not let their colours move.**

Therefore the dark values must **not** go on a bare `.dark` / `html.dark` selector. Scope them to
the landing page's own body:

```css
html.dark body:has([data-landing-page]) { /* dark values here */ }
```

`data-landing-page` is emitted by `src/components/landing/landing-page.tsx:222` on the page's
outermost element and is server-rendered, so the selector matches in the very first paint. Body is
the correct subject rather than the landing root itself, because the existing
`body:has([data-landing-page]) { background: var(--landing-ink) }` rule (line 291) resolves
`--landing-ink` *on `body`* — scoping the override any deeper would leave the page background
light while everything inside it went dark.

Specificity works out: the existing rule is `(0,1,1)`, the dark block is `(0,2,2)`, so the dark
values win on `body` and the background rule keeps working unchanged. That satisfies requirement
"keep `body:has([data-landing-page])` working in both themes" — you are not editing that rule at
all, only the value it reads.

### ⚠️ Warning 2 — `src/components/ui/*` already contains `dark:` utilities

Nine shadcn primitives ship `dark:` classes that have never fired because `.dark` was never set:

- `input.tsx`, `textarea.tsx`, `select.tsx` — `dark:bg-input/30`, `dark:disabled:bg-input/80`
- `button.tsx` — `dark:border-input dark:bg-input/30 dark:hover:bg-input/50` on the outline variant
- `checkbox.tsx` — `dark:bg-input/30`, `dark:data-checked:bg-primary`
- `tabs.tsx` — `dark:text-muted-foreground`, `dark:data-active:bg-input/30`
- `badge.tsx`, `calendar.tsx`, `dropdown-menu.tsx` — assorted destructive/hover variants

The moment `.dark` sits on `<html>`, a visitor who picks dark on the homepage and then navigates
to `admin.localhost:3000` or the onboarding wizard gets grey-filled inputs, a translucent active
tab and a repainted outline button — because the shadcn token set stays light-only, so those
`dark:` utilities resolve to light values in the wrong slots. That fails the "admin/onboarding
surfaces visually unchanged" acceptance criterion without anyone writing a single new `dark:`
class.

**Fix: narrow the variant declaration on line 5** so `dark:` can only ever fire inside the landing
subtree:

```css
/* Declared by the shadcn CLI as `&:is(.dark *)` and never used — nothing set
   `.dark` until the landing page's theme toggle did. Narrowed to the landing
   subtree on purpose: `.dark` now lives on `<html>` for the whole session, and
   the `src/components/ui/*` primitives carry `dark:` classes (`dark:bg-input/30`
   on input/textarea/select/button/checkbox, `dark:text-muted-foreground` on
   tabs) that would otherwise start firing on the admin back office, the driver
   hub and both onboarding wizards — all three of which are deliberately pinned
   to a light palette with a light-only shadcn token set. This is a strict no-op
   for existing behaviour (the variant has never matched anything) and it keeps
   `dark:` available where it is actually wanted. */
@custom-variant dark (&:is(.dark [data-landing-page], .dark [data-landing-page] *));
```

The landing root itself is listed alongside its descendants so a `dark:` utility written on the
page's outermost element still matches.

### ⚠️ Warning 3 — what must NOT gain dark values

Only the `--landing-*` names flip. Do not add dark values for, and do not reference, any of:

- the shadcn token set (`--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`,
  `--destructive`, `--border`, `--input`, `--ring`, `--chart-*`, `--sidebar-*`)
- `--onboarding-accent` / `--onboarding-accent-hover` — these happen to share the value `#ff5a1f`
  with `--landing-accent` but are a separate variable that must not move
- `--admin-accent` / `--admin-muted`
- `--background` / `--foreground` — the existing `@media (prefers-color-scheme: dark)` block at
  lines 81–86 already owns those and is out of scope

**The `--color-muted` fallback chain is the trap.** `@theme inline` line 103 reads
`--color-muted: var(--admin-muted, var(--landing-muted))`. Override `--landing-muted` inside the
scoped dark block and the chain still works everywhere: on admin/driver-hub/onboarding pages
`--admin-muted` is defined on `body` and wins, and those pages never carry `data-landing-page`
anyway. **Never** write `--color-muted`, `--muted` or `--admin-muted` in the dark block — setting
`--color-muted` directly would hard-override the resolved value for the whole subtree and silently
disable the admin fallback. The same rule applies to `--color-accent`.

---

### Step 1 — new light-theme values in `:root`

Six of the handoff's tokens (glass, glass-on-image, surface-raised, surface-sunken, carousel
frame, border-strong, accent-hover, on-accent, the graded text alphas) have no light equivalent
today. They must be defined in **both** themes so a component can reference one name and get the
right value — a wave-2 task must never branch on the theme in TSX.

Add this immediately after the existing `--landing-on-strong` line (currently line 27), inside
`:root`:

```css
  /* --- Georgia-homepage additions, light theme -------------------------------
     Every token below has a dark counterpart in the
     `html.dark body:has([data-landing-page])` block further down. They exist in
     both themes so the section components reference one name and never branch on
     the theme in TSX. Values that read as "translucent white over a dark page" in
     the handoff become "translucent ink over a light page" here; the two that
     sit on top of photography (`glass-image*`) stay dark in both themes, because
     a caption pill over a banner needs to be legible either way. */
  --landing-accent-hover: #b4530f; /* handoff's "accent on light bg" */
  --landing-on-accent: #ffffff;
  --landing-frame: #f1efe9;
  --landing-surface-raised: #ffffff;
  --landing-surface-sunken: rgba(32, 31, 28, 0.05);
  --landing-glass: rgba(255, 255, 255, 0.72);
  --landing-glass-image: rgba(8, 9, 10, 0.62);
  --landing-glass-image-strong: rgba(8, 9, 10, 0.66);
  --landing-line-hairline: rgba(32, 31, 28, 0.07);
  --landing-line-strong: rgba(32, 31, 28, 0.14);
  --landing-line-stronger: rgba(32, 31, 28, 0.2);
  --landing-line-accent: rgba(255, 90, 31, 0.22);
  --landing-line-accent-strong: rgba(255, 90, 31, 0.3);
  --landing-subtle: rgba(32, 31, 28, 0.66);
  --landing-faint: rgba(32, 31, 28, 0.5);
  --landing-faintest: rgba(32, 31, 28, 0.42);

  /* The four named gradients from the handoff's Design Tokens table, restated
     on the light accent. Declared as whole `background-image` values rather than
     colour stops so a component applies one with
     `bg-[image:var(--landing-gradient-accent-card)]` and gets the theme's
     version for free. */
  --landing-gradient-spotlight: radial-gradient(
    closest-side,
    rgba(255, 90, 31, 0.16),
    rgba(255, 90, 31, 0.04) 55%,
    transparent 72%
  );
  --landing-gradient-accent-card: linear-gradient(
    160deg,
    rgba(255, 90, 31, 0.1),
    rgba(32, 31, 28, 0.02) 46%
  );
  --landing-gradient-coverage-card: linear-gradient(
    160deg,
    rgba(255, 90, 31, 0.09),
    rgba(32, 31, 28, 0.02) 50%
  );
  --landing-gradient-cta-panel: linear-gradient(
    150deg,
    rgba(255, 90, 31, 0.14),
    rgba(32, 31, 28, 0.02) 58%
  );

  /* Shadows. The handoff's three, softened for a light page — an 0.9-alpha black
     drop shadow reads as a smudge on white. The CTA glow keeps its accent hue in
     both themes because it is the button's own colour bleeding, not a shadow. */
  --landing-shadow-frame: 0 40px 90px -34px rgba(32, 31, 28, 0.28);
  --landing-shadow-pill: 0 8px 30px rgba(32, 31, 28, 0.12);
  --landing-shadow-cta: 0 10px 30px rgba(255, 90, 31, 0.28);

  /* Motion, from the handoff's Motion table. Theme-independent, so declared once
     here and never repeated in the dark block. `--landing-ease` is the same
     cubic-bezier the existing `--animate-rise` / `--animate-wipe` already use;
     naming it lets the carousel and the scroll reveal share one curve. The
     6000ms auto-advance interval is deliberately NOT a CSS variable — it is a
     JS constant owned by the carousel component in task-06. */
  --landing-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --landing-duration-reveal: 750ms;
  --landing-duration-carousel: 420ms;
  --landing-duration-dot: 240ms;
```

### Step 2 — the scoped dark block

Insert this **after** the `@media (prefers-color-scheme: dark)` block (i.e. after current line 86)
and before `@theme inline`. Order matters for readability even though specificity already decides
the winner.

```css
/* Landing page, dark theme — the `Home-Georgia-v3` palette from
   `UI:UX/homepage/design_handoff_georgia_homepage/README.md`.
   `.dark` is set on `<html>` before first paint by the inline script in
   `src/app/layout.tsx`, and is what the (narrowed) `dark:` variant keys off.

   Scoped to `body:has([data-landing-page])` rather than to `.dark` alone
   ON PURPOSE. The `--landing-*` prefix is misleading: `bg-ink`, `bg-surface`,
   `text-paper`, `border-line`, `text-accent` and `text-muted` are also used by
   the account pages, the signed-in booking app (`src/components/home/
   booking-form.tsx`, out of scope for this feature) and — via the
   `var(--admin-muted, var(--landing-muted))` chain — by the admin back office,
   the driver hub and both onboarding wizards. A bare `.dark { --landing-ink: ... }`
   would repaint all of them for any visitor who once picked dark on the
   homepage. `data-landing-page` is server-rendered on the landing root, so this
   selector matches from the first paint with no flash.

   Body is the subject rather than `[data-landing-page]` itself because
   `body:has([data-landing-page]) { background: var(--landing-ink) }` further
   down resolves the variable on `body`.

   Only `--landing-*` names appear here. The shadcn token set, `--onboarding-accent`,
   `--admin-accent`/`--admin-muted` and `--background`/`--foreground` are all
   deliberately absent — see the Non-Goals in
   `specs/georgia-homepage-redesign/requirements.md`: the toggle governs the
   landing page and nothing else. In particular never set `--color-muted` or
   `--color-accent` here; those are the resolved `@theme` names and writing them
   would bypass the `--admin-*` fallback chain the back office depends on. */
html.dark body:has([data-landing-page]) {
  /* Native form controls, scrollbars and the canvas behind the page follow the
     theme too. Scoped with everything else so the admin's scrollbars stay light. */
  color-scheme: dark;

  --landing-ink: #08090a;
  --landing-paper: #f4f4f2;
  --landing-accent: #f58220;
  --landing-accent-hover: #ffa45c;
  --landing-on-accent: #0a0b0a;
  --landing-frame: #111315;
  --landing-surface: rgba(255, 255, 255, 0.04);
  --landing-surface-raised: rgba(255, 255, 255, 0.06);
  --landing-surface-sunken: rgba(8, 9, 10, 0.55);
  --landing-glass: rgba(16, 18, 20, 0.72);
  --landing-glass-image: rgba(8, 9, 10, 0.62);
  --landing-glass-image-strong: rgba(8, 9, 10, 0.66);
  --landing-line-hairline: rgba(255, 255, 255, 0.07);
  --landing-line: rgba(255, 255, 255, 0.08);
  --landing-line-strong: rgba(255, 255, 255, 0.12);
  --landing-line-stronger: rgba(255, 255, 255, 0.18);
  --landing-line-accent: rgba(245, 130, 32, 0.22);
  --landing-line-accent-strong: rgba(245, 130, 32, 0.28);
  --landing-subtle: rgba(244, 244, 242, 0.62);
  --landing-muted: rgba(244, 244, 242, 0.55);
  --landing-faint: rgba(244, 244, 242, 0.42);
  --landing-faintest: rgba(244, 244, 242, 0.36);

  /* The dark bookend pair. In light mode these are a genuinely dark panel that
     closes the page; in dark mode they are one step *up* from the page so the
     footer and driver panel still separate from the background. */
  --landing-ink-strong: #111315;
  --landing-on-strong: #f4f4f2;

  --landing-gradient-spotlight: radial-gradient(
    closest-side,
    rgba(245, 130, 32, 0.24),
    rgba(245, 130, 32, 0.05) 55%,
    transparent 72%
  );
  --landing-gradient-accent-card: linear-gradient(
    160deg,
    rgba(245, 130, 32, 0.14),
    rgba(255, 255, 255, 0.03) 46%
  );
  --landing-gradient-coverage-card: linear-gradient(
    160deg,
    rgba(245, 130, 32, 0.12),
    rgba(255, 255, 255, 0.03) 50%
  );
  --landing-gradient-cta-panel: linear-gradient(
    150deg,
    rgba(245, 130, 32, 0.2),
    rgba(255, 255, 255, 0.03) 58%
  );

  --landing-shadow-frame: 0 40px 90px -30px rgba(0, 0, 0, 0.9);
  --landing-shadow-pill: 0 8px 30px rgba(0, 0, 0, 0.45);
  --landing-shadow-cta: 0 10px 30px rgba(245, 130, 32, 0.28);
}
```

Note what is *absent* from the dark block on purpose: `--landing-glass-image` /
`--landing-glass-image-strong` and the motion tokens are identical in both themes, so they are
declared once in `:root` — repeat them here only if a value actually differs. (The two
`glass-image` values are listed above for legibility even though they match; if you prefer, drop
them from the dark block entirely and add a comment saying they intentionally do not flip. Either
is acceptable; do not let them diverge.)

### Step 3 — register the new names under `@theme inline`

Add immediately after the existing `--color-on-strong` mapping (currently line 107):

```css
  /* Georgia-homepage additions. Every name here is new — none collides with the
     shadcn token set — so unlike `accent`/`muted` above they need no fallback
     chain. Values come from whichever `--landing-*` block is in scope, so a
     component writes `bg-glass` once and gets the light or dark value for free. */
  --color-accent-hover: var(--landing-accent-hover);
  --color-on-accent: var(--landing-on-accent);
  --color-frame: var(--landing-frame);
  --color-surface-raised: var(--landing-surface-raised);
  --color-surface-sunken: var(--landing-surface-sunken);
  --color-glass: var(--landing-glass);
  --color-glass-image: var(--landing-glass-image);
  --color-glass-image-strong: var(--landing-glass-image-strong);
  --color-line-hairline: var(--landing-line-hairline);
  --color-line-strong: var(--landing-line-strong);
  --color-line-stronger: var(--landing-line-stronger);
  --color-line-accent: var(--landing-line-accent);
  --color-line-accent-strong: var(--landing-line-accent-strong);
  --color-subtle: var(--landing-subtle);
  --color-faint: var(--landing-faint);
  --color-faintest: var(--landing-faintest);

  /* `--shadow-*` and `--blur-*` are Tailwind namespaces, so these become the
     `shadow-frame` / `shadow-pill` / `shadow-cta` and `backdrop-blur-glass`
     utilities. Adding new names to a namespace is inert; overriding an existing
     one is not — that is the mistake the `--radius-*` comment at the bottom of
     this block records, so do not extend `--radius-*` here. */
  --shadow-frame: var(--landing-shadow-frame);
  --shadow-pill: var(--landing-shadow-pill);
  --shadow-cta: var(--landing-shadow-cta);
  --blur-glass: 18px;
  --blur-glass-chip: 12px;

  /* The handoff's marquee is 42s; the existing `--animate-ticker` is 45s and is
     still used by `landing-ticker.tsx`, so this is a second name over the same
     keyframes rather than an edit to the first. The status-dot pulse is the hero
     chip's live indicator (2.4s, opacity .55→1, scale 1→1.35). */
  --animate-marquee: landing-ticker 42s linear infinite;
  --animate-status-pulse: landing-status-pulse 2.4s ease-in-out infinite;
```

### Step 4 — the status-pulse keyframes

Add after the `@keyframes landing-ticker` block (currently ends line 216):

```css
/* The hero status chip's live dot. Scale and opacity together rather than a
   ring element, so it costs one compositor-only animation. */
@keyframes landing-status-pulse {
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

### Step 5 — reduced motion

The existing block (lines 303–311) already flattens `animation-duration`,
`animation-iteration-count` and `transition-duration` for everything inside `[data-landing-page]`,
which covers the marquee, the reveal transition and the pulse. Two things it does **not** cover:
smooth scrolling (the carousel track uses it) and any component that reads the motion duration
tokens to drive a JS-timed animation. Extend it, following the shape of the onboarding block at
lines 363–377 (which lists the marked element itself, not only its descendants):

```css
@media (prefers-reduced-motion: reduce) {
  /* The landing root itself joins its descendants: the page's scroll-reveal
     wrapper and the carousel track both carry the animation on the same element
     that carries the hook, so a descendant-only selector leaves exactly those
     running. */
  [data-landing-page],
  [data-landing-page] *,
  [data-landing-page] *::before,
  [data-landing-page] *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    /* The carousel scrolls its track with `scrollTo({ behavior: "smooth" })`;
       this is what makes that land instantly instead. */
    scroll-behavior: auto !important;
  }

  /* Flattens the durations at the token level too, so a component that reads
     `--landing-duration-carousel` for a JS-timed step gets 0 rather than 420ms
     without having to check the media query itself. */
  :root {
    --landing-duration-reveal: 0.01ms;
    --landing-duration-carousel: 0.01ms;
    --landing-duration-dot: 0.01ms;
  }
}
```

CSS cannot stop a `setInterval`. Note for task-06 (do not implement it here): the carousel must
also check `window.matchMedia("(prefers-reduced-motion: reduce)").matches` in JS and skip
auto-advance entirely.

### Step 6 — the pre-paint theme script in `src/app/layout.tsx`

`src/app/layout.tsx` is 53 lines: it configures `IBM_Plex_Sans` / `IBM_Plex_Mono` via
`next/font/google`, exports `metadata`, and returns `<html lang="en" className={...}>` →
`<body>` → global `<header>` → `{children}`. It has no `<head>` element today.

A `useEffect` is **too late** — it runs after hydration, so the page would paint light, then snap
to dark. The script must be inline, synchronous, and in `<head>` so it executes before the body
renders.

```tsx
/**
 * Applied before first paint so the landing page never flashes the wrong theme.
 * This has to be an inline, synchronous `<script>` in `<head>`: a `useEffect`
 * (or `next/script` at any strategy other than `beforeInteractive`) runs after
 * the first paint, which is exactly the flash we are avoiding.
 *
 * Only the class is set here; every token the class selects lives in
 * `globals.css`, scoped to `body:has([data-landing-page])` so the class is inert
 * on the admin back office, the driver hub and the onboarding wizards.
 *
 * `localStorage` throws — not returns null — in a browser with site data blocked
 * and in some private-browsing modes, and an exception here would abort the
 * whole script and leave the page unthemed, so both reads are guarded. The
 * `"theme"` key is restated in `src/components/landing/landing-theme-toggle.tsx`,
 * which writes it; there is no shared constant because this string has to be
 * embedded in a script literal that runs before any module does.
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("theme");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){try{if(window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.classList.add("dark")}}catch(e2){}}})();`;
```

and in the returned JSX:

```tsx
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      // The script above adds `dark` to this element's class list before React
      // hydrates, so the server-rendered markup and the live DOM legitimately
      // differ here. Suppression is one level deep — it covers `<html>`'s own
      // attributes and nothing inside.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
```

Notes on this step:

- Keep the script minified on one line. A multi-line template literal works but adds bytes to
  every HTML response for no benefit.
- Do **not** reach for `next/script`. A bare `<script>` inside `<head>` in the root layout is
  rendered verbatim by the App Router and is the only form guaranteed to run before paint.
- Adding an explicit `<head>` is safe: Next.js merges it with the `metadata` output.
- Nothing on the server may read the theme. `src/app/page.tsx` is `export const revalidate = 60`
  and its HTML is shared between visitors, so the theme is a client-only concern by construction.

### Step 7 — `src/components/landing/landing-theme-toggle.tsx`

Conventions to match: the landing components are hand-styled from landing tokens and use **zero
shadcn primitives**; they hand-roll inline `<svg>` icons (see `landing-header.tsx:22` and the
seven icons in `landing-category-tiles.tsx`) rather than importing `lucide-react`. Follow both.

The hydration problem: the server cannot know the visitor's theme, so any markup derived from it
mismatches. Solved two ways at once —

1. **Visuals come from CSS, not state.** Both icons are always in the DOM; `dark:` utilities
   decide which is visible. The class is already on `<html>` before paint, so the correct icon is
   the one that ever renders — no flash, and the server markup is byte-identical in both themes.
   This is why Step 1's narrowed `dark:` variant still has to match inside `[data-landing-page]`.
2. **ARIA settles after mount.** `aria-pressed` starts at a stable `false` on both server and
   first client render, then an effect corrects it. Momentarily-stale ARIA for one frame is
   preferable to `aria-pressed={undefined}`, which is invalid on a toggle button.

```tsx
"use client";

import { useEffect, useState } from "react";

/**
 * Restated rather than imported from `src/app/layout.tsx`: the pre-paint script
 * there has to embed this key in a string literal that runs before any module
 * loads, so there is no shared constant to import. Both sides are commented to
 * point at each other — the same deliberate-restatement convention the admin
 * routes use for their `ALLOWED_ROLES`. Change one, change the other.
 */
const THEME_STORAGE_KEY = "theme";

type Theme = "light" | "dark";

/**
 * The applied theme is read back off the DOM rather than kept as the source of
 * truth in React state: the pre-paint script in `src/app/layout.tsx` is what
 * sets the class, so the class *is* the truth and state only mirrors it.
 */
function readAppliedTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Light/dark switch for the landing page. Built here, placed by the nav pill
 * (`landing-nav.tsx`) — it is not mounted anywhere else, and it governs the
 * landing page only: the class it toggles selects tokens that `globals.css`
 * scopes to `body:has([data-landing-page])`.
 */
export function LandingThemeToggle({ className }: { className?: string }) {
  // Starts at the light default on both the server and the first client render
  // so hydration matches, then syncs to whatever the pre-paint script actually
  // applied. Only `aria-pressed` depends on this; the icons are swapped by CSS,
  // so nothing visible waits for the effect.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readAppliedTheme());
  }, []);

  function handleClick() {
    const next: Theme = readAppliedTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Site data blocked, or private browsing. The switch still works for this
      // page view; it just will not be remembered. Never let this throw — an
      // unhandled error here would leave the class flipped and the UI wedged.
    }

    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={theme === "dark"}
      aria-label="Dark theme"
      className={/* pill: rounded-full, border-line, hover:bg-surface-raised, focus ring comes from globals.css */ className}
    >
      {/* Both icons are always rendered and swapped by CSS, so the server markup
          does not depend on the theme. `aria-hidden` on both: the button's own
          label already names the control. */}
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 dark:hidden">
        {/* sun */}
      </svg>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="hidden h-4 w-4 dark:block">
        {/* moon */}
      </svg>
      <span className="sr-only">Dark theme</span>
    </button>
  );
}
```

Requirements for the finished component:

- `aria-label="Dark theme"` (the thing being toggled), **not** "Toggle theme" — with
  `aria-pressed` the label names the state being switched on.
- Keyboard operable for free by being a real `<button type="button">`. Do not build it out of a
  `<div>` with an `onClick`. The focus ring is already provided by the
  `[data-landing-page] button:focus-visible` rule in `globals.css` — do not add another.
- Accept an optional `className` so task-05 can size it into the pill without this file knowing
  the pill's layout.
- Pill styling from tokens only: `rounded-full`, `border border-line`, `text-subtle`,
  `hover:bg-surface-raised`, `hover:text-paper`, `transition-colors`. No hard-coded hex.
- Nice-to-have, not required: when nothing is stored, follow later OS changes live by subscribing
  to `matchMedia("(prefers-color-scheme: dark)")` and returning the cleanup from the effect. If
  you add it, it must stop following as soon as the visitor clicks the toggle.

### Reference — the rest of the handoff's token table

Downstream tasks will need these; record them in your implementation comments where relevant but
do **not** invent CSS variables for them, because Tailwind already expresses them:

- **Radius.** `2rem` → `rounded-4xl` (carousel frame, driver panel, CTA panel); `1.5rem` →
  `rounded-3xl` (feature/vehicle cards); `1.25rem` → `rounded-[1.25rem]` (stat cards); `1rem` →
  `rounded-2xl` (FAQ items, city chips); `.75rem` → `rounded-xl` (logo tiles); `.375rem` →
  `rounded-md` (small inputs); `999px` → `rounded-full`. **Do not add `--radius-*` tokens** — the
  comment at the end of `@theme inline` records that overriding Tailwind's radius scale resized
  `rounded-md`/`lg`/`xl`/`2xl` across the whole app last time.
- **Typography.** Fluid `clamp()` values, applied per component as arbitrary values: H1
  `clamp(42px,7.4vw,104px)/.94/-.05em`; section H2 `clamp(30px,4.6vw,62px)/1/-.045em`; panel H2
  `clamp(26px,3.4vw,46px)/1.03/-.04em`; large-card H3 `clamp(22px,2.5vw,32px)/1.12/-.03em`; step
  H3 `clamp(21px,2.4vw,30px)/1.15/-.03em`; card title 17–18px/600/-.02em; stat value
  `clamp(30px,3.4vw,44px)/600/1/-.04em`; lead `clamp(16px,1.7vw,21px)/1.55`; body 15–16px/1.6;
  body small 14–14.5px/1.55; nav & button 13.5–15px/600; mono eyebrow 10–11px uppercase
  `.14–.18em`. `text-wrap: balance` on headings, `pretty` on paragraphs. Fonts are already wired:
  `font-display` / `font-body` (IBM Plex Sans) and `font-price` (IBM Plex Mono).
- **Spacing.** Section padding `clamp(56px,7vw,104px)` vertical / `clamp(20px,4vw,48px)`
  horizontal; card gap 14px (12px stat strip, 10px city chips); card padding
  `clamp(24px,2.6vw,32px)`, large cards `clamp(26px,3vw,38px)`, panels `clamp(28px,3.2vw,44px)`;
  content max width 1200px.

### Verification

```bash
pnpm check          # eslint + tsc --noEmit — must pass
pnpm dev            # then open http://localhost:3000 (the CLIENT host; `-H ::` in the dev
                    # script is load-bearing for the cross-host redirects — do not change it)
```

`src/components/landing/landing-theme-toggle.tsx` is not mounted by anything until task-05, so
`pnpm check` is the only automated gate this task has. To exercise it manually before then,
temporarily render it from `src/components/landing/landing-header.tsx` and **revert that edit
before finishing** — `landing-header.tsx` is owned by task-05 and must not be left modified.

## Acceptance Criteria

- [ ] `html.dark body:has([data-landing-page])` defines the full dark set: `--landing-ink`
      `#08090a`, `--landing-paper` `#f4f4f2`, `--landing-accent` `#f58220`,
      `--landing-accent-hover` `#ffa45c`, `--landing-on-accent` `#0a0b0a`, `--landing-frame`
      `#111315`, surface `rgba(255,255,255,0.04)` / raised `0.06` / sunken `rgba(8,9,10,0.55)`,
      glass `rgba(16,18,20,0.72)`, glass-on-image `0.62`/`0.66`, the four border alphas
      `0.07`/`0.08`/`0.12`/`0.18`, border-accent `0.22`/`0.28`, and text at `0.62`/`0.55`/`0.42`/`0.36`.
- [ ] The four named gradients and the three shadows exist in both themes under one name each.
- [ ] Every new token has a value in **both** themes; no wave-2 component will need to branch on
      the theme in TSX.
- [ ] `grep -n "\-\-card\|--popover\|--primary\|--onboarding-accent\|--admin-muted\|--color-muted"`
      inside the new dark block returns nothing.
- [ ] Reloading `localhost:3000` in either theme shows **no flash** of the other theme — verified
      by throttling the network in devtools and watching the first paint.
- [ ] The choice survives a reload and opening the page in a new tab.
- [ ] With nothing in `localStorage`, the page follows the OS `prefers-color-scheme`.
- [ ] With site data blocked (devtools → Application → "Block all cookies", or a private window
      with storage disabled), the page still renders, still follows the OS preference, and the
      toggle still switches for the current page view.
- [ ] `admin.localhost:3000` (all sections), the driver hub at `/dashboard`, the driver and fleet
      onboarding wizards, `/account` and the signed-in booking form at `localhost:3000` are
      **pixel-identical** with `dark` on `<html>` and with it off. Check a page containing an
      `<Input>`, an outline `<Button>`, a `<Tabs>` and a `<Checkbox>` — those are the primitives
      carrying pre-existing `dark:` classes.
- [ ] `body:has([data-landing-page])` still paints the page background in both themes; the
      landing focus-ring rule still uses the theme's accent.
- [ ] With `prefers-reduced-motion: reduce` forced in devtools, the marquee, status-dot pulse and
      reveal transitions are flat, and the motion duration tokens resolve to `0.01ms`.
- [ ] `pnpm check` passes.

## Notes

- **Why `.dark` on `<html>` and not a `data-theme` attribute.** `globals.css` line 5 already
  declares `@custom-variant dark (&:is(.dark *))` and nothing has ever used it; a class keeps the
  Tailwind variant usable inside the landing subtree, which is what makes the toggle's icon swap
  work with zero React state. The price is Warning 2, which the narrowed variant pays.
- **Why the tokens are scoped to `body:has([data-landing-page])` rather than to `.dark`.** The
  `--landing-*` prefix over-promises; six of the eight names are used by the account pages and the
  out-of-scope booking app, and `--landing-muted` backs `text-muted` in 83 files. Scoping is not
  defensive tidiness here, it is the difference between passing and failing the "no dark mode for
  the rest of the app" non-goal.
- **Existing components use `text-ink` on accent buttons** (`landing-hero.tsx:88`,
  `landing-how-it-works.tsx:49`) — that is white-on-orange today and would become
  near-black-on-orange in dark, which happens to be right, but only by coincidence. New components
  must use `text-on-accent`, which says what it means.
- `landing-hazard` reads `var(--landing-accent)` and so re-tints for free; `landing-grain` and
  `landing-grid` tint from `currentColor` and invert for free. None of the three needs a dark
  variant — do not add one.
- The pre-existing `@media (prefers-color-scheme: dark)` block at lines 81–86 darkens
  `--background`/`--foreground` app-wide and is unrelated to this feature. It does not reach the
  landing page (the `body:has([data-landing-page])` background rule overrides it) and the admin
  and onboarding surfaces already pin their way out of it. Leave it exactly as it is.
- One known cosmetic gap, accepted: `/home` renders `<LandingPage showSiteHeader />` for signed-in
  staff, and that global `<header>` sits outside `[data-landing-page]`, so it keeps the app's
  default chrome rather than the landing theme. It is a staff preview route; not worth widening
  the token scope for.
- The theme is never sent to the server and never persisted per user. `src/app/page.tsx` is
  `revalidate = 60` and its HTML is shared across visitors, so a server-rendered theme would be
  wrong for half of them.
