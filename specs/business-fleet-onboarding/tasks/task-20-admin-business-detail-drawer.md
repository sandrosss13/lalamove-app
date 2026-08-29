# Task 20: Admin Business Application Detail Drawer

## Status

pending

## Wave

6

## Description

The 560px review panel opened from a row of `/admin/business/applications`: the whole application in one scrollable column — the company block with its verify/flag control, one card per vehicle with its own approve/flag control and its assigned driver, and a footer holding the two decisions that end the review. It is where every verdict in this feature is actually recorded.

Structurally it follows `src/components/admin/driver-application-detail-drawer.tsx` exactly: a hand-rolled fixed panel (there is no Sheet primitive in `src/components/ui` — see `requirements.md`), fetching its own detail rather than receiving it from the queue, applying each endpoint's own response in place, and re-reading the detail afterwards so the counts and the footer hint follow the database rather than a patched copy.

## Dependencies

**Depends on:** task-16-admin-nav-registration.md, task-17-admin-applications-read-api.md, task-18-admin-applications-mutation-api.md
**Blocks:** None

**Context from dependencies:**

**From task-16** — nothing this component imports; it exists so the drawer's host route is reachable. Do not edit `src/components/admin/admin-nav.ts`.

**From task-01, restated so nothing here needs a schema check:**

```prisma
enum BusinessApplicationStatus { DRAFT PENDING ACTION_REQUIRED APPROVED }
enum CompanyReviewStatus { PENDING VERIFIED FLAGGED }
enum BusinessApplicationVehicleStatus { PENDING APPROVED FLAGGED }
enum VehicleClass { SMALL_VAN LARGE_VAN MEDIUM_TRUCK HEAVY_FREIGHT_TRUCK TRAILER_TRUCK }

model BusinessApplication {
  id                  String                      @id @default(cuid())
  companyId           String                      @unique
  company             LogisticsCompany            @relation(fields: [companyId], references: [id], onDelete: Cascade)
  /// "BIZ-40219" — 5 random digits, allocated on task-05's lazy GET.
  reference           String                      @unique
  status              BusinessApplicationStatus   @default(DRAFT)
  companyReviewStatus CompanyReviewStatus         @default(PENDING)
  companyFlagReason   String?
  draft               Json?
  draftStep           Int                         @default(1)
  draftUpdatedAt      DateTime?
  firstSubmittedAt    DateTime?
  lastSubmittedAt     DateTime?
  submissionCount     Int                         @default(0)
  createdAt           DateTime                    @default(now())
  updatedAt           DateTime                    @updatedAt
  vehicles            BusinessApplicationVehicle[]

  @@index([status])
}

model BusinessApplicationVehicle {
  id                    String                           @id @default(cuid())
  businessApplicationId String
  businessApplication   BusinessApplication              @relation(fields: [businessApplicationId], references: [id], onDelete: Cascade)
  /// Nullable + SetNull: a company can remove a vehicle from its own fleet at
  /// any time through an existing, unrelated flow, and the review row must
  /// survive so this drawer can render "vehicle no longer on file" rather than
  /// vanishing a decided verdict. Mirrors `DriverApplication.vehicleId`.
  vehicleId             String?                          @unique
  vehicle               Vehicle?                         @relation(fields: [vehicleId], references: [id], onDelete: SetNull)
  /// Denormalised at submit so the admin queue, this drawer and the dispatch
  /// gate can read the declared class and body without a join that a null
  /// `vehicleId` would break.
  vehicleClass          VehicleClass
  chassisType           ChassisType
  status                BusinessApplicationVehicleStatus @default(PENDING)
  flagReason            String?
  decidedAt             DateTime?
  createdAt             DateTime                         @default(now())
  updatedAt             DateTime                         @updatedAt

  @@index([businessApplicationId])
}
```

There is **no `position` column** on `BusinessApplicationVehicle`. The cards render in the order task-17 returns them — `orderBy: { createdAt: "asc" }` — and any 1-based row number is the array index, computed at render time. Never sort on a `position` field; there isn't one.

`LogisticsCompany` gains `registeredAddress`, `citiesOfOperation GeorgianCity[]`, `contactName`, `contactRole`, `contactEmail`, `bankAccountIban`, `activatedAt DateTime?` (null = cannot dispatch).

