# Task 05: Vehicles roster guard — refuse a roster driver's personal vehicle server-side

## Status

pending

## Wave

2

## Description

Today the Driver Hub's Vehicles screen offers *every* individual driver an "Add
vehicle" form, and `POST /api/driver-profile/vehicles` accepts it from every
one of them. For a driver employed on a company's roster that is wrong in a way
nothing downstream can recover from: the route writes the row with the caller's
own `driverProfileId` and an explicit `companyId: null`
(`src/app/api/driver-profile/vehicles/route.ts:248-262`), so an employed driver
ends up owning a personal `Vehicle` their employer's fleet screens cannot see,
that no dispatch path will ever assign to them, and that the fleet's own
vehicle-review pipeline never touched. The vehicle exists, it is theirs, and it
is useless.

This task closes that at the boundary — a `403` from `POST
/api/driver-profile/vehicles` for a roster driver, in the same shape the Load
Board's `GET /api/loads` already refuses one — and surfaces the same rule as
`canAddVehicle` on `HubVehiclesData` so the screen (task-09) branches on the
loader's verdict rather than re-deriving the persona rule in the client, where
the two could silently drift apart.

It also carries `persona` onto `HubVehiclesData`. Vehicles is the one hub loader
that *already* treats a roster driver differently — its scope clause is the
hub's only three-way scope, because a roster driver reaches a company vehicle
through an open `DriverVehicleAssignment` rather than by owning a row — but it
has only ever exported the two-valued `kind`, so the screen above it could see
"individual" and never "employed individual".

## Dependencies

**Depends on:** task-01-hub-persona-model
**Blocks:** task-09-vehicles-screen-roster

**Context from dependencies:**

### The three personas

The Driver Hub serves three genuinely different registered-driver account
shapes. Before this feature it modelled two.

| Persona | `HubAccount.kind` | `HubAccount.companyId` | Who they are |
|---|---|---|---|
| `INDEPENDENT` | `"INDIVIDUAL"` | `null` | Owns their vehicle, browses the open Load Board, keeps their own fares |
| `ROSTER` | `"INDIVIDUAL"` | set — their **employer** | Employed driver; work arrives via company dispatch; fares are paid to the employer |
| `BUSINESS` | `"BUSINESS"` | set — their **own** company | Fleet owner; also sees the Drivers and Employees screens |

**`companyId !== null` alone is NOT the roster test.** A `BUSINESS` account has
a `companyId` too — its own company's id. The roster test is `kind ===
"INDIVIDUAL" && companyId !== null`. Getting this backwards would lock a fleet
owner out of the one screen this feature is trying to protect.

**`DriverProfile.accountType` (`DriverAccountType`) is a different axis and must
never be used for this.** A sole-proprietor driver registered as a business is
still `kind: "INDIVIDUAL"` and, with no employer, persona `INDEPENDENT`.

### What task-01 produces that this task consumes

task-01 edits `src/lib/dashboard/hub/account.ts` to add a `persona` field to
`HubAccount`, derived once inside the React-`cache()`d `resolveHubAccount()`:

```ts
// src/lib/dashboard/hub/account.ts — after task-01
export type HubAccountKind = "BUSINESS" | "INDIVIDUAL";

export type HubPersona = "INDEPENDENT" | "ROSTER" | "BUSINESS";

