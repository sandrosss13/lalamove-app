# Task 15: Application Status Screen

## Status

pending

## Wave

4

## Description

Fills in `src/components/fleet-onboarding/fleet-application-status-screen.tsx`, which exports `FleetApplicationStatusScreen` — what a logistics company sees after submitting, in each of the three post-submit states: pending review, action required, and approved. `task-09` creates that file as a stub and its shell already renders the component instead of any wizard step whenever `status !== "DRAFT"`, so this task owns only the component's body.

This is the surface where per-vehicle review actually shows its value. Unlike the driver flow's status screen, which reports one verdict on one application, this one carries a company-level verdict *and* a verdict per vehicle, and it must make clear that the two move independently: a flagged vehicle is fixed on its own without disturbing the rest of the fleet, and vehicles already approved keep their verdict across a resubmission.

## Dependencies

**Depends on:** task-09-fleet-wizard-shell.md, task-10-step1-company-details.md, task-12-step3-vehicle-specifications.md, task-14-step5-review-submit.md
**Blocks:** task-21-dispatch-gate-and-redirect.md

`task-12` because the per-vehicle **Fix** button mounts that task's `VehicleEditorDialog`, imported from `src/components/fleet-onboarding/vehicle-editor-dialog.tsx`. `task-10` because the **Fix company details** button mounts that task's `CompanyDetailsForm` in correction mode. `task-14` because this screen is the sole consumer of both of its endpoints — the resubmit `POST` and the per-vehicle correction `PATCH`. All four are wave 4 and land together; if this task is built first, write it against the contracts restated below.

**Context from dependencies:**

### `useFleetDraft()` — from `task-09` (`src/components/fleet-onboarding/fleet-draft-context.tsx`)

The wizard's single data hook; throws outside `FleetDraftProvider`. This component takes **zero props** and reads everything from it. The full surface, verbatim:

```ts
export const FLEET_SCREENS = {
  company: 1, fleet: 2, vehicles: 3, drivers: 4, review: 5,
} as const;

/** One vehicle's review row, as `task-05`'s GET returns it. */
export type FleetVehicleVerdict = {
  /** `BusinessApplicationVehicle.id` — what task-18's admin verdict mutations address. */
  id: string;
  /** `Vehicle.id` — what task-15's Fix PATCH is keyed on. Null if the vehicle was removed. */
  vehicleId: string | null;
  /** 1-based, derived from `createdAt` ordering. Not a column. */
  position: number;
  status: "PENDING" | "APPROVED" | "FLAGGED";
  flagReason: string | null;
  chassisType: FleetDraftChassisType;
  vehicleClass: FleetDraftVehicleClassId;
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  colour: string | null;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  driver: {
    driverProfileId: string;
    name: string;
    phone: string;
    categories: ("B" | "C" | "CE")[];
  } | null;
};

export type FleetSubmittedSummary = {
  companyName: string;
  vatId: string;
  registeredAddress: string;
  city: string;
  citiesOfOperation: string[];
  contactName: string;
  contactRole: string;
  contactEmail: string;
  phone: string;
  /** Masked to the last four characters, e.g. "•••• •••• •••• 4821". */
  bankAccountIban: string;
  vehicleCount: number;
  countsByBodyType: Record<string, number>;
};

export type FleetDraftState = {
  loading: boolean;
  loadError: string | null;
  saveError: string | null;
  saving: boolean;
  status: "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED" | null;
  reference: string | null;
  companyReviewStatus: "PENDING" | "VERIFIED" | "FLAGGED" | null;
  companyFlagReason: string | null;
  vehicleVerdicts: FleetVehicleVerdict[];
  submittedSummary: FleetSubmittedSummary | null;
  draftStep: number;
  draftUpdatedAt: string | null;
  draft: FleetDraftV1;
  updateDraft: (patch: Partial<FleetDraftV1>) => void;
  goToStep: (step: number) => void;
  refetch: () => Promise<void>;
  resetApplication: () => Promise<boolean>;
  showToast: (message: string, tone?: "default" | "error") => void;
};

export function useFleetDraft(): FleetDraftState;
```