**From task-17** — `GET /api/admin/business-applications/[id]` returns, exported from `src/app/api/admin/business-applications/[id]/route.ts` (import **type-only**):

```ts
export type AdminBusinessApplicationVehicle = {
  applicationVehicleId: string;   // BusinessApplicationVehicle.id — what the verdict endpoint takes
  vehicleId: string | null;       // null when the Vehicle row was deleted after submit
  vehicleClass: string;           // "MEDIUM_TRUCK"
  vehicleClassName: string;       // "Medium Truck"
  chassisType: string;            // DRY_BOX | REFRIGERATED | OPEN_CHASSIS
  make: string;
  model: string;
  year: number | null;
  colour: string;
  plateNumber: string;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  status: "PENDING" | "APPROVED" | "FLAGGED";
  flagReason: string | null;
  driver: {
    driverProfileId: string;
    name: string;
    phone: string;
    categories: string[];        // ["B", "C"]
  } | null;
};

export type AdminBusinessApplicationDetail = {
  applicationId: string;
  reference: string;
  status: "PENDING" | "ACTION_REQUIRED" | "APPROVED";
  submittedAt: string;           // ISO
  submissionCount: number;
  company: {
    companyId: string;
    companyName: string;
    vatId: string;
    registeredAddress: string;
    primaryCity: string;         // raw GeorgianCity value
    citiesOfOperation: string[]; // raw GeorgianCity values
    contactName: string;
    contactRole: string;
    phone: string;
    email: string;
    bankAccountIban: string;
    activatedAt: string | null;
  };
  companyReviewStatus: "PENDING" | "VERIFIED" | "FLAGGED";
  companyFlagReason: string | null;
  vehicles: AdminBusinessApplicationVehicle[];
  counts: { total: number; approved: number; flagged: number; pending: number };
};
```

Missing scalars arrive as `""`; a deleted vehicle arrives with `vehicleId: null` and blank specifications. 404 body: `{ error: "Application not found." }`.

**From task-18** — four mutation endpoints, all gated to `SUPER_ADMIN`/`USER_MANAGER`, all answering `{ error: string }` on failure:

| Method + path | Body | Success body |
|---|---|---|
| `PATCH /api/admin/business-applications/[id]/company` | `{ verdict: "VERIFIED" }` or `{ verdict: "FLAGGED", reason }` | `AdminBusinessCompanyReviewResponse { companyReviewStatus, companyFlagReason }` |
| `PATCH /api/admin/business-applications/[id]/vehicles/[vehicleId]` | `{ verdict: "APPROVED" }` or `{ verdict: "FLAGGED", reason }` | `AdminBusinessVehicleReviewResponse { applicationVehicleId, status, flagReason }` |
| `POST /api/admin/business-applications/[id]/request-changes` | none | `AdminBusinessRequestChangesResponse { status: "ACTION_REQUIRED", flaggedVehicleCount, companyFlagged }` |
| `POST /api/admin/business-applications/[id]/activate` | none | `AdminBusinessActivateResponse { status: "APPROVED", activatedAt, approvedVehicleCount, flaggedVehicleCount }` |

Server-side refusals this component must be able to surface verbatim:

- `"This fleet has already been activated."` (400)
- `"This application is still waiting on the company to resubmit."` (409)
- `"Verify the company's details before activating the fleet."` (409)
- `"N vehicles are still pending review. Decide every vehicle before activating the fleet."` (409)
- `"At least one vehicle must be approved before activating the fleet."` (409)
- `"Flag the company's details or at least one vehicle before requesting changes."` (409)
- `"That is not one of the company flag reasons."` / `"That is not one of the vehicle flag reasons."` (400)

The per-vehicle route's dynamic segment is spelled **`[vehicleId]`** (task-18 owns it: Next.js forbids two dynamic segments with the same name on one path, so it cannot be `[id]`). Its *value* is a **`BusinessApplicationVehicle.id`** — the field this component calls `applicationVehicleId` — never a `Vehicle.id`. The review row is what carries the verdict and it outlives the vehicle (`vehicleId` is `SetNull`). Keep the local variable named `applicationVehicleId`; only the URL segment is `vehicleId`.

