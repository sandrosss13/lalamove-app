# Task 11: Restyle the quote calculator into its own section

## Status

complete

## Wave

2

## Description

`src/components/landing/landing-quote-calculator.tsx` is the one genuinely interactive widget on the marketing page, and it works: a visitor types a pickup and a dropoff, picks a cargo category, optionally asks for a helper, and gets a real itemised fare back from `POST /api/pricing/estimate` — no account, no auth. Today it lives in the hero's right column at anchor `#price-a-load` and is styled for the current light-only landing palette.

This task does two things and nothing else. It **moves the widget out of the hero into its own section below it**, wrapped in a card that matches the new design language and framed by an eyebrow/heading/intro from a new `quote_calculator` CMS content type. And it **restyles every control** — the text inputs, the `<select>`, the checkbox, the error banner, the result panel and the submit button — onto task-01's two-theme tokens, because the current styling only works in light mode.

**Behaviour and the API contract must not change.** Not the request body, not the endpoint, not the cheapest-vehicle selection, not the loading and error states, not a single accessibility affordance. This is a restyle and a relocation.

## Dependencies

**Depends on:** `task-01-theme-tokens-and-toggle.md`, `task-02-cms-content-contract.md`
**Blocks:** `task-14-page-composition.md`

**Context from dependencies:**

**task-01** adds a `.dark`-scoped landing palette to `src/app/globals.css` and exposes it through `@theme inline`. The app declares `@custom-variant dark (&:is(.dark *))` at line 5 of `globals.css` but nothing has ever set `.dark` — task-01 lights it up, with a persisted flash-free toggle in the nav pill. That is the whole reason this task exists: **the calculator's current classes are light-only** (`bg-ink` on a field means "white" today) and would be unreadable once the page can go dark.

| Utility | Dark value | Role |
|---|---|---|
| `bg-ink` | `#08090A` | Page background |
| `text-paper` | `#F4F4F2` | Primary text / foreground |
| `bg-surface` | `rgba(255,255,255,0.04)` | The card, and the form fields |
| `bg-surface-sunken` | `rgba(8,9,10,0.55)` | The result panel |
| `bg-glass` | `rgba(16,18,20,0.72)` | Nav pill (not used here) |
| `border-line` | `rgba(255,255,255,0.08)` | Card and field borders |
| `border-line-strong` | `rgba(255,255,255,0.12)`–`0.18` | Emphasised borders |
| `text-accent` / `bg-accent` | `#F58220` | Eyebrow, price, submit button, focus ring |
| `text-accent-hover` | `#FFA45C` | Link hover |
| `bg-surface-raised` | `rgba(255,255,255,0.06)` | Secondary button |
| `text-on-accent` / `bg-on-accent` | `#0A0B0A` | Text on the orange button |

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

**task-02** extends `src/lib/admin/home-page-content.ts` — the dependency-free shared contract (no Prisma, no `server-only`, because client landing components import it directly). It adds `quote_calculator` to `HOME_PAGE_SECTION_TYPES`, a validator, default copy in `DEFAULT_HOME_PAGE_CONTENT`, and this type:

```ts
/** Framing copy for the quote calculator's section. The form itself is not authored. */
export type QuoteCalculatorContent = {
  eyebrow: string;
  heading: string;
  intro: string;
};
```

Only the *framing* is content. The field labels, placeholders, button labels, breakdown terms and error messages stay in the component — they are UI strings tied to a specific request/response shape, not marketing copy, and putting them in a `Json` column would let a content edit break a working form.

**Verify the type before you write JSX.** Open `src/lib/admin/home-page-content.ts` and follow what task-02 actually landed. If a field name differs, adjust your references — do not edit that shared file to match this document.

## Files to Modify

- `src/components/landing/landing-quote-calculator.tsx` — restyled onto the new tokens and wrapped in its own `<section>` with CMS-driven framing copy. **All 412 lines must be read before any edit.**

## Technical Details

### Read this first — all 412 lines

`src/components/landing/landing-quote-calculator.tsx`. You cannot restyle this file safely without knowing what every piece of it is doing. The inventory below is what you are protecting, not a substitute for reading it.

