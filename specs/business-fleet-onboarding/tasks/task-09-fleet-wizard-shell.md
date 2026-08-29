# Task 09: Fleet Wizard Shell

## Status

pending

## Wave

3

## Description

Builds the route, its eligibility guard, and every piece of chrome the five wizard steps and the status screen plug into: the welcome phase, the left step rail with its live fleet tally, the five-segment progress bar, the toast, and — most importantly — `FleetDraftProvider`, the one context that owns *all* wizard state (the draft blob, the current step, the application status, the per-vehicle verdicts, saving, loading and the toast slot). Every step component built in wave 4 takes **zero props** and reads and writes through `useFleetDraft()`.

This task deliberately builds **stubs** for the five steps and the status screen — a one-line placeholder body with the real (empty) signature — so wave 4's six tasks each fill in exactly one file with no collisions. It builds no real step UI, not even partially. Read `UI:UX/Business Fleet Onboard/design_handoff_business_onboarding/README.md`'s "Surfaces", "Welcome" and "Interactions & behaviour" sections before starting, and read `src/components/driver-onboarding/onboarding-draft-context.tsx` end to end: this context is that file's mechanics re-applied to a different payload, and every one of its documented guards (stale-response sequencing, the unmount flush, the two-mode load) is load-bearing here for the same reasons.

## Dependencies

**Depends on:** task-05-fleet-draft-api.md
**Blocks:** task-10-step1-company-details.md, task-11-step2-fleet-composition.md, task-12-step3-vehicle-specifications.md, task-13-step4-drivers-assignment.md, task-14-step5-review-submit.md, task-15-application-status-screen.md

**Context from dependencies:**

`task-05` ships the resumable draft API and the draft type module. Restated in full so this task never has to open that file:

**`src/lib/fleet-onboarding/draft-schema.ts`** (pure data + pure functions, no server-only imports — safe to import from client components):

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
  /** Stable client-generated id (crypto.randomUUID()). Survives count changes. */
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
  /** "Hino 916" — names the prefill source in the editor footer. Absent for free text. */
  prefillSource?: string;
  /** `DriverProfile.id` of the assigned driver. */
  driverProfileId?: string;
};

export type FleetDraftV1 = {
  version: 1;
  company?: FleetDraftCompany;
  fleet?: FleetDraftFleet;
  vehicles?: FleetDraftVehicle[];
};

/** Returns null for anything that is not a `version: 1` object. */
export function parseFleetDraft(value: unknown): FleetDraftV1 | null;