export type HubAccount = {
  kind: HubAccountKind;   // unchanged, still present, still exported
  persona: HubPersona;    // NEW
  userId: string;
  displayName: string;
  initials: string;
  identifier: string;
  city: string;
  isOnline: boolean | null;
  isActivated: boolean;
  canToggleOnline: boolean;
  companyName: string | null;
  driverProfileId: string | null;
  companyId: string | null;
};
```

Derivation, inside `resolveHubAccount()`: `BUSINESS` when `kind === "BUSINESS"`;
`ROSTER` when `kind === "INDIVIDUAL" && companyId !== null`; `INDEPENDENT`
otherwise.

**`HubAccountKind` is not removed and `kind` is not removed from `HubAccount`.**
`persona` is added *alongside* it. This task depends on both fields existing.

task-01 also re-keys `src/components/driver-hub/driver-hub-nav.ts` — the
`businessOnly` / `rosterHidden` booleans on `HubNavItem` collapse into one
persona-keyed rule, and `hubNavForAccount(account)` filters on
`account.persona`. **This task must not touch `driver-hub-nav.ts`.** Vehicles is
visible to all three personas and no nav change is needed here.

## Files to Create

None.

## Files to Modify

- `src/lib/dashboard/hub/vehicles.ts` — add `persona: HubPersona` and
  `canAddVehicle: boolean` to `HubVehiclesData`, populate both at the loader's
  two return sites, keep `kind` (with a corrected doc comment — the current one
  is factually wrong about what `kind` is used for), and extend the module
  header to record that the loader now also carries a permission verdict.
- `src/app/api/driver-profile/vehicles/route.ts` — add the roster refusal to
  `POST`: read `companyId` alongside `id` in the existing `driverProfile`
  lookup and return `403` when it is non-null, placed before any Supabase
  Storage upload happens. `GET` is deliberately unchanged.
- `src/app/dashboard/(hub)/vehicles/page.tsx` — **doc comment only, no code
  change.** The page's existing comment reasons about "both account kinds" and
  explicitly justifies the absence of a guard; after this task it must say the
  screen stays open to all three *personas* and that the roster restriction is
  a write restriction enforced in the route, not a read restriction enforced
  here. The file is listed so its ownership is unambiguous within Wave 2.

## Technical Details

### 1. Verify the bug first

Read `src/app/api/driver-profile/vehicles/route.ts` before changing it. The
`POST` handler as it stands does exactly four checks and none of them is about
a company:

1. `session` exists → else `401` (line 181-184).
2. `session.user.role === "DRIVER"` → else `403 "Only drivers can add
   vehicles."` (line 186-191).
3. The body parses as `multipart/form-data` and validates (lines 193-209).
4. A `DriverProfile` exists for the caller → else `400 "Complete your driver
   profile before adding a vehicle."` (lines 211-221).

Then it uploads the photos (lines 231-244) and writes:

```ts
// src/app/api/driver-profile/vehicles/route.ts:248-262 — as it stands today
    vehicle = await prisma.vehicle.create({
      data: {
        driverProfileId: driverProfile.id,
        // Exactly one owner column may be set (`vehicle_single_owner_check`);
        // spelling out the null makes that explicit rather than implied.
        companyId: null,
        vehicleTypeSpecId,
        plateNumber,
        make,
        model,
        year,
        photoUrls,
      },
      include: { vehicleTypeSpec: true },
    });
```

An employed driver passes all four checks. The `companyId: null` is not a bug in
itself — the schema's `vehicle_single_owner_check` constraint means exactly one
owner column may be set, and this route's owner is always the driver — the bug
is that the route lets an employed driver *reach* it.

The only caller of this endpoint is the hub's own add form
(`src/components/driver-hub/screens/vehicles-add-form.tsx:246-256`, which posts
here for any non-`BUSINESS` `kind`). Nothing else in `src/` posts to it.

### 2. The refusal, mirroring `GET /api/loads`

`src/app/api/loads/route.ts:727-750` is the shape to match. Read it. Verbatim as
it stands today:

```ts
// src/app/api/loads/route.ts:727-750
  // `account.companyId` on an INDIVIDUAL account is `DriverProfile.companyId`:
  // the fleet a roster driver belongs to, or null for an independent driver or
  // sole proprietor. An employed roster driver receives work through their
  // company's dispatcher, who accepts and rejects on the company's behalf, so
  // they have no board of their own — the same reasoning
  // src/app/api/orders/[id]/accept/route.ts already refuses them with, adapted
  // from an action to a listing. This is a deliberate scoping choice rather
  // than an oversight: see specs/driver-load-board/requirements.md's
  // Assumptions ("Roster drivers do not accept work — confirmed, not assumed")
  // and specs/driver-load-board/action-required.md's "Decide whether employed
  // roster drivers get the board" item, which records the default (no) and the
  // alternative (a per-company opt-in) as an open *business* decision.
  if (account.kind === "INDIVIDUAL" && account.companyId !== null) {
    return NextResponse.json<LoadBoardError>(
      {
        error:
          "Drivers who belong to a company receive deliveries through their company's dispatch, not through the open load board.",
      },
      { status: 403 },
    );
  }
```

Four properties to carry over:

- **`403`, not `400` or `404`.** The request is well-formed and the caller is
  authenticated; what they are asking for is not theirs to have.