### The behaviour that must survive, verbatim

**Hooks and identity**
- `"use client"` at the top.
- Four `useId()` calls — `pickupId`, `dropoffId`, `cargoCategoryId`, `helperId` — each wired `<label htmlFor>` ↔ `<input id>`. `useId` (not a hand-rolled counter) so two instances on one page cannot collide.
- `useLandingVehicleTypes()` from `@/components/landing/landing-vehicle-types`, destructured as `{ vehicleTypes, loading, error: vehicleTypesError }`. **Do not add a second fetch** — that module deliberately dedupes one module-level `/api/vehicle-types` request across every landing section that needs the taxonomy, and clears the cached promise on failure so a later mount retries rather than replaying the same rejection.

**State**
- `pickupAddress`, `dropoffAddress` (strings), `cargoCategory` (`CargoCategory`, defaulted to `DEFAULT_CARGO_CATEGORY = "FURNITURE_FURNISHINGS"`), `requiresHelper` (boolean), `submitting`, `error`, `estimate`.
- `clearQuote()` — sets `estimate` and `error` to `null` — is called on **every** field edit, via `updateField()`, `updateCargoCategory()` and the checkbox's inline handler. The comment explains why: any edit invalidates the quote on screen, and a price for the previous route must not sit under the new inputs. Keep all three call sites.

**Vehicle selection — the subtlest part of the file**
- `CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory]` filters `vehicleTypes` down to what the chosen cargo may legally travel in, so the server's mismatch rejection is unreachable from this form.
- `cheapestVehicleType` is a `.reduce()` picking the lowest `pricingRule.baseFare` among those. The long comment above it explains the product decision: a visitor prices a *load*, not a specific truck, and requiring a vehicle picker made the quote depend on a required control staying in sync with a background fetch. **Do not add a vehicle picker.** Keep the comment.

**Submission**
- `handleSubmit` `preventDefault()`s, clears `error` and `estimate`, bails with `"Could not price this load. Please try again."` if `cheapestVehicleType` is null, sets `submitting`, and then:

  ```ts
  await fetch("/api/pricing/estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pickupAddress,
      dropoffAddress,
      vehicleTypeCode: cheapestVehicleType.code,
      cargoCategory,
      requiresHelper,
    }),
  });
  ```

  **This request must be byte-identical after your change.** Same URL, same method, same headers, same five body fields, same names.
- Non-`ok` → surface `payload.error` if present, else the generic message. `catch` → `"Network error. Please check your connection and try again."` `finally` → `setSubmitting(false)`.
- On success, `setEstimate({ ...payload, vehicleLabel: cheapestVehicleType.label })` — the label is captured *now* so the panel keeps matching the quote even if the visitor edits the form afterwards. Keep that comment.

**Derived values**
- `const message = error ?? vehicleTypesError;` with its comment (a quote failure is the more urgent of the two, and the submit button is disabled while the list is missing, so only one is reachable at a time).
- `minimumFareApplied` — true when the four components sum to less than `price - 0.005`. The comment explains the half-cent margin keeps floating-point dust from reading as a floor. Keep the arithmetic and the margin exactly.

**Accessibility and states — every one of these survives**
- `role="alert"` on the error banner.
- `aria-live="polite"` on the result panel, and the panel is **rendered before the first quote** (showing `EMPTY_STAT = "—"`) so the card does not grow a whole new region under the visitor's cursor when the estimate lands. Keep both the behaviour and the comment.
- `required` on both address inputs and the `<select>`; `autoComplete="off"` on the addresses.
- The helper control is a `<label htmlFor={helperId}>` wrapping its own text with the `<input type="checkbox" id={helperId}>` inside, so the whole row is a click target.
- The submit button is `disabled={submitting || loading || !cheapestVehicleType}` and its label cycles `"Calculating…"` → `"Loading…"` → `"Calculate price"`. The comment explains this is the only gate against a premature submit racing the taxonomy fetch. Keep it.
- `<dl>` / `<dt>` / `<dd>` semantics in the result panel and the breakdown — the estimate is a description list, not a table of divs. Keep the elements.
- The helper breakdown line renders only when `estimate.helperFee > 0`.
- The "Sign up to book this load" `next/link` renders only once an estimate exists.

