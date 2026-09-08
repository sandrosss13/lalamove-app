# Task 09: Board shell, route & filters

## Status

pending

## Wave

3

## Description

Builds the load board's route, chrome and shared client state — everything
Wave 4's four visual surfaces (desktop table, detail drawer, claim dialogs,
mobile board) will be dropped into. This is the load-bearing task for the
whole feature's UI: it creates `/dashboard/loads` inside the existing driver
hub shell (server fetch + client interaction split, matching the hub's
existing page+screen pattern), registers the hub nav entry (hidden for
employed roster drivers), extends the shared hub header with the design's
vehicle-capacity pill, builds the tab bar and filter panel, and defines the
board's one shared state container. It also creates **placeholder** files at
the four exact paths Wave 4 will fill in, already imported and wired into the
screen, so four coder agents can implement task-10 through task-13 fully in
parallel without any two of them ever touching the same file.

## Dependencies

**Depends on:** task-06-loads-api, task-07-reject-api, task-08-claim-api
**Blocks:** task-10-loads-table, task-11-load-drawer, task-12-claim-dialogs,
task-13-mobile-board

**Context from dependencies:**

- **task-06** builds `GET /api/loads`. Per load it returns: `id`, `reference`
  (`GE-48210` form), the client's name, pickup and dropoff address + city +
  coordinates, `pickupWindowStart`/`pickupWindowEnd`/`deliveryDeadline`,
  `cargoCategory`, `cargoWeightKg`, `cargoLengthM`/`cargoWidthM`/`cargoHeightM`,
  `packagingDescription`, `itemQuantity`, `handlingTags`, `helperCount`,
  `distanceKm`, `pickupDistanceKm` (nullable — distance from the driver's
  current position, which is frequently stale or absent per
  `specs/driver-load-board/requirements.md`'s Assumptions), `driverPayout`, a
  per-km driver rate, `createdAt`, and a row state of `available` | `claimed` |
  `mine`. The fit filter and rejection exclusion already ran server-side by
  the time this response is built — every row in it is a load the signed-in
  account's vehicle can physically carry and has not rejected. The response
  additionally carries the count of loads hidden purely by the vehicle-fit
  filter, and a separate list of the account's own rejected loads (same shape
  as an ordinary load row). **The exact JSON envelope key names (e.g. whether
  the top-level shape is `{ loads, hiddenByCapacityCount, rejectedLoads }` or
  something else) are not given verbatim to this task** — only the field list
  above is. `src/components/driver-hub/screens/loads-context.tsx` (built by
  this task) defines its own best-effort `HubLoad`/`LoadsApiResponse` TypeScript
  types from this description; whoever implements this task must open
  `src/app/api/loads/route.ts` first and adjust those two types (and nothing
  else in this task's contract) to match the real response exactly.
- **task-07** builds `POST /api/loads/[id]/reject` and
  `DELETE /api/loads/[id]/reject` — driver/company-scoped, reversible. Both
  endpoints are given verbatim; this task's reject/restore actions call them
  by these exact paths.
- **task-08** extends the existing atomic claim endpoint (this repo's pattern
  is `POST /api/orders/[id]/accept`, an atomic conditional `updateMany` — see
  `src/app/api/orders/[id]/accept/route.ts`) so a lost race responds `409`
  carrying the load's `reference`. **The exact path and request/response shape
  task-08 ships are not given verbatim to this task either** — only that
  behaviour. This task wires `loads-context.tsx`'s `claim()` action against
  `POST /api/orders/[id]/accept` with `{ vehicleId }` in the body as the
  best-available default (that is the one atomic-claim endpoint that exists in
  the codebase today), and flags this as the one place its contract is
  provisional — confirm the literal path/body against task-08's actual route
  file and adjust the single call site in `loads-context.tsx` if it differs.
  Everything else in this task does not depend on that URL being exactly
  right to compile or to be reviewable.

## Files to Create

- `src/app/dashboard/(hub)/loads/page.tsx` — server component: resolves the
  account, redirects a roster driver away, resolves the vehicle-capacity pill
  data, renders `<LoadsScreen>`.
- `src/components/driver-hub/screens/loads-screen.tsx` — client screen:
  registers the header's vehicle pill, renders the tab bar and filter panel,
  and mounts the four Wave 4 placeholders inside `<LoadsProvider>`.
- `src/components/driver-hub/screens/loads-context.tsx` — the board's one
  shared state container: `LoadsProvider` + `useLoadsBoard()`.
- `src/components/driver-hub/screens/loads-filters.tsx` — the filter panel
  (pickup/dropoff city selects, weight range, handling chips, Reset).
- `src/components/driver-hub/screens/loads-format.ts` — display formatters
  shared by this task and by every Wave 4 task (GEL, per-km rate, weight,
  dimensions, plural counts, relative time).
- `src/components/driver-hub/screens/loads-table.tsx` — **placeholder** for
  task-10 (desktop table).
- `src/components/driver-hub/screens/loads-drawer.tsx` — **placeholder** for
  task-11 (detail drawer).
- `src/components/driver-hub/screens/loads-claim-dialogs.tsx` — **placeholder**
  for task-12 (confirm + lost-the-race dialogs).
- `src/components/driver-hub/screens/loads-mobile.tsx` — **placeholder** for
  task-13 (mobile card list + bottom sheet).

## Files to Modify

- `src/components/driver-hub/driver-hub-nav.ts` — add the `loads` nav entry
  and a roster-driver visibility rule.
- `src/components/driver-hub/driver-hub-shell.tsx` — add the vehicle-pill
  header-slot context, alongside the existing subtitle-override context.
- `src/components/driver-hub/driver-hub-header.tsx` — render the optional
  vehicle pill.

**Boundary with Wave 4 (read this before writing anything):** the eight files
above are this task's alone. Wave 4 (task-10 through task-13) is four agents
working **simultaneously** on `loads-table.tsx`, `loads-drawer.tsx`,
`loads-claim-dialogs.tsx` and `loads-mobile.tsx` respectively — each rewrites
the body of exactly one of those four files and nothing else. None of them may
create a new file, and **none of them may modify `loads-screen.tsx`,
`loads-context.tsx`, `loads-filters.tsx`, `loads-format.ts`, this task's three
hub-shell files, or `page.tsx`** — two agents editing the same file
concurrently is exactly the failure mode this split exists to prevent. Wave 4
tasks only ever *import from* `loads-context.tsx` and `loads-format.ts`
(read-only) and keep each placeholder's exported function name and prop
signature (none of the four take props — see below) unchanged, the same rule
`specs/company-ops-dashboard/tasks/task-06-shell-and-scaffold.md` set for its
own six tab placeholders and three drawer placeholders.

## Technical Details

### 1. Route: server fetch, client interaction

`src/app/dashboard/(hub)/jobs/page.tsx` is the pattern: a server component
resolves the account (and here, redirects), resolves anything else it alone
can query directly, and renders one client screen that owns all interaction
state. Unlike Jobs, the board's own data (the loads themselves) is **not**
fetched server-side in `page.tsx` — see the note on `GET /api/loads` below.

```tsx
// src/app/dashboard/(hub)/loads/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoadsScreen } from "@/components/driver-hub/screens/loads-screen";
import { resolveHubAccount } from "@/lib/dashboard/hub/account";
import { prisma } from "@/lib/prisma";
import {
  capabilityOf,
  widestCapability,
  type VehicleCapability,
} from "@/lib/orders/vehicle-fit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Load Board · Driver Hub",
};

const HUB_HOME = "/dashboard/today";

export type HubVehiclePill = { label: string; capability: VehicleCapability };

/**
 * The header pill's "Vehicle" data — a class label and the resolved capacity
 * to show next to it. NOT part of `GET /api/loads`'s response (that endpoint
 * describes loads, not the caller's own vehicle), so this is its own small
 * Prisma read, kept local to this page rather than a new shared
 * `src/lib/dashboard/hub/*.ts` module: it is one query, used from exactly one
 * screen, and does not need the discoverability a shared module earns
 * elsewhere in the hub.
 *
 * An INDIVIDUAL account (including a sole proprietor) resolves to their own
 * most-recent vehicle, or the fleet vehicle currently assigned to them if
 * they are a roster driver — mirroring `resolveHubAccount()`'s own
 * `vehicles`/`assignments` lookup. A BUSINESS account has no single vehicle:
 * per `specs/driver-load-board/requirements.md`'s "claim first, assign
 * afterwards" resolution, it resolves to `widestCapability` across the whole
 * fleet — the same aggregate task-06's server-side fit filter runs a
 * company's loads against, so the pill previews exactly what is being
 * filtered on. Returns `null` when there is nothing to show yet (a driver or
 * company mid-onboarding with no vehicle registered) — the pill renders
 * nothing rather than a garbage string, the same reasoning
 * `driverIdentifier()` in `account.ts` gives for falling back to just the
 * city.
 */
async function resolveVehiclePill(
  account: Awaited<ReturnType<typeof resolveHubAccount>>,
): Promise<HubVehiclePill | null> {
  if (account === null) {
    return null;
  }

  if (account.kind === "BUSINESS") {
    const vehicles = await prisma.vehicle.findMany({
      where: { companyId: account.companyId ?? undefined },
      select: {
        payloadKg: true,
        cargoLengthM: true,
        cargoWidthM: true,
        cargoHeightM: true,
        vehicleTypeSpec: {
          select: {
            maxPayloadKg: true,
            cargoLengthM: true,
            cargoWidthM: true,
            cargoHeightM: true,
          },
        },
      },
    });

    const capability = widestCapability(
      vehicles.map((vehicle) => capabilityOf(vehicle, vehicle.vehicleTypeSpec)),
    );

    return capability === null ? null : { label: "Fleet", capability };
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { driverProfileId: account.driverProfileId ?? undefined },
    orderBy: { createdAt: "desc" },
    select: {
      payloadKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
      vehicleTypeSpec: {
        select: {
          label: true,
          maxPayloadKg: true,
          cargoLengthM: true,
          cargoWidthM: true,
          cargoHeightM: true,
        },
      },
    },
  });

  if (vehicle === null) {
    return null;
  }

  return {
    label: vehicle.vehicleTypeSpec.label,
    capability: capabilityOf(vehicle, vehicle.vehicleTypeSpec),
  };
}