/** "BIZ-40219" — prefix + 5 random digits; callers retry on P2002. */
export function generateBusinessApplicationReference(): string;
```

Four binding points this shell must not drift from:

- **Counts are nested.** The declared fleet lives at `draft.fleet.counts`, never at a flat
  `draft.fleet`. Anything that iterates the counts iterates `draft.fleet?.counts`.
- The count key is `` `${chassisType}:${classId}` `` — a single colon, enum values on both sides.
- A vehicle's primary key is **`id`**, its class field is **`classId`** (not `vehicleClass`), and
  its driver is **`driverProfileId` on the vehicle itself**. There is no `assignments` section and
  no `FleetDraftAssignment` type — the draft has exactly three sections: `company`, `fleet`,
  `vehicles`.
- The reference prefix is `BIZ-` + 5 digits; `BIZ-40219` is the example string used throughout
  this feature.

The same module also exports the two clamp bounds this shell's `persistedStep` uses,
`FLEET_FIRST_STEP = 1` and `FLEET_LAST_STEP = 5`, which are the endpoints of the API's integer
`draftStep` range.

**`GET /api/logistics-company/onboarding`** → 200 with:

```ts
{
  status: "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED";
  reference: string;                       // "BIZ-40219" — non-null, allocated here
  draftStep: number;                       // integer 1–5
  draftUpdatedAt: string | null;           // ISO
  draft: FleetDraftV1 | null;              // returned only while status === "DRAFT"
  companyReviewStatus: "PENDING" | "VERIFIED" | "FLAGGED";
  companyFlagReason: string | null;
  /** The per-vehicle review rows. Surfaced on the hook as `vehicleVerdicts`
   *  (typed `FleetVehicleVerdict[]`, restated in full in §2). */
  vehicles: FleetVehicleVerdict[];
  submittedSummary: FleetSubmittedSummary | null;
}
```

It creates the `BusinessApplication` row on first read if the company has none — allocating `reference` at that moment, non-null, with a P2002 retry — so the client never has to handle "no application yet" or a missing reference. `vehicles` is `[]` while `status === "DRAFT"`: nothing is written to `BusinessApplicationVehicle` before submit. Each row carries **both** `id` (the `BusinessApplicationVehicle.id` the admin verdict routes address) and `vehicleId` (the `Vehicle.id` `task-15`'s Fix PATCH is keyed on, null when the vehicle has since been removed from the fleet), and `position` is 1-based and derived from `createdAt` ordering in the response rather than stored as a column.

**`PATCH /api/logistics-company/onboarding`** takes `{ draftStep: number; draft: FleetDraftV1 }`, replaces the whole blob (no server-side merge), validates `draftStep` as an **integer in [1, 5]**, rejects a draft over `MAX_DRAFT_JSON_LENGTH = 64 * 1024` with 400, and returns **204** with no body.

**The draft is writable ONLY while `status === "DRAFT"`.** `PATCH` returns 400 `An application under review can no longer be edited.` for **all three** of `PENDING`, `ACTION_REQUIRED` and `APPROVED`, and `GET` returns `draft` only while `DRAFT`. `ACTION_REQUIRED` is not an exception: the correction loop does **not** go through the draft at all — a flagged vehicle is corrected through `PATCH /api/logistics-company/onboarding/vehicles/[vehicleId]` and a flagged company block through `POST /api/logistics-company`, both owned by other tasks. That is why this shell renders `FleetApplicationStatusScreen` for every non-`DRAFT` status rather than routing `ACTION_REQUIRED` back into the wizard, and why the client-side `persist` bail in §2.9 is on `statusRef.current !== "DRAFT"` rather than on a list of two statuses.

**`POST /api/logistics-company/onboarding/reset`** clears the draft to **`Prisma.DbNull`** — SQL `NULL`, not an empty `{ version: 1 }` object — resets `draftStep` to 1, and returns 204. It is only valid on a `DRAFT` application (400 otherwise). The client does not need to know the difference beyond this: `resetApplication` re-`GET`s and the shell renders whatever comes back, and `EMPTY_DRAFT` below is the client-side stand-in for a null blob.

Every error body from all three is `{ error: string }`.

## Files to Create

- `src/app/dashboard/fleet-onboarding/page.tsx` — server component: role + eligibility guard, then the provider and shell.
- `src/components/fleet-onboarding/fleet-draft-context.tsx` — the client context that owns all wizard state.
- `src/components/fleet-onboarding/fleet-wizard-shell.tsx` — client root: welcome phase, chrome, screen routing.
- `src/components/fleet-onboarding/fleet-step-rail.tsx` — the 5-entry left rail plus the live fleet tally card.
- `src/components/fleet-onboarding/fleet-progress-bar.tsx` — five segments, 0.35s width transition.
- `src/components/fleet-onboarding/fleet-onboarding-toast.tsx` — the single toast slot.
- `src/components/fleet-onboarding/steps/step-1-company-details.tsx` — **stub**, filled by `task-10`.
- `src/components/fleet-onboarding/steps/step-2-fleet-composition.tsx` — **stub**, filled by `task-11`.
- `src/components/fleet-onboarding/steps/step-3-vehicle-specifications.tsx` — **stub**, filled by `task-12`.
- `src/components/fleet-onboarding/steps/step-4-drivers-assignment.tsx` — **stub**, filled by `task-13`.
- `src/components/fleet-onboarding/steps/step-5-review-submit.tsx` — **stub**, filled by `task-14`.
- `src/components/fleet-onboarding/fleet-application-status-screen.tsx` — **stub**, filled by `task-15`.

## Technical Details

### 1. `src/app/dashboard/fleet-onboarding/page.tsx`

Server component. `export const dynamic = "force-dynamic";` — it touches the session and Prisma, so it cannot be statically rendered.

`src/app/dashboard/layout.tsx` already guarantees a session, a non-`CLIENT` role and a non-`mustChangePassword` account via `requireDashboardSession()`. Call `requireDashboardSession()` again here for the session object itself — it is wrapped in React `cache()`, so the second call costs nothing within one render pass.

```tsx
import { redirect } from "next/navigation";