This screen reads `status`, `reference`, `companyReviewStatus`, `companyFlagReason`, `vehicleVerdicts`, `submittedSummary`, `refetch` and `showToast`. It never calls `updateDraft` or `resetApplication`, and it never calls **`goToStep`** — both Fix affordances are dialogs rendered over this screen, because the shell renders it for every non-`DRAFT` status and navigating away is impossible by design.

**`FleetVehicleVerdict` carries two different ids and they are not interchangeable.** `id` is the `BusinessApplicationVehicle` row — the review verdict, which is what `task-18`'s admin mutations address. `vehicleId` is the `Vehicle` itself, and it is **`vehicleId` that the Fix `PATCH` is keyed on**. It is `null` when the vehicle has been removed from the fleet through an unrelated flow (the FK is `SetNull`, so the verdict row survives its vehicle); such a row is unfixable and renders without a Fix button — see the table below.

The verdict also carries the vehicle's full spec — `make`, `model`, `year`, `colour`, `payloadKg` and the three cargo dimensions — which is what lets the Fix editor open pre-filled without a second fetch.

`submittedSummary` is `task-05`'s `GET` field, built from the normalized rows rather than the draft, with `bankAccountIban` already masked to its last four characters. **`task-09`'s `FleetDraftState` must expose it** — it is listed in that task's hook surface for this reason; if it is missing when this task starts, add it there rather than fetching separately, so there stays exactly one loader.

The shell polls in the background while `status` is `PENDING` or `ACTION_REQUIRED` (`STATUS_POLL_INTERVAL_MS = 25_000`, silent mode — it never flips `loading` or `loadError`), so this screen updates itself when an admin decides something. Do not add a second poller.

### `POST /api/logistics-company/onboarding/submit` — from `task-14`

No request body. On the `ACTION_REQUIRED` path it re-checks that nothing flagged remains and that every pairing is still valid, then sets the application back to `PENDING` **without touching any `BusinessApplicationVehicle` row** — approved vehicles keep their verdict. `200 { status: "PENDING", reference }`, or `400 { error }` with the first problem. The refusals this screen can provoke:

- `Fix the {n} flagged vehicle{s} before resubmitting.`
- `Correct the flagged company details before resubmitting.`
- `Vehicle {plate} has no driver. Every vehicle needs a named driver.`
- `{fullName}'s licence has expired. Renew it before submitting.`
- `{fullName}'s licence does not list category {required}, which the {className} class requires.`
- `{fullName} is assigned to two vehicles. Each driver can hold one vehicle.`

### `PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]` — from `task-14`

What the **Fix** button writes through. **Keyed on the `Vehicle` id — `FleetVehicleVerdict.vehicleId`, never `FleetVehicleVerdict.id`.** `id` is the `BusinessApplicationVehicle` row and belongs to the admin routes; sending it here is a 404 `Vehicle not found.` A verdict whose `vehicleId` is `null` has no vehicle left to correct and cannot be sent at all. The URL is built as:

```ts
`/api/logistics-company/onboarding/vehicles/${verdict.vehicleId}`
```

Accepts `classId`, `chassisType`, `make`, `model`, `year`, `plateNumber`, `colour`, `payloadKg`, `cargoLengthM`, `cargoWidthM`, `cargoHeightM`; ignores anything else, and never reads a client-sent `vehicleTypeSpecId`. Refuses with 400 unless the application is `ACTION_REQUIRED` (`This application isn't open for corrections.`) and the row is `FLAGGED` (`This vehicle wasn't flagged for correction.`); 404 `Vehicle not found.` for a vehicle owned by another company. **On success it clears that vehicle's flag in the same transaction** — `status` back to `PENDING`, `flagReason` and `decidedAt` to `null`. That is the mechanism the Resubmit button's enablement depends on; this screen never clears a flag itself.

## Files to Modify

- `src/components/fleet-onboarding/fleet-application-status-screen.tsx` — replace `task-09`'s stub with the real component, keeping its named export `FleetApplicationStatusScreen`. The unprefixed `application-status-screen.tsx` / `ApplicationStatusScreen` does not exist in this feature; do not create it, and do not rename the file the shell already imports.

