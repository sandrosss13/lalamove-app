# Task 12: Load-space (body type) picker in step 5

## Status

pending

## Wave

3

## Description

Step 5 of the booking form ("Recommended vehicle") gains a body-type picker above the vehicle grid: Dry Box, Refrigerated or Open Chassis. It acts as a third filter on the vehicle list alongside the existing cargo-category and weight filters, and it is driven by data on the vehicle taxonomy rather than a hard-coded table.

This is the **first of five sequential tasks that edit `src/components/home/booking-form.tsx`**. Only one task per wave may touch that file.

## Dependencies

**Depends on:** task-01-booking-form-primitives.md, task-06-vehicle-body-types.md
**Blocks:** task-13-service-level-card.md

**Context from dependencies:**

task-01 extracted `StepCard`, `SelectedTick`, `BreakdownRow`, the `PICK_CARD_*` class constants and the vehicle glyphs into `src/components/home/booking-form-primitives.tsx`, added a `disabled?: boolean` prop to `StepCard` (defaulting to `false` and unused so far), and created `src/components/home/booking-format.ts` exporting `formatGel`. Every price in the form now renders in `₾`. Import the pick-card constants from the primitives module rather than redeclaring them — the body cards use the **same** geometry as the existing cargo and vehicle cards.

task-06 added `bodyTypes: ChassisType[]` to what `GET /api/vehicle-types` returns and to the client-side type in `src/components/home/order-vehicle-types.ts`, and exported `vehicleOffersBody(vehicle, body): boolean` from that module. `enum ChassisType { DRY_BOX REFRIGERATED OPEN_CHASSIS }`. **Use `vehicleOffersBody` — do not re-express the predicate here, and never hard-code which vehicle offers which body.**

## Files to Modify

- `src/components/home/booking-form.tsx` — step 5 (`~:1143-1219`), the state block, the vehicle memo and the invalidation effect

## Technical Details

### Implementation Steps

1. **Read `booking-form.tsx` in full first.** The regions this task touches: the `useState` block (~`:419-449`), the `eligibleVehicleTypes` memo (~`:524-531`), the quote-invalidation `useEffect` dependency array (~`:574-590`), and step 5 itself (~`:1143-1219`).

2. **State**: `const [bodyType, setBodyType] = useState<ChassisType>("DRY_BOX");` — Dry Box is the default.

3. **Picker UI**, inside the existing step 5 card, above the vehicle grid:
   - Label: `What kind of load space do you need?` — 13px/500, `mb-2.5`. The block gets `mb-[18px]` above the vehicle grid.
   - A three-column grid, `gap-2.5`, using the same pick-card geometry as the cargo and vehicle cards: `relative`, `rounded-xl`, `p-3.5`, idle `border border-line bg-ink`, selected accent border on a 6%-accent fill, with the accent `size-4` tick at `top-2.5 right-2.5`.
   - Card contents: title 13px/600; description 12px `text-muted`; then a count in `--font-price` 11px `text-muted` reading `N vehicles` — **how many vehicles offer that body for the currently selected cargo**, computed live, not hard-coded.

   | Body type | Title | Description |
   |---|---|---|
   | `DRY_BOX` (default) | Dry box | `Enclosed and weather-proof` |
   | `REFRIGERATED` | Refrigerated | `Temperature-controlled load space` |
   | `OPEN_CHASSIS` | Open chassis | `Flatbed, loadable from any side` |

4. **Control semantics — use native radios, not `aria-pressed` buttons.** The handoff specifies `<button type="button" aria-pressed>` in a `role="group"`. The form's most recent picker went the other way: the crew-size selector at `:1223-1279` uses a native `<fieldset>`/`<legend>` with `sr-only` radios, and the comment at `:1223-1227` records why — it buys arrow-key group navigation and the "3 of 4" screen-reader announcement for free. Three mutually exclusive options are textbook radio semantics. **Match the crew picker's pattern.** (The older cargo and vehicle grids use `aria-pressed`; do not change them in this task.)

5. **Filtering**: extend the `eligibleVehicleTypes` memo so a vehicle must satisfy body **and** cargo **and** weight. Use `vehicleOffersBody` from `order-vehicle-types.ts`.

6. **Reset behaviour**: changing `bodyType` resets the weight selection and the vehicle selection and invalidates the quote — exactly the reset a cargo change already performs. Add `bodyType` to the invalidation effect's dependency array.

7. **Empty state**: when body + cargo + weight together match no vehicle, replace the vehicle grid with an alert, mirroring the existing "No vehicle is currently available for these goods" alert:

   > No vehicle matches this body type for your goods and weight. Pick a different load space.

   13px accent text on an 8%-accent fill with a 30%-accent border, `rounded-lg`, `px-3.5 py-3`. Give it `role="alert"`.

8. **Fix the "Best" badge collision.** On the selected vehicle card the teal `Best` badge (currently in flow at ~`:1187-1192`) and the absolutely-positioned accent tick (~`:371-381`, now in the primitives module) both occupy the top-right. Give the badge `mr-5` while its card is selected so the two do not overlap.

9. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### House rules that apply to every task in this spec

- **Never write a `dark:` utility.** The booking page does not carry `data-landing-page`; the dark variant at `src/app/globals.css:29` is scoped to it, so dark utilities are inert here.
- Landing token utilities, not hex: `bg-ink`, `bg-surface`, `text-paper`, `text-muted`, `border-line`, accent utilities. Translate every literal in the handoff.
- `--font-price` with `tabular-nums` for every count and figure.
- British English, sentence case, no exclamation marks.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] The picker renders above the vehicle grid inside step 5, defaulting to Dry box
- [ ] It is a native `fieldset`/`legend` with `sr-only` radios, matching the crew-size picker — not `aria-pressed` buttons
- [ ] Each card shows a live `N vehicles` count for the current cargo selection
- [ ] The vehicle list filters on body **and** cargo **and** weight together
- [ ] The body predicate comes from `vehicleOffersBody`; no vehicle-name-to-body table exists in this file
- [ ] Changing body type resets weight and vehicle selection and invalidates the quote
- [ ] The no-match alert replaces the grid with the specified copy and `role="alert"`
- [ ] The `Best` badge no longer overlaps the selection tick on a selected card
- [ ] No hex literal, no inline colour `style`, no `dark:` utility in the diff
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

**No body-type surcharge.** The seeded catalogue already prices Refrigerated Van above Closed Box Van and gives Flatbed Truck its own `PricingRule`, so a surcharge would double-charge. Body type is a filter here and changes no rate.

Do not touch the crew-size picker at `:1223-1279` or `const helperCount = crewSize - 1` at `:456`. The handoff describes an older helper UI that commit `e7a7441` already superseded.