import { FleetDraftProvider } from "@/components/fleet-onboarding/fleet-draft-context";
import { FleetWizardShell } from "@/components/fleet-onboarding/fleet-wizard-shell";
import { requireDashboardSession } from "@/lib/dashboard/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FleetOnboardingPage() {
  const session = await requireDashboardSession();

  // Defensive: the layout bounces CLIENT, but an ADMIN or DRIVER session
  // reaches this route otherwise.
  if (session.user.role !== "COMPANY") {
    redirect("/dashboard");
  }

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: {
      activatedAt: true,
      application: { select: { status: true } },
    },
  });

  const eligible =
    company !== null &&
    (company.activatedAt === null ||
      company.application?.status === "APPROVED");

  if (!eligible) {
    redirect("/dashboard");
  }

  return (
    <FleetDraftProvider>
      <FleetWizardShell />
    </FleetDraftProvider>
  );
}
```

The eligibility split mirrors `src/app/dashboard/onboarding/page.tsx` exactly, and for the same two reasons — copy its header comment's reasoning into this file in your own words:

- **`activatedAt === null`** is the "still owes us an application" term. `task-01`'s migration adds `LogisticsCompany.activatedAt DateTime?` and backfills a timestamp onto every pre-existing, admin-created company, so a grandfathered company that never owed an application is bounced to `/dashboard` rather than dropped into a wizard with no way out.
- **The `APPROVED` arm** is what keeps the "Your fleet is live." screen reachable. The shell renders `FleetApplicationStatusScreen` for any `status !== "DRAFT"`, so this page is the approved company's confirmation screen, and that screen's own "Open the dispatch dashboard" CTA is the exit. Approval writes `status: "APPROVED"` and `activatedAt` in one transaction, so without this arm the first term alone would redirect every approved company and make the screen unreachable on reload. It is narrower than dropping the `activatedAt` term entirely: a grandfathered company has no `BusinessApplication` row at all, so `application?.status` is `undefined`, fails this arm too, and stays out.

A COMPANY user with **no** `LogisticsCompany` row redirects to `/dashboard`: that is the interrupted-sign-up case, and `CompanyDashboard` already owns the fallback for it. Two surfaces racing to explain one broken state is worse than one.

This guard is **defensive only** — it protects a direct or bookmarked visit. `task-21` owns the outbound redirect that proactively sends a company here from `/dashboard`, and it must not be added in this task.

### 2. `src/components/fleet-onboarding/fleet-draft-context.tsx`

`"use client"`. This file owns every byte of wizard state. Steps never prop-drill.

**Screen numbering.** Five steps, five integer screen numbers. Export the map and have every step import the names rather than hard-coding digits:

```ts
export const FLEET_SCREENS = {
  /** Step 1 — company phone, then company details (both inside task-10's component). */
  company: 1,
  /** Step 2 — fleet composition. */
  fleet: 2,
  /** Step 3 — vehicle specifications. */
  vehicles: 3,
  /** Step 4 — drivers & assignment. */
  drivers: 4,
  /** Step 5 — review & submit. */
  review: 5,
} as const;
```

Unlike the driver wizard there are **no fractional screens**. Step 1 has two sub-screens in the design (company phone, then company details) but they live inside `step-1-company-details.tsx` as plain local state — the same call `step-3-chassis-class.tsx` makes for 3a/3b. That keeps `draftStep` an integer everywhere, so `persistedStep` is a plain clamp:

```ts
function persistedStep(screen: number): number {
  return Math.min(
    Math.max(Math.trunc(screen), FLEET_FIRST_STEP),
    FLEET_LAST_STEP,
  );
}
```

Keep the function anyway rather than inlining the clamp: it is the single place the API's `[1, 5]` integer contract is enforced client-side.

**Exported types.**

```ts
export type FleetApplicationStatus = "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED";
export type FleetCompanyReviewStatus = "PENDING" | "VERIFIED" | "FLAGGED";

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