- **A plain-English error string in the same `{ error }` envelope** the rest of
  this route already uses, naming *who* does this instead of them. The add form
  renders `payload?.error` inline verbatim
  (`vehicles-add-form.tsx:263-268`), so this string is user-visible copy.
- **A long comment explaining *why*, in full sentences**, naming the
  dispatch/assignment path that replaces the refused one and pointing at the
  spec that recorded the decision.
- **The conjunction is explicit.** `GET /api/loads` writes `kind ===
  "INDIVIDUAL" && companyId !== null` because it serves both drivers and
  companies from one handler.

**One deliberate divergence: do not call `resolveHubAccount()` here.**

`GET /api/loads` can call it because it pre-checks `session`,
`mustChangePassword` and `role` first, and says so in a comment
(`src/app/api/loads/route.ts:702-704`). `resolveHubAccount()` is built on
`requireDashboardSession()` (`src/lib/dashboard/auth.ts`), which calls
`redirect()` on a missing session, a `mustChangePassword` user, or a `CLIENT`
role — `redirect()` throws `NEXT_REDIRECT` inside a route handler, which is not
what this endpoint should do to an API caller. This route is a `multipart`
form endpoint with no such pre-check ordering guarantee, and it *already reads
the `DriverProfile` row* the persona is derived from. So the refusal reads
`DriverProfile.companyId` directly, off the query the handler makes anyway,
for zero extra round trips.

The `kind === "INDIVIDUAL"` half of the conjunction is satisfied structurally
rather than skipped: the handler has already refused every `role !== "DRIVER"`
session at line 186, and `resolveHubAccount()` assigns `kind: "BUSINESS"` only
for a `role === "COMPANY"` session. Anything that reaches the new check is
necessarily `kind: "INDIVIDUAL"`, so a non-null `companyId` there means employer
and cannot mean own-company. **Say this in the comment** — the next reader will
otherwise see a bare `companyId !== null` test and correctly suspect the bug
this spec's requirements warn about.

### 3. The route change

Extend the existing lookup's `select` and add the guard immediately after the
profile null-check:

```ts
// src/app/api/driver-profile/vehicles/route.ts — inside POST, replacing
// lines 211-221
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    // `companyId` joins `id` for the roster check below. It rides on the query
    // the handler was making anyway, which is why this endpoint reads the
    // column directly instead of resolving the hub account: that path goes
    // through `requireDashboardSession()`, whose `redirect()` would throw
    // NEXT_REDIRECT out of a route handler answering a fetch.
    select: { id: true, companyId: true },
  });

  if (!driverProfile) {
    return NextResponse.json(
      { error: "Complete your driver profile before adding a vehicle." },
      { status: 400 },
    );
  }

  // A driver employed on a company's roster does not register their own
  // vehicle: they drive one the fleet owns, reached through an open
  // `DriverVehicleAssignment` that a fleet manager creates. Without this
  // refusal the create below would happily write them a `Vehicle` with
  // `companyId: null` — a personal row their employer's fleet screens cannot
  // see, that no dispatch path will assign work to, and that the fleet's own
  // vehicle-review pipeline never touched. It would exist, it would be theirs,
  // and it would be inert.
  //
  // `companyId` alone is the whole test *here* only because the role check
  // above has already refused every non-DRIVER session, and `resolveHubAccount`
  // assigns `kind: "BUSINESS"` for a COMPANY session alone. Anything reaching
  // this line is therefore an INDIVIDUAL-shaped account, so a non-null
  // `companyId` names an *employer* and can never name the caller's own
  // company. Elsewhere — `GET /api/loads`, `hubNavForAccount()` — the same rule
  // has to be spelled `kind === "INDIVIDUAL" && companyId !== null`, because
  // those surfaces serve both shapes from one code path. Fleet vehicles are
  // added through POST /api/logistics-company/vehicles instead.
  if (driverProfile.companyId !== null) {
    return NextResponse.json(
      {
        error:
          "Drivers who belong to a company drive their employer's vehicles. Ask your fleet manager to add this vehicle and assign it to you.",
      },
      { status: 403 },
    );
  }
```

**Placement matters and is not cosmetic.** The check must sit *before*
`findVehicleTypeSpecIdByCode()` (line 223) and, critically, before the photo
upload loop (lines 231-244). The route's cleanup path
(`deleteVehiclePhotos()`, lines 266-271) only runs when `prisma.vehicle.create`
throws; a refusal returned after the uploads would leave orphaned objects in
the Supabase bucket on every rejected roster attempt. Refuse before spending
anything.

