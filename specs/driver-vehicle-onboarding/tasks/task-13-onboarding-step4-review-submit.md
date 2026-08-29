# Task 13: Step 4 — Review & Submit

## Status

complete

## Wave

4

## Description

The wizard's last step: a read-only summary of everything collected in steps 1–3 with an Edit link back to each, and the submit action. This task also builds `POST /api/driver-profile/onboarding/submit` — the single point where every validation rule in the design's field tables is re-checked server-side (the server is authoritative; nothing the client already validated is trusted), and where `Vehicle`/`DriverLicence` rows are actually created. This same endpoint is called a second time, with no new fields, when a driver resubmits after "action required" (`task-14`'s Resubmit button) — it's create-or-update aware for exactly that reason.

## Dependencies

**Depends on:** task-08-onboarding-shell.md, task-04-vehicle-classes-constant.md
**Blocks:** task-20-onboarding-redirect-wiring.md

**Context from dependencies:** `useOnboardingDraft()` exposes the full `draft` (all three sections) and `documents`. `task-04`'s `resolveVehicleTypeSpecCode(classId, chassisType)` and `findVehicleClass(classId)` are needed both client-side (rendering the summary) and server-side (re-resolving the spec at submit).

## Files to Create

- `src/app/api/driver-profile/onboarding/submit/route.ts` — `POST`, full server-side validation + transactional write.

## Files to Modify

- `src/components/driver-onboarding/steps/step-4-review-submit.tsx` — replace the stub with the real step.

## Technical Details

### Review UI

Intro copy: "Check everything before it goes to the review team. Corrections after submission cost you a day." Four summary cards, each with an **Edit** link jumping back to the relevant step (`goToStep`):

1. **Personal information** → step 1. Rows: Name, ID number, Date of birth, Mobile, City, Profile photo ("Uploaded"/"Missing").
2. **Driver's licence** → step 2. Rows: Number, Expires, Categories (joined, e.g. "B, C"), Photos ("{n} of 2").
3. **Vehicle** → step 3a. Rows: Class (`findVehicleClass(classId).name`), Body (chassis type's display label), Make / model, Year / colour, Plate, Payload ("{n} kg"), Cargo hold ("{l} × {w} × {h} m").

Each row reads directly from `draft` — no extra fetch. CTA button: "Submit application", disabled while a submit request is in flight, calling `POST .../submit` with no body (the server reads the driver's own saved `draft`, not anything the client sends at this point — the client has nothing left to send that isn't already saved via the debounced `PATCH`). On success, `goToStep` isn't relevant anymore — the shell's own `status` (refetched after submit) switches it to the status screen automatically (`task-08`'s shell already renders `<ApplicationStatusScreen>` whenever `status !== "DRAFT"`; call `useOnboardingDraft().refetch()` after a successful submit to pick that up). On failure, show the server's `{error}` inline above the Submit button — never `alert()`.

### `POST /api/driver-profile/onboarding/submit`

Auth: session required, `role === "DRIVER"`, has a `DriverProfile` and a `DriverApplication` with `status` in (`"DRAFT"`, `"ACTION_REQUIRED"`) — 400 otherwise ("This application has already been submitted." / "This application has already been approved.", as appropriate).

**Full server-side validation**, re-running every rule from the design's field tables against the application's saved `draft` (parsed via `task-05`'s `parseOnboardingDraft`) — collect every failing field into one response rather than stopping at the first, mirroring how the client shows every invalid field at once:

- **Personal**: `fullName` splits into ≥2 non-empty words; `idNumber` matches `^[A-Za-z0-9-]{6,20}$`; `dateOfBirth` yields an age (computed from **today**, not from when the field was filled in) between 21 and 75 inclusive; `city` is a valid `GeorgianCity` value; `phone` is 10–15 digits after stripping non-digits.
- **Licence**: `licenceNumber` length ≥ 5; `expiresAt` is strictly after **now** (a resumed draft can be days old — this must be checked at submit time, not trusted from when step 2 was filled in); `categories` is a non-empty array of valid `LicenceCategory` values.
- **Vehicle**: `chassisType` and `classId` are both valid and `resolveVehicleTypeSpecCode(classId, chassisType)` is non-null (400 "This vehicle class isn't available with the selected body type." if the client somehow submitted a locked combination); the resolved class's `requiredLicenceCategory` is present in the licence's `categories` (this is the cross-check the design only enforces client-side as a "locked" card — it must be re-verified here, since a client-only lock is trivially bypassed); `make`/`model` are non-empty strings (no catalogue check — free text is allowed, per `task-12`); `year` is an integer between 1995 and `new Date().getFullYear()`; `plateNumber` (after `.toUpperCase()`) matches `.length >= 4`; `colour` is a non-empty string; `payloadKg` is between 100 and 40,000 **and** is at or above the resolved `VehicleTypeSpec.maxPayloadKg` (400 "This vehicle's declared payload is below the {class name} minimum of {n} kg." if not — this is the check that stops an under-capacity vehicle being registered under a class it can't meet, per `task-01`'s doc comment on the override columns); each of `cargoLengthM`/`cargoWidthM`/`cargoHeightM` is `> 0` and `<= 20`.
- **Documents**: all three document types (`PROFILE_PHOTO`, `LICENCE_FRONT`, `LICENCE_BACK`) have a live (`supersededAt: null`) row, and **none of them currently has `status: "FLAGGED"`** — this is the server-side half of "resubmit is disabled until every flagged document has been replaced" (the client already disables the button for this; the server must not trust that).

Any failure: `400 { error: string }` with a message naming the first problem found (matching this codebase's existing single-message error convention — see e.g. `src/app/api/driver-profile/vehicles/validation.ts`), not a field-by-field array; the client shows it inline.

**On success**, inside one `prisma.$transaction`:

```ts
const specCode = resolveVehicleTypeSpecCode(vehicle.classId, vehicle.chassisType)!; // already validated non-null
const spec = await tx.vehicleTypeSpec.findUniqueOrThrow({ where: { code: specCode } });

const vehicleData = {
  driverProfileId: driverProfile.id,
  vehicleTypeSpecId: spec.id,
  plateNumber: vehicle.plateNumber.toUpperCase(),
  make: vehicle.make,
  model: vehicle.model,
  year: vehicle.year,
  colour: vehicle.colour,
  chassisType: vehicle.chassisType,
  payloadKg: vehicle.payloadKg,
  cargoLengthM: vehicle.cargoLengthM,
  cargoWidthM: vehicle.cargoWidthM,
  cargoHeightM: vehicle.cargoHeightM,
};

// Create-or-update: a resubmission after "action required" already has a
// Vehicle row from the first successful submit.
const vehicleRow = application.vehicleId
  ? await tx.vehicle.update({ where: { id: application.vehicleId }, data: vehicleData })
  : await tx.vehicle.create({ data: vehicleData });

await tx.driverLicence.upsert({
  where: { driverProfileId: driverProfile.id },
  create: {
    driverProfileId: driverProfile.id,
    licenceNumber: licence.licenceNumber,
    expiresAt: new Date(licence.expiresAt),
    categories: licence.categories,
  },
  update: {
    licenceNumber: licence.licenceNumber,
    expiresAt: new Date(licence.expiresAt),
    categories: licence.categories,
  },
});

await tx.driverProfile.update({
  where: { id: driverProfile.id },
  data: {
    idNumber: personal.idNumber,
    dateOfBirth: new Date(personal.dateOfBirth),
    city: personal.city,
    phone: personal.phone,
  },
});

const now = new Date();
await tx.driverApplication.update({
  where: { id: application.id },
  data: {
    status: "PENDING",
    vehicleId: vehicleRow.id,
    draft: null,
    firstSubmittedAt: application.firstSubmittedAt ?? now,
    lastSubmittedAt: now,
    submissionCount: { increment: 1 },
  },
});
```

Catch a `Vehicle.plateNumber` unique-constraint violation using the existing `isDuplicatePlateError` helper (`src/app/api/driver-profile/vehicles/validation.ts`) around the transaction and return a readable `409 { error: "This plate number is already registered to another vehicle." }` instead of a raw Prisma error.

Response `200 { status: "PENDING" }` on success.

## Acceptance Criteria

- [ ] The review step renders all three summary cards with the exact rows above, each Edit link returning to the right step.
- [ ] Submitting a complete, valid draft moves the application to `PENDING`, creates exactly one `Vehicle` and one `DriverLicence` row, and clears `draft`.
- [ ] Every validation rule listed above is enforced server-side even when the client-side equivalent was bypassed (verify at least the licence-category-vs-class cross-check and the payload-vs-spec-minimum check, since both only exist as UI locks on the client).
- [ ] Submitting a second time after "action required" (with `application.vehicleId` already set) updates the existing `Vehicle`/`DriverLicence` rows rather than creating duplicates.
- [ ] Submitting while any live document is still `FLAGGED` is rejected with 400.
- [ ] A duplicate plate number returns a readable `409`, not a raw database error.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This endpoint is also what `task-14`'s "Resubmit" button on the status screen calls — that task documents the same contract independently; you don't need to coordinate with it beyond what's specified here.