/** What was actually submitted, as `task-05`'s GET returns it — built from the
 *  normalized `LogisticsCompany` columns and the `BusinessApplicationVehicle`
 *  → `Vehicle` join, never from the draft. After submit the draft is no longer
 *  the source of truth, and a summary the company shows itself must match what
 *  the reviewer sees. Null while `status === "DRAFT"`. */
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
  /** Body-type label -> count, for the status screen's fleet line. */
  countsByBodyType: Record<string, number>;
};
```

`FleetVehicleVerdict` is deliberately **not** narrowed to what a status list needs. It carries both ids and the full declared specification because `task-15` seeds its per-vehicle Fix editor directly from this array — a flagged vehicle's correction dialog opens pre-filled with the make, model, year, colour, payload, the three cargo dimensions and the assigned driver, and it PATCHes on `vehicleId` while the admin side decides on `id`. A verdict type carrying only `plateNumber` and `driverName` would force `task-15` into a second per-vehicle fetch that this feature has no endpoint for. Note the two class field names are different on purpose: the *draft* vehicle's class is `classId`, the *verdict*'s is `vehicleClass`, because the latter is the denormalised `BusinessApplicationVehicle.vehicleClass` column read straight back.

**The full hook surface.** `useFleetDraft(): FleetDraftState` returns exactly this and nothing else:

```ts
export type FleetDraftState = {
  /** True until the first foreground GET settles. No step renders before then. */
  loading: boolean;
  /** Why the initial load failed. Distinct from `saveError`: a failed load
   *  means nothing on screen can be trusted and the only action is retry. */
  loadError: string | null;
  /** Why the most recent PATCH failed; cleared by the next success or reload. */
  saveError: string | null;
  /** True while a PATCH is in flight, for the header's quiet "Saving…" line. */
  saving: boolean;

  status: FleetApplicationStatus | null;
  reference: string | null;
  companyReviewStatus: FleetCompanyReviewStatus | null;
  companyFlagReason: string | null;
  vehicleVerdicts: FleetVehicleVerdict[];
  /** `task-05`'s GET field, built from the normalized rows rather than the
   *  draft, with `bankAccountIban` already masked to its last four characters.
   *  Null while `status === "DRAFT"`. `task-15`'s approved state renders its
   *  summary card from this, which is why it is on the surface rather than
   *  fetched separately — there stays exactly one loader. */
  submittedSummary: FleetSubmittedSummary | null;

  /** The current screen — a `FLEET_SCREENS` value. */
  draftStep: number;
  /** ISO timestamp of the last successful save, or null for a fresh draft.
   *  Drives the welcome screen's resume banner. */
  draftUpdatedAt: string | null;
  draft: FleetDraftV1;

  /** Section-level merge (`{ company }`, `{ fleet }`, `{ vehicles }`) + a
   *  debounced PATCH. NOT a deep merge — see below. */
  updateDraft: (patch: Partial<FleetDraftV1>) => void;
  /** Navigate to a `FLEET_SCREENS` value, saving immediately. */
  goToStep: (step: number) => void;
  refetch: () => Promise<void>;
  /** "Start a new application" — resolves false (having raised a toast) if
   *  the reset failed, so the caller stays put rather than navigating into a
   *  state the server never created. */
  resetApplication: () => Promise<boolean>;
  showToast: (message: string, tone?: "default" | "error") => void;
};
```

`draftUpdatedAt` is on the surface in addition to the fields the wave-4 tasks strictly need: the welcome screen's resume banner renders a relative "saved 3 days ago" line from it, and it is the only signal that a draft exists at all.

**Mechanics to copy from `onboarding-draft-context.tsx`, each for the reason documented there.** Port the comments too — they explain non-obvious guards that a later reader will otherwise "simplify" away.

1. **Ref mirrors.** `draftRef`, `stepRef`, `statusRef` shadow `draft`, `draftStep` and `status`. The save callbacks read the refs, so `persist` / `updateDraft` / `goToStep` stay identity-stable across renders (they must not re-trigger every consumer's effects) while still seeing the newest values from inside a timer.
2. **`const SAVE_DEBOUNCE_MS = 300;`** on edits. Short enough that a company closing the tab a second after typing keeps its work, long enough that typing a company name is one request rather than eighteen.
3. **`goToStep` saves immediately**, clearing the debounce timer *first*. Navigation is a single deliberate act whose new `draftStep` must not be lost to a timer a route change is about to discard; the pending edit is folded into the same request because it sends the same draft.
4. **`saveSequence`** — a monotonic counter bumped at the top of every `persist`. A response whose sequence is no longer current returns early before touching `saveError`, `saving` or `draftUpdatedAt`, so an earlier PATCH resolving after a later one cannot overwrite the later one's state.
5. **`savePending` + unmount flush.** `updateDraft` sets `savePending.current = true`; `persist` clears it. The unmount effect clears both timers and, if a save is still owed **and** `statusRef.current === "DRAFT"`, fires a bare `fetch(ENDPOINT, { method: "PATCH", …, keepalive: true }).catch(() => {})` — not `persist`, because there is no state left to update and nothing to report a failure to. The point is only that the browser may finish the request after the page is gone.
6. **Two-mode `load({ silent })`.** Foreground (what `refetch` exposes) owns `loading` and `loadError`. Silent is for the status poll, where a `loading` flip would blank the status screen every 25 seconds and one dropped poll on a flaky connection would replace a good screen with an error page — a silent failure leaves the last-known-good state alone and waits for the next tick. Carry over `loadSequence` and the `foregroundLoads` counter, and re-check the sequence **after** `await response.json()` as well as after the fetch, since parsing is a second await during which a newer request can start.
7. **`const STATUS_POLL_INTERVAL_MS = 25_000;`**, in an effect with `status` as a dependency, returning early unless `status === "PENDING" || status === "ACTION_REQUIRED"`. `DRAFT` has nothing to wait for and is the one status the wizard writes to; `APPROVED` is terminal. Making `status` a dependency is what tears the interval down the moment the poll itself reads back a terminal status, and the cleanup covers unmount for free.
8. **Section-level merge in `updateDraft`, never a deep merge**, with `version` re-pinned last:

   ```ts
   const next: FleetDraftV1 = {
     ...draftRef.current,
     ...patch,
     version: FLEET_DRAFT_VERSION,
   };
   ```

   A step that clears a field sends its whole section back without it; a deep merge would resurrect it. Re-pinning `version` last means a patch can never drop or downgrade it. This is also what lets `task-11` write `{ fleet: { counts: next } }` — the whole `fleet` section, counts and all — without disturbing `draft.vehicles`.
9. **`persist` bails when `statusRef.current !== "DRAFT"`**, clearing `savePending` first. `PATCH` rejects a submitted application with a 400 and the wizard is not rendered for one — but a submit landing in another tab mid-debounce would otherwise produce a spurious save error.
10. **`resetApplication`** clears the timer, clears `savePending`, bumps `saveSequence` to invalidate an in-flight save, and calls `setSaving(false)` explicitly — that sequence bump means the in-flight `persist`'s `finally` will not recognise itself as current and would otherwise strand "Saving…" on screen forever. On a non-ok response or a throw it raises an error toast and returns `false`; on success it `await refetch()`s (the server decides the new `draftStep`) and returns `true`.
11. **`showToast` clears the previous timer first**, so a second toast raised over a live one gets a full display window rather than the remainder of one. `const TOAST_DURATION_MS = 2400;` — the business design's 2.4s, not the driver wizard's 2.2s.
12. **`readErrorMessage(response, fallback)`** — `await response.json().catch(() => null)` then `payload?.error ?? fallback`, so an HTML error page from an unhandled crash cannot throw over the top of the real failure.
13. **The hook throws outside the provider**, rather than returning `undefined`:

    ```ts
    export function useFleetDraft(): FleetDraftState {
      const ctx = useContext(FleetDraftContext);
      if (!ctx) {
        throw new Error("useFleetDraft must be used within FleetDraftProvider.");
      }
      return ctx;
    }
    ```

Constants and fallback copy:

```ts
const FLEET_ONBOARDING_ENDPOINT = "/api/logistics-company/onboarding";
const RESET_ENDPOINT = `${FLEET_ONBOARDING_ENDPOINT}/reset`;

const LOAD_ERROR_FALLBACK =
  "We couldn't load your application. Check your connection and try again.";