Also update the `POST` handler's doc comment (lines 165-179). It currently
says only that ownership is never taken from the request; it should now also
state that a roster driver is refused outright and why, so the rule is
discoverable from the handler's own documentation rather than only from the
body.

### 4. `GET` is deliberately not guarded

Leave `GET /api/driver-profile/vehicles` (lines 134-163) exactly as it is.

Two reasons, both worth writing into the code as a short comment on the `GET`
handler so a later reader does not "finish the job":

- A roster driver listing vehicles they own is harmless — it is a read of their
  own rows, and if the list is empty (which it will be for a roster driver
  created through `POST /api/logistics-company/drivers/register`) an empty array
  is the honest answer, not an error.
- The hub's Vehicles screen does not use this endpoint at all. It renders from
  `getHubVehicles()` server-side. Refusing `GET` would change nothing the hub
  shows and would break any other consumer for no gain.

`DELETE /api/driver-profile/vehicles/[id]` is likewise **out of scope and must
stay open.** A roster driver who registered a personal vehicle *before* this
guard lands needs a way to remove it; refusing the delete would strand the row
permanently. That file is not in this task's file list — do not open it.

### 5. `HubVehiclesData` — the field names, and why

Current shape, verbatim (`src/lib/dashboard/hub/vehicles.ts:170-188`):

```ts
export type HubVehiclesData = {
  /** Echoed so the screen can pick its "Vehicles" / "Vehicle" heading. */
  kind: HubAccountKind;
  /** Complete, unpaginated, newest first. */
  vehicles: HubVehicle[];
  tiles: {
    /** Total rows in `vehicles`. */
    vehicleCount: number;
    /** Breakdown behind the count, largest group first. */
    classBreakdown: HubVehicleClassCount[];
    /** Vehicles with a live assignment — the design's "On the road". */
    onTheRoadCount: number;
    /** Vehicles nobody currently holds. */
    unassignedCount: number;
    sampled: {
      fleetCostPerKmGel: number;
    };
  };
};
```

Replace the top of it with:

```ts
export type HubVehiclesData = {
  /**
   * The **owner** axis: which owner-scoped API route pair applies to a vehicle
   * on this screen, and whether the fourth tile is a fleet figure or a personal
   * one. `"BUSINESS"` posts and deletes against
   * `/api/logistics-company/vehicles`; `"INDIVIDUAL"` against
   * `/api/driver-profile/vehicles`.
   *
   * Kept, and deliberately **not** replaced by `persona` below. The three
   * places that read it — the "Fleet cost per km" / "Cost per km" tile label,
   * the add form's route choice, and the detail panel's `removable` rule and
   * `DELETE` endpoint — all ask a genuinely two-valued question about
   * *ownership*, and an INDEPENDENT and a ROSTER driver answer it identically.
   * Re-expressing them as `persona !== "BUSINESS"` would be a wider test
   * standing in for a narrower fact, and would make the detail panel's
   * ownership rule read as a persona rule.
   *
   * (The old comment here claimed this picks the screen's heading. It does
   * not — the header title comes from the static `"Vehicles"` literal in
   * `src/components/driver-hub/driver-hub-nav.ts`, which no screen overrides.)
   */
  kind: HubAccountKind;
  /**
   * The **account-shape** axis, for copy. Three sentences are needed where
   * `kind` can only tell two apart: an INDEPENDENT driver reads about a vehicle
   * they own, a ROSTER driver reads about one their employer owns and assigned
   * to them, and a BUSINESS reads about a fleet. This is the field the screen
   * branches on for wording; `canAddVehicle` below is the field it branches on
   * for the one affordance that is actually withheld.
   */
  persona: HubPersona;
  /**
   * Whether this account may register a vehicle at all — `false` for exactly
   * one persona, `ROSTER`.
   *
   * Carried as a decided verdict rather than left to the screen to derive from
   * `persona`, for the same reason `HubAccount.canToggleOnline` exists beside
   * the activation columns it is computed from: the rule is enforced
   * server-side (`POST /api/driver-profile/vehicles` 403s a roster driver, and
   * so does the fleet route for a non-company caller), and a client that
   * re-derives the rule is a second copy of it that can drift. When the rule
   * changes it changes here, and the button follows.
   */
  canAddVehicle: boolean;
  // …the rest unchanged: `vehicles`, `tiles`.
};
```