## Technical Details

### Header (all three states)

The mono application `reference` (`font-price`, e.g. `BIZ-40219`) beside the company name from `submittedSummary.companyName`, then one status card whose contents branch on `status`. This component never renders anything for `status === "DRAFT"` — the shell only mounts it once the application has been submitted at least once — so a `null`/`"DRAFT"` status returns `null` defensively rather than rendering an empty card.

### Fleet status table (rendered in all three states, below the status card)

One row per entry in `vehicleVerdicts`, ordered by `position`:

| Column | Content |
|---|---|
| `#` | `position`, `font-price` |
| Vehicle | class name + body short label, e.g. "Medium Truck · Refrigerated" |
| Plate | `plateNumber ?? "—"`, `font-price uppercase` |
| Driver | `driver?.name ?? "—"`, with `driver.categories.join(", ")` under it when present |
| Reason | `flagReason ?? "—"` — only ever populated on a flagged row |
| Status | a chip: Approved / Flagged / Pending |
| — | a red **Fix** button, rendered only when `status === "FLAGGED" && vehicleId !== null` |

Chip colours use the existing tokens, not raw hex: approved `text-[oklch(0.5_0.13_145)]` on a matching tint, flagged `text-destructive`, pending amber `text-[oklch(0.62_0.15_70)]`. Give the table an `overflow-x-auto` wrapper — it has seven columns and must not make the page scroll sideways.

**A verdict with `vehicleId === null`** is a row whose `Vehicle` was removed from the fleet through an unrelated flow; the `SetNull` FK keeps the verdict so the history is not lost. Render the row exactly like any other — its `#`, class, body, stored plate, reason and chip all still read from the verdict itself — but with **no Fix button**, since there is nothing left to `PATCH`. Put `Vehicle no longer on file` in the Plate cell in `text-muted-foreground` in place of a plate. Such a row still counts toward the outstanding total if it is `FLAGGED`, which correctly leaves Resubmit disabled: the server would refuse anyway, and the company needs to contact support rather than click a button that cannot work.

**Fix** opens `task-12`'s 640px `VehicleEditorDialog`, imported as a named export from `src/components/fleet-onboarding/vehicle-editor-dialog.tsx` — never duplicated, and never lifted out of the step file at call time. Seed its `initial: VehicleEditorValues` straight from the verdict, which carries every field it needs:

```ts
const initial: VehicleEditorValues = {
  make: verdict.make ?? "",
  model: verdict.model ?? "",
  prefillSource: null,          // this is a correction, not a fresh prefill
  year: verdict.year ?? undefined,
  plateNumber: verdict.plateNumber ?? "",
  colour: verdict.colour ?? "",
  payloadKg: verdict.payloadKg ?? undefined,
  cargoLengthM: verdict.cargoLengthM ?? undefined,
  cargoWidthM: verdict.cargoWidthM ?? undefined,
  cargoHeightM: verdict.cargoHeightM ?? undefined,
};
```

Pass `classId={verdict.vehicleClass}` and `chassisType={verdict.chassisType}`, and an `otherPlates` map built from the **other** verdicts' non-null plates (uppercased, keyed to their `position`) so the dialog's in-fleet duplicate check still works here. `prefillSource` starts `null` because nothing was prefilled from the reference table on this pass; picking a model inside the dialog sets it as usual, and the field is not sent to the server either way.

`onSave` `PATCH`es `/api/logistics-company/onboarding/vehicles/{verdict.vehicleId}` and returns `false` on failure so the dialog stays open — that is what the dialog's `saveError` and `saving` props are for, and this is the caller that passes both. On success: call `refetch()` and raise `showToast("Vehicle updated. Resubmit when every flagged item is fixed.")`. On failure, surface the server's `{ error }` inline in the dialog via `saveError` — never `alert()`.

A flagged row must remain visibly flagged until `refetch()` returns; do not optimistically clear the chip, because the server is what actually cleared the flag and an optimistic clear would enable Resubmit against state the server may have rejected.