const SAVE_ERROR_FALLBACK =
  "We couldn't save your progress. Your latest answers aren't stored yet.";
const RESET_ERROR_FALLBACK =
  "We couldn't start a new application. Please try again.";

const EMPTY_DRAFT: FleetDraftV1 = { version: FLEET_DRAFT_VERSION };
```

The provider renders `{children}` followed by `<FleetOnboardingToast toast={toast} />`, and memoises the context value with `useMemo` over every field.

### 3. `fleet-wizard-shell.tsx` — phases, chrome, screen routing

`"use client"`. Owns exactly one piece of state, `phase: "welcome" | "step"`, defaulting to `"welcome"` on every mount regardless of `draftStep` — per the design, a company returning to a half-finished application is told what it is returning to and offered the choice, rather than dropped back into a form mid-sentence. A second `resetting` boolean guards "Start a new application" against a double-fire while the request is in flight.

Render order, top to bottom:

1. **`loading`** → the `Surface` with a centred `<p className="text-sm text-muted-foreground">Loading your application…</p>`.
2. **`loadError !== null`** → the `Surface` with the message and an outline `Button` calling `void refetch()` labelled "Try again".
3. **`status !== null && status !== "DRAFT"`** → the rail (with every entry raising the toast `"Your application is with the review team — there is nothing left to edit."` instead of navigating, since a submitted application has no editable step) plus `<FleetApplicationStatusScreen />` inside the content column, wrapped in `animate-onboarding-fade-up`. Status wins over both the welcome phase and any wizard step — including an application submitted in another tab while this one sat on welcome.
4. **`phase === "welcome"`** → the welcome screen (below).
5. Otherwise the step chrome + `renderScreen(draftStep)`.

**Screen headers**, following the design's `STEPS` array:

```ts
const SCREEN_HEADERS: { screen: number; kicker: string; title: string }[] = [
  { screen: FLEET_SCREENS.company,  kicker: "Step 1 of 5 · Company & authorisation", title: "Company details" },
  { screen: FLEET_SCREENS.fleet,    kicker: "Step 2 of 5 · Fleet",                   title: "Fleet composition" },
  { screen: FLEET_SCREENS.vehicles, kicker: "Step 3 of 5 · Vehicles",                title: "Vehicle specifications" },
  { screen: FLEET_SCREENS.drivers,  kicker: "Step 4 of 5 · Drivers",                 title: "Drivers & assignment" },
  { screen: FLEET_SCREENS.review,   kicker: "Step 5 of 5 · Review",                  title: "Check and submit" },
];
```

One entry per screen, including step 1: the design's separate "Company phone" title is deliberately not modelled here, because that sub-screen is local state inside `task-10`'s component and the header lives in the shell. `task-10` is told this and leads its phone sub-screen with the design's intro sentence and an uppercase "Company phone" field label directly beneath the shared header, which reads correctly. Document that trade in this file's header comment so `task-10` can find it.

**The render helper** — a `switch`, so a new screen number is a compile-time exhaustiveness question rather than a silent blank:

```tsx
function renderScreen(screen: number) {
  switch (screen) {
    case FLEET_SCREENS.company:
      return <Step1CompanyDetails />;
    case FLEET_SCREENS.fleet:
      return <Step2FleetComposition />;
    case FLEET_SCREENS.vehicles:
      return <Step3VehicleSpecifications />;
    case FLEET_SCREENS.drivers:
      return <Step4DriversAssignment />;
    case FLEET_SCREENS.review:
      return <Step5ReviewSubmit />;
    default:
      return null;
  }
}
```

**Step chrome**, matching the driver shell's layout exactly:

- A 34px square Back button (`size-[34px] shrink-0 rounded-[9px] border border-border bg-card text-muted-foreground`, `ChevronLeftIcon className="size-4"`, `aria-label="Back"`). Back walks `SCREEN_ORDER` one place left; from screen 1 (or an unrecognised screen, where `indexOf` is `-1`) it returns to the welcome phase rather than doing nothing.
- The kicker `font-price text-[10.5px] font-semibold tracking-[0.09em] text-onboarding-accent uppercase` and the title `mt-0.5 text-[26px] font-semibold tracking-[-0.02em]`.
- The quiet save indicator on the same line: `saveError ?? (saving ? "Saving…" : null)`, `text-xs`, `text-destructive` + `role="alert"` when it is an error, `text-muted-foreground` otherwise.
- `<FleetProgressBar currentStep={draftStep} />` in an `mt-5` wrapper.
- The step itself in `<div key={draftStep} className="animate-onboarding-fade-up mt-7">` — keyed on the screen so each entering panel replays the design's `fadeUp` 0.3s instead of the content swapping inside a stationary box.

**The `Surface` and the content column.** `Surface` is the outermost `<main>` and carries `data-onboarding-surface=""` — without it the `src/components/ui` primitives resolve `accent`/`muted`/`border` against the landing palette:

```tsx
function Surface({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-onboarding-surface=""
      className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-muted font-body text-foreground md:flex-row"
    >
      {children}
    </main>
  );
}
```

**The content column is wider on the table steps.** The design's centred column is 1000px (not the driver wizard's 900px), and its inner panel width varies by screen — `680px` on the form steps, `760px` on fleet composition, and the full column width on the two table steps. Model that as a per-screen class on the inner wrapper, not by changing the outer column:

```tsx
/** Inner panel width per screen, from the design's own `colWidth`. Steps 3
 *  and 4 are tables — a numbered vehicle list and a driver-assignment list —
 *  and get the full 1000px column; the form steps stay at a readable measure. */
