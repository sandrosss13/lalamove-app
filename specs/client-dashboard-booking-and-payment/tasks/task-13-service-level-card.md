# Task 13: Service-level card, breakdown lines and bottom bar

## Status

pending

## Wave

4

## Description

A new unnumbered card between step 6 and the Price breakdown offers three mutually exclusive service levels — Priority, Regular, Pooling — each showing its own price once a quote exists. The price breakdown gains the tier lines, and the fixed bottom bar shows the selected tier's total with a `<Tier> · <Vehicle label>` caption. This task also makes `Calculate` and `Book delivery` coexist rather than swap.

**This is the second of five sequential tasks editing `src/components/home/booking-form.tsx`.**

## Dependencies

**Depends on:** task-01-booking-form-primitives.md, task-04-pricing-tiers.md, task-12-body-type-picker.md
**Blocks:** task-15-wire-stop-contacts.md

**Context from dependencies:**

task-01 extracted `StepCard`, `SelectedTick`, `BreakdownRow` and the `PICK_CARD_*` constants into `src/components/home/booking-form-primitives.tsx`, and created `src/components/home/booking-format.ts` exporting `formatGel`. All prices in the form already render in `₾`.

task-04 added to `src/lib/pricing.ts`: `PRIORITY_UPLIFT = 0.25`, `POOLING_DISCOUNT = 0.1`, `serviceLevelAdjustment(level, quotedPrice)` returning a signed GEL amount, and `priceForServiceLevel(level, quotedPrice)`. It also extended `POST /api/pricing/estimate` to return `serviceLevels: { PRIORITY: number; REGULAR: number; POOLING: number }` alongside every field it returned before.

task-12 added a `bodyType` state and picker to step 5 and added `bodyType` to the quote-invalidation effect's dependency array. Do not disturb that.

## Files to Modify

- `src/components/home/booking-form.tsx` — new card after step 6, the state block, the breakdown panel (~`:1300-1330`) and the bottom bar (~`:1400-1443`)

## Technical Details

### Implementation Steps

1. **Read `booking-form.tsx` in full first.** Note the insertion point after step 6 (~`:1287-1289`), the breakdown panel and the bottom bar.

2. **State**: `const [serviceLevel, setServiceLevel] = useState<ServiceLevel>("REGULAR");`

   **Critically: `serviceLevel` must NOT be added to the quote-invalidation effect's dependency array.** Switching tiers only re-derives the displayed price from the existing quote. Every *other* edit — route, cargo, weight, vehicle, crew size, body type — still invalidates as it does today. Add a comment saying so, because the omission looks like a bug otherwise.

3. **Card chrome**: unnumbered, matching the step cards — `rounded-[14px] border border-line bg-ink p-[22px]`. Use `StepCard` from the primitives module with no `step` prop if it supports that; otherwise match its markup.

4. **Header row**: `Service level` on the left — 11px/600, `tracking-[0.1em]`, uppercase, `text-muted`. On the right, 11px `text-muted`: `Prices appear after you calculate` before a quote exists, `Prices below are for this route` after.

5. **Grid**: three columns, `gap-2.5`, `mt-3.5`. Each card `relative flex flex-col gap-1 rounded-xl p-4 min-h-32 text-left`. Idle `border border-line bg-ink`; selected accent border on a 6%-accent fill.

6. **Control semantics — native radios, matching the crew-size picker at `:1223-1279`.** The handoff specifies `<button aria-pressed>`, but the form's most recent picker uses a `<fieldset>`/`<legend>` with `sr-only` radios for free arrow-key navigation and "2 of 3" announcements (rationale at `:1223-1227`). Three mutually exclusive options are textbook radio semantics. Match the crew picker and task-12's body picker.

7. **Card contents and copy.** Title 15px/600 `text-paper`; description 12px `leading-[1.35]` `text-muted` with `min-h-8` so the three prices sit on one baseline; price in `--font-price` 21px/600 `text-paper` `tabular-nums`, `mt-1.5`. Before a quote, the price slot shows an em dash at 15px in `text-muted/60`.

   **Use this copy, not the handoff's:**

   | Tier | Title | Description | Price |
   |---|---|---|---|
   | `PRIORITY` | Priority | `Flagged to dispatch as time-critical.` | `serviceLevels.PRIORITY` |
   | `REGULAR` | Regular | `Standard collection and delivery window.` | `serviceLevels.REGULAR` (**default**) |
   | `POOLING` | Pooling | `You accept a wider collection and delivery window.` | `serviceLevels.POOLING` |

   **Why the copy changed.** The handoff says `Match faster for quick deliveries` and `Pick up within 2h, deliver within 4h`. Nothing in the matching logic reads `serviceLevel` — dispatch is a bare `vehicleTypeSpecId` equality at `src/app/api/logistics-company/orders/[id]/dispatch/route.ts:186-193`. Shipping that copy would promise operational behaviour the platform cannot deliver. The replacements describe only what is true: the level **is** recorded on the order and **is** shown to the driver and to ops (task-09 does that). If matching is later made to honour the tiers, the copy can be strengthened then. **Do not reinstate the handoff's wording.**

