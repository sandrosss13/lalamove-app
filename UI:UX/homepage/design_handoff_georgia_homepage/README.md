# Handoff: Lalamove Georgia — Marketing Homepage

## Overview
A logged-out marketing homepage for the Georgian market of an on-demand
delivery service. Goal: get a new visitor to sign up, get a business to
request an account, and get a driver to apply. Dark, high-contrast layout
with a scroll-through hero banner carousel, partner logo marquee, bento
feature grid, vehicle catalogue, coverage list, FAQ and footer.

Audience: individual customers, business/enterprise shippers, driver
partners, and brand-new users. Desktop and mobile.

## About the Design Files
The files in this bundle are **design references created in HTML** — a
prototype showing the intended look and behaviour. They are NOT production
code to copy directly.

The task is to **recreate this design in the target codebase's existing
environment** (React, Vue, Next.js, SwiftUI, native — whatever the project
uses) following its established patterns, component library and styling
conventions. If no environment exists yet, pick the most appropriate
framework for the project and implement there.

Specifically:
- The prototype uses **inline styles only**, because the prototyping runtime
  requires it. In the real codebase use its normal styling approach
  (Tailwind utilities, CSS modules, styled-components, etc.).
- `<image-slot>` elements are prototype-only drag-and-drop placeholders.
  Replace each one with a real `<img>` / `next/image` / CMS-driven asset.
- The prototype's logic class is plain JS. Port it to the codebase's
  component idiom.

## Fidelity
**High-fidelity.** Colours, typography, spacing, radii, shadows and
interaction behaviour are final and should be reproduced closely. Every
value is listed under Design Tokens below.

Two caveats where the prototype runtime forced compromises — implement the
*intended* behaviour, not the prototype's workaround:
1. The hero carousel should scroll **smoothly** (eased, ~420ms). The
   prototype jumps instantly because `requestAnimationFrame`,
   `scroll-behavior: smooth` and CSS transitions do not run in the preview
   renderer.
2. The pagination dots should animate width and colour (~240ms). The
   prototype paints them instantly for the same reason.

## Screens / Views

### Homepage (single scrolling page)
**Purpose:** convert a visitor into a signup, a business lead, or a driver
application.

**Page shell**
- Background `#08090A`, text `#F4F4F2`, `overflow-x: hidden`.
- Font: IBM Plex Sans (400/500/600/700) for everything; IBM Plex Mono
  (400/500/600) for eyebrows, labels, numerals and monospaced captions.
- Content max width **1200px**, centred. Horizontal page padding
  `clamp(20px, 4vw, 48px)`.
- Vertical section rhythm `clamp(56px, 7vw, 104px)`.

---

#### 1. Floating nav pill (fixed)
- `position: fixed; top: 14px`, horizontally centred, `z-index: 50`.
- Pill: `border-radius: 999px`, background `rgba(16,18,20,0.72)`,
  `backdrop-filter: blur(18px) saturate(140%)`, border
  `1px solid rgba(255,255,255,0.09)`, shadow `0 8px 30px rgba(0,0,0,0.45)`.
  Padding `8px 8px 8px 18px`, `gap: 6px`, wraps on narrow widths.
- Wordmark "Lalamove": 16px / 700 / `letter-spacing: -0.035em`, 14px right margin.
- Links, in order: **How it works** (`#how`), **For Drivers** (`#drivers`),
  **Coverage** (`#coverage`), **Help** (`#faq`), **Sign in** (`#signin`).
  Each 13.5px, colour `rgba(244,244,242,0.66)`, padding `9px 14px`,
  `border-radius: 999px`.
  Hover: background `rgba(255,255,255,0.08)`, colour `#F4F4F2`.
- **Sign up** button (`#signup`): 13.5px / 600, background `#F4F4F2`,
  colour `#08090A`, padding `10px 20px`, `border-radius: 999px`.
- The outer wrapper is `pointer-events: none` and the pill itself
  `pointer-events: auto`, so the page behind stays clickable.

#### 2. Hero
- Section padding-top `clamp(120px, 14vw, 190px)` to clear the fixed nav.
- **Spotlight:** absolutely positioned decorative div, `top: -360px`,
  `left: 50%`, `margin-left: -550px`, `1100 × 900px`,
  `radial-gradient(closest-side, rgba(245,130,32,0.24), rgba(245,130,32,0.05) 55%, transparent 72%)`,
  `pointer-events: none`.