const CONTENT_WIDTH_CLASS: Record<number, string> = {
  [FLEET_SCREENS.company]: "max-w-[680px]",
  [FLEET_SCREENS.fleet]: "max-w-[760px]",
  [FLEET_SCREENS.vehicles]: "max-w-full",
  [FLEET_SCREENS.drivers]: "max-w-full",
  [FLEET_SCREENS.review]: "max-w-[680px]",
};

function ContentColumn({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1000px] px-6 md:px-12">{children}</div>
    </div>
  );
}
```

The step wrapper is then `` className={`${CONTENT_WIDTH_CLASS[draftStep] ?? "max-w-[680px]"} pt-10 pb-18`} ``. Welcome uses `max-w-[640px] pt-16 pb-18`; the status screen uses `py-10 pb-18` with no width cap.

**Fleet tally.** The shell computes it from the draft and passes it to the rail — the rail stays presentational and reads no context, so the shell remains the single place navigation and derived numbers are defined:

```ts
// Counts are NESTED at `draft.fleet.counts` — `draft.fleet` is a
// `FleetDraftFleet` object, not the count map itself. Summing
// `Object.values(draft.fleet ?? {})` would add up objects, not numbers.
const declared = Object.values(draft.fleet?.counts ?? {}).reduce((a, b) => a + b, 0);
const vehicles = draft.vehicles ?? [];
const specified = vehicles.filter(isVehicleSpecified).length;
const assigned = vehicles.filter((v) => Boolean(v.driverProfileId)).length;
```

`isVehicleSpecified` is a small local predicate — a vehicle counts as specified once it has a make, model, year, plate, colour, payload and all three dimensions. `task-12` owns the editor that fills those in; this shell only counts them, so keep the predicate here and keep it total (every field truthy) rather than importing anything from a wave-4 file.

The three tally rows, verbatim from the design's `tally`:

| Key | Value | Tone |
|---|---|---|
| `Declared` | `String(declared)` | always foreground |
| `Specified` | `` `${specified}/${vehicles.length}` `` or `—` when the list is empty | success green once `specified === vehicles.length` and non-zero, else muted |
| `Drivers assigned` | `` `${assigned}/${vehicles.length}` `` or `—` when the list is empty | same rule |

Success green has no token in `globals.css`; write it as the arbitrary value `text-[oklch(0.5_0.13_145)]`, the same call `step-1-auth-personal.tsx` makes for its uploaded-slot green, with a one-line comment saying so.

**Welcome phase.** Verbatim copy from the design:

- A 44px orange rounded square: `<div aria-hidden="true" className="mb-[30px] size-11 rounded-xl bg-onboarding-accent" />`.
- `<h1 className="text-[42px] leading-[1.08] font-semibold tracking-[-0.03em]">Register your fleet</h1>`.
- Sub, `mt-3.5 max-w-[540px] text-base leading-[1.55] text-muted-foreground`: "For logistics companies running more than one vehicle. Register the company once, declare the fleet by body type and class, then put a driver behind every vehicle."
- The five-step outline: `<ol className="mt-[34px] overflow-hidden rounded-[14px] border border-border">` over `FLEET_RAIL`, each `<li className="flex items-center gap-3 border-b border-border bg-card px-3.5 py-3.5 last:border-b-0">` with a `size-[22px] rounded-full bg-muted font-price text-[11px] font-semibold text-muted-foreground` number badge and the entry's `label` at `text-sm font-medium`.
- **Resume-draft banner**, rendered only when `draftUpdatedAt !== null`: `mt-6 flex flex-wrap items-center gap-5 rounded-[14px] border border-onboarding-accent bg-onboarding-accent/6 px-[18px] py-4` — that tint is the design's `rgba(255,90,31,0.06)`. Title `text-sm font-semibold` "Unfinished application"; the line beneath at `mt-[3px] text-[13px] text-muted-foreground` reads `` `${formatSavedAt(draftUpdatedAt)} · you left off at step ${draftStep} of ${FLEET_RAIL.length}` `` with `` ` · ${declared} vehicles declared` `` appended when `declared > 0` (singular "vehicle" at 1). A 44px "Resume" button (`h-11 shrink-0 rounded-[10px] bg-onboarding-accent px-5 text-[14.5px] font-semibold text-white hover:bg-onboarding-accent-hover`) sets `phase` to `"step"` without touching `draftStep`.
- **"Start a new application"** below it: `mt-4 h-[50px] rounded-xl border border-border bg-card px-[26px] text-[15px] font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50`. Its label is `"Start a new application"` when `draftUpdatedAt !== null` and plain `"Start"` when there is nothing to discard (the design's own `freshLabel`), and `"Starting…"` while `resetting`. It awaits `resetApplication()` and only moves to `phase: "step"` when that resolved `true` — on failure the context has already raised a toast and staying on welcome is correct, because the server cleared nothing.

`formatSavedAt(iso: string): string` is the `Intl.RelativeTimeFormat` helper from `onboarding-wizard-shell.tsx` — copy it into this file rather than importing it (it is not exported there, and extracting a shared module would mean editing a file this feature otherwise never touches). It is safe to compute during render: `draftUpdatedAt` only exists after the client-side `GET` resolves, so there is no server-rendered value for a clock difference to disagree with.

### 4. `fleet-step-rail.tsx`

```ts
export const FLEET_RAIL = [
  { step: 1, label: "Company & authorisation", sub: "Phone, legal entity, contact, payouts" },
  { step: 2, label: "Fleet composition", sub: "How many of each body type and class" },
  { step: 3, label: "Vehicle specifications", sub: "Plate, model, capacity per vehicle" },
  { step: 4, label: "Drivers & assignment", sub: "A named driver behind every vehicle" },
  { step: 5, label: "Review & status", sub: "Submit, per-vehicle verdicts, activation" },
] as const;
```

Verbatim from the design's `RAIL`. Exported because the welcome outline is the same five entries — it lives here so the shell can import it without the rail importing back from the shell.

Props: `{ currentStep: number; onSelect: (step: number) => void; tally: { key: string; value: string; tone: "default" | "success" | "muted" }[] }`. Purely presentational: it neither reads the draft context nor decides where a click goes.

Layout matches the driver rail — `<nav aria-label="Application progress" className="flex w-full flex-col gap-4 border-b border-border bg-card p-6 md:h-full md:w-[300px] md:shrink-0 md:border-r md:border-b-0 md:px-[22px] md:py-[26px]">`, an "Application progress" mono kicker, then the five entries as buttons with a `size-[22px]` mono number badge (`bg-onboarding-accent text-white` when active, `bg-primary text-primary-foreground` when done, `bg-border text-muted-foreground` otherwise), a `text-[13.5px] font-semibold` label that turns `text-onboarding-accent` when active, and the `text-[11.5px]` sub beneath. `aria-current={active ? "step" : undefined}`.

**The fleet tally card** replaces the driver rail's static footnote and is pinned to the bottom with `mt-auto`:

```tsx
<div className="mt-auto rounded-xl border border-border bg-muted/40 p-[13px]">
  <p className="font-price text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
    Fleet
  </p>
  <dl className="mt-[9px] flex flex-col gap-1.5">
    {/* one row per tally entry: <dt> at text-[12.5px], <dd> at
        font-price text-[12.5px] font-semibold, both taking the row's tone */}
  </dl>
