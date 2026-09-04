# Task 09: Photo-led vehicle catalogue and the For Drivers panel

## Status

complete

## Wave

2

## Description

Rebuilds two sections of the redesigned marketing homepage: the **vehicles catalogue** (design handoff section 8, "Every size, one app.") and the **For Drivers panel** (design handoff section 9).

The vehicles section is rewritten from today's spec-sheet grid — numbered tiles showing payload ratings — into the handoff's photo-led card catalogue: a photo per vehicle type with its name underneath, grouped by duty class, **name and photo only, and no prices anywhere**. The photos come from the new `VehicleTypeSpec.imageUrl` field that task-03 adds and carries through `/api/vehicle-types`; when a type has no photo yet, the card falls back to the inline SVG glyph the current component already draws, so the page never shows an empty box.

The For Drivers panel replaces today's skewed orange `landing-driver-cta.tsx` with the handoff's single glass panel — copy and CTAs on the left, a full-bleed courier photo on the right. The one piece of non-decorative logic in the old component, the host-aware driver sign-up destination, is preserved exactly.

Both sections are self-contained files. This task does not touch `landing-page.tsx`; task-14 composes them.

## Dependencies

**Depends on:** `task-01-theme-tokens-and-toggle.md`, `task-02-cms-content-contract.md`, `task-03-vehicle-photo-schema.md`
**Blocks:** `task-14-page-composition.md`

**Context from dependencies:**

**task-01** adds a `.dark`-scoped landing palette to `src/app/globals.css` and exposes it through `@theme inline`. The app declares `@custom-variant dark (&:is(.dark *))` at line 5 of `globals.css` but nothing has ever set `.dark` — task-01 lights it up, with a persisted flash-free toggle in the nav pill. The consequence for this task: **the page has two themes, so you may never hardcode a dark `rgba()` value.** Every colour is a token.

| Utility | Dark value | Role |
|---|---|---|
| `bg-ink` | `#08090A` | Page background |
| `text-paper` | `#F4F4F2` | Primary text / foreground |
| `bg-surface` | `rgba(255,255,255,0.04)` | Cards, chips, panels |
| `bg-surface-sunken` | `rgba(8,9,10,0.55)` | Inner sunken panels |
| `bg-glass` | `rgba(16,18,20,0.72)` | Nav pill (not used here) |
| `border-line` | `rgba(255,255,255,0.08)` | Card borders |
| `border-line-strong` | `rgba(255,255,255,0.12)`–`0.18` | Group rules, panel borders |
| `text-accent` / `bg-accent` | `#F58220` | Eyebrows, group labels, bullets, primary CTA |
| `text-accent-hover` | `#FFA45C` | Link hover |
| `bg-surface-raised` | `rgba(255,255,255,0.06)` | Secondary button |
| `text-on-accent` / `bg-on-accent` | `#0A0B0A` | Text on an orange button |

**Translating the handoff's greyed text, rules and gradients.** The handoff writes body copy as `rgba(244,244,242,0.55)` and card borders as `rgba(255,255,255,0.08)`. **Do not express these as opacity modifiers on `text-paper` / `border-paper`.** task-01 ships a named token for every tier, because the light theme needs a warmer, more opaque value than a plain alpha of near-black would give — and because a component must never branch on the theme in TSX:

| Handoff value | Utility | Role |
|---|---|---|
| `rgba(244,244,242,0.62)` | `text-subtle` | Lead / secondary copy |
| `rgba(244,244,242,0.55)` | `text-muted` | Body copy |
| `rgba(244,244,242,0.42)` | `text-faint` | Eyebrows, meta |
| `rgba(244,244,242,0.36)` | `text-faintest` | Smallest meta |
| `rgba(255,255,255,0.07)` | `border-line-hairline` | Inner dividers |
| `rgba(255,255,255,0.08)` | `border-line` | Card borders |
| `rgba(255,255,255,0.12)` | `border-line-strong` | Row rules, panel borders |
| `rgba(255,255,255,0.18)` | `border-line-stronger` | Frames, arrows |
| `rgba(245,130,32,0.22)` | `border-line-accent` | Accent card borders |
| `rgba(245,130,32,0.28)` | `border-line-accent-strong` | CTA panel border |