- **Status chip** (centred): padding `7px 8px 7px 14px`,
  `border-radius: 999px`, background `rgba(255,255,255,0.05)`, border
  `1px solid rgba(255,255,255,0.1)`, 13px text at `rgba(244,244,242,0.72)`.
  Contains a 7px orange dot pulsing on a 2.4s ease-in-out infinite loop
  (`opacity .55→1`, `scale 1→1.35`), the text "Now live in 11 Georgian
  cities", and a mono "New" tag (11px, `letter-spacing: .1em`, uppercase,
  background `rgba(255,255,255,0.08)`, padding `5px 10px`, pill).
- **H1:** "Anything, anywhere in Georgia, today." —
  `font-size: clamp(42px, 7.4vw, 104px)`, `line-height: .94`,
  `letter-spacing: -.05em`, weight 600, `max-width: 19ch`,
  `text-wrap: balance`, centred.
- **Subhead:** "Book a courier in twelve seconds. Vans to ten-tonne trucks,
  matched in under a minute, tracked door to door." —
  `clamp(16px, 1.7vw, 21px)`, `line-height: 1.55`,
  colour `rgba(244,244,242,0.62)`, `max-width: 52ch`, `text-wrap: pretty`.
- **CTAs** (centred row, `gap: 12px`, wraps):
  - Primary "Send a delivery" → `#signup`. 15px / 600, background `#F58220`,
    colour `#0A0B0A`, padding `16px 32px`, pill,
    shadow `0 10px 30px rgba(245,130,32,0.28)`.
  - Secondary "For business" → `#business`. Same metrics; background
    `rgba(255,255,255,0.06)`, border `1px solid rgba(255,255,255,0.14)`,
    colour `#F4F4F2`.

#### 3. Hero banner carousel — **max 6 banners**
- Frame: `border-radius: 2rem`, `overflow: hidden`, border
  `1px solid rgba(255,255,255,0.12)`, background `#111315`,
  `height: clamp(260px, 34vw, 480px)`,
  shadow `0 40px 90px -30px rgba(0,0,0,0.9)`.
- Track: `display: flex`, `overflow-x: auto`,
  `scroll-snap-type: x mandatory`, hidden scrollbar. Each slide
  `flex: 0 0 100%`, `scroll-snap-align: start`, full-bleed image.
- **Caption chip** per slide: bottom-left, `bottom: clamp(56px, 6vw, 70px)`,
  `left: clamp(16px, 3vw, 32px)`. Glass pill — background
  `rgba(8,9,10,0.66)`, `backdrop-filter: blur(12px)`, border
  `1px solid rgba(255,255,255,0.14)`, padding `9px 16px`, 13.5px text,
  6px orange dot, `max-width: calc(100% - 64px)`, `pointer-events: none`.
- **Arrows:** 42 × 42px circles, vertically centred, inset
  `clamp(10px, 1.5vw, 18px)`. Background `rgba(8,9,10,0.6)`,
  `backdrop-filter: blur(12px)`, border `1px solid rgba(255,255,255,0.18)`,
  glyphs `‹` / `›` at 17px.
- **Dots:** bottom-left glass pill (background `rgba(8,9,10,0.62)`,
  blur 12px, border `1px solid rgba(255,255,255,0.14)`, padding `8px 12px`,
  `gap: 7px`). Each dot `flex: 0 0 auto`, 8 × 8px, pill.
  Inactive `rgba(244,244,242,0.55)`; **active 24 × 8px, `#F58220`**.
- **Default banner content** (slot id → caption):
  1. `v3-hero` — "Same-hour delivery across Tbilisi"
  2. `v3-hero-2` — "Tbilisi to Batumi, loaded overnight"
  3. `v3-hero-3` — "Vans, trucks and specialised loads"
  4. `v3-hero-4` — "Twenty stops on one booking"
  5. `v3-hero-5` — "6,400 courier partners in Georgia"
  6. `v3-hero-6` — "Business dispatch, one invoice"
- Recommended real asset size **2400 × 900px**, JPG/WebP.

#### 4. Partner logo marquee
- Eyebrow: "Dispatching every day for" — mono, 10.5px,
  `letter-spacing: .18em`, uppercase, `rgba(244,244,242,0.36)`, centred.