</div>
```

Rows are `flex items-baseline justify-between gap-2.5`. Tone maps to `text-foreground` (default), `text-[oklch(0.5_0.13_145)]` (success) and `text-muted-foreground` (muted).

### 5. `fleet-progress-bar.tsx`

Props `{ currentStep: number }`. Five thin segments above the step heading, filled orange up to and including the current step. Each segment's **fill** animates its own width — not the track's — so advancing wipes the next segment in over the design's 0.35s rather than snapping:

```tsx
<div
  role="progressbar"
  aria-valuemin={1}
  aria-valuemax={FLEET_RAIL.length}
  aria-valuenow={currentStep}
  aria-valuetext={`Step ${currentStep} of ${FLEET_RAIL.length}`}
  className="flex gap-[5px]"
>
  {FLEET_RAIL.map((entry) => (
    <div key={entry.step} className="h-[3px] flex-1 overflow-hidden rounded-sm bg-border">
      <div
        className={`h-full bg-onboarding-accent transition-[width] duration-350 ease-out ${
          entry.step <= currentStep ? "w-full" : "w-0"
        }`}
      />
    </div>
  ))}
</div>
```

### 6. `fleet-onboarding-toast.tsx`

Presentational only; the provider owns the message and the dismissal timer.

```ts
export type FleetToastState = { message: string; tone: "default" | "error" } | null;
```

Returns `null` for a null toast. Otherwise a `<div role="status">` with `aria-live={tone === "error" ? "assertive" : "polite"}` — a toast replaced while on screen should be announced politely, not interrupt; errors get the assertive channel.

It **must re-declare `data-onboarding-surface=""`**. The toast is a sibling of the wizard's `<main>`, not a child, so it sits outside that element's surface subtree and would otherwise miss both the token resolution and the reduced-motion damping in `globals.css`.

```tsx
className="animate-onboarding-toast-in fixed bottom-8 left-1/2 z-90 -translate-x-1/2 rounded-[11px] px-[18px] py-3 text-[13.5px] font-medium text-white shadow-[0_12px_32px_rgba(0,0,0,0.25)]"
style={{
  backgroundColor:
    toast.tone === "error" ? "rgba(120,20,20,0.96)" : "rgba(17,17,19,0.94)",
}}
```

The two inks are inline styles, not Tailwind colour utilities: these exact translucent values are the design's own and are used nowhere else, so they would be single-use tokens rather than part of a palette — the same call `onboarding-toast.tsx` documents.

### 7. Step-rail jump guard

Rail entries jump directly via `goToStep`, and the shell also sets `phase` to `"step"` so a click from the welcome screen lands on the step rather than staying on welcome:

```tsx
function handleSelectStep(step: number) {
  // Steps 3, 4 and 5 are all generated from the declared fleet — an empty
  // vehicle table has nothing to specify, assign or review. The design flashes
  // this from step 3 onwards rather than disabling the entries, so the
  // company is told *why* the jump did nothing.
  if (step >= FLEET_SCREENS.vehicles && declared === 0) {
    showToast("Declare your fleet first.", "error");
    return;
  }
  goToStep(step);
  setPhase("step");
}
```

`declared` is the same total the tally uses. Note the guard is on the *declared count*, not on `draft.vehicles.length`: `task-11` writes counts and `task-12` materialises the vehicle list on entry to step 3, so a company that has declared a fleet but not yet reached step 3 must still be allowed through.

### 8. Step stubs

Six files, each a `"use client"` module exporting a zero-prop component with a one-line body. No props beyond what `useFleetDraft()` provides, because every step reads and writes through the shared context. Example:

```tsx
"use client";

