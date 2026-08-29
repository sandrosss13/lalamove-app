# Task 13: Step 4 — Drivers & Assignment

## Status

pending

## Wave

4

## Description

Fills in the wizard's fourth step: a numbered table pairing every vehicle from step 3 with a named driver, and the 640px dialog that does the pairing. The dialog has **two** tabs — pick someone already on the company's roster, or create the account there and then. Licence-category eligibility and one-driver-one-vehicle are both enforced here in the UI and again server-side by `task-14`'s submit; the UI's job is to make an ineligible choice visibly impossible rather than merely rejected.

Creating an account calls `task-07`'s endpoint, which really does create a `User` + `DriverProfile` + `DriverLicence` and returns a temporary password generated on the **server**. That password is shown exactly once, in its own dialog, and never touches the draft. The assignment itself is draft-only: `DriverVehicleAssignment` rows cannot exist yet, because the `Vehicle` rows they point at are not created until submit.

## Dependencies

**Depends on:** task-09-fleet-wizard-shell.md, task-04-vehicle-class-taxonomy.md, task-07-fleet-driver-api.md
**Blocks:** None

**Context from dependencies:**

### `useFleetDraft()` — from `task-09` (`src/components/fleet-onboarding/fleet-draft-context.tsx`)

The wizard's single data hook. Throws outside `FleetDraftProvider`. Step components take **zero props**. Mirrors `src/components/driver-onboarding/onboarding-draft-context.tsx` (`draftRef`/`stepRef`/`statusRef` mirrors, `SAVE_DEBOUNCE_MS = 300` on edits, immediate save on `goToStep`, `saveSequence` guard, keepalive unmount flush, two-mode `load({ silent })`, `STATUS_POLL_INTERVAL_MS = 25_000`).

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
  /** Section-level merge (NOT a deep merge); `version` re-pinned last. */
  updateDraft: (patch: Partial<FleetDraftV1>) => void;
  goToStep: (step: number) => void;
  refetch: () => Promise<void>;
  resetApplication: () => Promise<boolean>;
  showToast: (message: string, tone?: "default" | "error") => void;
};

export function useFleetDraft(): FleetDraftState;
```

`vehicleVerdicts` and `submittedSummary` are post-submit fields, empty and `null` while `DRAFT`; `task-15` is what renders them. This step touches neither — they are restated because the hook surface is one shape everywhere.

### `FleetDraftV1` — from `task-05`, re-exported through `task-09`

`src/lib/fleet-onboarding/draft-schema.ts`. This step reads `draft.vehicles` (built and owned by `task-12`) and writes exactly one field on each entry: `driverProfileId`.

```ts
export const FLEET_DRAFT_VERSION = 1;

export const FLEET_MIN_VEHICLES = 2;
export const FLEET_MAX_VEHICLES = 40;
export const FLEET_MAX_PER_CELL = 40;
export const MAX_DRAFT_JSON_LENGTH = 64 * 1024;

export type FleetDraftChassisType = "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS";
export type FleetDraftVehicleClassId =
  | "SMALL_VAN" | "LARGE_VAN" | "MEDIUM_TRUCK" | "HEAVY_FREIGHT_TRUCK" | "TRAILER_TRUCK";

export type FleetDraftCompany = {
  phone?: string;
  companyName?: string;
  vatId?: string;
  registeredAddress?: string;
  city?: string;                    // the registered city, set at sign-up
  citiesOfOperation?: string[];
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  bankAccountIban?: string;
};

export type FleetDraftFleet = {
  /** Key is `${chassisType}:${classId}`, e.g. "REFRIGERATED:MEDIUM_TRUCK". */
  counts?: Record<string, number>;
};

export type FleetDraftVehicle = {
  /** Stable client id, minted by task-12; survives step-2 count changes. */
  id: string;
  chassisType: FleetDraftChassisType;
  classId: FleetDraftVehicleClassId;
  make?: string;
  model?: string;
  year?: number;
  plateNumber?: string;
  colour?: string;
  payloadKg?: number;
  cargoLengthM?: number;
  cargoWidthM?: number;
  cargoHeightM?: number;
  /** "Hino 916" — names the prefill source in task-12's editor footer. */
  prefillSource?: string;
  /** `DriverProfile.id` of the assigned driver. Written by THIS step;
   *  absent === unassigned. */
  driverProfileId?: string;
};

