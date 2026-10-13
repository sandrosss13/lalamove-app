# Task 11: Vehicle step becomes a recommendation

## Status

complete (E2E verified 2026-10-13; coordinator fixed grid auto-opening during a following re-selection)

## Wave

5

## Description

Step 5 stops asking the client to pick a vehicle, and instead shows:

- the **recommended** vehicle (cheapest serviceable class that fits the load plan)
- a **one size up** option
- a **Change vehicle** disclosure containing the existing annotated grid

Business clients must explicitly choose a load space, with no default. Individuals never see that question. Step 7's crew picker suggests two people when the items call for it.

## Dependencies

**Depends on:** task-10
**Blocks:** task-12

## Files to Modify

- `src/components/home/vehicle-recommendation.tsx` — new (the two-card recommendation view)
- `src/components/home/booking-form.tsx` — step 5 and step 7 wiring
- `src/messages/en/home.json`, `src/messages/ka/home.json`

## Technical Details

### Implementation Steps

1. **Read** step 5 as task-10 left it, the `Best` badge and auto-select logic (`bestFitVehicleType`, `bookableVehicleTypes`), and the crew picker in step 7.

2. **Recommendation:** `recommendVehicles(plan, bookableVehicleTypes, bodyType)`.
   - `<VehicleRecommendation>` renders:
     - "Recommended" card: glyph, label, capacity line, quote when available
     - "One size up" card, if any, with "More room for peace of mind"
   - Same pick-card geometry; native radios in a `fieldset` (the newer house pattern).
   - Selecting either sets `vehicleTypeCode`.
   - If the recommendation is `may_not_fit`, show it with the soft warning and the alert "Your items may not all fit in one vehicle. Consider splitting the booking." No `fits` class exists in this case.
   - If nothing is bookable, keep the existing `NO_SERVICEABLE_VEHICLES` alert.

3. **Auto-select needs a new flag.** Today's effect (`booking-form.tsx:~1385-1397`) only replaces a selection that is no longer bookable. There is **no** "picked by hand" guard to keep, and without one an auto-picked MPV would stay put while the client adds a wardrobe. Add `vehicleChosenByClient: boolean`:
   - `false` (initial, and reset when the client presses "Use recommended") ⇒ the selection **follows** `recommended` as the plan changes.
   - `true` (set by any click on a vehicle card in either view) ⇒ a plan change re-annotates but **does not move** the selection. It is cleared only if it becomes `cannot_fit` or unserviceable for the body, with the reason shown, and then `vehicleChosenByClient` resets to `false`.

   Re-read the long comment above the grid. Its argument (never move a selection the client made, in a step they are not looking at) is exactly what this flag implements. Update the comment to say so.

4. **Change vehicle:** a disclosure button ("Change vehicle") reveals the existing grid unchanged from task-10. Collapsed by default. Expanded automatically if the selected class is not one of the two recommended ones. The `Best` pill moves to the recommended class.

5. **Load space:**
   - **BUSINESS:** render the existing load-space fieldset above the recommendation with **no default** (`bodyType` initial state `null` for business).
     - Step 5 is incomplete until a body is chosen; disabled reason "Choose a load space first."
     - Options incompatible with `plan` (a `requiredBody` other than this one) are disabled with "Not suitable for chilled goods" / "Your items need an open chassis".
     - Per-card counts stay.
   - **INDIVIDUAL:** no fieldset. Under the recommendation, a single muted line names the derived body: "Enclosed van or truck" / "Refrigerated vehicle" / "Open flatbed". This lets the client see why a refrigerated van was suggested.

6. **Step 7 crew hint:** when `plan.suggestedCrew === 2` and the crew size is 1, show a muted line under the crew picker: "Two people recommended for items like a fridge or wardrobe." Name the first `needsTwoPeople` item. Do not change the selection.

7. **Copy:**
   - Step 5 title "Your vehicle".
   - Step 5 description "Picked to fit your items, cheapest first. You can change it."

8. **Test in the running app:**
   - individual: recommendation appears, one size up is bigger, Change vehicle works, a manual pick survives adding a small item
   - business: cannot proceed without a load space, incompatible options disabled
   - crew hint appears for a fridge

9. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`.

### Findings from the wave-4 end-to-end run (fix in this task)

- **Premature alert:** with no items listed, step 5 (disabled) still renders "No vehicle is currently available for these items…". Show nothing but the disabled reason until a plan exists.
- **Conflict noise:** with chilled + open-chassis items listed, step 5 shows the serviceability alert ("No carrier currently runs any of these vehicle classes…") and an **empty** `role="alert"` element on top of the picker's conflict alert. When `plan.body.kind === "conflict"`, step 5 should show only its disabled reason ("Fix the item list above first."), and no empty alert may ever render.
- **Copy:** step 5 is still titled "Recommended vehicle" / "Only vehicles cleared for your items are shown, cheapest first." Replace with the copy in step 7 below.
- **Business forced body (task-10 deviation 1):** task-10 moves `chosenBodyType` to the body a line forces. With "no default" for business, start at `null` and keep that auto-move only when the forced body is unambiguous; incompatible options disabled with the reason.
- **Category note:** a sofa + 10 boxes derives `RETAIL_STOCK` (boxes outweigh the sofa; same allowed vehicle set as furniture). This is correct per task-02's tie-break; do not "fix" it.

## Acceptance Criteria

- [ ] Recommended + one size up shown; grid behind Change vehicle
- [ ] Manual selections are never moved by plan changes
- [ ] Business: load space required, no default, incompatible options disabled
- [ ] Individual: no load-space question; derived body named in one line
- [ ] Crew hint shown without changing the selection