- Track scrolls left continuously: `translateX(0 → -50%)` over **42s**,
  `linear`, infinite. The list is duplicated (8 logos × 2) for a seamless loop.
- Edge fade via `mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)`.
- Each logo tile: 180 × 66px, `margin: 0 10px`, `border-radius: .75rem`,
  background `rgba(255,255,255,0.04)`, border
  `1px solid rgba(255,255,255,0.07)`, padding `14px 18px`; logo constrained
  to 38px height, `object-fit: contain`.
- **In production this should be a CMS-managed list of partner logos.**

#### 5. Stats row
- `display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 14px`.
- Card: `border-radius: 1.25rem`, background `rgba(255,255,255,0.04)`,
  border `1px solid rgba(255,255,255,0.08)`, padding `26px 24px`.
- Value `clamp(30px, 3.4vw, 44px)` / 600 / `letter-spacing: -.04em`;
  label 13.5px at `rgba(244,244,242,0.52)`, 10px above.
- Content: **54s** "Median match time in Tbilisi" · **11** "Cities across
  Georgia" · **6,400** "Courier partners" · **24/7** "Dispatch and support".

#### 6. Bento feature grid
Three rows, each `gap: 14px`, cards `border-radius: 1.5rem`, background
`rgba(255,255,255,0.04)`, border `1px solid rgba(255,255,255,0.08)`,
padding `clamp(24px, 2.6vw, 32px)`.

- **Row A, left (large, `flex: 1 1 420px`)** — accent-tinted:
  `linear-gradient(160deg, rgba(245,130,32,0.14), rgba(255,255,255,0.03) 46%)`,
  border `1px solid rgba(245,130,32,0.22)`, padding `clamp(26px,3vw,38px)`.
  Eyebrow "Live tracking" (mono, orange). H3 "See the courier move, not a
  status label." at `clamp(22px, 2.5vw, 32px)`. Body: "Live map, direct
  phone line, and a proof-of-delivery photo the moment it lands."
  Bottom-pinned mock panel (`border-radius: 1rem`, background
  `rgba(8,9,10,0.55)`, padding `18px 20px`): "Order #A4821 · Van" left,
  "19 min" in orange mono right; a 4px progress bar at **68%** in `#F58220`
  on `rgba(255,255,255,0.1)`; then "Kwun Tong St, Vake" / "Didube" at 12px.
- **Row A, right (`flex: 1 1 300px`, stacked, `gap: 14px`)**:
  - "**20** / Stops per booking" — "Drag to reorder, and the courier gets the
    optimised sequence."
  - "Business API / Dispatch from your own stack" — "REST endpoints,
    webhooks, monthly invoicing in lari." + link "Read the docs →" in orange.
- **Row B (three cards, `flex: 1 1 240px`)**:
  - Scheduled — "Book it for Thursday, 08:00" — "Lock a courier days ahead at
    a fixed fare, with no surge pricing."
  - Intercity — "Tbilisi to Batumi overnight" — "Daily routes between the four
    largest cities, loaded in the evening."
  - Cover — "Insured up to ₾5,000" — "Every booking carries cover as standard.
    Claims settled in five days."
- Card eyebrows: mono 10.5px, `letter-spacing: .18em`, uppercase,
  `rgba(244,244,242,0.42)`. H3 18px / 600. Body 14.5px / 1.6 at
  `rgba(244,244,242,0.55)`.

#### 7. How it works (`#how`)
- H2 "Four taps, no phone calls." — `clamp(30px, 4.6vw, 62px)`,
  `line-height: 1`, `letter-spacing: -.045em`, weight 600, `max-width: 20ch`.
- Four rows, each `border-top: 1px solid rgba(255,255,255,0.1)`,
  padding `clamp(24px, 2.8vw, 34px) 0`, `gap: clamp(18px, 3vw, 44px)`,
  `align-items: baseline`:
  - number (mono 13px, `letter-spacing: .1em`, `#F58220`, 44px wide)
  - title (`flex: 1 1 260px`, `clamp(21px, 2.4vw, 30px)` / 600)
  - body (`flex: 1 1 320px`, 15.5px / 1.65, `rgba(244,244,242,0.55)`)