**On the name `canAddVehicle`.** It is the right one and should be kept:

- It matches the codebase's established `can<Verb><Noun>` convention for "may
  this UI control be operated" — `HubAccount.canToggleOnline`
  (`src/lib/dashboard/hub/account.ts:74`), whose own doc comment sets out
  exactly this reasoning: a field that answers "may this control be operated?"
  is kept distinct from the underlying fact it is computed from, so a caller
  cannot generalise the wrong one.
- It names the affordance in the user's own words. The button's label is
  literally `Add vehicle`
  (`src/components/driver-hub/screens/vehicles-screen.tsx:401`), so a reader
  going from the button to the flag and back never has to translate.
- Alternatives considered and rejected: `canRegisterVehicle` (correct but
  matches no visible label), `addVehicleAllowed` (breaks the `can…` convention
  the hub already reads), and shipping nothing at all and letting the screen
  test `persona !== "ROSTER"` itself (rejected — that is the drift this field
  exists to prevent).

**On whether `kind` should stay: yes, keep all three fields.** The requirements'
acceptance criteria already record the project-level version of this decision —
"`HubAccountKind` still exists and still means what it meant; `persona` is
added alongside it, not in place of it, so the Vehicles and Loads screens that
already consume `kind` keep compiling." Do not remove `kind`, and do not
retype it as `HubPersona`.

### 6. `vehicles.ts` — the loader change

Add `HubPersona` to the existing type import (line 44):

```ts
import type {
  HubAccount,
  HubAccountKind,
  HubPersona,
} from "@/lib/dashboard/hub/account";
```

`getHubVehicles()` has **two** return statements and both must be updated —
the empty-scope early return at lines 283-295 and the main return at lines
387-400. Derive the verdict once, above the `scope` computation, so the two can
never disagree:

```ts
export async function getHubVehicles(
  account: HubAccount,
): Promise<HubVehiclesData> {
  const { companyId, driverProfileId } = account;

  // Decided once for both return paths below. A roster driver's vehicle is
  // their employer's, reached through an open `DriverVehicleAssignment` that a
  // fleet manager creates — there is nothing for them to register, and
  // `POST /api/driver-profile/vehicles` refuses them if they try. An
  // INDEPENDENT driver registers their own; a BUSINESS registers the fleet's
  // through the company route. Computing it here rather than at each `return`
  // is what stops the empty-fleet path and the populated path from drifting
  // into two different answers to the same question.
  const canAddVehicle = account.persona !== "ROSTER";

  const scope = /* …unchanged… */;

  if (scope === null) {
    return {
      kind: account.kind,
      persona: account.persona,
      canAddVehicle,
      vehicles: [],
      tiles: {
        vehicleCount: 0,
        classBreakdown: [],
        onTheRoadCount: 0,
        unassignedCount: 0,
        sampled: { fleetCostPerKmGel: SAMPLE_FLEET_COST_PER_KM_GEL },
      },
    };
  }

  // …query and mapping unchanged…

  return {
    kind: account.kind,
    persona: account.persona,
    canAddVehicle,
    vehicles,
    tiles: {
      /* …unchanged… */
    },
  };
}
```

Write `account.persona !== "ROSTER"` rather than `account.persona ===
"INDEPENDENT" || account.persona === "BUSINESS"`. The rule being encoded is a
single withholding, not a pair of grants, and a fourth persona added later
should default to *allowed* here and be excluded deliberately, not be silently
denied by an exhaustive allow-list nobody remembered to extend.

**Do not touch the `scope` clause itself** (lines 258-283). It is already
correct and it is already the hub's only three-way scope: a `BUSINESS` matches
`{ companyId }`; anything else matches `OR: [{ driverProfileId }, {
assignments: { some: { driverProfileId, unassignedAt: null } } }]`, whose second
arm is the only reason a roster driver sees a vehicle at all. Rewriting it in
terms of `persona` would gain nothing — an INDEPENDENT and a ROSTER driver
already need the same `OR`, because a driver who owns a vehicle *and* holds a
company one must see both — and would risk narrowing a query that currently
fails safe.