Every `--color-*` name yields `bg-*` and `text-*` utilities as well as `border-*`, so a 1px rule drawn as a filled element is `bg-line-strong`, not a bordered one.

The handoff's four named gradients and three shadows are also tokens, declared per theme, so a component never writes a colour stop of its own:

| Handoff gradient / shadow | Utility |
|---|---|
| Accent card — `linear-gradient(160deg, rgba(245,130,32,0.14), rgba(255,255,255,0.03) 46%)` | `bg-[image:var(--landing-gradient-accent-card)]` |
| Coverage card — `linear-gradient(160deg, rgba(245,130,32,0.12), rgba(255,255,255,0.03) 50%)` | `bg-[image:var(--landing-gradient-coverage-card)]` |
| CTA panel — `linear-gradient(150deg, rgba(245,130,32,0.2), rgba(255,255,255,0.03) 58%)` | `bg-[image:var(--landing-gradient-cta-panel)]` |
| Hero spotlight | `bg-[image:var(--landing-gradient-spotlight)]` |
| Carousel frame shadow | `shadow-frame` |
| Nav pill shadow | `shadow-pill` |
| Primary CTA glow — `0 10px 30px rgba(245,130,32,0.28)` | `shadow-cta` |
| `backdrop-filter: blur(18px) saturate(140%)` | `backdrop-blur-glass` |

Opacity modifiers on `accent` itself (`bg-accent/10`, `text-accent/40`, `hover:border-accent/40`) are fine — `--color-accent` flips per theme, so the tint flips with it.

If task-01 shipped a token under a different name, **use the name it actually shipped** — read the `@theme inline` block in `src/app/globals.css` and map by role. Do not add tokens of your own; task-01 owns that file and this task must not edit it.

**task-02** extends `src/lib/admin/home-page-content.ts` — the dependency-free shared contract (no Prisma, no `server-only`, because client landing components import it directly). It widens the two content types this task consumes:

```ts
/** Framing copy for the fleet section; the vehicles come from the taxonomy. */
export type VehicleTypesContent = {
  eyebrow: string;
  heading: string;
  /** The supporting paragraph beside the heading. */
  intro: string;
  /** Display names for the two real VehicleCategory values. */
  mediumDutyLabel: string;
  heavyDutyLabel: string;
  /** The full-width business panel below the groups. */
  businessTitle: string;
  businessBody: string;
  businessCtaLabel: string;
  businessCtaHref: string;
};

/**
 * The drivers panel's copy. Its PRIMARY button target is not editable: where a
 * driver signs up depends on whether the merchant/client host split is enabled,
 * which is deployment configuration rather than content.
 */
export type DriverCtaContent = {
  eyebrow: string;
  /** Rendered line by line, so a newline is a deliberate line break. */
  headline: string;
  subtext: string;
  ctaLabel: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  points: string[];
  /** Courier/driver photo, uploaded in the admin. Null until one is set. */
  imageUrl: string | null;
};
```

**task-03** adds `imageUrl String?` to the `VehicleTypeSpec` model in `prisma/schema.prisma`, generates the migration, and carries the field through `GET /api/vehicle-types` and the `LandingVehicleType` type in `src/components/landing/landing-vehicle-types.ts`:

```ts
export type LandingVehicleType = {
  code: string;
  label: string;
  category: "MEDIUM_DUTY" | "HEAVY_DUTY";
  maxPayloadKg: number;
  /** Public Supabase URL for the type's photo, or null when none is set. */
  imageUrl: string | null;
  pricingRule: { baseFare: number; pricePerKm: number };
};
```

**Verify all three before writing JSX.** Read `src/lib/admin/home-page-content.ts` and `src/components/landing/landing-vehicle-types.ts` and follow the shapes that actually shipped. If a field name differs, adjust your references — do not edit those shared files to match this document.

## Files to Create

- `src/components/landing/landing-drivers-panel.tsx` — the For Drivers panel (design handoff section 9). Replaces `landing-driver-cta.tsx`.