- Copy:
  1. **Enter two addresses** — "Pickup and drop-off anywhere in the city. Add
     up to twenty stops and reorder them by dragging."
  2. **Pick a vehicle** — "Cargo van for a few boxes, ten-tonne truck for
     pallets. You see the fare before you confirm anything."
  3. **Get matched** — "The nearest available courier accepts, usually inside
     a minute. No calling around."
  4. **Track to the door** — "Live map, courier phone number,
     proof-of-delivery photo the moment it lands."

#### 8. Vehicles (`#vehicles`) — "Every size, one app."
Deliberately **no prices anywhere**. The product does not quote a fare until
the customer enters a route, so the page must not publish a rate card.

- Header row: H2 "Every size, one app." (`clamp(30px, 4.6vw, 62px)`,
  `max-width: 16ch`) + supporting paragraph "Pick the vehicle that fits the
  load. Nine types across three categories, available in every city we cover."
  (16px, `rgba(244,244,242,0.55)`, `max-width: 44ch`).
- Groups stacked with `gap: clamp(26px, 3vw, 40px)`. Each group has a label
  row — mono 11px, `letter-spacing: .18em`, uppercase, `#F58220` — followed
  by a 1px `rgba(255,255,255,0.1)` rule filling the remaining width.
- Cards per group: `grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 14px`.
  Card: `border-radius: 1.5rem`, background `rgba(255,255,255,0.04)`, border
  `1px solid rgba(255,255,255,0.08)`, `overflow: hidden`. Image area 140px
  tall with a `1px rgba(255,255,255,0.07)` bottom border; name below at
  `padding: 18px 22px 22px`, 17px / 600 / `letter-spacing: -.02em`.
  **Name + photo only.**
- Catalogue (slot id → name):
  - **Vans** — `v3-veh-van-cargo` Cargo Van · `v3-veh-van-long` Extended Van ·
    `v3-veh-van-crew` Crew Van
  - **Trucks** — `v3-veh-truck-3t` Truck 3t · `v3-veh-truck-5t` Truck 5t ·
    `v3-veh-truck-10t` Truck 10t
  - **Specialised** — `v3-veh-reefer` Refrigerated · `v3-veh-flatbed` Flatbed ·
    `v3-veh-crane` Crane Truck
  - ⚠️ **These nine are a placeholder set.** Wire this section to the real
    vehicle categories and types in the project's catalogue — the client has
    confirmed motorbike and car are NOT offered.
- Business panel below the groups: full-width card, padding
  `clamp(24px, 2.8vw, 34px)`. "Business account" (18px / 600) + "Monthly
  invoicing in lari, a multi-seat dispatch dashboard and a REST API. A
  specialist replies within one working day." CTA "Talk to sales" →
  `#business`, 15px / 600, background `#F4F4F2`, colour `#0A0B0A`, pill.

#### 9. For Drivers (`#drivers`)
- Single panel, `border-radius: 2rem`, `overflow: hidden`, border
  `1px solid rgba(255,255,255,0.1)`, background `rgba(255,255,255,0.04)`,
  two columns (`flex: 1 1 320px` each; image column `min-height: 340px`).
- Left: eyebrow "For drivers" (mono, orange); H2 "Your vehicle. Your hours.
  Paid weekly." (`clamp(26px, 3.4vw, 46px)`, `max-width: 18ch`); body "Bring
  a van or a truck. Accept the jobs you want, see the fare before you commit,
  and get paid every Wednesday."
- Bullet list (6px orange dot, 15px text at `rgba(244,244,242,0.7)`,
  `gap: 12px`):
  - "No sign-up fee, and no minimum hours"
  - "See the fare and the route before you accept"
  - "Weekly payouts every Wednesday, straight to your account"
- CTAs: "Start driving" → `#drive` (orange pill) and "Check requirements" →
  `#requirements` (glass pill).
- Right: full-bleed image (slot `v3-drivers`) — courier partner photo.

#### 10. Coverage (`#coverage`)
- Two columns, `gap: 14px`.
- Left card (`flex: 1 1 340px`): accent gradient
  `linear-gradient(160deg, rgba(245,130,32,0.12), rgba(255,255,255,0.03) 50%)`,
  border `1px solid rgba(255,255,255,0.1)`, `border-radius: 1.5rem`,
  padding `clamp(28px, 3.2vw, 44px)`. Eyebrow "Coverage"; H2 "Eleven cities,
  one account." (`clamp(26px, 3.4vw, 44px)`, `max-width: 16ch`); body
  "Same-hour delivery in the four largest cities, scheduled and intercity
  routes everywhere else. Support in Georgian, English and Russian, around the
  clock."; CTA "Check your address" → `#signup` (orange pill,
  `align-self: flex-start`).