export function Step1CompanyDetails() {
  return (
    <div className="text-sm text-muted-foreground">
      Step 1 — company details. Built by task-10.
    </div>
  );
}
```

The other five follow the same shape, exporting `Step2FleetComposition`, `Step3VehicleSpecifications`, `Step4DriversAssignment`, `Step5ReviewSubmit` and `FleetApplicationStatusScreen`. Do not add real UI to any of them in this task — a wave-4 task must find a clean file.

**The six filenames and their six export names are a contract with wave 4** — every one of those tasks opens a file by the name in "Files to Create" above and finds a stub with the export it expects. In particular the status screen is `src/components/fleet-onboarding/fleet-application-status-screen.tsx` exporting `FleetApplicationStatusScreen`, both `fleet`-prefixed; an unprefixed `application-status-screen.tsx` / `ApplicationStatusScreen` would collide with nothing today but is wrong, is what the shell's non-`DRAFT` branch imports by name, and is what `task-15` will open. The five step stubs live under `src/components/fleet-onboarding/steps/` and are named `step-{n}-{slug}.tsx` exactly as listed.

## Acceptance Criteria

- [ ] `/dashboard/fleet-onboarding` renders the welcome screen for a COMPANY user whose `LogisticsCompany.activatedAt` is null, and for one whose `BusinessApplication.status` is `APPROVED`.
- [ ] The same route redirects to `/dashboard` for a DRIVER, an ADMIN, a COMPANY user with no `LogisticsCompany` row, and an activated company whose application is not `APPROVED`.
- [ ] The welcome screen shows on every mount regardless of `draftStep`; "Resume" jumps to the saved step without resetting anything, and "Start a new application" calls the reset endpoint and only advances when it succeeded.
- [ ] Editing the draft PATCHes once, ~300 ms after the last change, not once per keystroke; a step-rail click PATCHes immediately with the new `draftStep`.
- [ ] Leaving the wizard within the debounce window still flushes the owed save (`keepalive`), and no save is attempted once the application is out of `DRAFT`.
- [ ] Two overlapping PATCHes cannot leave a stale `saveError` or a stuck "Saving…"; two overlapping GETs cannot leave a stale screen or a stuck spinner.
- [ ] A `PENDING` or `ACTION_REQUIRED` application re-reads its status every 25 s without the screen flickering; a `DRAFT` or `APPROVED` one issues no poll at all.
- [ ] The rail shows the live tally (Declared / Specified / Drivers assigned) and it updates as the draft changes; "Declared" is summed from `draft.fleet?.counts`, not from `draft.fleet`.
- [ ] `FleetVehicleVerdict` carries both `id` and `vehicleId`, the full declared specification and the nested `driver` object, and `submittedSummary` is typed `FleetSubmittedSummary | null` — not `Record<string, unknown>` — everywhere it appears.
- [ ] Clicking rail entry 3, 4 or 5 with nothing declared raises the toast "Declare your fleet first." and does not navigate.
- [ ] The progress bar has five segments and animates the newly filled one over 0.35 s.
- [ ] Steps 3 and 4 render in the full 1000px column while steps 1, 2 and 5 stay at 680/760px.
- [ ] The toast appears bottom-centre on `rgba(17,17,19,0.94)` at an 11px radius for 2.4 s, carries `data-onboarding-surface`, and has an error tone.
- [ ] `useFleetDraft()` throws a named error when called outside `FleetDraftProvider`.
- [ ] All six stubs are still one-line placeholders.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Do not build any real step UI here, even partially. Every stub must stay a placeholder so wave 4's six tasks have conflict-free files.
- Do not add the `/dashboard` → wizard redirect; that is `task-21`.
- Do not import anything from `src/components/driver-onboarding/` — the two wizards are separate features with separate copy, step counts and payloads, and the only thing genuinely shared is the CSS in `globals.css` (`--onboarding-accent`, `animate-onboarding-fade-up`, `animate-onboarding-toast-in`, `[data-onboarding-surface]`), which needs no import. Read those files closely and copy the mechanics; do not couple to them.
- `--primary` is near-black. Every orange is `bg-onboarding-accent` / `text-onboarding-accent` / `border-onboarding-accent` / `bg-onboarding-accent/5` / `hover:bg-onboarding-accent-hover`.
- The `SCREEN_HEADERS` decision for step 1 (one header, two sub-screens) is this task's call and must be documented at the top of `fleet-wizard-shell.tsx` — `task-10` reads it there.
