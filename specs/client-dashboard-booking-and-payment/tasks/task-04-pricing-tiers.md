# Task 04: Service-level pricing and a three-price estimate response

## Status

complete

## Wave

1

## Description

The booking form is gaining a Priority / Regular / Pooling service-level card that shows all three prices at once. This task adds the tier arithmetic to `src/lib/pricing.ts` — where every other pricing rule already lives — and extends `POST /api/pricing/estimate` to return all three figures from a single call.

Returning all three is cheaper than three round trips (one geocode, three arithmetic results) and matches the design, which shows the three prices side by side.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-08-orders-api.md, task-13-service-level-card.md

**Context from dependencies:** None. This task touches only `src/lib/pricing.ts` and the estimate route, and shares no files with anything else in Wave 1. It deliberately does **not** depend on the schema task: the estimate endpoint persists nothing, so it needs no new columns.

## Files to Modify

- `src/lib/pricing.ts` — tier constants and a `priceForServiceLevel` helper
- `src/app/api/pricing/estimate/route.ts` — return all three tier prices

## Technical Details

### Implementation Steps

1. **Read `src/lib/pricing.ts` in full first.** Note `roundCurrency` (`:113-116`), `MAX_HELPER_COUNT = 25` region (`:46`), `parseQuoteFields` (`:166-176`) and the helper-fee line at `:276`. Everything is in GEL major units; no symbol is ever emitted from this module.

2. **Add the tier constants and helper.** They belong here, next to the existing rules — not in the component.

3. **Extend the estimate response** at `src/app/api/pricing/estimate/route.ts:97-103` to include a `serviceLevels` object alongside the existing quote fields. Keep every existing field in the response exactly as it is; this is additive so nothing downstream breaks.

4. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### Code Snippets

In `src/lib/pricing.ts`:

```ts
// Service-level tiers.
//
// The design prototype used a flat +25 for Priority. A flat fee is wrong across this
// catalogue: +25 is a 200% uplift on an MPV (₾12 minimum fare) and 28% on a trailer
// truck (₾90). Percentages scale with the job, which is what the tier is actually
// pricing.
//
// These two figures are starting values, not signed-off rates — unlike every other
// money figure in the app, which is attributed to the rate owner with a date
// (see prisma/seed.ts:254-256). Tune them here when a rate lands.
export const PRIORITY_UPLIFT = 0.25;   // +25% of the quoted fare
export const POOLING_DISCOUNT = 0.1;   // −10% of the quoted fare

export type ServiceLevelKey = "PRIORITY" | "REGULAR" | "POOLING";

/**
 * The tier's effect on an already-quoted fare, as a signed amount in GEL.
 *
 * Applied to the final fare — i.e. after the minimum-fare floor — so a Pooling
 * discount can take a job below the vehicle's minimum. That is intended: the client
 * is being paid to accept a wider window, and the floor exists to protect against
 * short-route underpricing, not against a deliberate discount.
 */
export function serviceLevelAdjustment(level: ServiceLevelKey, quotedPrice: number): number {
  if (level === "PRIORITY") return roundCurrency(quotedPrice * PRIORITY_UPLIFT);
  if (level === "POOLING") return roundCurrency(-quotedPrice * POOLING_DISCOUNT);
  return 0;
}

export function priceForServiceLevel(level: ServiceLevelKey, quotedPrice: number): number {
  return roundCurrency(quotedPrice + serviceLevelAdjustment(level, quotedPrice));
}
```

Estimate response addition:

```ts
// Alongside the existing quote fields:
serviceLevels: {
  PRIORITY: priceForServiceLevel("PRIORITY", price),
  REGULAR: price,
  POOLING: priceForServiceLevel("POOLING", price),
},
```

### API Endpoints

- `POST /api/pricing/estimate` — response gains `serviceLevels: { PRIORITY: number; REGULAR: number; POOLING: number }`. All existing fields are unchanged. Rate limiting (6/min/IP, `estimate/route.ts:16`) is unchanged.

### House rules that apply to every task in this spec

- This module never emits a currency symbol. Formatting is the component's job.
- All figures are GEL major units. Nothing is divided.
- British English in comments and copy.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] `PRIORITY_UPLIFT`, `POOLING_DISCOUNT`, `serviceLevelAdjustment` and `priceForServiceLevel` are exported from `src/lib/pricing.ts`
- [ ] `serviceLevelAdjustment` returns a positive amount for `PRIORITY`, negative for `POOLING`, and exactly `0` for `REGULAR`
- [ ] Every returned figure passes through `roundCurrency`
- [ ] `POST /api/pricing/estimate` returns a `serviceLevels` object with all three prices
- [ ] Every pre-existing field in the estimate response is unchanged
- [ ] No currency symbol appears anywhere in `src/lib/pricing.ts`
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

**Do not add a body-type surcharge.** The seeded catalogue already prices Refrigerated Van above Closed Box Van and gives Flatbed Truck its own rule, so a surcharge would double-charge. Body type is a filter over the catalogue in this feature, and changes no rate.

The client will never be trusted for a price: task 08 re-derives the adjustment server-side from the chosen level at order-create time. This task's job is only to make the three figures available for display.
