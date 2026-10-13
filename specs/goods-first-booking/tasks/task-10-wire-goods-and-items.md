# Task 10: Wire goods shortcuts and the item list into the booking form

## Status

complete (E2E verified 2026-10-13: individual items, business pallets, ?goods=chilled, legacy path)

## Wave

4

## Description

Switch the booking form's steps 3, 4 and 6 to the goods-first flow:

- **Step 3** "What are you moving?" shows goods shortcuts instead of cargo-category cards.
- **Step 4** "What are you moving?" / "List your items" mounts the item list picker instead of the weight-bracket select.
- **Step 6** loses its four number fields; handling tags arrive pre-selected from the items.
- Submission sends `items[]`.

The vehicle step's filtering switches from the weight bracket to the load plan. Its presentation is left for task-11.

## Dependencies

**Depends on:** task-04, task-06, task-09
**Blocks:** task-11

## Files to Modify

- `src/components/home/booking-form.tsx`
- `src/messages/en/home.json`, `src/messages/ka/home.json`

## Technical Details

### Implementation Steps

1. **Read `booking-form.tsx` in full first.** It is long, and its comments carry decisions you must not undo. Regions:
   - **State:** `cargoCategory`, `maxWeightKg` (~`:1065`), the cargo number fields and touched state (~`:442-710`), `handlingTags` (~`:1153`).
   - **Memos:**
     - `cargoEligibleVehicleTypes` (~`:1220`)
     - `weightOptions` and its auto-select effect (~`:1234-1250`)
     - `bodyTypeCards`
     - `eligibleVehicleTypes` (~`:1288`)
     - `bookableVehicleTypes`
     - `bestFitVehicleType`
   - **Gating:** `goodsStepEnabled`, `weightStepEnabled`, `vehicleStepEnabled`, `cargoStepEnabled`, and the `*_KEY` disabled reasons (~`:800-830`).
   - **Steps 3–6 JSX** (~`:2518-3490`).
   - **Quote invalidation** effect and **submit payload** (~`:2044`).

2. **State changes:**
   - Add `goodsShortcut` (initialised from the `initialGoods` prop), `loadMode` (`"items"` | `"pallets"`) and `itemLines`.
   - Remove `maxWeightKg` and the four cargo number fields with their touched/blocking state.
   - `cargoCategory` state becomes a **derived** value: `plan?.cargoCategory`.
   - `plan = useMemo(() => planLoad(activeLines.map(toLoadLine)), …)`.

3. **Step 3:** replace the `CARGO_OPTIONS` grid with `shortcutsFor(accountType)` cards, using the same pick-card geometry. Keep `aria-pressed` buttons here, matching the grid it replaces. Selecting a shortcut sets `goodsShortcut` and, for `pallets`, `loadMode = "pallets"`. It **does not clear** lines already listed: switching from Furniture to Appliances just scrolls the picker. Copy: title "What are you moving?", description "Pick the closest match — you'll list the items next."

4. **Step 4:** title "List your items", description "Rough is fine. We use it to pick a vehicle that fits." Mount `<ItemListPicker>` with the catalogue from `useItemCatalogue`.

5. **Vehicle filtering:**
   - `cargoEligibleVehicleTypes` filters by `plan.cargoCategory` (no plan ⇒ empty list, step closed).
   - `eligibleVehicleTypes` filters by body only. Remove the `maxWeightKg` clause and the weight bracket.
   - The per-card unfit annotation that used `declaredCargoEnvelope` now uses `assessFit(plan, spec)`:
     - `cannot_fit` ⇒ disabled in place with the hard-axis reason (reuse `cargoFitCardReason`).
     - `may_not_fit` ⇒ selectable, with the soft warning line.
   - Keep the long comment's reasoning about annotating instead of filtering; update its wording where it describes step order. The "step 5 comes before step 6" problem it describes no longer exists, because the load is known before the vehicle step. Say so.
   - Body for **individuals:** `bodyType` is driven from `plan.body` and the load-space fieldset is hidden. Task-11 finalises this. In this task, just stop rendering the fieldset for individuals and set `bodyType` from the plan.
   - **Serviceability is per body.** Use task-06's `serviceableBodies` (`vehicleType.serviceableBodies.includes(bodyType)`) wherever the form now reads `serviceable`: `bookableVehicleTypes`, the no-carriers card reason and auto-select. Otherwise the form recommends a class the server refuses.

6. **Step 6:** remove the weight/size fieldset and its blocking line.
   - **"Item quantity" input:** hide it in items mode (the server writes the item summary there). Keep it in pallets mode, relabelled "What's inside" ("96 cartons"). See task-06 step 7.
   - Handling tags: when `plan.handlingTags` changes, **add** newly implied tags to the selection; never remove a tag the client chose. Track "implied by items" separately so removing an item can drop a tag it alone implied, unless the client toggled it.
   - The cold-chain warning that compares `handlingTags` against `bodyType` stays.

7. **Gating:**
   - Rename `weightStepEnabled` → `itemsStepEnabled` (same predicate as goods).
   - `vehicleStepEnabled` requires `plan !== null && plan.body.kind === "derived"`.
   - Update the disabled-reason keys: "List at least one item first" replaces `weightUnavailable` where that applied.
   - Read task-17's gating notes in `specs/client-dashboard-booking-and-payment/tasks/task-17-progressive-gating.md` before editing.

8. **Quote invalidation:** add `itemLines`, `loadMode` and `goodsShortcut` to the dependency array, replacing `maxWeightKg` and the cargo numbers.

9. **Submit:** send `items` (active mode's lines in task-06's shape). Stop sending `cargoWeightKg/LengthM/WidthM/HeightM`. **Keep sending `cargoCategory`** as `plan.cargoCategory`: the shared `parseQuoteFields` requires it, and the server overwrites it with its own derivation (task-06 step 3). The same `plan.cargoCategory` goes to `/api/pricing/estimate`. Keep `packagingDescription`, `handlingTags`, `bodyType` (the server ignores it for individuals).

10. Remove now-dead code: `weightOptions`, `CARGO_WEIGHT_FIELD` and siblings, unused message keys (from both locales, so the i18n spec stays green), unused imports.

11. **Test in the running app** (the `run` skill, or Playwright against `pnpm dev`):
    - An individual books a sofa + 10 boxes end to end.
    - A business books 4 EUR pallets.
    - `?goods=chilled` opens on the chilled group and yields a refrigerated body.
    - Check the created `Order` and `OrderItem` rows in the database.

12. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`.

## Acceptance Criteria

- [ ] Step 3 shows shortcuts; step 4 shows the item list; no weight bracket remains
- [ ] Step 6 has no number fields; implied handling tags are pre-selected without overriding the client
- [ ] Vehicle cards are annotated by `assessFit`; hard misfits disabled, soft misfits warned
- [ ] Orders submit `items[]` and are created with derived figures
- [ ] Dead code and message keys removed from both locales