Extend the module header comment (lines 1-34) too. Its opening paragraph says
"One loader serves both account kinds"; after this task it serves three
personas, and it now carries a permission verdict (`canAddVehicle`) as well as
data, which is a new kind of thing for a hub loader to export and should be
called out where a reader will find it.

### 7. `vehicles/page.tsx` — read the existing reasoning before changing anything

The page has **no guard today and that is deliberate.** Its doc comment
(`src/app/dashboard/(hub)/vehicles/page.tsx:14-31`) says so:

> Open to both account kinds, unlike Drivers and Employees: an independent
> driver has a vehicle too, and `getHubVehicles()` resolves the scope
> difference (a company's own rows, versus a driver's own rows plus the company
> van currently assigned to them). There is therefore no business-only redirect
> here, and adding one would lock a driver out of their own vehicle.

**That reasoning survives this feature intact and no `redirect()` is to be
added.** A roster driver has a legitimate reason to open this screen: it is
where they see the van they actually drive, its class, its payload and who
currently holds it. What is withheld from them is a *write*, and a write is
guarded where the write happens.

This is the one place in the feature where the requirements' standing rule —
"every screen withheld from a persona needs a server-side `redirect()` in its
`page.tsx`" — does not apply, precisely because the screen is not withheld. The
comparison to make is `src/app/dashboard/(hub)/earnings/page.tsx` (task-03),
which *does* gain a redirect because the whole screen is withheld, and
`src/app/dashboard/(hub)/loads/page.tsx:160-180`, which already has one.

So the only change here is to the comment: it should read "all three personas"
rather than "both account kinds", and it should state explicitly that the
roster restriction on this screen is the add affordance and its endpoint, not
the screen. Leave the body — `resolveHubAccount()`, the `null` early return,
`getHubVehicles(account)`, `<VehiclesScreen data={data} />` — byte-identical.

### API Endpoints

- `POST /api/driver-profile/vehicles` — unchanged request contract
  (`multipart/form-data`: `plateNumber`, `make`, `model`, `year`,
  `vehicleTypeCode`, one or more `photos`). Unchanged success:
  `201` with the created `Vehicle` including its `vehicleTypeSpec`. **New
  failure: `403` with
  `{ error: "Drivers who belong to a company drive their employer's vehicles. Ask your fleet manager to add this vehicle and assign it to you." }`**
  when the caller's `DriverProfile.companyId` is non-null. Existing `401`,
  `403` (non-DRIVER role), `400`, `409` and `502` responses are untouched.
- `GET /api/driver-profile/vehicles` — unchanged in every respect.
- `POST /api/logistics-company/vehicles` — not touched by this task. It is the
  route a fleet owner's add form posts to and it already refuses non-company
  callers.

## Acceptance Criteria

- [ ] `POST /api/driver-profile/vehicles` returns `403` with a JSON `{ error }`
      body when the caller's `DriverProfile.companyId` is non-null, and behaves
      exactly as before for a driver whose `companyId` is `null`.
- [ ] That refusal is returned **before** `uploadVehiclePhoto()` runs, so a
      refused request uploads nothing to Supabase Storage.
- [ ] The refusal reads `companyId` off the `driverProfile.findUnique()` the
      handler already makes — no second query, and no call to
      `resolveHubAccount()` or `requireDashboardSession()` from inside the route
      handler.
- [ ] The refusal carries a full-sentence comment explaining why an employed
      driver is refused, what path replaces it (a fleet manager adding the
      vehicle and creating a `DriverVehicleAssignment`), and why `companyId`
      alone is a sufficient test *at that line specifically* given the
      `role !== "DRIVER"` refusal above it.
- [ ] `GET /api/driver-profile/vehicles` is unchanged, and carries a short
      comment recording that its openness is deliberate.
- [ ] `src/app/api/driver-profile/vehicles/[id]/route.ts` is not modified.
- [ ] `HubVehiclesData` carries `persona: HubPersona` and
      `canAddVehicle: boolean` **in addition to** the existing
      `kind: HubAccountKind`, which is neither removed nor retyped.
- [ ] `canAddVehicle` is `account.persona !== "ROSTER"`, computed once in
      `getHubVehicles()` and returned identically from both of that function's
      two `return` statements.