8. **Corner badges** (Priority and Pooling only; Regular has none): `absolute top-2.5 right-2.5`, `size-[22px] rounded-full`, a 4%-black fill, 12px/700. `⚡` in `text-amber-500` for Priority, `%` in `text-teal-600` for Pooling. Mark them `aria-hidden` — they are decorative and the title carries the meaning. Palette utilities are correct here; the landing token set has no semantic colour.

9. **Price breakdown additions**, after the existing Distance / Transportation cost / Helper Fee rows:
   - `Regular fare` — the unmodified quoted fare
   - then exactly one of: `Priority fee` `+₾X.XX`, or `Pooling discount` `−₾X.XX` (U+2212 minus, not a hyphen). Regular adds neither.
   - `Total` — the tier-adjusted figure

   Use `BreakdownRow` from the primitives module and `formatGel` for every figure.

10. **Keep the minimum-fare note.** The form renders `Minimum fare applied for this vehicle type.` under the breakdown whenever `price` exceeds the sum of its components (~`:822-828`), because the quote is floored at the vehicle type's minimum fare. Without it the breakdown reads as bad arithmetic. Keep it in both the breakdown **and** the booked-order confirmation panel, and make sure the new tier rows do not break the condition that decides whether to show it — the note is about the *quoted* fare, so evaluate it against `price`, not against the tier-adjusted total.

11. **Bottom bar**: `ESTIMATED TOTAL` shows the **selected tier's** price. Add a caption beneath reading `<Tier> · <Vehicle label>` — e.g. `Priority · Cargo Van`. Use `·` (the house inline separator).

12. **`Calculate` → `Recalculate`**: today the two buttons swap (~`:1420-1440`). Change it so that once a quote exists, `Calculate` relabels to `Recalculate` and a `Book delivery` outline button appears **next to** it. Both remain available.

13. **Submit**: send `serviceLevel` with the order. The server re-derives the adjustment from its own quote (task-08); never send a price.

14. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### House rules that apply to every task in this spec

- **Never write a `dark:` utility.** The booking page does not carry `data-landing-page`; the dark variant at `src/app/globals.css:29` is scoped to it.
- Landing token utilities, not hex. Accent hover is the existing `--landing-accent-hover` (#b4530f); do not add `#e94f18`.
- `--font-price` with `tabular-nums` for every money figure.
- British English, sentence case, `·` as the inline separator, no exclamation marks.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] The card renders between step 6 and the price breakdown, unnumbered, with the step-card chrome
- [ ] Three tiers render as native radios in a `fieldset`/`legend`, defaulting to Regular
- [ ] Before a quote each price slot shows an em dash; after a quote each shows its own figure from `serviceLevels`
- [ ] The header's right-hand note switches between the two strings on quote state
- [ ] **The tier descriptions are the ones in the table above, not the handoff's** — no copy promises matching or a delivery window the platform does not honour
- [ ] Switching tiers does **not** invalidate the quote; every other edit still does
- [ ] `serviceLevel` is absent from the invalidation effect's dependency array, with a comment explaining why
- [ ] The breakdown shows `Regular fare`, the single tier line with a real minus sign, and `Total`
- [ ] The minimum-fare note still appears when it should, in both the breakdown and the confirmation panel
- [ ] The bottom bar shows the selected tier's total and a `<Tier> · <Vehicle label>` caption
- [ ] `Recalculate` and `Book delivery` are both visible once a quote exists
- [ ] The order submission includes `serviceLevel` and no price figure
- [ ] No hex literal, no inline colour `style`, no `dark:` utility in the diff
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

`PRIORITY_UPLIFT` and `POOLING_DISCOUNT` are unsigned-off starting values — see `../action-required.md`. Do not hard-code 25% or 10% anywhere in this component; read the prices from the estimate response.