- Right (`flex: 1 1 360px`): wrapping list of city chips,
  `flex: 1 1 150px`, `gap: 10px`, `align-content: flex-start`. Chip:
  `border-radius: 1rem`, background `rgba(255,255,255,0.04)`, border
  `1px solid rgba(255,255,255,0.08)`, padding `18px 20px`. City name
  16px / 600; tier below in mono 10.5px, `letter-spacing: .1em`, uppercase,
  `rgba(244,244,242,0.42)`.
- Cities: Tbilisi, Batumi, Kutaisi, Rustavi — **Same hour**. Gori, Zugdidi,
  Telavi, Poti, Zestaponi, Marneuli, Akhaltsikhe — **Scheduled**. Plus
  "Intercity — Daily routes".

#### 11. FAQ (`#faq`)
- Two columns, `gap: clamp(28px, 4vw, 64px)`.
- Left (`flex: 1 1 280px`): H2 "Questions" (`clamp(28px, 4vw, 52px)`) +
  "Still stuck? [Support is live 24/7](#support) in Georgian, English and
  Russian." (15px, `rgba(244,244,242,0.55)`).
- Right (`flex: 1 1 460px`): accordion, `gap: 10px`. Item
  `border-radius: 1rem`, background `rgba(255,255,255,0.04)`, border
  `1px solid rgba(255,255,255,0.08)`. Trigger is a full-width button,
  padding `20px 24px`, question 16px / 600, and a mono `+` / `–` at 19px in
  `#F58220` on the right. Answer 15px / 1.7 at `rgba(244,244,242,0.55)`,
  padding `0 24px 22px`, `max-width: 72ch`.
- **Single-open accordion.** Item 0 is open on load; clicking the open item
  closes it (index → -1).
- Questions and answers:
  1. *How fast will a courier accept?* — "Median match time in Tbilisi is 54
     seconds. If nobody accepts within five minutes the booking cancels
     automatically and you are not charged."
  2. *Which cities do you cover?* — "Same-hour delivery in Tbilisi, Batumi,
     Kutaisi and Rustavi, with intercity routes between all four. Gori,
     Zugdidi, Telavi, Poti and others are served on scheduled bookings."
  3. *What can I not send?* — "Live animals, hazardous goods, cash and
     restricted items. The full list is in the terms. Everything else, from a
     bakery order to a pallet of tiles, is fair game."
  4. *Is the price I see the price I pay?* — "Yes for the route you booked.
     Waiting time beyond 15 minutes, stops added mid-trip and parking fees are
     added afterwards and itemised on the receipt."
  5. *How do I get a business account?* — "Request rates and a specialist
     replies within one working day. Business accounts get volume pricing,
     monthly invoicing in lari, seat-based access and a REST API."

#### 12. Closing CTA
- Panel `border-radius: 2rem`, border `1px solid rgba(245,130,32,0.28)`,
  background `linear-gradient(150deg, rgba(245,130,32,0.2), rgba(255,255,255,0.03) 58%)`,
  padding `clamp(40px, 6vw, 88px) clamp(26px, 4vw, 64px)`, centred.
- H2 "Your first delivery is twelve seconds away." —
  `clamp(30px, 5.2vw, 72px)`, `line-height: .96`, `letter-spacing: -.05em`,
  `max-width: 20ch`.
- Body "Half price on your first three. No card needed to get a quote."
  (16.5px, `rgba(244,244,242,0.62)`, `max-width: 44ch`).
- CTAs "Sign up free" (orange pill + glow) and "Drive with us" (glass pill).

#### 13. Footer
- `border-top: 1px solid rgba(255,255,255,0.08)`, padding
  `clamp(44px, 5vw, 72px) … 36px`.
- One grid: `repeat(auto-fit, minmax(150px, 1fr))`, `gap: 28px`. The brand
  block spans `grid-column: 1 / -1` (its own row) so the four link columns
  always resolve to four equal tracks — **this is load-bearing; putting the
  brand block in the track flow orphans the last column.**