## Files to Modify

- `src/components/landing/landing-vehicles.tsx` — rewritten from the 165-line spec-sheet grid to the handoff's photo card catalogue plus a business panel.

## Files Deliberately Left Alone

- `src/components/landing/landing-driver-cta.tsx` — superseded by the new `landing-drivers-panel.tsx`, but **do not delete or edit it in this task**. `src/components/landing/landing-page.tsx` still imports it, and that file belongs to task-14 (Wave 3); removing the component here would break the typecheck for the rest of Wave 2. Read it (all 90 lines) for the sign-up logic you must carry over, leave it byte-identical, and state in your final message that task-14 should drop the import and delete the file.

## Technical Details

### Read these first

1. `UI:UX/homepage/design_handoff_georgia_homepage/README.md`, sections **8. Vehicles** (line 210) and **9. For Drivers** (line 243), plus **Responsive behaviour** (line 386) and **Design Tokens** (line 417 onward).
2. `src/components/landing/landing-vehicles.tsx` — all 165 lines. It is the file you are rewriting.
3. `src/components/landing/landing-driver-cta.tsx` — all 90 lines. It is what the new panel replaces.
4. `src/components/landing/landing-vehicle-types.ts` — the shared fetch hook, ~90 lines.
5. `src/app/globals.css` — the `@theme inline` block, to confirm task-01's token names.

### What the current `landing-vehicles.tsx` does, and what survives

It is a `"use client"` component (it calls `useLandingVehicleTypes()`, which fetches in the browser). It:

- defines two inline SVG glyphs, `TruckGlyph()` and `VanGlyph()`, each a 48×24 stroked `currentColor` path with wheels;
- declares a `CATEGORIES` array mapping the two real `VehicleCategory` values to a display heading and a glyph, "lightest first" — `MEDIUM_DUTY` → "Medium-Duty" / `VanGlyph`, `HEAVY_DUTY` → "Heavy-Duty" / `TruckGlyph`;
- has a `formatPayload()` helper rendering tonnes above 1000 kg;
- filters the fetched list per category, returns `null` for an empty group, and renders a `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` of tiles showing a zero-padded index, the label and "Up to {payload}".