### `status === "PENDING"`

Amber. Title "Fleet under review". Body, verbatim:

> Fleet under review. Our team is checking the company registration, then each vehicle and its driver. Vehicles are cleared individually — you can start dispatching as soon as the company is approved and at least one vehicle passes.

Footnote: "Typical review time is 24–48 hours for a fleet this size."

Show the company-level state alongside it as its own row — "Company registration: verified" once `companyReviewStatus === "VERIFIED"`, "in review" while `PENDING` — because the copy above promises the company clears separately and a company already verified should be able to see that.

No Resubmit button in this state.

### `status === "ACTION_REQUIRED"`

Red border. Compute:

```ts
const flaggedVehicles = vehicleVerdicts.filter((v) => v.status === "FLAGGED");
const companyFlagged = companyReviewStatus === "FLAGGED";
```

**Title.** The design names two titles — "Company details need correcting" and "2 vehicles need correcting" — but does not say what happens when both are flagged at once, which the admin drawer plainly allows. The rule, an explicit extension:

- company flagged, no vehicles flagged → `Company details need correcting`
- vehicles flagged, company not → `` `${n} vehicle${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} correcting` ``
- both → `` `Company details and ${n} vehicle${n === 1 ? "" : "s"} need correcting` ``

Body, verbatim: "The rest of the fleet is unaffected and stays in review. Fix what is flagged below and resubmit — approved vehicles keep their verdict."

**Company block.** When `companyFlagged`, render a card above the table showing `companyFlagReason` and a **Fix company details** button.

That button opens a **dialog**, exactly like the per-vehicle Fix button — it does **not** call `goToStep`. This is load-bearing and easy to get wrong: `task-09`'s shell renders `FleetApplicationStatusScreen` for *every* non-`DRAFT` status and its rail entries raise a toast instead of navigating, so `goToStep(FLEET_SCREENS.company)` in `ACTION_REQUIRED` would change `draftStep` and render nothing. The company block would be permanently uncorrectable, `companyFlagReason` would never clear, and `task-14`'s resubmit would refuse forever — the exact deadlock `task-06` §6 exists to prevent, one layer up.

The dialog mounts `task-10`'s company form in its correction mode (`CompanyDetailsForm`, exported from `src/components/fleet-onboarding/steps/step-1-company-details.tsx` — see `task-10` §8, which specifies the whole mode: it seeds from `submittedSummary` rather than the draft, holds edits in local state because the context's `persist` bails on non-`DRAFT`, and seeds `bankAccountIban` empty because the summary value is masked). Save posts to `POST /api/logistics-company`, which clears `companyReviewStatus` and `companyFlagReason` in the same transaction — same principle as the per-vehicle path: the server clears the flag, not the client. On success, close the dialog, `showToast("Company details updated.")` and `await refetch()`.

Both Fix affordances on this screen are therefore dialogs over the status screen, and the screen never navigates away from itself.

**Resubmit.** A primary button labelled with what remains:

- enabled only when `flaggedVehicles.length === 0 && !companyFlagged`
- while anything is outstanding, label it `` `Resubmit (${flaggedVehicles.length + (companyFlagged ? 1 : 0)} to fix)` `` and keep it `disabled`
- when clear, label it `Resubmit application`

On click: `POST /api/logistics-company/onboarding/submit` with no body. On `200`, call `refetch()` — the shell shows the `PENDING` state once `status` updates. On failure, read `{ error }` through the shared `readErrorMessage` helper and show it inline above the button; a `400` here means the server disagrees that everything is fixed, which is exactly the case the disabled state cannot be trusted to prevent (the poll may have picked up a new flag between render and click).

Footnote: "Resubmitted applications are usually reviewed within 4 hours."

### `status === "APPROVED"`

Green. Title "Your fleet is live."