The flag reasons are a **closed list** on the server; the chips below must match them byte for byte.

## Files to Create

- `src/components/admin/business-application-detail-drawer.tsx` — the drawer.

## Technical Details

### 1. Component contract

```tsx
"use client";

type BusinessApplicationDetailDrawerProps = {
  /** `BusinessApplication.id` — the row the queue page opened. */
  applicationId: string;
  /** Dismissed — the parent drops its selection and unmounts this panel. */
  onClose: () => void;
  /** Something about the application changed; the queue should re-fetch. */
  onChanged: () => void;
};

export function BusinessApplicationDetailDrawer({
  applicationId,
  onClose,
  onChanged,
}: BusinessApplicationDetailDrawerProps) { … }
```

task-19 is written against exactly this signature. Do not change it.

### 2. The panel — hand-rolled, 560px

There is no Sheet/Drawer primitive in `src/components/ui`. Use the scrim + fixed-panel pattern from `driver-application-detail-drawer.tsx`, with the width raised from 520px to the design's 560px:

```tsx
<>
  {/* Dismissal is also on Escape and the close button, so this backdrop is a
      redundant affordance rather than the only way out. */}
  <div
    onClick={() => {
      if (!isBusy) onClose();
    }}
    aria-hidden="true"
    className="fixed inset-0 z-40 bg-black/20"
  />
  <div
    role="dialog"
    aria-modal="true"
    aria-label={data ? `Fleet application ${data.reference}` : "Fleet application"}
    className="animate-in slide-in-from-right-6 fade-in-0 fixed top-0 right-0 z-50 flex h-full w-[560px] max-w-full flex-col border-l border-border bg-card duration-150"
  >
    <header className="flex items-start justify-between gap-3 border-b border-border px-[22px] py-5"> … </header>
    <div className="flex-1 overflow-y-auto px-[22px] py-[18px]"> … </div>
    <footer className="border-t border-border bg-muted/40 px-[22px] py-3.5"> … </footer>
  </div>
</>
```

`max-w-full` keeps it usable below 560px viewport width. The three-part header/scroll/footer split is what keeps the two decision buttons visible while the reviewer scrolls a 40-vehicle fleet.

Header content:

- `<p className="font-price text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">{data?.reference ?? "Application"}</p>`
- `<h2 className="mt-[3px] truncate text-[17px] font-semibold tracking-[-0.01em]">{data?.company.companyName ?? "Loading…"}</h2>` — **the company block is nested**: task-17 returns `data.company.companyName`, `data.company.primaryCity`, `data.company.vatId` and so on. There is no `data.companyName`. Only `reference`, `status`, `submittedAt`, `submissionCount`, `companyReviewStatus`, `companyFlagReason`, `vehicles` and `counts` sit at the top level.
- a `text-[12.5px] text-muted-foreground` line: `` `${counts.total} vehicles · ${cityLine}` `` where `counts` is the fallback-guarded `data?.counts ?? EMPTY_COUNTS` from §4 and `cityLine` is `data.company.primaryCity` mapped through `GEORGIAN_CITY_OPTIONS` plus `+n` for the other entries in `data.company.citiesOfOperation` (same rule as the queue's City column).
- close `<Button type="button" variant="outline" size="icon-sm" onClick={onClose} disabled={isBusy} aria-label="Close">×</Button>`

Escape closes, except while a request is in flight:

```ts
useEffect(() => {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !isBusy) onClose();
  }
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [isBusy, onClose]);
```

### 3. Loading its own detail

Same two-effect shape as the driver drawer:

- A `useEffect` on `[applicationId, reloadToken]` that clears `data`, `loading`, `loadError`, every error and every expanded reason list first — `applicationId` changing means a different company, and showing the previous one's VAT id under the new reference for a moment is worse than a brief loading state — then fetches `/api/admin/business-applications/${applicationId}` with an `AbortController`, returning silently on abort.
- A `refreshDetail` `useCallback` that re-reads **without** touching `loading`, so the panel does not blank out and lose the reviewer's scroll position mid-review. Best-effort: swallow its failure, because the caller has already applied the endpoint's own response, so a failure here leaves the panel slightly stale rather than wrong.

Copy `readErrorMessage(response, fallback)` verbatim from the driver drawer.

Fallback strings:

```ts
const LOAD_ERROR_FALLBACK = "Could not load this application.";
const COMPANY_VERDICT_ERROR_FALLBACK = "Could not save that verdict.";
const VEHICLE_VERDICT_ERROR_FALLBACK = "Could not save that verdict.";
const REQUEST_CHANGES_ERROR_FALLBACK = "Could not request changes.";
const ACTIVATE_ERROR_FALLBACK = "Could not activate this fleet.";
```

On load failure: `role="alert"` message plus a `Try again` outline button bumping `reloadToken`.

### 4. One in-flight action at a time

```ts
type PendingAction =
  | { kind: "company" }
  | { kind: "vehicle"; applicationVehicleId: string }
  | { kind: "request-changes" }
  | { kind: "activate" };

const [pending, setPending] = useState<PendingAction | null>(null);
const isBusy = pending !== null;
```

One value for all four kinds rather than a boolean each: every button on the panel is disabled while any request runs, so a double-click cannot send two activate calls, and flagging a vehicle cannot race the request-changes call that reads its verdict.

Errors are held separately so one failure does not clear another's explanation:

```ts
const [companyError, setCompanyError] = useState<string | null>(null);
const [vehicleError, setVehicleError] = useState<{ applicationVehicleId: string; message: string } | null>(null);
const [verdictError, setVerdictError] = useState<string | null>(null);  // the footer's
```

Which reason list is expanded:

```ts
const [companyReasonsOpen, setCompanyReasonsOpen] = useState(false);
const [reasonVehicleId, setReasonVehicleId] = useState<string | null>(null);
```

`const isReadOnly = data?.status === "APPROVED";` — every mutation endpoint refuses an activated fleet, so the panel opens read-only rather than offering buttons that can only 400. `const isAwaitingCompany = data?.status === "ACTION_REQUIRED";` — verdicts stay recordable (clearing a corrected vehicle is exactly what should happen here); only activation is off, mirroring the endpoint's own refusal.

`data` is `AdminBusinessApplicationDetail | null` for the whole of the first load, so derive the handful of values the header, the fleet heading and the footer all read **once**, right here, instead of repeating `data?.…` at every use site:

```ts
const EMPTY_COUNTS = { total: 0, approved: 0, flagged: 0, pending: 0 } as const;

const counts = data?.counts ?? EMPTY_COUNTS;
const companyReviewStatus = data?.companyReviewStatus ?? "PENDING";
const companyFlagged = companyReviewStatus === "FLAGGED";
const isCompanyVerified = companyReviewStatus === "VERIFIED";
const isCompanyFlagged = companyFlagged;
```

`counts`, `companyReviewStatus` and `companyFlagged` are **these locals** everywhere below — they are not properties of some other object and they are not `data.company.*`. `counts` and `companyReviewStatus` come off the top level of the detail (§ above); `companyFlagged` is derived here and is also the name task-18's request-changes response uses for the same idea, which is why it is spelled the same.

While `data === null` these fall back to a zeroed, unverified reading, which is exactly what the footer wants: every decision button is already disabled on `data === null`, and a hint that says "verify the company's details" under a still-loading panel is harmless. Do not reach for `!` or a cast to avoid the fallback.

### 5. Company block

Rendered only once `data !== null`, so the block can name `const company = data.company;` and read plain properties off it. Every value below is `data.company.*` — the detail response **nests** the company; there is no `data.vatId`, no `data.registeredAddress`, no `data.bankAccountIban`.

`<SectionTitle>Company</SectionTitle>` (`h3`, `text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase`), then a two-column `<dl className="mt-[9px] grid grid-cols-2 gap-x-[18px] gap-y-3">` with `dt` `text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase` and `dd` `mt-[3px] text-[13.5px] font-medium break-words`. Every field, in this order:

| Label | Value |
|---|---|
| VAT / tax ID | `company.vatId` |
| Registered address | `company.registeredAddress` |
| Cities of operation | `company.citiesOfOperation` mapped through `GEORGIAN_CITY_OPTIONS` and joined `", "` — full width (`col-span-2`) |
| Contact | `` `${company.contactName} · ${company.contactRole}` `` |
| Phone | `company.phone` |
| Email | `company.email` |
| Payout account | `company.bankAccountIban`, in `font-price` |

Any empty value renders the em-dash placeholder (`const EMPTY_VALUE = "—";` plus the `orPlaceholder()` helper from the driver drawer).

Under the grid, the current company verdict line:

- `VERIFIED` → `Verified` in the design's green (`const STATUS_GREEN = "oklch(0.5 0.13 145)";`, applied as an inline `style={{ color: STATUS_GREEN }}` exactly as the driver drawer does — it is used on this one surface, so a token would be a palette of one)
- `FLAGGED` → `` `Flagged — ${orPlaceholder(data.companyFlagReason)}` `` in `text-destructive`
- `PENDING` → `Pending review` in `text-muted-foreground`

Then the two buttons, hidden entirely when `isReadOnly`:

```tsx
<div className="mt-3 flex gap-1.5">
  <Button
    type="button"
    variant={isCompanyVerified ? "default" : "outline"}
    size="sm"
    disabled={isBusy}
    onClick={() => void reviewCompany({ verdict: "VERIFIED" })}
  >
    {pending?.kind === "company" ? "Saving…" : "Company details verified"}
  </Button>
  <Button
    type="button"
    variant={isCompanyFlagged ? "destructive" : "outline"}
    size="sm"
    disabled={isBusy}
    aria-expanded={companyReasonsOpen}
    onClick={() => setCompanyReasonsOpen((open) => !open)}
  >
    Flag company details
  </Button>
</div>
```

Flag expands the four reason chips rather than acting immediately — **picking a chip is the flag**, which is what the design specifies and what keeps the company's status screen from ever showing a reasonless rejection:

```tsx
const COMPANY_FLAG_REASONS: readonly string[] = [
  "VAT ID not found in the registry",
  "Address does not match registration",
  "Bank account not held by the entity",
  "Contact person unreachable",
];
```

Chip markup, identical to the driver drawer's:

```tsx
<div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
  {COMPANY_FLAG_REASONS.map((reason) => (
    <button
      key={reason}
      type="button"
      disabled={isBusy}
      onClick={() => void reviewCompany({ verdict: "FLAGGED", reason })}
      className="cursor-pointer rounded-full border border-border bg-card px-[11px] py-[5px] text-[11.5px] transition-colors hover:border-destructive hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      {reason}
    </button>
  ))}
</div>
```

These four strings must match task-18's server-side list byte for byte — an off-list reason is a 400.

`companyError` renders under the block as `<p role="alert" className="mt-2 text-[12.5px] text-destructive">`.

### 6. Fleet & drivers

Header:

```tsx
<SectionTitle>
  Fleet &amp; drivers ({counts.total})
</SectionTitle>
<p className="mt-1 text-[11.5px] text-muted-foreground">
  {`${counts.approved} approved, ${counts.flagged} flagged, ${counts.pending} pending`}
</p>
```

That count line is the design's "3 approved, 1 flagged, 3 pending", verbatim in shape. Derive it from `data.counts` (task-17 computes it server-side) so the header, the footer hint and task-18's activation guard all read the same numbers.

Then `<div className="mt-[9px] flex flex-col gap-[9px]">` with one card per vehicle, in the order the endpoint returned them (`createdAt asc` — stable across reloads and verdicts, so the reviewer works down the same list).

Each card, following `DocumentRow`'s shape:

```tsx
<div
  className={`rounded-[11px] border p-[11px] ${
    isFlagged ? "border-destructive bg-destructive/5" : "border-border bg-card"
  }`}
  style={isApproved ? { borderColor: `color-mix(in oklch, ${STATUS_GREEN} 45%, white)` } : undefined}
>
```

Three lines of content, exactly as the design lists them:

1. **Class + plate** — `<p className="text-[13px] font-semibold">{vehicle.vehicleClassName}</p>` with the plate beside it in `font-price text-[12px]` (uppercase; plates are stored uppercased).
2. **body · model · year · payload** — one `text-[11.5px] text-muted-foreground` line built by joining the present parts with `" · "`:
   - `CHASSIS_LABELS[vehicle.chassisType] ?? vehicle.chassisType` where `const CHASSIS_LABELS: Record<string, string> = { DRY_BOX: "Dry Box", REFRIGERATED: "Refrigerated", OPEN_CHASSIS: "Open Chassis" };` — the short "Refrigerated" label, which is what the design uses in table rows and summaries
   - `` `${vehicle.make} ${vehicle.model}` `` when non-empty
   - `String(vehicle.year)` when non-null
   - `` `${vehicle.payloadKg.toLocaleString("en-US")} kg` `` when non-null
3. **state + driver** — the verdict line (`Approved` in `STATUS_GREEN`; `` `Flagged — ${reason}` `` in `text-destructive`; `Pending review` in `text-muted-foreground`) followed by the driver: `` `${driver.name} · ${driver.phone} · ${driver.categories.join(", ")}` ``, or `No driver assigned` in `text-destructive` when `driver === null`.

When `vehicle.vehicleId === null`, replace lines 1–2 with the "vehicle no longer on file" treatment the driver drawer uses for its missing vehicle — a `border-destructive/40 bg-destructive/5` block reading:

```
Vehicle no longer on file
This vehicle was removed after the fleet was submitted. Flag it so the company can correct the application.
```

The verdict controls stay: flagging a removed vehicle is exactly the right action.

Controls per card (hidden when `isReadOnly`), same markup as the company block's pair:

- `Approve` — `variant={isApproved ? "default" : "outline"}`, calls `reviewVehicle(id, { verdict: "APPROVED" })`
- `Flag` — `variant={isFlagged ? "destructive" : "outline"}`, `aria-expanded`, toggles `reasonVehicleId`

Flag expands the six chips (same chip classes as §5):

```tsx
const VEHICLE_FLAG_REASONS: readonly string[] = [
  "Plate does not match the documents",
  "Payload above the class limit",
  "Dimensions look wrong",
  "Vehicle too old for the platform",
  "Duplicate plate on another fleet",
  "Cooling unit record missing",
];
```

`vehicleError` for this card renders under it, keyed by `applicationVehicleId`.

### 7. Mutations

```ts
async function reviewCompany(
  body: { verdict: "VERIFIED" } | { verdict: "FLAGGED"; reason: string },
) {
  setPending({ kind: "company" });
  setCompanyError(null);
  setVerdictError(null);

  try {
    const response = await fetch(
      `/api/admin/business-applications/${applicationId}/company`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      setCompanyError(await readErrorMessage(response, COMPANY_VERDICT_ERROR_FALLBACK));
      return;
    }

    const verdict = (await response.json()) as AdminBusinessCompanyReviewResponse;

    // Applied from the endpoint's own response so the state line updates on this
    // render, whatever the follow-up re-read does.
    setData((previous) =>
      previous === null
        ? previous
        : {
            ...previous,
            companyReviewStatus: verdict.companyReviewStatus,
            companyFlagReason: verdict.companyFlagReason,
          },
    );
    setCompanyReasonsOpen(false);
    onChanged();
    await refreshDetail();
  } catch {
    setCompanyError(COMPANY_VERDICT_ERROR_FALLBACK);
  } finally {
    setPending(null);
  }
}
```

`reviewVehicle(applicationVehicleId, body)` is the same shape against `` `/api/admin/business-applications/${applicationId}/vehicles/${applicationVehicleId}` `` — the route's dynamic segment is named `[vehicleId]`, but the value it takes is a `BusinessApplicationVehicle.id`, so the local stays `applicationVehicleId` — applying the response by mapping over `previous.vehicles` and **recomputing `counts` locally** from the updated array so the header line and footer hint move on the same render:

```ts
const vehicles = previous.vehicles.map((entry) =>
  entry.applicationVehicleId === verdict.applicationVehicleId
    ? { ...entry, status: verdict.status, flagReason: verdict.flagReason }
    : entry,
);
return {
  ...previous,
  vehicles,
  counts: {
    total: vehicles.length,
    approved: vehicles.filter((v) => v.status === "APPROVED").length,
    flagged: vehicles.filter((v) => v.status === "FLAGGED").length,
    pending: vehicles.filter((v) => v.status === "PENDING").length,
  },
};
```

The two terminal decisions share one function, both `POST` with no body, both closing the panel on success — the application has left the reviewer's current bucket, and a detail view of a row no longer in the list it was opened from is stale by definition:

```ts
async function submitVerdict(
  kind: "request-changes" | "activate",
  fallbackMessage: string,
) { … }
```

On failure it sets `verdictError` and clears `pending`. On success it calls `onChanged()`, then `router.refresh()`, then `onClose()` — and deliberately leaves `pending` set, because the parent unmounts this panel on `onClose()` and a button that flicks back to life in between invites a second request.

`router.refresh()` comes from `useRouter()` in `next/navigation`. It matters on activation specifically: `LogisticsCompany.activatedAt` changes what server-rendered surfaces show, and the project's rule is `router.refresh()` after any mutation that changes server-rendered data. Call it after both decisions for consistency.

**Every mutation surfaces its `{ error }` inline.** Never `alert()`.

### 8. Footer

```tsx
<footer className="border-t border-border bg-muted/40 px-[22px] py-3.5">
  <p className="mb-2.5 text-xs text-muted-foreground">{data === null ? " " : footerHint}</p>
  {verdictError !== null ? (
    <p role="alert" className="mb-2.5 text-[13px] text-destructive">{verdictError}</p>
  ) : null}
  <div className="flex gap-2.5"> …two buttons… </div>
</footer>
```

The hint changes with progress. Evaluate in **this order** — the first true arm wins, and the order is what makes the hint explain the *currently binding* blocker rather than an earlier one:

```ts
const flaggedItemCount = counts.flagged + (companyFlagged ? 1 : 0);

const footerHint = isReadOnly
  ? "This fleet is active — the company can dispatch its approved vehicles."
  : isAwaitingCompany
    ? "Changes were requested — waiting on the company to resubmit before this fleet can be activated."
    : companyReviewStatus === "PENDING"
      ? "Verify the company's details before this fleet can be activated."
      : counts.pending > 0
        ? `${counts.pending} vehicle${counts.pending === 1 ? "" : "s"} still to review.`
        : companyFlagged || counts.flagged > 0
          ? `${flaggedItemCount} item${flaggedItemCount === 1 ? "" : "s"} flagged. Requesting changes sends the fleet back for correction.`
          : counts.approved === 0
            ? "Every vehicle is flagged — approve at least one before activating the fleet."
            : "Company verified and every vehicle decided — ready to activate the fleet.";
```

(The `counts.approved === 0` arm is reachable only when nothing is flagged and nothing is pending on an empty fleet — a zero-vehicle application, which submit forbids but a deleted review row could produce. Keep it: it is the last guard before the "ready" line.)

**Request changes** — destructive, left:

```tsx
<Button
  type="button"
  variant="destructive"
  size="lg"
  className="h-[42px] flex-1 text-[13.5px]"
  disabled={data === null || isReadOnly || isAwaitingCompany || flaggedItemCount === 0 || isBusy}
  title={requestChangesBlockedReason ?? undefined}
  onClick={() => void submitVerdict("request-changes", REQUEST_CHANGES_ERROR_FALLBACK)}
>
  {pending?.kind === "request-changes"
    ? "Requesting…"
    : flaggedItemCount > 0
      ? `Request changes (${flaggedItemCount})`
      : "Request changes"}
</Button>
```

`flaggedItemCount` counts the flagged company as one item alongside each flagged vehicle, so the `(n)` in the label is the number of things the company will be asked to fix. Its disabled conditions mirror task-18's guards exactly:

```ts
const requestChangesBlockedReason = isReadOnly
  ? "This fleet has already been activated."
  : isAwaitingCompany
    ? "Changes have already been requested on this application."
    : flaggedItemCount === 0
      ? "Flag the company's details or at least one vehicle before requesting changes."
      : null;
```

**Activate fleet** — default, right:

```tsx
<Button
  type="button"
  size="lg"
  className="h-[42px] flex-1 text-[13.5px]"
  disabled={data === null || activateBlockedReason !== null || isBusy}
  title={activateBlockedReason ?? undefined}
  onClick={() => void submitVerdict("activate", ACTIVATE_ERROR_FALLBACK)}
>
  {pending?.kind === "activate" ? "Activating…" : "Activate fleet"}
</Button>
```

```ts
const activateBlockedReason = isReadOnly
  ? "This fleet has already been activated."
  : isAwaitingCompany
    ? "This application is still waiting on the company to resubmit."
    : companyReviewStatus !== "VERIFIED"
      ? "Verify the company's details before activating the fleet."
      : counts.pending > 0
        ? `${counts.pending} vehicle${counts.pending === 1 ? " is" : "s are"} still pending review. Decide every vehicle before activating the fleet.`
        : counts.approved === 0
          ? "At least one vehicle must be approved before activating the fleet."
          : null;
```

Those five strings are task-18's refusal messages verbatim, so a reviewer who somehow reaches the endpoint anyway (a stale tab, a second reviewer working the same application) reads the same sentence they would have read from the hover. The reason is surfaced three ways — as the footer hint, as the button's `title`, and as `verdictError` if the server refuses — rather than leaving a disabled button unexplained.

The client-side disable is a convenience only. **Task-18's server guards are the real boundary**; do not weaken either side because the other exists.

### 9. Things not to do

- Do not add a Sheet/Dialog primitive, a focus-trap library, or `react-aria`. The driver drawer is hand-rolled for a reason and the two must stay consistent.
- Do not use `bg-primary` expecting orange — `--primary` is near-black. The admin surface is the light shadcn palette; the brand orange (`bg-onboarding-accent`) belongs to the company-facing wizard, not to the back office.
- Do not add `data-onboarding-surface` here. That token scopes the *onboarding* palette; this component renders inside the admin layout, which already has the right surface.
- Do not paginate or virtualise the vehicle list. 40 is the hard cap per application (`requirements.md`), and a scrolling column of 40 cards is the design.
- Do not render document thumbnails. Business applications upload no documents in v1.

## Acceptance Criteria

- [ ] The panel is 560px wide (`w-[560px] max-w-full`), right-anchored, over a `fixed inset-0 z-40 bg-black/20` scrim, with the exact class strings quoted above.
- [ ] Escape, the backdrop and the × button all close it, and none of them do while a request is in flight.
- [ ] Every company field is read from the nested `data.company.*` (`companyName`, `vatId`, `registeredAddress`, `primaryCity`, `citiesOfOperation`, `contactName`, `contactRole`, `phone`, `email`, `bankAccountIban`); nothing reads a top-level `data.companyName`.
- [ ] The Company block shows VAT/tax ID, registered address, cities of operation, contact name + role, phone, email and payout IBAN, with em-dashes for empty values.
- [ ] "Company details verified" records `VERIFIED` and clears the reason; "Flag company details" expands exactly the four listed chips, and clicking one flags with that reason.
- [ ] The fleet header reads "N approved, N flagged, N pending" and updates on the same render as a verdict.
- [ ] Each vehicle card shows class + plate, then body · model · year · payload, then state + driver (name, phone, licence categories), and offers Approve / Flag with exactly the six listed chips.
- [ ] A vehicle with `vehicleId: null` renders the "Vehicle no longer on file" treatment and is still flaggable.
- [ ] The footer hint moves through every arm of the chain above as the reviewer works, and "Request changes (n)" shows the flagged-item count.
- [ ] Both footer buttons are disabled exactly under task-18's refusal conditions, with the blocking reason surfaced (hint + `title`), and a server refusal renders inline as `{ error }`.
- [ ] An `APPROVED` application opens read-only: no verdict buttons, no chips, footer hint "This fleet is active — the company can dispatch its approved vehicles."
- [ ] Every mutation calls `onChanged()` and `router.refresh()` on success; the two terminal decisions also close the panel.
- [ ] No `alert()` anywhere; every failure path renders text.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- All API types are imported type-only from the route modules, so nothing of Prisma or Better Auth is pulled into this client bundle. That shared shape is what stops the panel and the API drifting apart.
- The `STATUS_GREEN` inline style and `color-mix(in oklch, …)` border are copied deliberately from the driver drawer: the design's approved green has no token, and inventing one in `globals.css` for two components would be a palette of one.
- `counts` is recomputed locally after a vehicle verdict *and* re-read from the server by `refreshDetail()`. The local recompute is what makes the UI feel immediate; the re-read is what makes it correct if two reviewers are working the same application.
- The design's footer wording ("a hint that changes with progress") is realised by the chain in §8. If a hint arm ever disagrees with a task-18 guard, the guard is right — fix the hint.
