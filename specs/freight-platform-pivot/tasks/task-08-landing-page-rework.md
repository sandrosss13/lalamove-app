# Task 08: Landing page rework for freight positioning

## Status

pending

## Wave

3

## Description

Updates the marketing landing page (shown at `/` for logged-out visitors and `/home` for anyone
signed in) to reflect the freight/cargo positioning instead of general small-parcel delivery: the
copy, the vehicle showcase, and the live pricing calculator all need to speak to "move furniture,
appliances, full relocations, industrial supplies" rather than "book a courier for a parcel." The
existing bold industrial visual design (near-black + orange, Bebas Neue/Archivo type, diagonal
motion cues) stays — this is a content/data rework, not a redesign.

## Dependencies

**Depends on:** task-02-pricing-engine.md
**Blocks:** None

**Context from dependencies:** task-02 built `src/lib/pricing.ts`'s `parseQuoteFields`/
`estimateDelivery` (now keyed on `vehicleTypeCode`/`cargoCategory`/`requiresHelper` instead of the
old `packageType`), `POST /api/pricing/estimate` (same new request shape, still public and rate-
limited at 6/minute per IP, still returns only `{ distanceKm, ...breakdown }` with no coordinates),
`GET /api/vehicle-types` (public, all 10 seeded vehicle types with specs), and `src/lib/cargo.ts`
(`CARGO_CATEGORY_LABELS`, `CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES`).

## Files to Modify

- `src/components/landing/landing-quote-calculator.tsx` — currently posts
  `{ pickupAddress, dropoffAddress, packageType }` to `/api/pricing/estimate` and renders a
  package-type `<select>`. Replace with the new fields: pickup/dropoff text inputs unchanged (still
  no autocomplete, per the earlier decision to keep the LocationIQ budget protected from anonymous
  traffic — do not add autocomplete here), a cargo-category `<select>` (from `CARGO_CATEGORY_LABELS`),
  a vehicle-type `<select>` fetched from `GET /api/vehicle-types` and filtered to the selected cargo
  category's allowed vehicle categories (same filtering logic task-05 implements for the booking
  form — keep the two consistent in behavior, they don't need to share code, this component already
  has its own independent form state), and a "Request a helper" checkbox. Update the result display
  (the card's stat footer) to show the itemized breakdown — distance, and price — matching
  the new `estimateDelivery` response shape; if there's room in the existing card layout for one
  more stat without cramming it, consider showing the vehicle type label as the third stat instead of
  cargo category (whichever reads better against the existing 2-3 column stat grid this component
  already has — use your judgment, this is a minor layout call, not a structural change).
- `src/components/landing/landing-hero.tsx` — headline/subheadline copy currently talks about
  general delivery ("Move anything across the city", "Set a pickup and a dropoff, pick the vehicle
  that fits the load..."). Update the subheadline to reflect freight/cargo positioning (e.g.
  mention furniture, relocations, industrial cargo — keep it concise, matching the existing copy's
  length/tone, don't write a paragraph). The headline itself ("Move anything across the city") can
  stay if it still reads correctly, or be lightly adjusted — your call, but don't restructure the
  hero's layout/animation, only the copy and the calculator it embeds (handled above).
- `src/components/landing/landing-vehicles.tsx` — the vehicle-type showcase grid. Currently sources
  its list from the now-deleted `VEHICLE_TYPE_GROUPS` static constant. Replace with a fetch (or, if
  this component is currently a server component, a direct `prisma.vehicleTypeSpec.findMany` call —
  check its current implementation before deciding) to the new `VehicleTypeSpec` data, grouped by
  `category` (`MEDIUM_DUTY`/`HEAVY_DUTY` — reuse whatever category grouping/labeling convention the
  rest of this task establishes, e.g. "Medium-Duty" / "Heavy-Duty" as the two group headings,
  replacing the old "Light Truck (<3.5t)" / "Cargo Van" headings). Each card can now meaningfully show
  `maxPayloadKg` (it couldn't before — the old model had no payload data), which is a nice concrete
  upgrade to this section, not just a taxonomy swap.
- `src/components/landing/landing-how-it-works.tsx` — check this component's current copy for any
  language assuming small-parcel/document delivery specifically (e.g. references to "package" rather
  than "cargo" or "load") and adjust wording to match the new domain. This is likely a light touch —
  don't restructure the 3-step layout, just correct any now-inaccurate copy.
- `src/components/landing/landing-driver-cta.tsx` — the "become a driver" callout. Check its copy for
  small-vehicle/parcel-courier framing and adjust to freight framing (e.g. "own a van or truck" is
  probably already accurate and needs no change — verify rather than assume, this file may need no
  edits at all).

## Technical Details

### Reuse task-05's filtering logic conceptually, not literally

Both the booking form (task-05, `src/app/page.tsx`) and this landing calculator independently fetch
`GET /api/vehicle-types` and filter by `CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory]`.
Do not attempt to extract a shared hook/component between them as part of this task — they are
different pages with different form-state shapes and (per the project's established pattern of
small, direct, occasionally-duplicated logic over premature shared abstractions — see how
`client-profile`/`driver-profile` API routes already duplicate similar validation rather than
sharing it) keeping them independent is consistent with this codebase's style. If a genuine shared
hook feels clearly warranted once both are written, that's a judgment call you can make, but it is
not required by this task.

### Landing calculator result display

Match the existing card's visual language (check the component's current `STAT_VALUE_CLASSES`/
color-per-stat pattern — a prior fix in this codebase specifically corrected a bug where a shared
class string silently lost a color override due to Tailwind's source-order specificity resolution;
don't reintroduce that bug by bundling a color into a shared class string again — apply
`text-accent`/`text-paper` per-stat explicitly, as the current code already does after that fix).

## Acceptance Criteria

- [ ] The landing calculator (on both `/` and `/home`) collects cargo category, a filtered
      vehicle-type selection, and a helper checkbox; submitting produces a real price from
      `POST /api/pricing/estimate` matching what the same inputs would produce via the authenticated
      booking form (task-05).
- [ ] No component under `src/components/landing/` references `packageType`, the old `VehicleType`
      enum, or the deleted `src/lib/vehicle-types.ts`.
- [ ] The vehicle showcase section displays all 10 seeded vehicle types grouped by
      Medium-Duty/Heavy-Duty, each showing at least its label and max payload.
- [ ] Landing page copy no longer implies small-parcel/document/food delivery anywhere (hero
      subheadline, how-it-works, driver CTA).
- [ ] `pnpm lint`/`pnpm typecheck`/`pnpm build` pass.
- [ ] Verified live (screenshot or Playwright, matching how this landing page was originally built
      and verified in prior work on this repo): both `/` and `/home` render correctly at a desktop
      and a mobile width, the calculator's full click-through produces a real result with zero
      console errors, and the Total/price stat renders in the correct accent color (not paper-white
      — the known prior bug class to watch for, see the note above).

## Notes

- Do not touch `src/components/landing/landing-footer.tsx` or `src/components/landing/landing-page.tsx`
  (the composing wrapper) unless you find genuine stale copy in the footer worth a one-line fix —
  the footer is mostly navigational links, unlikely to need domain-specific copy changes.
- Do not touch `src/app/page.tsx`'s signed-in `CLIENT` booking form — that's task-05's file, not this
  task's, even though both deal with cargo/vehicle selection.