- Brand: "Lalamove Georgia" 18px / 700 + "On-demand delivery in 11 cities,
  matched in under a minute." (14px, `rgba(244,244,242,0.45)`,
  `max-width: 30ch`).
- Column headings: mono 10px, `letter-spacing: .18em`, uppercase,
  `rgba(244,244,242,0.35)`. Links 14px at `rgba(244,244,242,0.6)`,
  `gap: 11px`.
  - **Product** — Instant delivery, Scheduled, Multi-stop, Intercity, API
  - **Business** — Enterprise, Enterprise enquiry, Case studies, Integrations
  - **Couriers** — Become a courier, Requirements, Earnings, Support
  - **Company** — About, Newsroom, Careers, Contact
- Bottom bar: `border-top: 1px solid rgba(255,255,255,0.08)`,
  `padding-top: 24px`, mono 11px, `letter-spacing: .08em`,
  `rgba(244,244,242,0.35)` — "© 2026 Lalamove Georgia" left,
  "Privacy · Terms · Cookies" right.

## Interactions & Behavior

### Hero carousel
- **Max 6 banners.** Fewer is fine; the dots and slide count follow the data.
- Auto-advance every **6000ms**, wrapping last → first.
- Any user interaction (arrow, dot) **cancels auto-advance permanently** for
  the session.
- Arrows step ±1 with wrap-around (`((i % n) + n) % n`).
- Dots jump to an absolute index.
- Native touch swipe works via `overflow-x: auto` + `scroll-snap`; a
  debounced (~90ms) scroll listener derives the index from
  `Math.round(scrollLeft / clientWidth)` and syncs the dots.
- **Intended motion:** eased scroll, ~420ms, `cubic-bezier(.16,1,.3,1)`;
  active dot animates width 8→24px and colour over ~240ms. (The prototype
  is instant — see Fidelity.)
- Respect `prefers-reduced-motion`: disable auto-advance and easing.

### Scroll reveal
- Elements marked `data-reveal` fade and rise in: `opacity 0 → 1`,
  `translateY(20px) → none`, **750ms**, `cubic-bezier(.16, 1, .3, 1)`.
- Triggered by an IntersectionObserver at `threshold: .08`,
  `rootMargin: "0px 0px -6% 0px"`, unobserved after firing.
- **Anything already inside the viewport on load must never be hidden** —
  check `getBoundingClientRect().top < innerHeight * .95` and skip the hide
  entirely. (The prototype originally blanked the hero for 3.5s; do not
  reproduce that.)
- Keep a short safety timeout that reveals everything if the observer never
  reports.

### FAQ accordion
Single-open. Clicking an open item collapses it. Index 0 open on load.

### Marquee
CSS-only, 42s linear infinite, list duplicated for a seamless loop. Pause on
hover is a nice-to-have.

### Hover states
- Nav links: background `rgba(255,255,255,0.08)`, colour `#F4F4F2`.
- Anchors elsewhere: `#F58220` → `#FFA45C`.
- Buttons/cards: no hover treatment specified — apply the codebase's default
  subtle lift or brightness shift.

### Responsive behaviour
- No media queries. Everything is fluid: `clamp()` for type and spacing,
  `grid auto-fit` / `flex-wrap` for layout.
- **Lesson learned, please carry it over:** for equal-width card rows use
  `grid-template-columns: repeat(auto-fit, minmax(Xpx, 1fr))`, **not**
  `flex: 1 1 Xpx`. A wrapped flex item with `flex-grow: 1` inflates to the
  full row width and reads as a broken layout. Every card row in this design
  is a grid for that reason.
- The nav pill wraps its links rather than collapsing to a hamburger. In
  production consider a proper mobile menu.

## State Management
Component-local only; no data fetching in the prototype.

| State | Type | Purpose |
|---|---|---|
| `banner` | number (0–5) | Active hero slide. Set by arrows, dots, auto-advance interval and the debounced scroll sync. |
| `openFaq` | number (−1–4) | Open accordion index; −1 = all closed. Starts at 0. |

Non-state instance values: the track element reference, the auto-advance
interval id, and the scroll-debounce timer.

**Production data needs** — all of the following should come from a CMS or
API rather than being hard-coded:
- Hero banners (image, caption, link, order, live/scheduled/draft, max 6)
- Partner logos
- Stats figures
- Vehicle categories and types (from the real catalogue)
- City coverage list and tiers
- FAQ entries