**What survives:** the `"use client"` directive, `useLandingVehicleTypes()`, the two glyph components, and the per-category filter with its empty-group `return null` (and the comment explaining it — a group with nothing in it keeps the section's heading rather than framing empty rows).

**What is deleted:** `formatPayload()` (no specs are shown any more — remove it, an unused function fails lint), the zero-padded index numerals, the "N types" count, the `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` breakpoint grid (no media queries in the redesign), the decorative blurred accent blob, and the `CATEGORIES` array's hardcoded `heading` strings (group names become CMS content — see below).

**The glyphs change role.** They are no longer the group heading's icon. They become the **per-card fallback** for a vehicle type whose `imageUrl` is `null`, drawn centred in the 140px image area. Keep both components and keep the glyph choice per category (van glyph for `MEDIUM_DUTY`, truck glyph for `HEAVY_DUTY`).

### What the current `landing-driver-cta.tsx` does, and what survives

It is a server component rendering a full-bleed orange skewed band with a headline, subtext, a single CTA and a bullet list. **The one piece of non-decorative logic is the sign-up destination**, and it must be carried over verbatim, comment included:

```tsx
import { merchantOrigin } from "@/lib/host";

// The landing page is client-host-only, and `/sign-up` there only offers
// CLIENT registration — so a driver has to be sent across to the merchant
// host. When the split is disabled, this stays a plain relative `/sign-up`.
const origin = merchantOrigin();
const driverSignUpHref = origin ? `${origin}/sign-up` : "/sign-up";
```

`merchantOrigin()` reads `NEXT_PUBLIC_MERCHANT_HOST`, which is inlined into the browser bundle, and resolves its protocol correctly in both server and client contexts — so it is safe to call from either. (Its sibling `clientOrigin()` is **not** browser-safe; do not reach for it.) This is why the primary CTA's href is deliberately absent from `DriverCtaContent`: it is deployment configuration, not content. Keep that comment too.

Also preserved: the multi-line headline rendering. `content.headline` is authored as text with newlines, and each newline is a deliberate break in a display heading, so it is split and joined with `<br />` inside a `<Fragment>` — not collapsed into one line.

### Universal rules for both sections

Repeated in each Wave 2 task on purpose.

- **Tailwind v4 utilities only.** There is no `tailwind.config.*`; tokens live in `src/app/globals.css` under `@theme inline`. **No `style={{ ... }}` inline styles.** The prototype uses inline styles only because its preview renderer requires it (handoff line 556, compromise #4) — an explicitly prototype-only compromise.
- **No hardcoded dark `rgba()` values.** Both themes must work.
- **No media queries, no `sm:`/`md:`/`lg:` prefixes.** Everything is fluid: `clamp()` for type and spacing, `grid auto-fit` / `flex-wrap` for layout (handoff line 387).
- **Equal-width card rows are CSS Grid, never flex.** The handoff calls this out as a lesson learned (line 389): use `grid-template-columns: repeat(auto-fit, minmax(Xpx, 1fr))`, **not** `flex: 1 1 Xpx`. A wrapped flex item with `flex-grow: 1` inflates to the full row width and reads as a broken layout. The vehicle card rows are grids for exactly this reason. **The drivers panel's two columns are the deliberate exception** — see below.
- **Section shell.** Each component renders its own `<section>` with `px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]`, an inner `mx-auto w-full max-w-[1200px]`, and `scroll-mt-28` so the fixed nav pill does not cover the heading on an anchor jump.
- **Scroll reveal.** Task-14 owns the IntersectionObserver. Put `data-reveal` on the top-level blocks so task-14 can pick them up. Do not write the observer, the transition CSS, or any `opacity-0` starting state — task-14's rule is that anything already inside the viewport on load must never be hidden.
- **Typography.** `text-balance` on headings, `text-pretty` on paragraphs. `font-display` (IBM Plex Sans) for headings and body, `font-price` (IBM Plex Mono) for eyebrows and group labels — both already wired via `next/font/google` in `src/app/layout.tsx`; the handoff's bundled `fonts/*.woff2` are ignored.
- **Images are plain `<img>`, not `next/image`.** URLs are typed or uploaded by a content editor and can point at any host, so they cannot be pinned in `remotePatterns` at build time. This is the same call `landing-page.tsx` already makes for banners, with the same suppression:

  ```tsx
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img src={…} alt={…} loading="lazy" className="…" />
  ```

### Implementation — rewriting `src/components/landing/landing-vehicles.tsx`

Keep `"use client"` and the existing props signature:

```tsx
export function LandingVehicles({
  content = DEFAULT_HOME_PAGE_CONTENT.vehicle_types,
}: {
  content?: VehicleTypesContent;
}) {
  const { vehicleTypes } = useLandingVehicleTypes();
  …
}
```

Section `id="vehicles"`, `scroll-mt-28`.

**Header row** (handoff line 216). A `flex flex-wrap items-end justify-between gap-8` two-item row (flex is right here: two items, both meant to go full width when they stack):

- optional accent mono eyebrow from `content.eyebrow` — `font-price text-[11px] tracking-[.18em] uppercase text-accent`
- H2 from `content.heading` — `text-[clamp(30px,4.6vw,62px)] leading-none tracking-[-.045em] font-semibold text-paper max-w-[16ch] text-balance`
- supporting paragraph from `content.intro` — `text-[16px] leading-[1.6] text-muted max-w-[44ch] text-pretty`

**The two groups.** The design shows three groups (Vans / Trucks / Specialised) over nine placeholder types. **That catalogue is a placeholder set and the handoff says so itself** (line 236: "⚠️ These nine are a placeholder set. Wire this section to the real vehicle categories and types in the project's catalogue — the client has confirmed motorbike and car are NOT offered."). The real data has **two** categories, so this section renders **two** groups:

- `MEDIUM_DUTY` — Minivan, MPV / Estate, Cargo Van, Closed Box Van, Refrigerated Van
- `HEAVY_DUTY` — Box Truck, Flatbed Truck, Curtainsider Truck, Refrigerated Truck, Large Freight Truck, Trailer Truck

That is the seed in `prisma/seed.ts` — 11 types across the two `VehicleCategory` values. Do not add a third group, do not invent a "Specialised" bucket by string-matching labels, and do not hardcode the type list; it comes from `/api/vehicle-types` at runtime.

Restructure `CATEGORIES` so the display name comes from `content` rather than being baked in:

```tsx
const CATEGORY_ORDER: {
  category: LandingVehicleType["category"];
  /** Which authored label names this group. */
  labelKey: "mediumDutyLabel" | "heavyDutyLabel";
  /** Fallback drawn on a card whose type has no photo yet. */
  glyph: () => ReactElement;
}[] = [
  { category: "MEDIUM_DUTY", labelKey: "mediumDutyLabel", glyph: VanGlyph },
  { category: "HEAVY_DUTY", labelKey: "heavyDutyLabel", glyph: TruckGlyph },
];
```

Groups are stacked with `gap-[clamp(26px,3vw,40px)]` (`flex flex-col`).

**Group label row** (handoff line 222). A mono label followed by a 1px rule that fills the remaining width:

```tsx
<div className="flex items-center gap-4">
  <h3 className="font-price text-[11px] tracking-[.18em] text-accent uppercase">
    {content[labelKey]}
  </h3>
  <span aria-hidden="true" className="h-px flex-1 bg-line-strong" />
</div>
```

(Use whichever token task-01 exposes for the `rgba(255,255,255,0.1)` rule — a `bg-*` form of `border-line-strong`, or `border-t border-line-strong` on a `flex-1` element. Match the token names actually shipped.)

**The card row** (handoff line 226) — this is the equal-width card row, so it is a grid:

```tsx
<ul className="mt-5 grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
```

**Each card:** `<li>` with `overflow-hidden rounded-3xl border border-line bg-surface`.

- **Image area** — `h-[140px] border-b border-line` (the handoff's `1px rgba(255,255,255,0.07)` inner hairline; use the subtle/hairline token task-01 shipped), `relative`.
  - When `vehicleType.imageUrl` is a non-empty string: a plain `<img>` filling it — `h-full w-full object-cover` with `alt={vehicleType.label}` and `loading="lazy"`, plus the eslint suppression comment above.
  - When it is `null`: centre the category's glyph — `flex h-full items-center justify-center text-accent/40` wrapping `<Glyph />`. The glyph is already `aria-hidden="true"` and strokes `currentColor`, so it picks the colour up. Scale it up from the current `h-6 w-12` to something that reads at 140px (e.g. wrap it in a `scale-[2.2]` container, or add a size override class at the call site) — do **not** edit the glyph components' viewBox.
- **Name** — `<p className="px-[22px] pt-[18px] pb-[22px] text-[17px] font-semibold tracking-[-.02em] text-paper">{vehicleType.label}</p>` (handoff: `padding: 18px 22px 22px`, 17px / 600 / `-.02em`).

> 🚫 **Name and photo only.** No payload, no dimensions, no loading-access type, and above all **no prices** — not a "from ₾X", not a `pricingRule.baseFare`, nothing. This is a hard product requirement, not a styling preference: the platform does not quote a fare until a route is entered, so the page must not publish a rate card (handoff line 211; `requirements.md` Non-Goals, "No rate card"). `LandingVehicleType` still carries `pricingRule` because the quote calculator needs it — ignore it here.

**Empty group.** Keep the existing behaviour: if the filter yields zero types, `return null` for that group, with the existing comment. The taxonomy is fetched in the browser, so on first paint both groups are empty and the section is just its header — that is intended and matches today's behaviour.

**Business panel** (handoff line 238). Below the groups, a full-width card: `rounded-3xl border border-line bg-surface p-[clamp(24px,2.8vw,34px)]`, laid out `flex flex-wrap items-center justify-between gap-6`.

- title — `content.businessTitle` at `text-[18px] font-semibold text-paper`
- body — `content.businessBody` at `text-[14.5px] leading-[1.6] text-muted max-w-[52ch] text-pretty`
- CTA — a `next/link` to `content.businessCtaHref` styled as a light pill: `inline-flex shrink-0 items-center rounded-full bg-paper px-6 py-3 text-[15px] font-semibold text-ink transition-colors` (the handoff's `background: #F4F4F2; color: #0A0B0A`, i.e. foreground-on-page-background — which is exactly the `bg-paper text-ink` pair, and therefore inverts correctly in the light theme). Add the codebase's default subtle lift on hover (`hover:-translate-y-0.5`), which is what the surrounding landing components already do.

The handoff's business copy mentions "a REST API" — task-02 seeds a replacement, because the platform does not publish one. Render `content`; do not type the handoff's string.

### Implementation — `src/components/landing/landing-drivers-panel.tsx`

A server component (no state, no browser API — `merchantOrigin()` is safe on the server):

```tsx
export function LandingDriversPanel({
  content = DEFAULT_HOME_PAGE_CONTENT.driver_cta,
}: {
  content?: DriverCtaContent;
}) { /* … */ }
```

Section `id="drivers"` (the handoff's anchor, line 243 — note this differs from the old component's `id="drive"`; task-05 builds the nav that links to `#drivers` and task-14 wires it), `scroll-mt-28`, standard section shell.

**The panel** (handoff line 244): a single `rounded-[2rem] overflow-hidden border border-line-strong bg-surface`, laid out `flex flex-wrap`.

> ⚠️ **This one IS a two-column flex, not a card grid.** Both columns are `flex-[1_1_320px]`, exactly as the handoff specifies. The `auto-fit` grid rule above targets *equal-width card rows* where a lone wrapped card inflating to full width reads as broken. Here there are exactly two items and full-width-when-stacked is the intended behaviour, so `flex-wrap` is correct. Do not convert this to a grid.

**Left column** — `flex-[1_1_320px] flex flex-col gap-5 p-[clamp(28px,3.2vw,44px)]`:

- eyebrow — `content.eyebrow`, `font-price text-[11px] tracking-[.18em] uppercase text-accent`
- H2 — `content.headline` at `text-[clamp(26px,3.4vw,46px)] leading-[1.03] tracking-[-.04em] font-semibold text-paper max-w-[18ch] text-balance`, **rendered line by line**: split on `\n` and join with `<br />` inside `<Fragment key={index}>`, carrying over the existing comment explaining that each newline is a deliberate break in a display heading
- body — `content.subtext` at `text-[16px] leading-[1.6] text-subtle text-pretty`
- bullet list — `<ul className="flex flex-col gap-3">` over `content.points`; each `<li className="flex items-start gap-3 text-[15px] leading-[1.55] text-subtle">` with a 6px accent dot: `<span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />`
- CTAs — a `flex flex-wrap gap-3` row:
  - **primary, accent pill** → `href={driverSignUpHref}` (the host-aware value computed above; **not** from `content`), label `content.ctaLabel`, classes `inline-flex items-center rounded-full bg-accent px-6 py-3 text-[15px] font-semibold text-on-accent transition-transform hover:-translate-y-0.5`
  - **secondary, glass pill** → `href={content.secondaryCtaHref}`, label `content.secondaryCtaLabel`, classes `inline-flex items-center rounded-full border border-line-strong bg-surface px-6 py-3 text-[15px] font-semibold text-paper transition-colors hover:border-accent/40`

**Right column** — `flex-[1_1_320px] min-h-[340px] relative`, the full-bleed image:

- when `content.imageUrl` is a non-empty string: `<img src={content.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />` with the eslint suppression. `alt=""` because the headline beside it already carries the meaning — the photo is decorative. (If task-02 shipped an `imageAlt` field, use it and drop the empty alt.)
- when it is `null`: a token-built placeholder rather than an empty hole — `bg-[image:var(--landing-gradient-accent-card)]` plus the existing `landing-grid` utility from `globals.css` (it tints from `currentColor`, so it inverts for free). `action-required.md` notes the courier photo is one of the assets a human still has to supply, and the page must look deliberate without it.

The `<img>` needs no border; the panel's `overflow-hidden` and `rounded-[2rem]` clip it.

### Code Snippets

Shared class constants at the top of the file, matching how the other landing components share repeated class strings (the landing page uses zero shadcn primitives — every control is hand-styled; see `FIELD_CLASSES` in `landing-quote-calculator.tsx`):

```tsx
const CARD_CLASSES = "overflow-hidden rounded-3xl border border-line bg-surface";

const GROUP_LABEL_CLASSES =
  "font-price text-[11px] tracking-[.18em] text-accent uppercase";
```

The card row grid, spelled out so the `auto-fit` rule is unmissable:

```tsx
<ul className="mt-5 grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
```

The photo-or-glyph fallback:

```tsx
<div className="relative h-[140px] border-b border-line">
  {vehicleType.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={vehicleType.imageUrl}
      alt={vehicleType.label}
      loading="lazy"
      className="h-full w-full object-cover"
    />
  ) : (
    // No photo uploaded for this type yet — the section's own glyph rather
    // than an empty box, so an unphotographed catalogue still reads as one.
    <div className="flex h-full items-center justify-center text-accent/40">
      <span className="scale-[2.2]">
        <Glyph />
      </span>
    </div>
  )}
</div>
```

### Environment Variables

- `NEXT_PUBLIC_MERCHANT_HOST` — read indirectly through `merchantOrigin()` from `@/lib/host`. Unset (the default) disables the host split and the driver CTA falls back to a relative `/sign-up`. Do not read `process.env` directly; call `merchantOrigin()`.

### API Endpoints

- `GET /api/vehicle-types` — consumed only through the existing `useLandingVehicleTypes()` hook in `src/components/landing/landing-vehicle-types.ts`. **Do not add a second fetch.** That module deliberately dedupes one module-level request across every landing section that needs the taxonomy, and clears the cached promise on failure so a later mount retries rather than replaying the same rejection. task-03 adds `imageUrl` to the route's response and to `LandingVehicleType`; this task just reads it.

## Acceptance Criteria

- [ ] `landing-vehicles.tsx` renders exactly **two** groups, driven by `CATEGORY_ORDER` over the real `MEDIUM_DUTY` / `HEAVY_DUTY` values — no third group, no label string-matching, no hardcoded type list.
- [ ] Group display names come from `content.mediumDutyLabel` / `content.heavyDutyLabel`, not from a constant in the component.
- [ ] Each group's cards are a grid: `[grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]` with `gap-[14px]`. No `flex-[1_1_180px]` anywhere.
- [ ] Cards are `overflow-hidden rounded-3xl border border-line bg-surface` with a `h-[140px]` image area, a `border-b` hairline under it, and a name at `px-[22px] pt-[18px] pb-[22px] text-[17px] font-semibold tracking-[-.02em]`.
- [ ] A type with a non-null `imageUrl` shows a plain `<img>` (`object-cover`, `loading="lazy"`, eslint suppression present, `alt` = the label). A type with `imageUrl === null` shows the category's inline SVG glyph, scaled up and centred — never an empty box.
- [ ] **No prices, no payloads, no dimensions anywhere in the section.** `formatPayload` is deleted, and grepping the file for `pricingRule`, `baseFare`, `maxPayloadKg` and `₾`/`$` returns nothing.
- [ ] An empty group still returns `null` rather than rendering an empty row, with an explanatory comment.
- [ ] A full-width business panel sits below the groups with `content.businessTitle` / `businessBody` / `businessCtaLabel` / `businessCtaHref`, its CTA a `bg-paper text-ink` pill at `text-[15px] font-semibold`.
- [ ] `landing-drivers-panel.tsx` exists, exports `LandingDriversPanel`, takes `content?: DriverCtaContent` defaulted to `DEFAULT_HOME_PAGE_CONTENT.driver_cta`, and has `id="drivers"`.
- [ ] The panel is one `rounded-[2rem] overflow-hidden border border-line-strong bg-surface` container with two `flex-[1_1_320px]` columns in a `flex flex-wrap`, the image column `min-h-[340px]` and full-bleed.
- [ ] The primary driver CTA's href is still computed by `merchantOrigin()` — `${origin}/sign-up` when the split is on, `/sign-up` when it is off — and is **not** read from `content`. The explanatory comment is preserved.
- [ ] The headline still splits on `\n` and renders `<br />` between lines.
- [ ] The bullet list renders `content.points` with a 6px accent dot, 15px text and `gap: 12px`.
- [ ] Two CTAs render: an accent pill (`bg-accent text-on-accent`) and a glass pill (`border-line-strong bg-surface text-paper`).
- [ ] `content.imageUrl === null` produces a token-built gradient placeholder, not an empty column.
- [ ] No `style` attribute anywhere in either file.
- [ ] No hardcoded `rgba(...)` or hex colour literals. Grep both files for `rgba(` and `#` and confirm nothing but utility classes remains.
- [ ] No `@media`, no `sm:` / `md:` / `lg:` prefixes.
- [ ] Both sections render correctly in light and dark (toggle with task-01's control, or set `class="dark"` on `<html>` by hand while developing).
- [ ] `src/components/landing/landing-driver-cta.tsx` is left in place and unmodified (task-14 deletes it when it stops importing it).
- [ ] `pnpm check` (lint + typecheck) passes.

## Notes

- **Do not touch `src/components/landing/landing-page.tsx`.** Task-14 owns composition, the `LandingSectionRenderer` switch and the section ordering — including swapping `LandingDriverCta` for `LandingDriversPanel` and deleting the old file. Until then `landing-drivers-panel.tsx` is an unreferenced export; that is expected and lint tolerates it.
- **Do not touch `src/lib/admin/home-page-content.ts`, `src/app/globals.css`, `prisma/schema.prisma`, or `src/components/landing/landing-vehicle-types.ts`.** Those belong to task-02, task-01 and task-03. If the contract has a genuine gap, report it in your final message rather than patching a shared file another task may be reading.
- **Do not touch `src/components/home/booking-form.tsx` (1,367 lines) or `src/components/home/route-preview-map.tsx` (522 lines).** They render the signed-in booking app for CLIENT sessions and are out of scope for the whole feature.
- **Do not add a second `/api/vehicle-types` fetch.** The module-level dedupe in `landing-vehicle-types.ts` exists because four landing sections need the same list and `/` renders the landing page from a client tree (it branches on session), so the taxonomy cannot be read through Prisma server-side here.
- **Do not reproduce the prototype's workarounds.** `Home-Georgia-v3.dc.html` styles everything inline, assigns `scrollLeft` directly and paints state via `document.querySelectorAll` — all documented preview-renderer compromises (handoff line 556), not design intent.
- **`<image-slot>` elements in the prototype (`v3-veh-*`, `v3-drivers`) are drag-and-drop placeholders.** They are replaced by real `<img>` elements fed from `VehicleTypeSpec.imageUrl` and `DriverCtaContent.imageUrl`. Do not port the custom element.
- **Photography is an outstanding human action.** `action-required.md` asks for 11 vehicle photos at 720×560 and one courier photo at 1200×1000. The section must look finished without them — that is what the glyph fallback and the gradient placeholder are for. Do not block on the assets, and do not check in placeholder stock images.
- **Coverage figures and the "three categories" framing.** The handoff's supporting paragraph says "Nine types across three categories". Both numbers are wrong for this product (11 types, 2 categories). task-02 seeds corrected `intro` copy; render it rather than reasoning about counts in the component. Do not compute "N types" into the copy either — the previous component did that and it is being removed.
- **Sanity-check on the real host.** The landing page renders for signed-out visitors at `localhost:3000` (the CLIENT host); `merchant.localhost:3000` redirects away from `/`. `package.json`'s `"dev": "next dev -H ::"` is load-bearing — without `-H ::` the cross-host redirects collapse into `ERR_TOO_MANY_REDIRECTS`. Do not change it. `/home` (`src/app/home/page.tsx`, `force-dynamic`) renders the landing page as a staff preview while signed in, which is a convenient way to look at these sections. To exercise both the photo and glyph paths, set `imageUrl` on a couple of `VehicleTypeSpec` rows and leave the rest null.