A summary card built from `submittedSummary`: `companyName`, `vatId`, `citiesOfOperation` (city labels joined with `", "`), the already-masked `bankAccountIban`, `vehicleCount`, and the per-body-type counts from `countsByBodyType`. The fleet status table below it will show every vehicle as Approved except any the admin left flagged at activation — activation requires every vehicle *decided*, not every vehicle approved, so a flagged vehicle can legitimately survive into an approved fleet. Render those rows normally, without a Fix button (the application is no longer open for corrections), and add a line under the table when at least one exists: "Flagged vehicles cannot be dispatched. Contact support to have one re-reviewed."

CTA: a green **"Open the dispatch dashboard"** button that does `router.push("/dashboard")` + `router.refresh()`.

Footnote: "Licences and cooling-unit records are re-checked 30 days before expiry."

### Chrome

The component renders inside `task-09`'s `Surface`, which already carries `data-onboarding-surface`, so `src/components/ui` primitives resolve correctly — do not re-declare it here. Cards use the wizard's radii (12–14px). The status card animates in with the shell's `fadeUp`. Use `font-price` (IBM Plex Mono) for the reference, plates, counts and the `#` column, `font-body` everywhere else.

## Acceptance Criteria

- [ ] All three states render with the exact copy above, including the correctly pluralised action-required title in all three of its cases (company only, vehicles only, both).
- [ ] The fleet status table lists every vehicle with its own chip and shows a flag reason only on flagged rows.
- [ ] The component lives at `src/components/fleet-onboarding/fleet-application-status-screen.tsx` and is exported as `FleetApplicationStatusScreen`.
- [ ] **Fix** appears only on flagged rows **that still have a `vehicleId`**, opens `task-12`'s `VehicleEditorDialog` imported from `vehicle-editor-dialog.tsx` and seeded from the verdict's own `make` / `model` / `year` / `plateNumber` / `colour` / `payloadKg` / `cargoLengthM` / `cargoWidthM` / `cargoHeightM`, and writes through `PATCH /api/logistics-company/onboarding/vehicles/{verdict.vehicleId}` — keyed on `vehicleId`, never on `id`.
- [ ] A verdict with `vehicleId === null` renders as a normal row with no Fix button and `Vehicle no longer on file` in place of a plate.
- [ ] A vehicle's chip changes from Flagged to Pending only after `refetch()` returns — never optimistically.
- [ ] Resubmit is disabled while any vehicle is flagged or the company block is flagged, its label counts the outstanding items, and it enables the moment the last one is cleared.
- [ ] Resubmit posts with no body and surfaces a server `{ error }` inline on failure rather than in an `alert()`.
- [ ] A company-level flag shows its reason and a **Fix company details** button that opens a dialog mounting `CompanyDetailsForm` in correction mode — it does not call `goToStep`, and the screen does not attempt to clear `companyFlagReason` itself.
- [ ] The approved state renders the summary from `submittedSummary` — `bankAccountIban` arrives already masked and is never re-derived here — and shows the flagged-vehicle footnote only when a flagged vehicle survived activation.
- [ ] The screen updates from the shell's existing 25s poll with no second poller added.
- [ ] The table scrolls inside its own container rather than making the page scroll horizontally.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This component never renders for `status === "DRAFT"`; the shell only mounts it after a first submit.
- Approved vehicles keeping their verdict across a resubmission is `task-14`'s guarantee, not something this screen enforces — but the copy promises it to the company, so if that behaviour regresses this is where it will be noticed.
- The per-vehicle correction endpoint deliberately lives in `task-14`, not here, because it shares the submit validator; duplicating that validator is how the two would drift apart.
- **The two ids on a verdict are the single easiest thing to get wrong on this screen.** `FleetVehicleVerdict.id` is a `BusinessApplicationVehicle` row and is what the admin routes in `task-18` address; `FleetVehicleVerdict.vehicleId` is the `Vehicle` and is what this screen's `PATCH` is keyed on. They are different values on every row, and swapping them produces a 404 rather than a type error, so it will not be caught by `pnpm typecheck`.
- The vehicle editor dialog is `task-12`'s file and `task-12`'s contract. Do not fork it, do not re-declare `VehicleEditorValues`, and if it needs a prop this screen requires that step 3 does not, add the prop there rather than copying the component.
