# Task 10: Step 2 — Licence Verification

## Status

complete

## Wave

4

## Description

Fills in `src/components/driver-onboarding/steps/step-2-licence.tsx`. Collects the driver's licence front/back photos, licence number, expiry date, and held categories (B/C/CE) — the categories are what gates which vehicle class the driver may pick in step 3.

## Dependencies

**Depends on:** task-08-onboarding-shell.md, task-06-onboarding-documents-api.md
**Blocks:** None

**Context from dependencies:** `useOnboardingDraft()` exposes `draft.licence`, `updateDraft({ licence: {...} })`, `documents`, `goToStep`, `showToast`. `<DocumentUploadDialog slot="licFront" | "licBack">` handles both licence photo uploads via `task-06`'s endpoints, identically to how `task-09` uses it for the profile photo.

## Files to Modify

- `src/components/driver-onboarding/steps/step-2-licence.tsx` — replace the stub with the real step.

## Technical Details

### Layout and fields (from `design_handoff_driver_onboarding/README.md`)

Intro copy: "Scans or photos both work. All four corners must be visible and free of glare." Two upload slots side by side, front and back, each a 104px preview tile + a status line ("Not uploaded" / "Uploaded"), opening `<DocumentUploadDialog slot="licFront">` / `slot="licBack">` respectively.

| Field | Control | Validation |
|---|---|---|
| Licence number | mono text input | required, min 5 characters |
| Expiry date | `date` input | required; must be in the future — error copy exactly: "This licence has expired. Renew it before applying." |
| Categories held | 3 checkbox cards | at least one required |

Category cards, exact copy:

```
B  — "Cars and vans up to 3.5 t"
C  — "Rigid trucks over 3.5 t"
CE — "Truck with trailer / articulated"
```

Build as toggleable cards (not `src/components/ui/checkbox.tsx`'s bare checkbox alone — wrap it in a card following the same button-card visual pattern `sign-up-form.tsx` already uses for its account-type choices, with the checkbox as the selected/unselected indicator inside it).

### Deselecting a category clears an incompatible vehicle class

Per the design: if the driver already picked a vehicle class in step 3 (`draft.vehicle.classId` is set) and then deselects the category that class requires, the vehicle class selection must be cleared — a driver can't keep a class selected that their current licence no longer supports. On every categories change:

```ts
import { isClassLockedByLicence } from "@/lib/driver-onboarding/vehicle-classes";

function handleCategoriesChange(nextCategories: LicenceCategory[]) {
  const currentClassId = draft.vehicle?.classId;
  const shouldClearClass =
    currentClassId && isClassLockedByLicence(currentClassId, nextCategories);

  updateDraft({
    licence: { ...draft.licence, categories: nextCategories },
    ...(shouldClearClass ? { vehicle: { ...draft.vehicle, classId: undefined } } : {}),
  });
}
```

(`isClassLockedByLicence` is exported from `task-04`'s `src/lib/driver-onboarding/vehicle-classes.ts`.)

### Validation timing

Same as `task-09`: on Continue, not on blur; failing fields get a red border + inline message; toast "Fix the highlighted fields to continue." on failure. Continue with everything valid calls `goToStep(3)` (or whatever step-3-entry value `task-08`'s shell documented for the chassis/class sub-step — read the top-of-file comment in `onboarding-wizard-shell.tsx` for the exact numbering it chose).

## Acceptance Criteria

- [ ] Both licence photo slots open the shared upload dialog and reflect "Uploaded" once their respective document exists.
- [ ] Licence number, expiry, and at-least-one-category are all enforced on Continue with the exact expired-licence error copy above.
- [ ] Deselecting a category that a currently-selected vehicle class requires clears that class selection in the draft.
- [ ] All fields survive a page reload via the draft.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This step does not re-validate expiry against "now" at submit time — that's `task-13`'s server-side job (a resumed draft can be days old, so the client-side "future" check here is a UX convenience, not the authoritative one).