export type FleetDraftV1 = {
  version: 1;
  company?: FleetDraftCompany;
  fleet?: FleetDraftFleet;
  vehicles?: FleetDraftVehicle[];
};
```

**The driver lives on the vehicle.** There is no `assignments` section in the draft and no `FleetDraftAssignment` type — `draft.vehicles[i].driverProfileId` is the pairing, in full. Removing a driver deletes that key (or sets it to `undefined`); it never writes `null`, which the type does not admit.

Vehicle order — and therefore the `#` numbering — is fixed by `task-12`: groups enumerated body-major (`DRY_BOX`, `REFRIGERATED`, `OPEN_CHASSIS`) then class-minor (`SMALL_VAN`, `LARGE_VAN`, `MEDIUM_TRUCK`, `HEAVY_FREIGHT_TRUCK`, `TRAILER_TRUCK`), numbered 1-based and continuous over the flattened array. This step numbers by array index and must not reorder.

### The five-class taxonomy and the lock map — from `task-04` (`src/lib/driver-onboarding/vehicle-classes.ts`)

`task-04` grows the **shared** taxonomy to five classes. `HEAVY_FREIGHT_TRUCK` moves from CE to **C**; `TRAILER_TRUCK` is added at **CE**. Only `task-04` may edit that file.

```ts
export type VehicleClassId =
  | "SMALL_VAN" | "LARGE_VAN" | "MEDIUM_TRUCK"
  | "HEAVY_FREIGHT_TRUCK" | "TRAILER_TRUCK";

export const VEHICLE_CLASSES: VehicleClass[]; // in the order above
export function findVehicleClass(id: VehicleClassId): VehicleClass; // throws on unknown
export function resolveVehicleTypeSpecCode(
  classId: VehicleClassId, chassisType: ChassisType,
): string | null; // null === locked cell
```

| Class | `name` | `chip` | `requiredLicenceCategory` |
|---|---|---|---|
| `SMALL_VAN` | Small Van | `CAT B` | `B` |
| `LARGE_VAN` | Large Van | `CAT B` | `B` |
| `MEDIUM_TRUCK` | Medium Truck | `CAT C` | `C` |
| `HEAVY_FREIGHT_TRUCK` | Heavy Freight Truck | `CAT C` | `C` |
| `TRAILER_TRUCK` | Trailer Truck | `CAT CE` | `CE` |

`specCodeByChassis` — 8 usable cells, 7 locked (`null`). This step never resolves a spec itself, but the same map is why only these eight (body × class) pairs can appear in the table at all:

| Class | `DRY_BOX` | `REFRIGERATED` | `OPEN_CHASSIS` |
|---|---|---|---|
| `SMALL_VAN` | `MINIVAN` | `null` | `null` |
| `LARGE_VAN` | `CARGO_VAN` | `REFRIGERATED_VAN` | `null` |
| `MEDIUM_TRUCK` | `BOX_TRUCK` | `REFRIGERATED_TRUCK` | `FLATBED_TRUCK` |
| `HEAVY_FREIGHT_TRUCK` | `LARGE_FREIGHT_TRUCK` | `null` | `null` |
| `TRAILER_TRUCK` | `TRAILER_TRUCK` *(seeded by task-02)* | `null` | `null` |

### `task-07` — Fleet Driver Create & Assign API

Two endpoints matter to this step. Both are company-scoped: `task-07` resolves the caller's `LogisticsCompany` from the session and never accepts a `companyId` from the client. Both already exist in the codebase — `task-07` extends them, it does not add a parallel pair — so their existing response shapes are load-bearing and are what this step must be written against.

```
GET  /api/logistics-company/drivers            ->  200 RosterEntry[]        (a BARE array)
POST /api/logistics-company/drivers/register   ->  201 RegisterDriverResult (a FLAT object)
```

#### `GET /api/logistics-company/drivers` — the roster

**The body is a bare array, not `{ drivers: [...] }`.** That is today's shape and `task-07` keeps it. A company with no `LogisticsCompany` row yet gets `[]` with a 200, never a 404. Entries are ordered by `createdAt` ascending.

```ts
export type RosterEntry = {
  userId: string;
  driverProfileId: string;
  /** "Nino Abashidze" — already joined server-side. There is no `fullName`. */
  name: string;
  email: string;
  phone: string;
  city: GeorgianCity;
  isOnline: boolean;
  /** Empty when the driver has no licence on file — an older company-created
   *  account predating licence capture. Such a driver is ineligible for every
   *  vehicle, which is correct rather than a bug to work around. */
  categories: ("B" | "C" | "CE")[];
  /** ISO 8601, or null when there is no licence row. */
  licenceExpiresAt: string | null;
  /** The vehicle this driver currently holds, or null. Drives the design's
   *  "on 34 ABC 128" ineligibility note. */
  currentAssignment: { vehicleId: string; plateNumber: string } | null;
};
```