export default async function LoadsPage() {
  const account = await resolveHubAccount();

  if (account === null) {
    return null;
  }

  // Roster-driver gate — server-side, not just the hidden nav link. See
  // "Hub nav entry" below for why `companyId` (not `kind`) is the check: a
  // BUSINESS account's own `companyId` names *its own* company and must keep
  // access; only an INDIVIDUAL-kind account with a non-null `companyId` is an
  // employed driver on someone else's roster.
  if (account.kind === "INDIVIDUAL" && account.companyId !== null) {
    redirect(HUB_HOME);
  }

  const vehiclePill = await resolveVehiclePill(account);

  return <LoadsScreen account={account} vehiclePill={vehiclePill} />;
}
```

`LoadsScreen` itself fetches `GET /api/loads` from the browser (see
`loads-context.tsx` below) rather than `page.tsx` fetching it server-side.
This is a deliberate departure from Jobs/Vehicles/Drivers, which all call a
direct `getHub*()` Prisma function from the server component. Three reasons:

1. Every other hub screen's data is a read with no further client-owned
   shape to derive — Jobs' table is exactly `getHubJobs()`'s rows, filtered by
   a tab. The board's visible list is a five-stage client-side pipeline (tab →
   rejected toggle → city/weight/tag filters → sort) over data that changes
   under the driver's feet (another driver claiming a row) and needs
   re-fetching after every mutation (claim, reject, restore) — a page
   component cannot re-run itself without a full navigation.
2. task-14 (Wave 5, out of this task's scope) polls the board for live claim
   updates from the client. `GET /api/loads` has to be callable from the
   browser regardless; fetching it the same way on first mount, instead of
   also server-rendering it once, means there is exactly one code path that
   builds the board's data instead of two that have to agree.
3. This repo has no existing precedent for a server component fetching its
   own API route (every internal `fetch()` in `src/app/` is from a `"use
   client"` component, e.g. the admin applications tables), so a client-side
   fetch on mount is the pattern already established, not a new one.

The tradeoff this accepts: the board shows a brief loading state on first
paint instead of being server-rendered. `loads-screen.tsx` renders a simple
loading placeholder (reuse `HubEmptyState` from `hub-primitives.tsx` with a
"Loading loads…" message) while the first fetch is in flight.

### 2. Hub nav entry, and hiding it for roster drivers

Add to `HubNavItemId` and `HUB_NAV` in `driver-hub-nav.ts`:

```ts
export type HubNavItemId =
  | "today"
  | "earnings"
  | "loads"
  | "jobs"
  | "performance"
  | "vehicles"
  | "drivers"
  | "employees";
```

Insert the `loads` entry after `earnings` and before `jobs` — the design
frames the board as where a driver *gets* work, which reads naturally next to
Today (where they track today's work) and before Jobs (where they review past
work):

```ts
{
  id: "loads",
  label: "Load Board",
  href: "/dashboard/loads",
  businessOnly: false,
  rosterHidden: true,
  title: "Load Board",
  subtitle: "Bookings open to drivers",
},
```

(`title`/`subtitle` transcribed verbatim from the design's header copy — see
`UI:UX/Order Dashboard/design_handoff_driver_load_board/README.md` §1. Neither
is a derived/runtime string, unlike four of the other six subheads, so no
screen-side `useHubSubtitle()` override is needed for this entry — the static
literal is the whole story.)