## Design Tokens

### Colour
| Token | Value | Use |
|---|---|---|
| Page background | `#08090A` | Body |
| Foreground | `#F4F4F2` | Primary text, inverted buttons |
| Accent | `#F58220` | Primary CTA, eyebrows, active dot, progress |
| Accent hover | `#FFA45C` | Link hover |
| Accent (link, light bg) | `#B4530F` | Anchors on light surfaces |
| On-accent | `#0A0B0A` | Text on the orange button |
| Carousel frame | `#111315` | Empty banner backdrop |
| Surface | `rgba(255,255,255,0.04)` | Cards, chips, tiles |
| Surface raised | `rgba(255,255,255,0.06)` | Secondary button |
| Surface sunken | `rgba(8,9,10,0.55)` | Mock tracking panel |
| Glass | `rgba(16,18,20,0.72)` | Nav pill |
| Glass (on image) | `rgba(8,9,10,0.62)` – `rgba(8,9,10,0.66)` | Caption + dot pills |
| Border subtle | `rgba(255,255,255,0.08)` | Card borders |
| Border hairline | `rgba(255,255,255,0.07)` | Inner dividers |
| Border strong | `rgba(255,255,255,0.12)` – `0.18` | Carousel frame, arrows |
| Border accent | `rgba(245,130,32,0.22)` – `0.28` | Accent cards, CTA panel |
| Text secondary | `rgba(244,244,242,0.62)` | Hero subhead |
| Text muted | `rgba(244,244,242,0.55)` | Body copy |
| Text faint | `rgba(244,244,242,0.42)` – `0.36` | Eyebrows, meta |

Gradients:
- Hero spotlight — `radial-gradient(closest-side, rgba(245,130,32,0.24), rgba(245,130,32,0.05) 55%, transparent 72%)`
- Accent card — `linear-gradient(160deg, rgba(245,130,32,0.14), rgba(255,255,255,0.03) 46%)`
- Coverage card — `linear-gradient(160deg, rgba(245,130,32,0.12), rgba(255,255,255,0.03) 50%)`
- CTA panel — `linear-gradient(150deg, rgba(245,130,32,0.2), rgba(255,255,255,0.03) 58%)`

### Typography
- **Display / body:** IBM Plex Sans — 400, 500, 600, 700.
- **Mono:** IBM Plex Mono — 400, 500, 600. Eyebrows, numerals, ids, captions.
- Scale (fluid):
  | Role | Size | Line height | Tracking |
  |---|---|---|---|
  | H1 | `clamp(42px, 7.4vw, 104px)` | .94 | −.05em |
  | H2 (section) | `clamp(30px, 4.6vw, 62px)` | 1 | −.045em |
  | H2 (panel) | `clamp(26px, 3.4vw, 46px)` | 1.02–1.04 | −.04em |
  | H3 (large card) | `clamp(22px, 2.5vw, 32px)` | 1.12 | −.03em |
  | H3 (step) | `clamp(21px, 2.4vw, 30px)` | 1.15 | −.03em |
  | Card title | 17–18px / 600 | — | −.02em |
  | Stat value | `clamp(30px, 3.4vw, 44px)` / 600 | 1 | −.04em |
  | Lead | `clamp(16px, 1.7vw, 21px)` | 1.55 | — |
  | Body | 15–16px | 1.6–1.65 | — |
  | Body small | 14–14.5px | 1.5–1.6 | — |
  | Nav / button | 13.5–15px / 600 | — | — |
  | Eyebrow (mono) | 10–11px, uppercase | — | .14–.18em |
- `text-wrap: balance` on headings, `pretty` on paragraphs.

### Spacing
- Section padding: `clamp(56px, 7vw, 104px)` vertical,
  `clamp(20px, 4vw, 48px)` horizontal.
- Grid/card gap: **14px** (12px for the stat strip, 10px for city chips).
- Card padding: `clamp(24px, 2.6vw, 32px)`; large cards
  `clamp(26px, 3vw, 38px)`; panels `clamp(28px, 3.2vw, 44px)`.
- Content max width **1200px**.