Note the flattening: there is **no nested `licence` object** and no `assignedVehicle`. Licence facts arrive as the sibling fields `categories` and `licenceExpiresAt`, and "has no licence on file" is `licenceExpiresAt === null` (equivalently, `categories.length === 0`).

The route hands over facts and does not filter. Eligibility is *presented* here and *enforced* server-side.

#### `POST /api/logistics-company/drivers/register` — create the account

Body, parsed by the route's hand-rolled `parseRegisterDriverBody(body: unknown)` — no Zod:

```ts
{
  email: string;                    // REQUIRED
  firstName: string;
  lastName: string;
  phone: string;
  city: GeorgianCity;
  vehicleId?: string;               // omitted here — no Vehicle row exists yet
  licenceNumber: string;
  licenceExpiresAt: string;         // ISO; must parse and be strictly in the future
  licenceCategories: ("B" | "C" | "CE")[];   // >= 1
}
```

**`email` is required and is supplied by the company.** The route calls `auth.api.signUpEmail` with it; there is **no derived login**, and the client must never construct one. The name is sent split — `firstName` and `lastName` — because that is how `DriverProfile` stores it; the route joins them back into the `name` it returns.

201 response — a flat object, no `driver` or `credentials` wrapper:

```ts
{
  userId: string;
  driverProfileId: string;
  name: string;                     // "Nino Abashidze"
  email: string;
  phone: string;
  categories: ("B" | "C" | "CE")[];
  /** 12 characters, server-generated, returned exactly once. */
  tempPassword: string;
  vehicleAssigned: boolean;         // always false from this step
}
```

Server behaviour this step depends on:

- The **temporary password is generated server-side** by `node:crypto`'s `randomInt` over the 56-character ambiguity-free charset `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789` at **length 12**, exactly as `src/app/api/logistics-company/drivers/register/route.ts` already does. It is returned once, as `tempPassword`, and is not retrievable afterwards.
- `User.mustChangePassword` is set to `true` by a direct write inside the transaction.
- **`DriverProfile.activatedAt` is set to `new Date()` at creation.** A company-created driver never sees the self-serve driver wizard, so no application will ever exist for an admin to approve and nothing else would ever activate them; leaving it null would lock every fleet driver permanently out of going online. What actually stops an unapproved fleet from dispatching is `task-21`'s fleet gate (`LogisticsCompany.activatedAt` plus the per-vehicle verdict), not this column.
- The `DriverLicence` row is written in the same transaction as the profile, so a driver never lands on the roster without the licence that makes them assignable.
- `auth.api.signUpEmail` is called **without forwarding request headers**, so no session is issued for the new driver and the company admin stays signed in (`src/lib/auth.ts`'s `before` hook has an explicit `if (!ctx.request) return;` bail-out for this call).
- Errors are `{ error: string }` — 401 `Unauthorized.`, 403 for a non-COMPANY caller, 400 for a bad body, and **400** `An account with that email address already exists.` for a duplicate account. That last one is a **400, not a 409**, and its message names the email — render it verbatim under the email field's own inline slot as well as in the dialog's error line.

There is **no** assign endpoint call from this step. `task-07`'s assign/unassign routes operate on real `Vehicle` rows, which do not exist during the wizard, and `vehicleId` is therefore omitted from the `POST` body; see "Where the assignment actually lives" below.

## Files to Create

- `src/components/fleet-onboarding/driver-assignment-dialog.tsx` — the 640px two-tab dialog.
- `src/components/fleet-onboarding/temp-password-dialog.tsx` — the shown-once credentials dialog.

## Files to Modify

- `src/components/fleet-onboarding/steps/step-4-drivers-assignment.tsx` — replace `task-09`'s stub with the real step.

## Technical Details

### 0. Where the assignment actually lives

`Vehicle` rows do not exist during the wizard — `plateNumber` is globally `@unique` and an abandoned draft must never claim a real plate — so a `DriverVehicleAssignment` row has nothing to point at yet. This step therefore records the pairing as `FleetDraftVehicle.driverProfileId` in the draft, and `task-14`'s submit creates the real `DriverVehicleAssignment` rows inside its transaction.

The **driver account** is the exception: it is created for real, immediately, by `task-07`'s `POST`. That is deliberate and is what makes category gating enforceable at all — a company-created driver used to get no `DriverLicence` row, so there was nothing to gate on. Once created, the driver is on the roster whether or not the application is ever submitted. The account is fully activated at creation (`DriverProfile.activatedAt` is stamped) — what keeps it off the road until the fleet is approved is `task-21`'s dispatch gate on the company, not a null activation timestamp.

### 1. Step intro

Rendered above the table in `text-[13.5px] leading-[1.5] text-muted-foreground`:

```
Every vehicle needs a named driver. Create the account yourself for drivers already on staff, or pick one from your roster.
```

This is the design's line with its second clause replaced. The original reads "…or send an invitation and let them complete their own licence details", which describes the third tab this feature does not ship.

### 2. Loading the roster

One `GET /api/logistics-company/drivers` on mount, into step-local state (`drivers`, `rosterLoading`, `rosterError`). Read failures through the shared helper:

```ts
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? fallback;
}
```

Fallback: `We couldn't load your drivers. Check your connection and try again.` shown as a bordered card with a Retry button; the table still renders, since a failed roster load must not hide the vehicles.

A driver created in the dialog is folded into `drivers` from the `POST` response — no refetch. Bump a local `rosterSequence` ref when folding so a slow in-flight `GET` cannot overwrite the new row with the pre-creation list, the same guard `recordDocument` uses in the driver flow.

### 3. The table — `steps/step-4-drivers-assignment.tsx`

Built on `src/components/ui/table`.

**Step header.** Right-aligned mono counter in the label style, `aria-live="polite"`:

```
{assignedCount} of {totalCount} assigned
```

e.g. `5 of 7 assigned`.

**Columns**, in order: `#` · `Vehicle` · `Plate` · `Driver` · `Status`.

| Column | Content | Empty |
|---|---|---|
| `#` | 1-based array index, `font-price` | — |
| Vehicle | `findVehicleClass(classId).name` on the first line; under it, in `text-[12px] text-muted-foreground`, `needs category {requiredLicenceCategory}` (e.g. `needs category C`) | — |
| Plate | `plateNumber`, `font-price font-semibold tracking-[0.12em]` | `—` |
| Driver | the roster entry's `name` on the first line; under it, in `text-[12px] text-muted-foreground`, `{phone} · {categories.join(", ")}` (e.g. `+995 555 12 34 56 · B, C`), or just the phone when `categories` is empty | `Not assigned` in `text-muted-foreground` |
| Status | pill (below) | — |

**Status pill.** 20px radius, 11px mono uppercase. **Two values only:**

- `Assigned` — `border-transparent` on `color-mix(in oklch, oklch(0.5 0.13 145) 12%, var(--card))` with `oklch(0.5 0.13 145)` text.
- `Unassigned` — `border-transparent bg-muted text-muted-foreground`; after a failed Continue, an unassigned row's pill switches to `bg-destructive/10 text-destructive` and the `TableRow` gains `bg-destructive/5`.

**There is no `Invited` status.** Invitations are an explicit non-goal (this codebase ships no email or SMS), so the third state and the "invitation sent · licence pending" driver line are removed rather than stubbed.

If a vehicle's `driverProfileId` points at someone no longer on the roster (deleted out of band between sessions), render the Driver cell as `Not assigned`, treat the row as Unassigned, and drop the stale key via `updateDraft` on mount (rebuild the vehicle without `driverProfileId` rather than writing `null` onto it). A dangling id would otherwise pass the client's assigned-count check and fail server-side at submit.

**Opening the dialog.** The whole row is clickable: `role="button"`, `tabIndex={0}`, `cursor-pointer`, `onClick`, and `onKeyDown` for `Enter` and `Space` (`preventDefault` on Space). `aria-label` = `Assign a driver to vehicle {n}, {className} {plate}`.

**Continue.** If every vehicle has a `driverProfileId` that resolves to a roster driver → `goToStep(FLEET_SCREENS.review)`. Otherwise set `showErrors`, stay put, and raise:

```
showToast(`Vehicle ${n}: assign a driver before continuing.`, "error")
```

where `n` is the first unassigned row. Per the design, a **table** step's toast carries the first field message rather than the form steps' `Fix the highlighted fields to continue.` — on a table step the failing control lives inside a closed dialog, so pointing at "highlighted fields" would point at nothing.

**Back** returns to `FLEET_SCREENS.vehicles`.

### 4. `driver-assignment-dialog.tsx`

```ts
export function DriverAssignmentDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 1-based row number, for the title. */
  index: number;
  classId: VehicleClassId;
  plateNumber: string | undefined;
  /** The driver currently on this vehicle, or null. */
  currentDriverProfileId: string | null;
  drivers: RosterEntry[];
  /** driverProfileId -> the OTHER vehicle holding them, for the "on …" note. */
  takenInDraft: Map<string, { index: number; plateNumber: string | undefined }>;
  /** Seeds the Create-account tab's City select — the company's own registered
   *  city, from `draft.company?.city`. The endpoint requires a `city`. */
  defaultCity: string | undefined;
  onAssign: (driverProfileId: string) => void;
  onRemove: () => void;
  /** Folds a newly created driver into the step's roster state. */
  onDriverCreated: (driver: RosterEntry) => void;
  showToast: (message: string, tone?: "default" | "error") => void;
}): React.ReactElement;
```

**Shell.** `DialogContent` with `className="w-full sm:max-w-[640px] rounded-2xl ..."` — the primitive defaults to `sm:max-w-sm`, so the override is required — and `data-onboarding-surface=""`, because the content portals to `document.body`, outside the wizard's surface element. `DialogTitle`: `Vehicle {index} — {plate ?? className}`. `DialogDescription`: `{className} · needs licence category {required}`. Body scrolls: `max-h-[calc(100dvh-6rem)] overflow-y-auto`.

**Tabs.** `src/components/ui/tabs`, exactly **two**:

```tsx
<Tabs key={`${index}:${open}`} defaultValue={initialTab}>
  <TabsList className="w-full">
    <TabsTrigger value="existing">Existing driver</TabsTrigger>
    <TabsTrigger value="create">Create account</TabsTrigger>
  </TabsList>
  <TabsContent value="existing">…</TabsContent>
  <TabsContent value="create">…</TabsContent>
</Tabs>
```

`initialTab` is computed once per open: `"existing"` when at least one roster driver is **eligible** for this vehicle, otherwise `"create"`. The `key` is what makes it recompute when the dialog is reopened for a different vehicle — `defaultValue` is otherwise read only on first mount.

#### 4a. Eligibility

Computed client-side per roster driver, against `findVehicleClass(classId).requiredLicenceCategory`, evaluated in this order and reported with the **first** matching note:

| Condition | Note | Copy |
|---|---|---|
| `licenceExpiresAt === null` | missing licence | `No licence on file` |
| `!categories.includes(required)` | wrong categories | `No category {required}` — e.g. `No category CE` |
| `new Date(licenceExpiresAt) <= now` | expired | `Licence expired {d MMM yyyy}` |
| `currentAssignment !== null` | already holds a real vehicle | `on {currentAssignment.plateNumber}` — e.g. `on 34 ABC 128` |
| `takenInDraft.has(driverProfileId)` | already holds a vehicle **in this draft** | `on {plateNumber}`, or `on vehicle {index}` when that vehicle has no plate yet |

The fields are flat on `RosterEntry` — `categories`, `licenceExpiresAt` and `currentAssignment` — with no `licence` object to null-check first.

The last row matters: during the wizard nothing is persisted, so double assignment happens entirely inside the draft and `currentAssignment` from the server can never see it. `takenInDraft` is built by the step from `draft.vehicles`, excluding the vehicle being edited, so the currently assigned driver is never marked ineligible against their own row.

`Licence expired` is an addition to the design's two notes. It is worth the extra state because `task-14`'s submit rejects an expired licence outright, and finding that out on the submit button — after every other vehicle is already assigned — is a worse failure than seeing it here.

Date formatting reads the `YYYY-MM-DD` parts out of the string rather than going through `Date`, exactly as `step-4-review-submit.tsx` in the driver flow does: `new Date("2027-05-12")` is UTC midnight, so formatting it anywhere west of Greenwich renders the previous day, and an off-by-one on a licence expiry reads as a bug.

#### 4b. Existing driver tab

A list of roster rows (plain `button` elements in a `flex flex-col gap-2`, not a `Table` — these are tap targets, not data):

```
[NA]  Nino Abashidze
      +995 555 12 34 56 · B, C
                                    Assign →   (eligible)
                                    No category CE   (ineligible, text-destructive)
```

- Initials avatar: the first letter of the first and last whitespace-separated words of `name`, uppercased, in a `size-9 rounded-full bg-muted font-price text-[13px] font-semibold` circle.
- Eligible rows: `border-border bg-card hover:bg-muted cursor-pointer`. The row currently assigned to this vehicle is `border-onboarding-accent bg-onboarding-accent/5` and its right-hand slot reads `Assigned` instead of `Assign`.
- **Ineligible rows sit at `opacity-[0.55]`** with the note in `text-xs text-destructive`. They stay focusable and clickable — clicking is how the company finds out why.
- **Clicking an ineligible row flashes why**: set `flashedDriverId` and a `flashKey` counter; while flashed the row gains `border-destructive bg-destructive/5` and its note is re-keyed with `animate-onboarding-fade-up` so the animation replays on a repeat click. Clear after 1400 ms via a `setTimeout` held in a ref, cleared before each new one and on unmount. Mirror the note into a visually hidden `aria-live="assertive"` region so a screen-reader user gets the same explanation.
- Clicking an eligible row calls `onAssign(driverProfileId)` and closes the dialog.

**Empty state** — shown when the roster has no drivers at all, or none eligible:

```
No driver on your roster holds the categories this vehicle needs. Create an account instead.
```

Rendered in a bordered card with a button that switches to the Create account tab. This is the design's line with "or send an invitation" removed.

#### 4c. Create account tab

`useState` per field; validation is a pure function computed every render returning `Partial<Record<FieldName, string>>`; messages stay hidden until the first failed Save (`showErrors`). `useId()` for ids, `aria-invalid` + `aria-describedby` on every input, inline messages as `<p className="text-xs text-destructive">`. Shared chrome:

```
FIELD_CLASS = "h-[46px] rounded-[10px] border-border bg-card px-[13px] text-[15px] focus-visible:border-onboarding-accent focus-visible:ring-onboarding-accent/15 md:text-[15px]"
LABEL_CLASS = "text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase"
```

| Field | Control | Rule | Message |
|---|---|---|---|
| First name | `Input`, `autoComplete="given-name"` | non-empty after trim | `Enter the driver's first name.` |
| Last name | `Input`, `autoComplete="family-name"` | non-empty after trim | `Enter the driver's last name.` |
| Email address | `Input` `type="email"` `inputMode="email"`, `autoComplete="off"`, `spellCheck={false}` | matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` after trim | `Enter the driver's email address — they sign in with it.` |
| Mobile | `Input` `inputMode="tel"` | 10–15 digits after stripping non-digits | `Enter a valid mobile number.` |
| City | `Select` over `GEORGIAN_CITY_OPTIONS` from `src/lib/georgian-cities.ts` | one selected; initialised from the `defaultCity` prop | `Select the driver's city.` |
| Licence number | `Input`, `font-price` | ≥ 5 characters after trim | `Enter the licence number.` |
| Expiry | `Input type="date"`, `FIELD_CLASS` | parses, and is strictly in the future | `That licence has expired. Enter a future expiry date.` |
| Categories held | three `Checkbox`es — `B`, `C`, `CE` | at least one selected | `Select at least one licence category.` |
| Categories held | must include the vehicle's required category | see below | `This vehicle needs category {required}. Assign a different driver or vehicle.` |

**First and last name are two separate inputs, side by side in a `sm:grid-cols-2`** — not one "Full name" box that the client splits. The endpoint takes `firstName` and `lastName`, `DriverProfile` stores them apart, and a client-side split on whitespace mangles every two-word surname it meets. The roster's `name` is what the server joins back and returns.

**The email is required and is the driver's login.** There is no derived login to display or construct anywhere in this feature; the company types the address, the server passes it to `signUpEmail`, and the temp-password dialog shows that same address back. A duplicate is a **400** carrying `An account with that email address already exists.` — surface it against the email field, not just as a generic footer error, since it names the one field that has to change.

The category checkboxes are **prechecked with the vehicle's requirement**: on open, `categories` initialises to `[required]`. Unchecking it is allowed — it is what surfaces the design's exact message:

```
This vehicle needs category CE. Assign a different driver or vehicle.
```

Below the fields, a note card (`rounded-[12px] border border-border bg-muted/40 p-[13px] text-[12.5px] leading-[1.5] text-muted-foreground`) with a heading of `Temporary password` in `LABEL_CLASS`:

```
Shown once when you save, for you to pass on. The driver must change it at first sign-in and upload their own licence photos before their first order.
```

**Save** (primary CTA chrome, label `Create driver account`, `Creating…` while in flight):

1. Validate. On failure → reveal messages, `showToast` with the first message, stay open.
2. `POST /api/logistics-company/drivers/register` with `{ "Content-Type": "application/json" }` and exactly this body — `vehicleId` is deliberately omitted, since no `Vehicle` row exists during the wizard:

   ```ts
   {
     email: email.trim(),
     firstName: firstName.trim(),
     lastName: lastName.trim(),
     phone: phone.trim(),
     city,
     licenceNumber: licenceNumber.trim(),
     licenceExpiresAt: expiry,          // the date input's "YYYY-MM-DD"
     licenceCategories: categories,     // ("B" | "C" | "CE")[]
   }
   ```

3. Non-OK → `readErrorMessage(response, "We couldn't create this driver account. Please try again.")` rendered inline as `<p role="alert" className="text-[13px] text-destructive">`. **Never `alert()`.** A 400 whose message is `An account with that email address already exists.` is additionally mirrored under the email input, because that is the field the company has to change.
4. OK → the response is flat. Fold it in as a roster entry and assign it:

   ```ts
   onDriverCreated({
     userId: body.userId,
     driverProfileId: body.driverProfileId,
     name: body.name,
     email: body.email,
     phone: body.phone,
     city,
     isOnline: false,
     categories: body.categories,
     licenceExpiresAt: new Date(expiry).toISOString(),
     currentAssignment: null,
   });
   onAssign(body.driverProfileId);
   ```

   Then open the temp-password dialog with `{ email: body.email, tempPassword: body.tempPassword }`. The assignment dialog closes; the credentials dialog is what the company sees next.

Double-submit guard: disable Save while in flight and ignore a second click, since a duplicate `POST` would create a second real account.

#### 4d. Dialog footer

A `DialogFooter` carrying **Cancel** (bordered muted, right) and, **only when `currentDriverProfileId !== null`**, a red **Remove current driver** on the left:

```tsx
<Button type="button" variant="destructive" onClick={onRemove}>Remove current driver</Button>
```

`onRemove` deletes that vehicle's `driverProfileId` from the draft (the key goes away; it is never set to `null`) and closes the dialog. It does **not** delete the driver account — the driver stays on the roster and becomes eligible for another vehicle again. Follow it with `showToast("Driver removed from vehicle {n}.")`.

### 5. `temp-password-dialog.tsx`

```ts
export function TempPasswordDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName: string;
  /** Straight off the register response: its `email` and `tempPassword`. */
  email: string;
  tempPassword: string;
  showToast: (message: string, tone?: "default" | "error") => void;
}): React.ReactElement;
```

**The two values are the register response's own `email` and `tempPassword`, passed through unchanged.** There is no `credentials` wrapper, no `login` and no `temporaryPassword` — the driver signs in with the email address the company typed.

**The password comes from the server response and nowhere else.** It is 12 characters from `node:crypto`'s `randomInt` over a 56-character ambiguity-free charset. It is **never generated client-side**: the design prototype's 8-character `4 letters + 4 digits` `Math.random()` version is a placeholder and must not be ported, because this value is a real credential until the driver changes it. It is held in component state only, is never written to the draft, is never sent back to the server, and is **not retrievable after this dialog closes** — the server stores only Better Auth's hash.

Layout, in a `sm:max-w-[440px] rounded-2xl` `DialogContent` carrying `data-onboarding-surface=""`:

- `DialogTitle`: `Driver account created`
- `DialogDescription`: `{driverName} can sign in with these details.`
- Two rows in a bordered card, each a `LABEL_CLASS` label over a `font-price text-[15px] font-semibold select-all` value: **Email** (the sign-in address) and **Temporary password**.
- A warning line in `text-xs text-destructive`: `This password is shown once. Copy it before closing — we cannot show it again.`
- `DialogFooter`: **Copy credentials** (primary CTA chrome) and **Done** (bordered muted, closes).

`Copy credentials` writes

```
Email: {email}
Temporary password: {tempPassword}
```

via `navigator.clipboard.writeText`, then `showToast("Credentials copied.")`. On rejection (an insecure context, or a browser that refuses without a user-gesture heuristic) → `showToast("Couldn't copy. Select the details and copy them by hand.", "error")` and leave the dialog open. The values are `select-all` precisely so that fallback is workable.

Closing is only via **Done** or the dialog's own close affordance; the assignment has already been recorded, so closing loses the password and nothing else.

## Acceptance Criteria

- [ ] The table numbers rows 1-based over `draft.vehicles` in array order and does not reorder them.
- [ ] The Vehicle cell shows the class name and `needs category {C|B|CE}` derived from `findVehicleClass`.
- [ ] The header reads `{n} of {total} assigned` and updates live.
- [ ] The roster `GET` is read as a **bare array**, and each entry's flat `name`, `categories`, `licenceExpiresAt` and `currentAssignment` drive the Driver cell and the eligibility notes.
- [ ] Status has exactly two values, `Unassigned` and `Assigned` — there is no `Invited` state anywhere in the component.
- [ ] The dialog is 640px, carries `data-onboarding-surface`, and has exactly **two** tabs: Existing driver and Create account.
- [ ] It opens on Existing driver when the roster has an eligible driver and on Create account otherwise, recomputed each time it is opened for a different vehicle.
- [ ] Roster rows show initials, phone and categories; ineligible rows render at 0.55 opacity with a red note that is `No category CE` for a category miss and `on 34 ABC 128` when the driver already holds another vehicle — including one held only in the draft.
- [ ] Clicking an ineligible row flashes the reason (visible tint + replayed animation + `aria-live` announcement) and does not assign.
- [ ] With no eligible driver, the roster tab shows `No driver on your roster holds the categories this vehicle needs. Create an account instead.`
- [ ] Create account collects first name, last name, **email**, mobile, city, licence number, expiry and categories as separate fields; the vehicle's required category is prechecked; unchecking it produces `This vehicle needs category CE. Assign a different driver or vehicle.`
- [ ] The `POST` body is `{ email, firstName, lastName, phone, city, licenceNumber, licenceExpiresAt, licenceCategories }` — email present, name split, `vehicleId` omitted — and no login is derived anywhere in the client.
- [ ] A duplicate account comes back as a **400** carrying `An account with that email address already exists.`, and the message is shown against the email field.
- [ ] A past expiry date is rejected before the request is sent.
- [ ] Saving posts once, folds the flat 201 response into the roster as a `RosterEntry`, assigns them, and opens the temp-password dialog showing the **server-returned** `email` and 12-character `tempPassword`, with `Copy credentials` and `Done`.
- [ ] The password is never generated in the browser, never written to the draft, and is unavailable once the dialog closes.
- [ ] The footer shows a red `Remove current driver` only when the vehicle already has one, and removing it leaves the driver account intact and eligible again.
- [ ] Continue is refused unless every vehicle is assigned, and the toast carries `Vehicle {n}: assign a driver before continuing.` rather than the generic form-step string.
- [ ] All request failures render inline; `alert()` appears nowhere.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- **The design's third tab, "Send invitation", is deliberately dropped — not stubbed, not hidden behind a flag.** It sends the driver a link to complete their own licence, categories and profile photo. This codebase has no email or SMS infrastructure, an explicit non-goal in `specs/driver-registration-and-vehicle-assignment` and `specs/freight-platform-pivot` and again in this feature's requirements. Removed with it: the `Invited` vehicle status, the "invitation sent · licence pending" driver line, the tab's own copy ("The driver gets a link and completes their own licence, categories and profile photo. The vehicle stays reserved for them and cannot be dispatched until they finish."), and its orange note ("Their licence must show category CE. If their licence does not show it, the invitation cannot be completed and the vehicle stays unassigned."). Do not implement any of it. A tab that silently sends nothing is worse than a tab that is not there.
- The step intro is the design's line with its invitation clause replaced; the roster empty state likewise drops "or send an invitation". Both replacements are given verbatim above — use them exactly.
- Client-side eligibility is a convenience, not a control. `task-14`'s submit re-checks, server-side and against the database: that every vehicle has a driver, that the driver belongs to this company, that their licence has not expired **as of submit time**, that their categories cover the class's required category, and that no driver holds two vehicles. Nothing here is trusted there.
- SMS OTP is dropped entirely from this feature; there is no phone-verification step on the created driver.
- **The created driver's `DriverProfile.activatedAt` is set, not left null.** `task-07` stamps it `new Date()` inside the creation transaction, deliberately: a company-created driver never sees the self-serve driver wizard, so no `DriverApplication` will ever exist for an admin to approve, and a null `activatedAt` would lock every fleet driver out of going online for good. The thing that actually keeps an unapproved fleet off the road is `task-21`'s dispatch gate, which reads `LogisticsCompany.activatedAt` and the per-vehicle verdict. Do not "fix" this by nulling the column.
- The assignment lives on the vehicle — `draft.vehicles[i].driverProfileId` — and nowhere else. There is no `draft.assignments` array and no `FleetDraftAssignment` type to write, read or migrate.
- Verify manually (recorded in `action-required.md`): after creating a driver from this step, the company user is still signed in as themselves. `auth.api.signUpEmail` called server-side without forwarded headers must not swap the session.