**No existing mechanism gates a nav item on roster-driver status** — the only
axis `HubNavItem` filters on today is `businessOnly` (BUSINESS vs INDIVIDUAL
`kind`), which cannot express "hide for an INDIVIDUAL who also has a
`companyId`". Add one:

```ts
export type HubNavItem = {
  id: HubNavItemId;
  label: string;
  href: string;
  businessOnly: boolean;
  /**
   * Hidden for a DRIVER on a company's roster (`DriverProfile.companyId` set).
   * Per `specs/driver-load-board/requirements.md`'s Assumptions: an employed
   * driver receives work through their company's dispatch, not the open
   * market, and the board's server-side guard (`loads/page.tsx`) redirects
   * them away even if they hand-type the URL — this field only controls the
   * sidebar link, the same cosmetic-only relationship `businessOnly` already
   * has to its own page guards. Only `loads` sets this today; every other
   * entry is `false`.
   */
  rosterHidden: boolean;
  title: string;
  subtitle: string;
};
```

Set `rosterHidden: false` on the six existing entries (a one-line addition to
each, no other change). Change the filtering function's signature from
`kind` alone to the slice of `HubAccount` it now needs:

```ts
/**
 * The links an account sees: all seven business-only-eligible entries filtered
 * by `kind` as before, further filtered by `rosterHidden` for a driver whose
 * `DriverProfile.companyId` is set.
 *
 * Renamed from `hubNavForKind` (which took only `kind`) because a roster
 * driver and an independent driver are both `kind: "INDIVIDUAL"` — the
 * distinction this function now also has to make lives on `companyId`, which
 * `kind` alone cannot see. `companyId` on a BUSINESS account names that
 * account's *own* company and must not be confused with a roster driver's:
 * only `kind === "INDIVIDUAL" && companyId !== null` is the roster case.
 */
export function hubNavForAccount(
  account: Pick<HubAccount, "kind" | "companyId">,
): HubNavItem[] {
  const isRosterDriver =
    account.kind === "INDIVIDUAL" && account.companyId !== null;

  return HUB_NAV.filter((item) => {
    if (account.kind !== "BUSINESS" && item.businessOnly) {
      return false;
    }
    if (isRosterDriver && item.rosterHidden) {
      return false;
    }
    return true;
  });
}
```

Update the one call site: `driver-hub-shell.tsx`'s
`const items = hubNavForKind(account.kind);` becomes
`const items = hubNavForAccount(account);` (the shell already has the full
`account` in scope, so this is a same-line rename, not a new prop). No other
file calls `hubNavForKind` — verified by grep before writing this task.

**This is still cosmetic-only**, exactly like `businessOnly` — see the
existing doc comment on `HubNavItem.businessOnly` and the server-side guard in
`loads/page.tsx` above, which is the actual boundary.

### 3. Header: extend the shared bar, do not add a second one