### Radius
| Token | Value | Use |
|---|---|---|
| `2rem` | 32px | Carousel frame, driver panel, CTA panel |
| `1.5rem` | 24px | Feature and vehicle cards |
| `1.25rem` | 20px | Stat cards |
| `1rem` | 16px | FAQ items, city chips, inner panels |
| `.75rem` | 12px | Logo tiles |
| `.375rem` | 6px | Admin-style inputs and small buttons |
| `999px` | pill | Nav, buttons, chips, dots |

### Shadow
- Carousel frame — `0 40px 90px -30px rgba(0,0,0,0.9)`
- Nav pill — `0 8px 30px rgba(0,0,0,0.45)`
- Primary CTA glow — `0 10px 30px rgba(245,130,32,0.28)` (0.3 on the closing CTA)

### Motion
| Name | Value |
|---|---|
| Reveal | 750ms `cubic-bezier(.16, 1, .3, 1)`, opacity + `translateY(20px)` |
| Carousel scroll | 420ms `cubic-bezier(.16, 1, .3, 1)` |
| Dot state | 240ms ease (width + background) |
| Auto-advance | 6000ms interval |
| Marquee | 42s linear infinite, `translateX(0 → -50%)` |
| Status dot pulse | 2.4s ease-in-out infinite, opacity .55→1 / scale 1→1.35 |

### Blur
`backdrop-filter: blur(18px) saturate(140%)` on the nav; `blur(12px)` on
glass chips over imagery.

## Assets

### Fonts
IBM Plex Sans and IBM Plex Mono, bundled in `fonts/` as `.woff2` with a
`fonts.css` of `@font-face` rules. Source: the Lalamove UI Kit design
system. In production, load them the way the codebase already loads fonts.

### Images
**None are included — every image in the design is an empty placeholder.**
The prototype uses `<image-slot>` drag-and-drop targets so the client can
drop real photography in. Each has a stable id, listed here so you know what
belongs where:

| Slot id(s) | What it is | Suggested size |
|---|---|---|
| `v3-hero` … `v3-hero-6` | Six hero banners | 2400 × 900 |
| `v3-partner-1` … `-8` (+ `…b` duplicates) | Partner logos, transparent PNG/SVG | 360 × 96 |
| `v3-veh-*` (nine) | Vehicle photos per type | 720 × 560 |
| `v3-drivers` | Courier partner photo | 1200 × 1000 |

The `…b` partner ids are duplicates of 1–8 that exist only because the
marquee renders the list twice for a seamless loop. In production render one
source list twice; do not create duplicate assets.

No icons are used — the design relies on typography, dots, and the `‹`/`›`
glyphs. Swap those for the codebase's icon set (e.g. chevron-left/right).

## Files
| File | What it is |
|---|---|
| `Home-Georgia-v3.dc.html` | **The design to build.** Final Georgia homepage. Open in a browser to view. |
| `Home-Georgia-v2.dc.html` | Earlier direction — sharp-edged hairline grid, light. Reference only. |
| `Home-Georgia.dc.html` | Earlier direction — warm editorial. Reference only. |
| `Home-A-Ledger.dc.html`, `Home-B-Switch.dc.html`, `Home-C-Tracker.dc.html` | First-round explorations, pre-Georgia. Reference only. |
| `fonts/` | IBM Plex Sans + Mono woff2 files and `fonts.css`. |
| `image-slot.js` | Prototype-only drag-and-drop placeholder component. **Do not port.** |
| `support.js` | Prototype runtime. **Do not port.** |

### Reading the prototype source
Each `.dc.html` file is a template plus a JS logic class:
- The template holds the markup with `{{ value }}` holes and
  `<sc-for list="{{ items }}" as="item">` / `<sc-if value="{{ flag }}">`
  loops and conditionals.
- The logic class exposes everything the template reads from a
  `renderVals()` method — that is where the copy, data arrays and event
  handlers live.

Read the logic class first for content and behaviour, then the template for
structure and exact style values.

## Known prototype-only compromises
Do not carry these into production — they are workarounds for the preview
renderer, not design intent:
1. `requestAnimationFrame` does not run, so the carousel scroll is a direct
   `scrollLeft` assignment instead of an eased animation.
2. `scroll-behavior: smooth` is a no-op.
3. CSS transitions do not advance, so the pagination dots have no
   `transition` at all and are painted imperatively via
   `document.querySelectorAll('[data-dot]')`. In production use ordinary
   state-driven styling with a transition.
4. All styling is inline because the runtime requires it.
5. The nav has no mobile menu; links wrap instead.