**Formatting**
- Every numeral is `.toFixed(2)` (or `.toFixed(1)` for kilometres) and rendered in `font-price` (IBM Plex Mono) for tabular alignment. **Keep `font-price` on every number** — that is why the mono face is loaded.
- The currency symbol stays `$`, exactly as it is today. Changing it to `₾` is a product decision affecting the whole pricing stack, not a restyle, and is out of scope here.

### The scope change: out of the hero, into its own section

Today the component returns a bare `<form>` carrying `animate-rise [animation-delay:520ms] rounded-2xl border border-line bg-ink p-5 shadow-[...] sm:p-6`, because it was a card sitting in the hero's right column. Task-06 rewrites the hero to the handoff's **centred** layout and removes the calculator from it, so this component now owns its own section.

New outer structure:

```tsx
<section
  id="price-a-load"
  className="scroll-mt-28 px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]"
>
  <div data-reveal className="mx-auto w-full max-w-[1200px]">
    {/* eyebrow / heading / intro from `content` */}
    <form onSubmit={handleSubmit} className={CARD_CLASSES}>…</form>
  </div>
</section>
```

- **Keep the `price-a-load` id.** It is an existing in-page anchor; the hero's secondary CTA and the nav may still point at it, and task-05/task-14 own those links. `scroll-mt-28` keeps the fixed floating nav pill off the heading.
- **Drop `animate-rise [animation-delay:520ms]`.** That delay was choreographed against the hero's entrance and is meaningless now. Task-14 owns the scroll-reveal IntersectionObserver — emit `data-reveal` on the wrapper and write no transition, no observer and no `opacity-0` starting state here (task-14's rule is that anything already in the viewport on load must never be hidden).
- **Drop the `shadow-[0_18px_48px_-24px_rgba(32,31,28,0.35)]`.** It is a hardcoded light-theme shadow and the new design language uses borders and surfaces, not drop shadows, for card separation.
- **Framing copy** above the form, from `content`:
  - eyebrow — `font-price text-[11px] tracking-[.18em] uppercase text-accent`
  - `<h2>` — `content.heading` at `text-[clamp(30px,4.6vw,62px)] leading-none tracking-[-.045em] font-semibold text-paper max-w-[20ch] text-balance`
  - intro — `content.intro` at `text-[16px] leading-[1.6] text-muted max-w-[44ch] text-pretty`
- **The form's in-card `<h2>`** ("See your price now") and its subtitle ("Price a load before you create an account.") are now redundant with the section heading above. Demote them: either delete both and keep only the "Estimate" pill, or keep the pill row alone. **Do not leave two `<h2>`s in the section** — if you keep an in-card title, make it an `<h3>`. Recommended: delete the in-card title/subtitle pair, keep the "Estimate" status pill, and let the section heading carry the framing.

New signature:

```tsx
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type QuoteCalculatorContent,
} from "@/lib/admin/home-page-content";

export function LandingQuoteCalculator({
  content = DEFAULT_HOME_PAGE_CONTENT.quote_calculator,
}: {
  content?: QuoteCalculatorContent;
}) { /* … */ }
```

Note the prop is optional with a default, matching every other landing section — the component must still render correctly with zero CMS rows, which is the normal state until task-15 seeds the database.

### The restyle

**Universal rules** (repeated in each Wave 2 task on purpose):

- Tailwind v4 utilities only. There is no `tailwind.config.*`; tokens live in `src/app/globals.css` under `@theme inline`. **No `style={{ ... }}` inline styles.**
- **No hardcoded `rgba()` or hex literals.** Both themes must work.
- **No media queries and no `sm:` / `md:` / `lg:` prefixes.** The existing `sm:p-6` goes; use `p-[clamp(24px,2.6vw,32px)]` instead. Everything is fluid: `clamp()` for type and spacing.
- The landing page uses **zero shadcn primitives** — every control is hand-styled with landing tokens. That is why this file defines its own `FIELD_CLASSES` around lines 46–51. **Keep that pattern**: shared class-string constants at the top of the module. Do not import `@/components/ui/input`, `select`, `checkbox` or `button`; those belong to the admin back office, carry the shadcn token set, and are pinned light.

