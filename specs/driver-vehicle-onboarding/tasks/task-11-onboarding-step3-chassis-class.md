# Task 11: Step 3a/3b — Cargo Body Type & Vehicle Class

## Status

complete

## Wave

4

## Description

Fills in `src/components/driver-onboarding/steps/step-3-chassis-class.tsx` — the first two of the vehicle-registration step's three sub-screens: choosing the cargo body type (3a), then the vehicle class (3b). The class the driver can pick is gated two ways: by the licence categories they selected in step 2, and by which (class, chassis) combinations actually exist in this codebase's vehicle catalogue (`task-04`'s mapping) — the second gate is new in this feature (the original design didn't need it, since its prototype had no real backing catalogue to run out of combinations against).

## Dependencies

**Depends on:** task-08-onboarding-shell.md, task-04-vehicle-classes-constant.md
**Blocks:** None

**Context from dependencies:** `useOnboardingDraft()` exposes `draft.vehicle` (`chassisType`, `classId`), `draft.licence.categories`, `updateDraft`, `goToStep`. `task-04`'s `src/lib/driver-onboarding/vehicle-classes.ts` exports `VEHICLE_CLASSES`, `isClassLockedByLicence(classId, heldCategories)`, and `resolveVehicleTypeSpecCode(classId, chassisType)` (returns `null` when that combination has no matching spec).

## Files to Modify

- `src/components/driver-onboarding/steps/step-3-chassis-class.tsx` — replace the stub with 3a + 3b as two sub-phases of this one step component.

## Technical Details

### 3a — Cargo body type

Three radio cards, each with a 172px inline SVG side view: **Dry Box** (enclosed box body), **Refrigerated Vehicle** (roof-mounted cooling unit + a snowflake glyph), **Open Chassis** (flatbed with drop sides). Author these as inline SVG line drawings directly in this component (no raster assets, no icon font — matching the design's own approach; this codebase already has `lucide-react` for ordinary icons, but these three are bespoke vehicle silhouettes, not stock icons). Required; selecting one calls `updateDraft({ vehicle: { ...draft.vehicle, chassisType } })` and clears `draft.vehicle.classId` if the previously-chosen class has no spec for the new chassis type (see 3b's lock logic below — the same clear-on-incompatibility pattern `task-10` uses for licence categories).

### 3b — Vehicle class

Four cards, from `VEHICLE_CLASSES` (`task-04`), each showing `name`, the mono `chip`, `capacityLine`, `samplesLine`. A card is locked (rendered at `0.65` opacity, red chip, unclickable-to-select but still clickable-to-explain) in either of two cases:

**Licence-category lock** (from the design, verbatim copy): `isClassLockedByLicence(classId, draft.licence.categories ?? [])` — card shows "Locked — your licence does not list category {requiredLicenceCategory}." and clicking it flashes "Add category {requiredLicenceCategory} in step 2 to drive this class."

**Chassis-availability lock** (new in this feature — the design's prototype had no real catalogue to run out of, so it never needed this case; this codebase's does, per `task-04`'s mapping table): `resolveVehicleTypeSpecCode(classId, draft.vehicle.chassisType) === null` — card shows "Locked — not offered as {chassis type label} yet." and clicking it flashes "Choose a different body type in the previous screen to unlock this class." Use the same visual treatment (opacity, red chip, flash message) as the licence lock so the two read as one consistent "locked" language, not two different UI patterns.

If both locks apply, show the licence-category message (it's the more actionable one — a chassis change alone wouldn't fix it).

Selecting an unlocked class calls `updateDraft({ vehicle: { ...draft.vehicle, classId } })`. Per the design, selecting a class also prefills payload/cargo-dimension defaults for `task-12`'s step — look up the resolved `VehicleTypeSpec` (via `resolveVehicleTypeSpecCode` + a lookup you'll need against `/api/vehicle-types` or an equivalent already-available client data source for `maxPayloadKg`/`cargoLengthM`/`cargoWidthM`/`cargoHeightM` — check `src/components/vehicle-type-select.tsx` for how the existing driver "add a vehicle" form already fetches/caches this list client-side, and reuse that pattern rather than inventing a second one) and seed `draft.vehicle.payloadKg`/`cargoLengthM`/`cargoWidthM`/`cargoHeightM` with the spec's own values as the starting point for `task-12`'s editable fields.

### Navigation

Continue from 3b calls `goToStep(<whatever step-3c's entry value is, per task-08's documented numbering scheme>)`. Both 3a and 3b require a selection before Continue is enabled — validate on Continue with the same red-border/inline-message/toast pattern as the previous steps (a chassis type or class of `null` is a validation failure, not just a disabled button, so the same "Fix the highlighted fields to continue." toast applies here too).

## Acceptance Criteria

- [ ] All three chassis body types render as 172px inline SVGs with the described silhouettes, and selecting one updates the draft.
- [ ] All four vehicle classes render with the design's exact copy (chip/capacity/samples from `task-04`'s constant).
- [ ] A class locked by licence category shows the exact copy above and the exact click-flash message.
- [ ] A class locked by chassis availability (per `task-04`'s mapping) shows a distinctly-worded but visually identical lock state.
- [ ] Selecting a class seeds `draft.vehicle`'s payload/dimension fields from the resolved spec's defaults.
- [ ] Changing the chassis type after a class was already selected clears that class if the new (class, chassis) pair has no matching spec.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Do not let a locked class be selectable by any path (including keyboard/Enter on a focused locked card) — `updateDraft` must never be called with a `classId` that's currently locked by either gate.
