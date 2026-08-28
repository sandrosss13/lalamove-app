# Task 05: Onboarding Draft & Status API

## Status

pending

## Wave

2

## Description

This is the read/write backbone the entire driver-facing wizard is built on: one endpoint that returns everything the wizard or the status screen needs to render (which of the two to show is `status`-driven), a save endpoint for the in-progress draft, and a reset endpoint for "Start a new application". Every wizard-side task in wave 4 (`task-09` through `task-14`) calls these three endpoints — none of them build their own.

## Dependencies

**Depends on:** task-01-schema-migration.md (needs `DriverApplication`, `DriverApplicationDocument`, `DriverLicence`), task-03-driver-document-storage.md (needs `getDriverDocumentSignedUrls` to resolve document thumbnails)
**Blocks:** task-08-onboarding-shell.md

**Context from dependencies:** `task-01`'s `DriverApplication` has `status`/`draft`/`draftStep`/`draftUpdatedAt`/`reference`/`vehicleId`, 1:1 on `DriverProfile`. `DriverApplicationDocument` rows are versioned — only the row with `supersededAt: null` for a given `(driverApplicationId, type)` is live. `task-03`'s `getDriverDocumentSignedUrls(paths: string[])` returns a `path -> signedUrl` map.

## Files to Create

- `src/app/api/driver-profile/onboarding/route.ts` — `GET` (read/auto-create), `PATCH` (save draft)
- `src/app/api/driver-profile/onboarding/reset/route.ts` — `POST` (start a new application)
- `src/lib/driver-onboarding/draft-schema.ts` — the versioned draft shape + a hand-written parser (Prisma types `Json` as `JsonValue`; never `as`-cast it)

## Technical Details

### `src/lib/driver-onboarding/draft-schema.ts`

The whole in-progress wizard, held as one object across all four steps. Every field is optional — the client sends whatever it has filled in so far on every save (whole-object replace, not a merge).

```ts
export type OnboardingDraftV1 = {
  version: 1;
  personal?: {
    phone?: string;
    fullName?: string;
    idNumber?: string;
    dateOfBirth?: string; // ISO date string
    city?: string; // GeorgianCity enum value
  };
  licence?: {
    licenceNumber?: string;
    expiresAt?: string; // ISO date string
    categories?: ("B" | "C" | "CE")[];
  };
  vehicle?: {
    chassisType?: "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS";
    classId?: "SMALL_VAN" | "LARGE_VAN" | "MEDIUM_TRUCK" | "HEAVY_FREIGHT_TRUCK";
    make?: string;
    model?: string;
    year?: number;
    colour?: string;
    plateNumber?: string;
    payloadKg?: number;
    cargoLengthM?: number;
    cargoWidthM?: number;
    cargoHeightM?: number;
  };
};

/** Parses a Prisma `JsonValue` into an `OnboardingDraftV1`, or `null` for
 *  anything that isn't a plausible draft of this shape (missing/wrong
 *  `version`, not an object, etc.) — callers treat `null` exactly like "no
 *  draft yet" rather than crashing. There is only one version today; this
 *  function is the single place a future `version: 2` migration would branch. */
export function parseOnboardingDraft(value: unknown): OnboardingDraftV1 | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  // Shallow-trust the rest — this is our own previously-saved data, and every
  // field is optional; deep validation happens at submit time (task-13)
  // against the actual business rules, not here.
  return record as OnboardingDraftV1;
}
```

### Reference generation

Add to the same `draft-schema.ts` file (or a `reference.ts` alongside it — implementer's choice, just export it for `task-13` and `task-05`'s own route to share):

```ts
const REFERENCE_PREFIX = "APP-";
const REFERENCE_DIGITS = 5;

export function generateApplicationReference(): string {
  const n = Math.floor(Math.random() * 10 ** REFERENCE_DIGITS);
  return `${REFERENCE_PREFIX}${n.toString().padStart(REFERENCE_DIGITS, "0")}`;
}
```

### `GET /api/driver-profile/onboarding`

Auth: session required, `role === "DRIVER"`, must have a `DriverProfile`. **Get-or-create**: if the driver has no `DriverApplication` row yet, create one (`status: "DRAFT"`, `draft: null`, `reference: generateApplicationReference()`) — retry the reference on a unique-constraint violation (Prisma error code `P2002`) up to 5 times before giving up with a 500; a collision is astronomically unlikely at 5 digits but must not be silently ignored.

Response `200`:

```ts
type OnboardingGetResponse = {
  status: "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED";
  reference: string;
  draftStep: number;
  draftUpdatedAt: string | null; // ISO, for the welcome screen's "saved at" line
  draft: OnboardingDraftV1 | null; // present only while status === "DRAFT"
  documents: {
    type: "PROFILE_PHOTO" | "LICENCE_FRONT" | "LICENCE_BACK";
    status: "PENDING" | "APPROVED" | "FLAGGED";
    flagReason: string | null;
    signedUrl: string | null; // null if signing failed — caller shows a broken-thumbnail state, not a crash
    uploadedAt: string; // ISO
  }[]; // only the live (supersededAt: null) row per type, if any
  // Present only once status !== "DRAFT" — built from the normalized rows
  // task-13's submit wrote, for the status screen's summary card. Null while
  // still a draft (there's nothing normalized yet to summarize).
  submittedSummary: {
    fullName: string;
    idNumber: string;
    dateOfBirth: string;
    city: string;
    licenceNumber: string;
    licenceExpiresAt: string;
    categories: string[];
    vehicleClassName: string;
    chassisType: string;
    make: string;
    model: string;
    year: number;
    colour: string;
    plateNumber: string;
    payloadKg: number | null;
    cargoLengthM: number | null;
    cargoWidthM: number | null;
    cargoHeightM: number | null;
  } | null;
};
```

Build `documents[].signedUrl` with `getDriverDocumentSignedUrls` (batch call, one round trip for all live documents). Build `submittedSummary` by reading `driverProfile.{firstName,lastName,idNumber,dateOfBirth,city}`, `driverProfile.licence.{licenceNumber,expiresAt,categories}`, and `application.vehicle.{make,model,year,colour,chassisType,vehicleTypeSpec}` (join `vehicleTypeSpec` to recover which `VehicleClass` it belongs to via `src/lib/driver-onboarding/vehicle-classes.ts`'s reverse lookup — find the class whose `specCodeByChassis` contains the vehicle's spec code — for `vehicleClassName`).

### `PATCH /api/driver-profile/onboarding`

Auth: same as `GET`. Body: `{ draftStep: number; draft: OnboardingDraftV1 }`. **Rejects (400) if `status !== "DRAFT"`** — a pending or approved application's data doesn't change through this endpoint (see `task-13` for how resubmission after "action required" works — it goes through the same submit endpoint, not this one). Validate `draftStep` is an integer 1–4. Whole-blob replace: `prisma.driverApplication.update({ where: { driverProfileId }, data: { draft, draftStep, draftUpdatedAt: new Date() } })`. Parse the incoming `draft` through `parseOnboardingDraft`-shaped validation (reject 400 on a malformed body — wrong `version`, not an object) before writing. Return `204` with no body — the client already has the state it just sent.

Client-side debounce is the caller's responsibility (`task-08`'s draft-state context), not this route's — but note in the route's own comment that it's expected to be called at most a few times a minute per driver, not on every keystroke.

### `POST /api/driver-profile/onboarding/reset`

Auth: same as `GET`. **400 if `status !== "DRAFT"`** — resetting a submitted application isn't supported (see `requirements.md`'s Assumptions: no "rejected, start over" state exists in this design). On success: within one `prisma.$transaction`, set `draft: null`, `draftStep: 1`, `draftUpdatedAt: null`; find every live `DriverApplicationDocument` row for this application and set `supersededAt: new Date()` on each (don't hard-delete the rows — same versioning reasoning as `task-01`); after the transaction commits, best-effort `deleteDriverDocuments` on their `storagePath`s (storage cleanup failing must not fail the reset — log and continue, matching `supabase-storage.ts`'s existing "orphaned objects are a tidiness problem" reasoning). Return `204`.

## Acceptance Criteria

- [ ] `GET` creates a `DriverApplication` on first call for a driver who has none, with a unique `reference` and `status: "DRAFT"`.
- [ ] `GET` returns `draft: null` and `submittedSummary: null` appropriately depending on `status`, and always returns the live document list with signed URLs.
- [ ] `PATCH` rejects with 400 when the application isn't in `DRAFT` status, and rejects a malformed `draft` body (wrong or missing `version`) with 400.
- [ ] `PATCH` on success updates `draftStep`/`draftUpdatedAt` and returns `204`.
- [ ] `POST /reset` supersedes every live document row and best-effort deletes the underlying storage objects, and rejects (400) when `status !== "DRAFT"`.
- [ ] All three routes 401 when there's no session, and 403 (or 404, implementer's choice, consistent with this codebase's existing driver-profile routes) when the session isn't a `DRIVER` with a `DriverProfile`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This task does not create `Vehicle` or `DriverLicence` rows — those are only written at a successful submit (`task-13`), from the validated draft, inside one transaction. Nothing in this task writes to either table.
- This task does not handle document upload itself (`task-06`) — `GET`'s `documents[]` array only *reads* whatever `DriverApplicationDocument` rows already exist.