**Card** — replaces the old `rounded-2xl border border-line bg-ink p-5 … sm:p-6`:

```tsx
const CARD_CLASSES =
  "rounded-3xl border border-line bg-surface p-[clamp(24px,2.6vw,32px)]";
```

(`rounded-3xl` = `1.5rem` = 24px, the design's feature-card radius.)

**Fields** — the existing constant, retargeted. Keep the comment above it explaining that the focus ring is spelled out here because `globals.css` only rings links and buttons, so form controls on this page style their own:

```tsx
const FIELD_CLASSES =
  "w-full rounded-xl border border-line bg-surface-sunken px-3.5 py-2.5 text-sm text-paper " +
  "transition-colors placeholder:text-faint focus:border-accent focus:outline-none " +
  "focus:ring-2 focus:ring-accent/25";
```

The field sits on `bg-surface-sunken` so it reads as recessed inside the `bg-surface` card in **both** themes — on the old light-only palette the field was `bg-ink` (white) inside a white card, which only worked because the card had a shadow.

**Select.** A native `<select>` inherits the page's colour but the browser paints its own dropdown list. Add `appearance-none` plus a chevron (an inline SVG positioned in a `relative` wrapper, or `bg-[url(...)]`-free — prefer the SVG, so no colour is baked into a data URI). Also give the `<option>` elements a readable background: browsers on some platforms render the popup with the element's own `background-color`, so keep the `<select>`'s background a real token colour rather than a translucent one if the options come out unreadable in dark mode — if `bg-surface-sunken`'s alpha causes trouble, fall back to `bg-ink` for the select alone and note it in a comment. Test this in a real browser in both themes; it is the single most likely thing to look broken.

**Checkbox row** — currently `rounded-lg border border-line px-3.5 py-3 … hover:border-accent/40`. Retarget to `rounded-xl border border-line bg-surface-sunken px-3.5 py-3 text-[0.8125rem] leading-snug text-paper transition-colors hover:border-accent/40`. Keep `accent-accent` on the `<input type="checkbox">` — that is `accent-color`, which is exactly the right primitive here and already tracks the token.

**Field labels** — `FIELD_LABEL_CLASSES` becomes `flex items-center gap-2 text-[0.8125rem] font-medium text-paper`. The two route marks stay: a hollow accent ring for pickup (`h-2 w-2 rounded-full border-[1.5px] border-accent`) and a filled accent square for dropoff (`h-2 w-2 rounded-[2px] bg-accent`), with the comment explaining they are the two ends of one journey.

**Error banner** — `rounded-xl border border-line-accent-strong bg-accent/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-accent`. Already token-based; just update the radius and confirm `bg-accent/10` is legible on both grounds.

**Result panel** — currently `rounded-xl border border-line-accent bg-accent/[0.06] px-4 py-4`. Retarget to `rounded-2xl border border-line-accent bg-accent/8 px-5 py-5` (`rounded-2xl` = `1rem`, the design's inner-panel radius). Inside:

- `PANEL_LABEL_CLASSES` → `font-price text-[10.5px] tracking-[.1em] uppercase text-faint` (mono, matching the design's meta treatment — it is currently sans).
- the price — keep `font-price`, `text-accent`, and its `text-[2.125rem] leading-none font-semibold tracking-[-0.03em]`.
- `BREAKDOWN_TERM_CLASSES` → `text-[0.8125rem] text-muted`; `BREAKDOWN_VALUE_CLASSES` → `font-price text-[0.8125rem] text-paper`.
- the breakdown's divider `border-t border-accent/15` stays.
- "Minimum fare applied" stays `text-xs text-accent`.

**Submit button** — the design's accent pill: `mt-5 w-full rounded-full bg-accent px-5 py-3.5 text-[15px] leading-none font-semibold text-on-accent transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60`. Note `text-on-accent` replaces the old `text-ink`, which only happened to be right because `ink` was white in the light-only palette.

**Sign-up link** — keep as-is structurally; retarget colours to `text-paper transition-colors hover:text-accent`.

### Code Snippets

The shared constants block, after the retarget (keep every existing explanatory comment):

```tsx
const CARD_CLASSES =
  "rounded-3xl border border-line bg-surface p-[clamp(24px,2.6vw,32px)]";

/** The focus ring is spelled out here because `globals.css` only rings links
 *  and buttons — form controls on this page style their own. */
const FIELD_CLASSES =
  "w-full rounded-xl border border-line bg-surface-sunken px-3.5 py-2.5 text-sm text-paper " +
  "transition-colors placeholder:text-faint focus:border-accent focus:outline-none " +
  "focus:ring-2 focus:ring-accent/25";

const FIELD_LABEL_CLASSES =
  "flex items-center gap-2 text-[0.8125rem] font-medium text-paper";

const PANEL_LABEL_CLASSES =
  "font-price text-[10.5px] tracking-[.1em] text-faint uppercase";

const BREAKDOWN_TERM_CLASSES = "text-[0.8125rem] text-muted";

const BREAKDOWN_VALUE_CLASSES = "font-price text-[0.8125rem] text-paper";
```

### API Endpoints

- `POST /api/pricing/estimate` — **unchanged, and not to be touched.** Request body `{ pickupAddress, dropoffAddress, vehicleTypeCode, cargoCategory, requiresHelper }`; success response `{ distanceKm, baseFare, distanceFare, timeFare, helperFee, price }`; failures return `{ error?: string }` with a non-2xx status. Do not open `src/app/api/pricing/estimate/route.ts` to "improve" it.
- `GET /api/vehicle-types` — consumed only through the existing `useLandingVehicleTypes()` hook. Do not add a second fetch.

### Environment Variables

None.

## Acceptance Criteria

- [ ] `LandingQuoteCalculator` now takes `content?: QuoteCalculatorContent` defaulted to `DEFAULT_HOME_PAGE_CONTENT.quote_calculator`, and renders its own `<section id="price-a-load" className="scroll-mt-28 px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]">` with an eyebrow, an `<h2>` and an intro from `content`.
- [ ] The form is wrapped in a card: `rounded-3xl border border-line bg-surface p-[clamp(24px,2.6vw,32px)]`.
- [ ] `animate-rise`, `[animation-delay:520ms]`, the `shadow-[0_18px_48px_-24px_rgba(32,31,28,0.35)]` and `sm:p-6` are all gone. `data-reveal` is present on the section's inner wrapper, with no `opacity-0` starting state.
- [ ] There is exactly one `<h2>` in the section (the CMS heading); any surviving in-card title is an `<h3>` or removed.
- [ ] **The fetch call is byte-identical**: `POST /api/pricing/estimate`, `Content-Type: application/json`, body `{ pickupAddress, dropoffAddress, vehicleTypeCode, cargoCategory, requiresHelper }` with `vehicleTypeCode` from `cheapestVehicleType.code`. Diff this block against the original and confirm no change.
- [ ] `src/app/api/pricing/estimate/route.ts` is untouched (`git status` shows it unmodified).
- [ ] The address fields are still plain `<input type="text">`. `AddressAutocomplete` is **not** imported.
- [ ] No vehicle-type picker was added; `cheapestVehicleType` still selects by lowest `pricingRule.baseFare` among the categories `CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory]` permits, and its explanatory comment survives.
- [ ] `clearQuote()` is still called from `updateField`, `updateCargoCategory` and the checkbox handler.
- [ ] All four `useId()` calls and their `htmlFor`/`id` pairings survive.
- [ ] `role="alert"` on the error banner, `aria-live="polite"` on the result panel, and the result panel still renders (as `"—"`) before the first quote.
- [ ] `required` on both addresses and the select; `autoComplete="off"` on both addresses; the helper row is still a full-width clickable `<label>`.
- [ ] The submit button is still `disabled={submitting || loading || !cheapestVehicleType}` with the `"Calculating…"` / `"Loading…"` / `"Calculate price"` label cycle.
- [ ] `message = error ?? vehicleTypesError` and the `minimumFareApplied` arithmetic (including the `- 0.005` margin) are unchanged.
- [ ] `<dl>`/`<dt>`/`<dd>` semantics survive in the result panel and the breakdown; the helper line still renders only when `helperFee > 0`; the sign-up link still renders only when an estimate exists.
- [ ] Every numeral still carries `font-price`, and the currency symbol is still `$`.
- [ ] No `style` attribute, no hardcoded `rgba(...)` or hex literal, no `@media`, no `sm:` / `md:` / `lg:` prefix anywhere in the file.
- [ ] No `@/components/ui/*` import was added.
- [ ] The whole widget is legible and usable in **both** themes: field text, placeholder, the `<select>` and its open dropdown list, the checkbox, the error banner, the result panel and the disabled button. Verify the open `<select>` popup specifically.
- [ ] End-to-end: with the dev server on `localhost:3000`, a signed-out visitor can enter two real Tbilisi addresses, submit, and see a price with its breakdown — in both themes.
- [ ] `pnpm check` (lint + typecheck) passes.

## Notes

- **Do not "improve" the pricing call.** No debouncing, no auto-quote-on-blur, no retry loop, no client-side price maths, no caching layer, no switching to a GET with query params. The endpoint and the request shape are the contract; the signed-in booking app prices through a different path and the two must not be conflated.
- **Do not swap the text inputs for `AddressAutocomplete`.** `src/components/address-autocomplete.tsx` is the Google Places control the signed-in booking form uses. This widget deliberately does **not** use it — see the component's own header comment around line 65: it calls the *public* `/api/pricing/estimate` endpoint rather than the auth-gated autocomplete path, so the addresses are plain text fields geocoded once, on submit. That is a security and cost boundary (an unauthenticated marketing page must not be a free proxy to a metered Places key), not an oversight.
- **Do not touch `/api/pricing/estimate`, `src/lib/pricing.ts`, `src/lib/geo.ts` or the geocode routes.** Several of them have uncommitted local changes on this branch already; leave them alone.
- **Do not touch `src/components/landing/landing-page.tsx` or `landing-hero.tsx`.** Task-14 owns composition and the renderer switch; task-06 owns the hero and is what removes the calculator from it. If you find the hero still rendering `<LandingQuoteCalculator />` when you are done, that is task-06's and task-14's problem to resolve, not yours — say so in your final message.
- **Do not touch `src/lib/admin/home-page-content.ts` or `src/app/globals.css`.** Those are task-02 and task-01. If the contract has a genuine gap, report it rather than patching a shared file another task may be reading.
- **Do not touch `src/components/home/booking-form.tsx` (1,367 lines) or `src/components/home/route-preview-map.tsx` (522 lines).** They render the signed-in booking app for CLIENT sessions and are explicitly out of scope for the whole feature.
- **Do not add a second `/api/vehicle-types` fetch.** The module-level dedupe in `src/components/landing/landing-vehicle-types.ts` exists because several landing sections need the same list and `/` renders the landing page from a client tree (it branches on session), so the taxonomy cannot be read through Prisma server-side here.
- **Keep the comments.** This file is unusually well-commented and every comment in it explains a decision that is not obvious from the code: why the vehicle picker was removed, why the label is captured at estimate time, why the result panel renders empty, why the submit button has three disable conditions, why the minimum-fare margin is half a cent, why the focus ring is hand-written. A restyle that strips them makes the next reader re-derive all of it. Update a comment only where the code it describes actually changed.
- **Sanity-check on the real host.** The landing page renders for signed-out visitors at `localhost:3000` (the CLIENT host); `merchant.localhost:3000` redirects away from `/`. `package.json`'s `"dev": "next dev -H ::"` is load-bearing — without `-H ::` the cross-host redirects collapse into `ERR_TOO_MANY_REDIRECTS`. Do not change it. `/home` (`src/app/home/page.tsx`, `force-dynamic`) renders the landing page as a staff preview while signed in, which is useful for looking at the section, but exercise the actual submit while **signed out** — that is the path the widget is built for.