The hub shell already renders one persistent, sticky, 61px-tall top bar
(`driver-hub-header.tsx`) with: page title + subhead on the left (exactly the
design's "Load Board" / "Bookings open to drivers"), and on the right an
account-kind badge, the online-availability pill, the avatar/name/identifier
block, and sign out. That already covers everything in the design's header
**except** the vehicle pill — the design has no equivalent of the account
badge or sign-out button because its prototype has no other screen to sign out
of, but production's one header already carries both for all seven hub
screens and must keep doing so here too.

**Decision: extend `DriverHubHeader`, do not render a second, board-local
header.** The design's header is drawn as a single 61px bar with the vehicle
pill sitting between a flex spacer and the identity block — rendering a
second sticky bar directly under the existing one would stack two chrome rows
where the design shows one, and would duplicate the identity/sign-out content
that already lives in the shared header. The desktop/mobile segmented control
is dropped entirely per the design's own instruction ("in production, drop it
and use real breakpoints") — nothing replaces it, and the existing header
already has no such control.

Add a header-slot context mirroring `useHubSubtitle` exactly, in
`driver-hub-shell.tsx`:

```tsx
type HubHeaderContextValue = {
  setSubtitle: (subtitle: string | null) => void;
  /** `null` hides the vehicle pill — the default for every screen but Loads. */
  setVehiclePill: (pill: React.ReactNode | null) => void;
};

const HubHeaderContext = React.createContext<HubHeaderContextValue | null>(null);

export function useHubSubtitle(subtitle: string | null): void {
  const context = React.useContext(HubHeaderContext);
  if (context === null) {
    throw new Error(/* unchanged message */);
  }
  const { setSubtitle } = context;
  React.useEffect(() => {
    setSubtitle(subtitle);
    return () => setSubtitle(null);
  }, [setSubtitle, subtitle]);
}

/**
 * Lets a screen render extra content in the header's right-hand row, between
 * the title/spacer and the account identity block — today only the Load
 * Board's vehicle-capacity pill (design §1). Same registration pattern as
 * `useHubSubtitle`: set in an effect, cleared on unmount, so navigating away
 * from Loads cannot leave a stale pill up on the next screen.
 */
export function useHubVehiclePill(pill: React.ReactNode | null): void {
  const context = React.useContext(HubHeaderContext);
  if (context === null) {
    throw new Error(
      "useHubVehiclePill must be called inside <DriverHubShell>.",
    );
  }
  const { setVehiclePill } = context;
  React.useEffect(() => {
    setVehiclePill(pill);
    return () => setVehiclePill(null);
  }, [setVehiclePill, pill]);
}
```

Rename the existing `HubSubtitleContext`/`HubSubtitleContextValue` identifiers
to `HubHeaderContext`/`HubHeaderContextValue` as part of this change (a pure
rename — `useHubSubtitle`'s exported name, behaviour and every existing
caller are unaffected) rather than adding a second, parallel context: one
provider carrying both pieces of header override state is simpler than two
nested ones for the same bar. Add a second `useState<React.ReactNode | null>`
in `DriverHubShell` for `vehiclePillOverride`, pass both values into the one
memoised context value, and pass `vehiclePill={vehiclePillOverride}` into
`<DriverHubHeader>` alongside the existing `title`/`subtitle` props.

`driver-hub-header.tsx` renders it between the spacer that today is implicit
(the `justify-between` on the header's flex row) and the identity block:

```tsx
export type DriverHubHeaderProps = {
  account: HubAccount;
  title: string;
  subtitle: string;
  /** design §1's vehicle pill. `null` (every screen but Loads) renders nothing. */
  vehiclePill?: React.ReactNode;
};

// inside the returned JSX, as a new sibling before the `Badge`:
{vehiclePill}
```

`loads-screen.tsx` builds the pill itself (a small local component or inline
JSX — no new file needed, it is a handful of lines) from the `HubVehiclePill`
`page.tsx` resolved, and registers it once on mount:

```tsx
useHubVehiclePill(
  vehiclePill === null ? null : (
    <div className="flex items-center gap-2 rounded-lg border border-border py-[5px] pr-[10px] pl-2">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-[oklch(59.6%_0.145_163.225)]"
      />
      <span className="text-xs text-muted-foreground">Vehicle</span>
      <span className="font-price text-xs">
        {vehiclePill.label} · {formatWeightKg(vehiclePill.capability.payloadKg)} ·{" "}
        {formatDims(vehiclePill.capability)}
      </span>
    </div>
  ),
);
```

(`formatWeightKg`/`formatDims` from `loads-format.ts`, below — the design's
`"Van 5.5t · 1200 kg · 3.2 × 1.7 × 1.9 m"` string includes a GVW-class prefix
("5.5t") that has no field on `VehicleTypeSpec`/`Vehicle` to come from — every
seeded label is a plain name like "Cargo Van" or "Closed Box Van" — so this
task drops that segment rather than inventing data: the real pill reads
`"Closed Box Van · 1,200 kg · 3.0 × 1.7 × 1.8 m"`.)

### 3b. Header alignment — folded in from a second design handoff

A later handoff at `UI:UX/Registered Driver account (New)/Driver dashboard
header alignment/` reshapes this same header. It is folded into this task rather
than run separately **because it modifies the exact two files this task already
modifies** — `driver-hub-header.tsx` and `driver-hub-nav.ts` — and two agents
editing both is the collision the wave structure exists to prevent. Note that
handoff ships no `README.md`, only a 19-line `github.md` sync note, so it is a
far thinner brief than the load board's own: treat its two `.dc.html`
prototypes as the specification and prefer this repo's existing conventions
wherever it is silent.

What to build, on top of the `DriverHubHeader` extension decided above:

- **Rebuild the bar in the client site header's shape** — wordmark on the left,
  primary nav, then name + "My account" + "Sign out" on the right. Read
  `src/components/auth-status.tsx` and `src/app/layout.tsx` for the shape being
  matched; reuse their structure rather than re-deriving it.
- **"My orders" and "Wallet" point at screens that already exist.** Confirmed
  with the product owner:
  - **My orders = job history** → the hub's existing `jobs` entry,
    `/dashboard/jobs` (`title: "Job history"`).
  - **Wallet = payouts** → the hub's existing `earnings` entry,
    `/dashboard/earnings` (`title: "Earnings & payouts"`), which already renders
    a payout-history table.

  **Do NOT link these to `/orders` or `/wallet`.** Those are client routes and
  they mean different things: `src/app/orders/page.tsx:53` hard-rejects any role
  that is not `CLIENT`, and `/wallet` is the client's *saved payment cards* page
  — a driver receives payouts, they do not store cards to pay with. Linking
  there would 403 the driver or show them the wrong concept entirely. Relabel
  the existing hub entries in `HUB_NAV`; do not create new routes.
- **Active-job indicator** — the "Current job / In transit" affordance from the
  `Driver Dashboard v2.dc.html` prototype. The data already exists behind the
  Today screen (`src/components/driver-hub/screens/today-current-job-card.tsx`,
  `src/lib/dashboard/hub/today.ts`); surface a compact form of it in the header
  rather than querying again.
- **"My account"** reuses the client account rail + panel structure — see
  `src/app/account/page.tsx` and `src/components/account-sidebar.tsx`.

**Explicitly NOT in this task: the notifications bell.** The prototypes show a
bell with an unread count, and there is no notification system in this codebase
at all — no model in `prisma/schema.prisma`, no code under `src/lib` or
`src/app/api`. It needs a `Notification` table, a read/unread model, write points
at every order-lifecycle event and a delivery mechanism; it is a feature with a
data layer, not a header component. The product owner has deferred it to its own
spec alongside the Phase 2 email/SMS work, where the same lifecycle events feed
three delivery channels. **Render no bell and no placeholder count** — a bell
that never lights is worse than no bell.

One ordering note: the `Driver Dashboard v2.dc.html` prototype displays a "Paid
to you" figure. That number is currently wrong in the codebase — the Earnings
screen sums the client's `price + overtimeFee` as driver earnings — and task-15
corrects it to `driverPayout + overtimeDriverPayout`. Do not reimplement or
reshape that calculation here; render whatever the earnings module returns and
let task-15 own its correctness.

### 4. Tab bar

Use the shadcn `Tabs` primitive with `variant="line"` on `TabsList` — that
variant already renders exactly the design's underline treatment (no pill
background, a `after:` pseudo-element bottom border on the active trigger)
rather than the filled-pill look `FilterStrip` in `hub-primitives.tsx` uses
elsewhere in the hub, which does not match this design. Restyle the trigger's
padding/size to the design's `10px` vertical / `14px` / `500`:

```tsx
<Tabs value={tab} onValueChange={(value) => setTab(value as LoadsTab)}>
  <TabsList variant="line" className="h-auto gap-5 bg-transparent p-0">
    <TabsTrigger
      value="available"
      className="rounded-none border-none px-0 py-2.5 text-sm font-medium text-muted-foreground data-active:text-foreground"
    >
      Available loads{" "}
      <span className="text-muted-foreground">({availableCount})</span>
    </TabsTrigger>
    <TabsTrigger
      value="mine"
      className="rounded-none border-none px-0 py-2.5 text-sm font-medium text-muted-foreground data-active:text-foreground"
    >
      My loads <span className="text-muted-foreground">({mineCount})</span>
    </TabsTrigger>
  </TabsList>
</Tabs>
```

Beside it, right-aligned on the same row, the Filters toggle:

```tsx
<Button
  type="button"
  variant="outline"
  size="sm"
  onClick={() => setFiltersOpen((open) => !open)}
  className="gap-1.5 text-[13px] font-medium"
>
  Filters
  {activeFilterCount > 0 ? (
    <Badge className="h-auto rounded-full bg-foreground px-1.5 py-0 text-[11px] text-background">
      {activeFilterCount}
    </Badge>
  ) : null}
</Button>
```

`availableCount`/`mineCount`/`activeFilterCount` all come from
`useLoadsBoard()` (see the state container below) — this component reads the
context, it does not compute them.

### 5. Filter panel

Own file, `loads-filters.tsx`, rendered by `loads-screen.tsx` directly below
the tab bar row when `filtersOpen` is true (open by default per the design).
Grid layout matches the design's `repeat(3, minmax(180px, 240px)) 1fr auto`:

```tsx
<div className="grid grid-cols-[repeat(3,minmax(180px,240px))_1fr_auto] items-end gap-4 rounded-lg border border-border bg-card p-3.5">
  {/* 1. Pick-up city */}
  <div className="flex flex-col gap-1.5">
    <label className="text-xs text-muted-foreground">Pick-up city</label>
    <Select value={fPickup} onValueChange={setFPickup}>
      <SelectTrigger className="h-[34px] w-full"><SelectValue /></SelectTrigger>
      <SelectContent data-admin-surface="">
        <SelectItem value="All cities">All cities</SelectItem>
        {pickupCityOptions.map((city) => (
          <SelectItem key={city} value={city}>{city}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>

  {/* 2. Drop-off city — identical shape, dropCityOptions, fDrop/setFDrop */}

  {/* 3. Cargo weight */}
  <div className="flex flex-col gap-1.5">
    <label className="text-xs text-muted-foreground">
      Cargo weight up to {new Intl.NumberFormat("en-GB").format(fWeight)} kg
    </label>
    <input
      type="range"
      min={100}
      max={1200}
      step={50}
      value={fWeight}
      onChange={(event) => setFWeight(Number(event.target.value))}
      className="h-[34px] w-full accent-foreground"
    />
  </div>

  {/* 4. Special handling — Fragile / Cold chain / Hazmat chips, multi-select */}
  <div className="flex flex-col gap-1.5">
    <label className="text-xs text-muted-foreground">Special handling</label>
    <div className="flex gap-1.5">
      {HANDLING_FILTER_TAGS.map(({ value, label }) => {
        const selected = fTags.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            onClick={() => toggleTag(value)}
            className={cn(
              "h-[34px] rounded-md border px-2.5 text-xs font-medium",
              selected
                ? "border-transparent bg-foreground text-background"
                : "border-border bg-background text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  </div>

  {/* 5. Reset */}
  <Button type="button" variant="outline" size="sm" onClick={resetFilters} className="h-[34px] text-muted-foreground">
    Reset
  </Button>
</div>
```

`HANDLING_FILTER_TAGS` is the design's deliberately narrowed set — three of the
six `CargoHandlingTag` values, not all six (all six still render as pills
elsewhere, e.g. the Wave 4 drawer/table; only these three are filterable):

```ts
export const HANDLING_FILTER_TAGS = [
  { value: "FRAGILE", label: "Fragile" },
  { value: "COLD_CHAIN", label: "Cold chain" },
  { value: "HAZMAT", label: "Hazmat" },
] as const satisfies readonly { value: CargoHandlingTag; label: string }[];
```

**The city problem, and the approach this task recommends.** `Order` has no
city column — `pickupAddress`/`dropoffAddress` are free-text street addresses
(`String`) alongside nullable `pickupLat`/`pickupLng`/`dropoffLat`/`dropoffLng`
coordinates (see `prisma/schema.prisma`'s `model Order`). The `GeorgianCity`
enum (`src/lib/georgian-cities.ts`'s `GEORGIAN_CITY_OPTIONS`, 69 values) is
already what `DriverProfile.city` and `LogisticsCompany.city` are typed as,
and `formatCity()` (`src/lib/format-city.ts`) is the existing
`"TBILISI" → "Tbilisi"` humaniser used everywhere else a city reaches the UI.
Given this task's dependency context states that `GET /api/loads` **already
returns a resolved `city` string per stop** (task-06, Wave 2 — "pickup/dropoff
address + city + coordinates"), the underlying resolution is not this task's
decision to make; it recommends the approach for the benefit of whoever
implements task-04/task-05/task-06 (or, if they have already landed by the
time this task starts, to sanity-check what they did): **add nullable
`pickupCity`/`dropoffCity` `GeorgianCity?` columns to `Order`, set once at
booking time from the same `GEORGIAN_CITY_OPTIONS` dropdown already used
elsewhere in the client booking flow, not derived at read time from the
free-text address.** Parsing a city out of a Georgian street address string on
every list request is unreliable (substring matching against 69 city names
produces both false positives — a street literally named after another city —
and false negatives) and would have to be re-run on every request; a column
set once at booking is exact and cheap to filter and index. Reverse-geocoding
`pickupLat`/`pickupLng` was considered and rejected for the same reliability
reason, plus it would make the filter's option list depend on an external
service being up.

**This task's filter code does not depend on which of those approaches task-06
actually took.** `loads-filters.tsx` only assumes each `HubLoad` carries a
plain `pickupCity: string` and `dropoffCity: string` (whatever
`GET /api/loads` calls them once the exact field names are confirmed per the
note in "Context from dependencies" above), and builds its two `<Select>`
option lists by taking the **unique set of cities actually present across the
board's loads**, sorted with `localeCompare` — not `GEORGIAN_CITY_OPTIONS`
directly, because the design's own spec is "options = 'All cities' + unique
pickup cities, sorted", i.e. a dropdown that never offers a city with zero
loads in it today.

```ts
function uniqueSortedCities(loads: readonly HubLoad[], key: "pickupCity" | "dropoffCity"): string[] {
  return Array.from(new Set(loads.map((load) => load[key]))).sort((a, b) =>
    a.localeCompare(b),
  );
}
```

City filter comparison is exact string equality (`load.pickupCity ===
fPickup`), per the design's "City filters compare exact city names."

### 6. Board state container — `loads-context.tsx`

The design's State Management table, transcribed below with `mode` (the
prototype-only desktop/mobile preview switch) dropped — production has no
runtime toggle between the two, only breakpoints — and with the prototype's
client-only `rejected: string[]`/`claimedAgo` collapsed into server state, since
`LoadRejection` is now a real table and every load's status/claim recency
comes back from `GET /api/loads` rather than being maintained client-side.

| State | Owner | Type | Notes |
|---|---|---|---|
| `loads` | server | `HubLoad[]` | the account's open + claimed + mine loads, already fit-filtered and rejection-excluded, from `GET /api/loads` |
| `rejectedLoads` | server | `HubLoad[]` | the account's own rejected loads, same response |
| `hiddenByCapacityCount` | server | `number` | same response |
| `isLoading` / `loadError` | client | `boolean` / `string \| null` | fetch lifecycle for the board's one `GET` |
| `tab` | client | `"available" \| "mine"` | |
| `filtersOpen` | client | `boolean` | default `true` |
| `fPickup`, `fDrop` | client | `string` | `"All cities"` = no filter |
| `fWeight` | client | `number` | upper bound kg, default `1200` |
| `fTags` | client | `CargoHandlingTag[]` | subset of `HANDLING_FILTER_TAGS`'s three values |
| `sortKey`, `sortDir` | client | `LoadsSortKey` / `"asc" \| "desc"` | default `"payout"` / `"desc"` — see Notes on this default |
| `selectedId` | client | `string \| null` | drawer target |
| `dialogId` | client | `string \| null` | confirm-dialog target |
| `lostLoad` | client | `{ id: string; reference: string } \| null` | lost-the-race dialog target — carries `reference` because the dialog's copy names the load by it, and the load may already be gone from `loads` by the time this is set |
| `showRejected` | client | `boolean` | table/mobile list shows `rejectedLoads` instead of the tab-filtered `loads` |

`LoadsSortKey` deliberately renames the design's `"price"` literal to
`"payout"`: the sort key selects `HubLoad.driverPayout`, and the money rule
below makes `"price"` the one word that must never label anything a driver
sees or that a reviewer skims past. `"route"`/`"win"`/`"cargoType"`/`"helpers"`/
`"weight"` become `"route"` (sorts `pickupCity`), `"window"` (sorts
`pickupWindowStart`), `"cargo"` (sorts `cargoCategory`), `"helpers"` (sorts
`helperCount`), `"weight"` (sorts `cargoWeightKg`, nulls sort last).

```ts
export type LoadsSortKey = "route" | "window" | "cargo" | "helpers" | "weight" | "payout";
export type LoadsTab = "available" | "mine";

export type HubLoad = {
  id: string;
  reference: string;
  clientName: string;
  pickupCity: string;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffCity: string;
  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryDeadline: string | null;
  cargoCategory: string;
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  packagingDescription: string | null;
  itemQuantity: string | null;
  handlingTags: CargoHandlingTag[];
  helperCount: number;
  distanceKm: number;
  pickupDistanceKm: number | null;
  driverPayout: number;
  driverRatePerKm: number;
  createdAt: string;
  status: "available" | "claimed" | "mine";
};

export type LoadsBoardValue = {
  isLoading: boolean;
  loadError: string | null;
  tab: LoadsTab;
  setTab: (tab: LoadsTab) => void;
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  fPickup: string;
  setFPickup: (city: string) => void;
  fDrop: string;
  setFDrop: (city: string) => void;
  fWeight: number;
  setFWeight: (weight: number) => void;
  fTags: CargoHandlingTag[];
  toggleTag: (tag: CargoHandlingTag) => void;
  resetFilters: () => void;
  sortKey: LoadsSortKey;
  sortDir: "asc" | "desc";
  setSort: (key: LoadsSortKey) => void; // toggles direction if key === current sortKey
  showRejected: boolean;
  setShowRejected: (show: boolean) => void;
  selectedId: string | null;
  selectedLoad: HubLoad | null;
  selectLoad: (id: string | null) => void;
  dialogId: string | null;
  dialogLoad: HubLoad | null;
  openConfirm: (id: string) => void;
  closeConfirm: () => void;
  lostLoad: { id: string; reference: string } | null;
  closeLost: () => void;
  confirmClaim: () => Promise<void>;
  reject: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  pickupCityOptions: string[];
  dropCityOptions: string[];
  activeFilterCount: number;
  availableCount: number;
  mineCount: number;
  rejectedCount: number;
  hiddenByCapacityCount: number;
  visibleLoads: HubLoad[]; // the fully derived, sorted list Wave 4 renders
};
```

**Derived pipeline** (implemented as `React.useMemo` inside the provider, in
this order, per the design's "Derived" note):

1. Base set: `showRejected ? rejectedLoads : loads.filter(l => tab === "mine" ? l.status === "mine" : l.status !== "mine")`.
   ("Available loads" shows both `available` and `claimed`-by-other rows — a
   claimed-by-other row stays visible, rendered at `opacity-60` with a
   "Claimed" pill by Wave 4's table/mobile components, per the design; only
   `mine` rows move out of it.)
2. City filters: `fPickup === "All cities" || l.pickupCity === fPickup`, same
   for drop.
3. Weight filter: `l.cargoWeightKg === null || l.cargoWeightKg <= fWeight`
   (a load with unknown weight was already excluded by the server-side fit
   filter in every realistic case — see task-03's Notes on unknown always
   failing fit — so this branch is defensive, not load-bearing).
4. Tag filter: `fTags.every(tag => l.handlingTags.includes(tag))` (AND
   semantics, per the design).
5. Sort: `localeCompare` for `route`/`cargo`, numeric for the rest, nulls
   sorted last regardless of direction (a load with unknown weight/window
   should not jump to the top of a `desc` sort).

`availableCount`/`mineCount` are `loads.filter(status === "available").length`
/ `loads.filter(status === "mine").length` — **not** `visibleLoads.length`,
which already has tab/filters applied; the tab bar's own counts must not
shrink just because a filter is active, matching how Jobs' `counts.all` stays
independent of its own visible-row count.

**Mutations.** `reject`/`restore` call task-07's endpoints
(`POST`/`DELETE /api/loads/${id}/reject`) and then re-fetch `GET /api/loads`
to resync `loads`/`rejectedLoads`/`hiddenByCapacityCount` together, rather than
hand-patching local arrays — simplest-correct for a first cut; optimistic
updates are a plausible later refinement, not required here. `confirmClaim`
POSTs the claim endpoint for `dialogId` (see "Context from dependencies"
above for why its exact path is provisional) and either: on success,
re-fetches the board, switches `tab` to `"mine"`, and clears `dialogId`; or on
a `409`, clears `dialogId` and sets `lostLoad` from the response body's `id` +
`reference`.

`LoadsProvider` fetches once on mount:

```tsx
"use client";

export function LoadsProvider({ children }: { children: React.ReactNode }) {
  const [loads, setLoads] = React.useState<HubLoad[]>([]);
  const [rejectedLoads, setRejectedLoads] = React.useState<HubLoad[]>([]);
  const [hiddenByCapacityCount, setHiddenByCapacityCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const refetch = React.useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch("/api/loads");
      if (!response.ok) {
        throw new Error(`GET /api/loads failed: ${response.status}`);
      }
      const data = (await response.json()) as {
        loads: HubLoad[];
        rejectedLoads: HubLoad[];
        hiddenByCapacityCount: number;
      };
      setLoads(data.loads);
      setRejectedLoads(data.rejectedLoads);
      setHiddenByCapacityCount(data.hiddenByCapacityCount);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load the board.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refetch();
  }, [refetch]);

  // ...client-only state (tab, filters, sort, selection, dialogs) and the
  // derived pipeline described above, then:

  return (
    <LoadsBoardContext.Provider value={value}>
      {children}
    </LoadsBoardContext.Provider>
  );
}

export function useLoadsBoard(): LoadsBoardValue {
  const context = React.useContext(LoadsBoardContext);
  if (context === null) {
    throw new Error("useLoadsBoard must be used within <LoadsProvider>.");
  }
  return context;
}
```

### 7. Assembling the screen

```tsx
// loads-screen.tsx
"use client";

export function LoadsScreen({
  account,
  vehiclePill,
}: {
  account: HubAccount;
  vehiclePill: HubVehiclePill | null;
}) {
  return (
    <LoadsProvider>
      <LoadsScreenBody vehiclePill={vehiclePill} />
    </LoadsProvider>
  );
}

// Split into an inner component so `useHubVehiclePill`/`useLoadsBoard` can be
// called below the provider, not above it.
function LoadsScreenBody({ vehiclePill }: { vehiclePill: HubVehiclePill | null }) {
  useHubVehiclePill(/* the pill JSX from §3, or null */);

  const { isLoading, loadError } = useLoadsBoard();

  if (isLoading) {
    return <HubEmptyState message="Loading loads…" />;
  }
  if (loadError !== null) {
    return <HubEmptyState message="Couldn't load the board." children={loadError} />;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* tab bar row from §4 */}
      {/* <LoadsFilters /> from §5, gated on filtersOpen */}
      <LoadsTable />
      <LoadsMobile />
      <LoadsDrawer />
      <LoadsClaimDialogs />
    </div>
  );
}
```

`LoadsTable` and `LoadsMobile` both render unconditionally in the DOM and are
switched by Tailwind breakpoint utility classes (`hidden lg:block` on the
table's wrapper, `lg:hidden` on the mobile list's), the same `lg` breakpoint
`MasterDetailSplit` already gates its own two-column layout on in
`hub-primitives.tsx` — not a JS-detected breakpoint, which would either
mismatch on hydration or require a "not yet known" third render state. Each of
the four placeholders (§8) is self-sufficient off `useLoadsBoard()` alone, so
this assembly never has to pass any of them props.

### 8. The four Wave 4 placeholders

Every placeholder takes **no props** and reads everything from
`useLoadsBoard()` — this is what makes the boundary in "Files to Modify"
enforceable: Wave 4 rewrites only the body of its one file, never this
screen's composition or any prop it is called with.

`loads-table.tsx`:

```tsx
"use client";

import { useLoadsBoard } from "@/components/driver-hub/screens/loads-context";

/** Placeholder — real content: task-10. Desktop only (`hidden lg:block`). */
export function LoadsTable() {
  const { visibleLoads } = useLoadsBoard();
  return (
    <div className="hidden rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground lg:block">
      Loads table — coming soon ({visibleLoads.length} loads).
    </div>
  );
}
```

`loads-mobile.tsx`:

```tsx
"use client";

import { useLoadsBoard } from "@/components/driver-hub/screens/loads-context";

/** Placeholder — real content: task-13. Mobile only (`lg:hidden`). */
export function LoadsMobile() {
  const { visibleLoads } = useLoadsBoard();
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground lg:hidden">
      Mobile board — coming soon ({visibleLoads.length} loads).
    </div>
  );
}
```

`loads-drawer.tsx`:

```tsx
"use client";

import { useLoadsBoard } from "@/components/driver-hub/screens/loads-context";

/**
 * Placeholder — real content: task-11. Renders nothing when no row is
 * selected, matching the design's "hidden entirely when nothing is selected."
 * `data-admin-surface` is required here — see §9 below — because this is
 * `position: fixed`, i.e. visually detached from the shell's layout even
 * though it is not (yet) a portal; task-11 keeps it if it stays a plain fixed
 * div, or moves it onto whatever portal root it renders through instead.
 */
export function LoadsDrawer() {
  const { selectedLoad, selectLoad } = useLoadsBoard();
  if (selectedLoad === null) {
    return null;
  }
  return (
    <div
      data-admin-surface=""
      className="fixed top-[61px] right-0 bottom-0 z-30 hidden w-[400px] max-w-[92vw] overflow-y-auto border-l border-border bg-card p-4 lg:block"
    >
      Load drawer — coming soon ({selectedLoad.reference}).
      <button type="button" onClick={() => selectLoad(null)}>
        Close
      </button>
    </div>
  );
}
```

`loads-claim-dialogs.tsx`:

```tsx
"use client";

import { useLoadsBoard } from "@/components/driver-hub/screens/loads-context";

/**
 * Placeholder — real content: task-12. Renders nothing when neither dialog is
 * open. `data-admin-surface` is required — see §9 — this renders as an
 * overlay outside the shell's normal document flow regardless of whether it
 * is a true Radix `Dialog` portal (task-12's call) or a plain fixed div.
 */
export function LoadsClaimDialogs() {
  const { dialogLoad, lostLoad, closeConfirm, closeLost } = useLoadsBoard();
  if (dialogLoad === null && lostLoad === null) {
    return null;
  }
  return (
    <div
      data-admin-surface=""
      className="fixed inset-0 z-50 grid place-items-center bg-black/50"
      onClick={dialogLoad !== null ? closeConfirm : closeLost}
    >
      Claim dialogs — coming soon.
    </div>
  );
}
```

### 9. `data-admin-surface` is load-bearing — Wave 4 must repeat it

Per the doc comment on `DriverHubShell` (`driver-hub-shell.tsx`): the shell's
root carries `data-admin-surface`, which pins the surface to the light scheme
the `src/components/ui` primitives are toned for and resolves the
`accent`/`muted` token collision between the shadcn and marketing palettes.
Radix **portalled** content (`SelectContent`, `DialogContent`,
`PopoverContent`, `DropdownMenuContent`) renders outside this subtree via a
React portal and therefore outside the attribute's reach — see the precedent
at `src/components/driver-hub/screens/drivers-add-panel.tsx`'s
`<SelectContent data-admin-surface="" className="max-h-72">`, which this
task's own `loads-filters.tsx` follows for its two city `<Select>`s (§5).

**Wave 4 inherits this warning directly: any Radix `DialogContent` task-12
renders (the confirm and lost-the-race dialogs) and any portal task-11's
drawer might use must repeat `data-admin-surface=""` on itself,** or the
Lalamove `bg-accent`/`bg-muted`/border tokens this design's tokens map to will
silently resolve to the marketing site's palette instead — a bug that is easy
to miss in review because nothing errors, the colors are just subtly wrong.
This task's own two placeholders (`loads-drawer.tsx`, `loads-claim-dialogs.tsx`)
already carry the attribute as a `position: fixed` div, precisely so Wave 4
inherits a working example to build from rather than a bare instruction.

### 10. The money rule

`Order.price` is what the **client** pays and must never reach this UI in any
form. Every figure the board shows — the table's Price column (task-10), the
drawer's headline (task-11), the confirm dialog's "You are paid" (task-12),
every per-km sub-line — is `HubLoad.driverPayout`, which `GET /api/loads`
already resolved server-side. `formatGel()` in `loads-format.ts` (below) is
the only money formatter this feature's UI needs, and it is written to accept
`driverPayout`-shaped numbers, never `price`.

### `loads-format.ts`

```ts
/**
 * Display formatters shared by this task and by every Wave 4 task
 * (task-10 through task-13). Mirrors the per-screen `*-format.ts` convention
 * already used by `jobs-format.ts`, `vehicles-format.ts`, etc. — not a
 * central shared module, but this feature's own.
 */
import type { VehicleCapability } from "@/lib/orders/vehicle-fit";

const gelFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** `driverPayout: 190` → `"₾190"`. Never call this with `Order.price`. */
export function formatGel(driverPayout: number): string {
  return `₾${gelFormatter.format(driverPayout)}`;
}

/** `driverRatePerKm: 6` → `"₾6/km"`. */
export function formatGelPerKm(driverRatePerKm: number): string {
  return `₾${gelFormatter.format(driverRatePerKm)}/km`;
}

const weightFormatter = new Intl.NumberFormat("en-GB");

/** `820` → `"820 kg"`; `null` → `"—"`. */
export function formatWeightKg(weightKg: number | null): string {
  return weightKg === null ? "—" : `${weightFormatter.format(weightKg)} kg`;
}

/** `{lengthM:3.2,widthM:1.7,heightM:1.9,...}` → `"3.2 × 1.7 × 1.9 m"`. */
export function formatDims(
  dims: Pick<VehicleCapability, "lengthM" | "widthM" | "heightM">,
): string {
  return `${dims.lengthM.toFixed(1)} × ${dims.widthM.toFixed(1)} × ${dims.heightM.toFixed(1)} m`;
}

/** `1, "load"` → `"1 load"`; `3` → `"3 loads"`. */
export function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
```

(A relative-time-ago helper for the drawer's "Claimed by another driver 4 min
ago" notice, and full clock/date formatters for the pickup window and
deadline, belong here too but are left for task-11 to add — this task cannot
specify their exact input shape without knowing whether `GET /api/loads`'s
timestamp fields land as ISO strings or `Date`s once task-06's actual response
is inspected. Task-11 should add to this file, not create a second one.)

## Acceptance Criteria

- [ ] The header matches the client site header's shape: wordmark, nav, then
      name + My account + Sign out.
- [ ] "My orders" links to `/dashboard/jobs` and "Wallet" to
      `/dashboard/earnings` — NOT to the client `/orders` or `/wallet` routes.
- [ ] No notifications bell is rendered anywhere.

- [ ] `/dashboard/loads` renders inside the driver hub shell for an
      INDIVIDUAL (non-roster) driver, a sole proprietor, and a BUSINESS
      account — sidebar, header (including the vehicle pill), tab bar, and
      an (initially open) filter panel all present.
- [ ] An INDIVIDUAL driver whose `DriverProfile.companyId` is non-null: the
      `Load Board` link is absent from the sidebar, and a direct GET to
      `/dashboard/loads` redirects to `/dashboard/today`.
- [ ] A BUSINESS account's own `companyId` (naming its own company) does not
      trigger that redirect — verified by kind, not merely companyId-null.
- [ ] The header's vehicle pill shows the emerald-dot + "Vehicle" label +
      class/payload/dimension string for a driver with a registered vehicle,
      and renders nothing (no empty pill) for one with none yet.
- [ ] No Desktop/Mobile segmented control exists anywhere on this screen.
- [ ] The tab bar shows both tabs with muted count suffixes that do not
      change when a filter is applied; the Filters button's badge shows the
      count of active filters and is absent at zero.
- [ ] The filter panel's two city selects list only cities that appear on at
      least one of the account's current loads, sorted; the weight slider
      runs 100–1200 step 50; exactly three handling chips are filterable
      (Fragile, Cold chain, Hazmat); Reset restores all four to default and
      clears the Filters badge.
- [ ] `loads-context.tsx` fetches `GET /api/loads` once on mount, exposes
      `isLoading`/`loadError`, and its derived `visibleLoads` pipeline runs
      tab/rejected → city/weight/tag → sort in that order.
- [ ] `showRejected` toggling swaps the visible list between the tab-filtered
      open loads and `rejectedLoads`, and clears `selectedId`.
- [ ] `reject`/`restore` call `POST`/`DELETE /api/loads/${id}/reject`
      respectively and refetch the board on success.
- [ ] All four Wave 4 placeholder files exist at the exact paths listed above,
      export a function with **no props**, compile, and render inside
      `loads-screen.tsx` without error with an empty `loads` array.
- [ ] `loads-drawer.tsx` and `loads-claim-dialogs.tsx` each carry
      `data-admin-surface=""` on their outermost rendered element.
- [ ] Every money figure referenced anywhere in this task's own files is
      `driverPayout`/`formatGel`-shaped; grep confirms no file this task
      creates or modifies reads `.price` off a load.
- [ ] `pnpm check` passes.

## Notes

- **The default sort is `payout` descending, per the approved design — and
  this is a known, deliberate tradeoff, not an oversight.** It means the
  highest-paying load on the board draws every driver's attention first while
  a cheap, nearby job can sit unclaimed at the bottom of the list — cherry-picking, encoded as the default view. Neither Uber nor Lalamove sorts
  their own open-job lists by pay for exactly this reason. It is implemented
  as designed here. Flipping the default to pickup proximity (`sortKey:
  "route"`, or a future distance-based key once `pickupDistanceKm` is
  reliably populated) is a one-line change to this task's initial state
  (`sortKey`/`sortDir` in `LoadsProvider`) and is tracked as an
  after-implementation item in `specs/driver-load-board/action-required.md`
  ("Reconsider the default table sort").
- **Sort key naming.** The design's own `sortKey` literal is `"price"`; this
  task renames it to `"payout"` in the TypeScript type so nobody reading
  `sortKey === "price"` six months from now mistakes it for `Order.price` —
  see the money rule in §10. The column header copy Wave 4 renders can still
  say "Price" (that is the label a driver sees for their own payout column,
  matching the design's header text), only the internal state key changes.
- **The claim endpoint's exact path is this task's one open contract gap** —
  see "Context from dependencies." `loads-context.tsx` ships against
  `POST /api/orders/${id}/accept` as the best-available default; confirm this
  against task-08's actual route before treating `confirmClaim()` as correct,
  and update that one call site if it differs. Nothing else in this task
  depends on the exact URL.
- **`GET /api/loads`'s exact response envelope key names are inferred, not
  quoted verbatim**, from this task's dependency context — see the note under
  "Context from dependencies" and the `HubLoad`/fetch-response types in §6.
  Whoever implements this task should open `src/app/api/loads/route.ts` first
  and reconcile field names before writing `loads-context.tsx`.
- **Do not add a second toggle for the account-kind switcher.** The design's
  Business/Individual segmented control on other hub screens is already
  established as a prototype affordance nowhere reproduced in production
  (see `driver-hub-header.tsx`'s own doc comment) — this task does not
  reintroduce anything like it for the board.
- **`resolveVehiclePill()` in `page.tsx` is a new, narrow consumer of
  `Vehicle`'s per-field overrides**, the same category of use task-03's
  `vehicle-fit.ts` doc comment already flags for `GET /api/loads`'s own fit
  filter — nothing new to reconcile, just noting it uses the same module for
  a second, display-only purpose (previewing the driver's own capacity in the
  header) rather than a filtering decision.