- [ ] The stale `kind` doc comment ("Echoed so the screen can pick its
      'Vehicles' / 'Vehicle' heading") is corrected — the header title comes
      from `driver-hub-nav.ts` and no screen overrides it.
- [ ] The three-way `scope` clause in `getHubVehicles()` (the `BUSINESS`
      `{ companyId }` branch and the driver `OR` of owned rows plus open
      assignments) is byte-identical to what it was.
- [ ] `src/app/dashboard/(hub)/vehicles/page.tsx` gains no `redirect()`; only
      its doc comment changes, and it now names all three personas.
- [ ] `src/components/driver-hub/driver-hub-nav.ts` is not modified by this
      task.
- [ ] No file owned by another Wave 2 task (`today.ts`, `earnings.ts`,
      `performance.ts` and their pages) is touched.
- [ ] No `vehicles-*` component under `src/components/driver-hub/screens/` is
      touched — those belong to task-09 in Wave 3.
- [ ] No Prisma schema change and no migration.
- [ ] `pnpm lint` and `pnpm typecheck` (or the project's equivalents) pass
      clean.

## Notes

**A roster driver has no personal `Vehicle` row today, and that is verified,
not assumed.** `POST /api/logistics-company/drivers/register` is the only path
that creates a `DriverProfile` with a non-null `companyId`, and its own comment
records that "A company-created driver never sees the self-serve onboarding
wizard" (`src/app/api/logistics-company/drivers/register/route.ts:490-506`) —
so the wizard's `tx.vehicle.create()`
(`src/app/api/driver-profile/onboarding/submit/route.ts:790`) never runs for
one. No route anywhere sets an existing `DriverProfile.companyId` from `null` to
a value. The hub's own add form was therefore the *only* way an employed driver
could acquire a personal vehicle, which is exactly why closing it is sufficient
rather than merely helpful.

**The reverse direction exists and works out correctly.** `DELETE
/api/logistics-company/drivers/[userId]` sets `companyId: null` on the profile
(`src/app/api/logistics-company/drivers/[userId]/route.ts:55-58`), taking a
driver off the roster. Because `persona` is derived per request inside the
React-`cache()`d `resolveHubAccount()` and `canAddVehicle` is derived from it
per request, that driver's next page load resolves as `INDEPENDENT`, the button
returns and the endpoint accepts them again, with nothing to migrate. Do not
cache the verdict anywhere with a longer lifetime than a request.

**The driver onboarding wizard is an unguarded second surface, out of scope.**
`src/app/api/driver-profile/onboarding/submit/route.ts:773-790` writes a
`Vehicle` with `driverProfileId` and no company, and has no roster check either.
It is unreachable for a roster driver today for the reason above, so it is not a
live hole — but it *is* a second door to the same room. Do not open that file in
this task; the file list is fixed for parallel safety. Flag it in the
implementation report so it can be scheduled.

**A pre-existing personal row would still render correctly.** If one ever exists
— a legacy row, or a fixture — the loader's `OR` arm still returns it, the
screen still lists it, and `vehicles-detail-panel.tsx:176-179` still offers
`Remove vehicle` for it, because that rule keys off `vehicle.ownership ===
"DRIVER"` rather than off the persona. That is the correct behaviour: the
corrective action for such a row is removing it, and this task must not make it
un-removable. task-09 will not change that rule either.

**Why not a `companyName` on `HubVehiclesData`.** It would let the screen say
"assigned to you by Gizo Cargo LLC" instead of a generic sentence, and
`HubAccount.companyName` already carries the string. It is deliberately not
added: the assignment for this task is the guard and the verdict, task-09's copy
requirements are satisfied without it, and a field nothing reads is a field the
next person has to decide about. If task-09 finds it genuinely needed, raise it
rather than adding it speculatively here.

**Two callers of `getHubVehicles()` exist; check both compile.** Besides
`vehicles/page.tsx`, `src/app/dashboard/(hub)/drivers/page.tsx:99-102` calls it
for a `BUSINESS` account and reads only `vehicles.vehicles`. Adding fields to
`HubVehiclesData` is additive and cannot break it — but do not "tidy" that file
while you are there. It belongs to no task in this spec.

**Manual verification, per `action-required.md`.** Confirming the `403` needs a
driver account with `DriverProfile.companyId` set — one created through the
fleet's own "register a driver" flow is the realistic shape. Without one, the
verification available is reading the code and running lint and typecheck; say
which of the two you did in the implementation report rather than implying
runtime coverage that did not happen.
