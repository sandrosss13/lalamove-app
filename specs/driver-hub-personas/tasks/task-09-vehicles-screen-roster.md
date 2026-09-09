# Task 09: Vehicles screen — hide "Add vehicle" for a roster driver and name the employer's van

## Status

pending

## Wave

3

## Description

The Vehicles screen currently offers an "Add vehicle" button to every account it
renders for, and tells an empty-handed driver "You have no vehicle registered
yet. Add one to start taking jobs." For a driver employed on a company's roster
both are wrong: they drive a van their employer owns and assigned to them, they
have nothing to register, and as of task-05 the endpoint behind that button
returns `403` to them. This task makes the screen agree with the rule the server
now enforces — the affordance disappears, the empty state stops instructing an
action that cannot succeed, and the tiles stop describing fleet-management moves
to somebody who cannot make them.

This is not a new kind of work for this screen. `vehicles-screen.tsx` is the
only screen in the hub that already branches on account shape visually — the
fourth tile's label, the empty-state sentence, and the `kind` it forwards to the
add form and the detail panel — so this task extends branching that is already
there rather than introducing it. Its main structural risk is the toolbar row,
which was written on the assumption that the "Add vehicle" button is always
present and will otherwise render as an empty bar.

## Dependencies

**Depends on:** task-05-vehicles-roster-guard
**Blocks:** None

**Context from dependencies:**

### The three personas

| Persona | `HubAccount.kind` | `HubAccount.companyId` | Who they are |
|---|---|---|---|
| `INDEPENDENT` | `"INDIVIDUAL"` | `null` | Owns their vehicle, browses the open Load Board, keeps their own fares |
| `ROSTER` | `"INDIVIDUAL"` | set — their **employer** | Employed driver; work arrives via company dispatch; fares are paid to the employer |
| `BUSINESS` | `"BUSINESS"` | set — their **own** company | Fleet owner; also sees the Drivers and Employees screens |

`companyId !== null` alone is **not** the roster test — a `BUSINESS` account has
one too. `DriverProfile.accountType` is a different axis entirely and is never
used for this. **Neither test appears in this task**: the persona is decided
server-side and handed to the screen already resolved. Never re-derive it here.

### What task-05 produces that this task consumes

task-05 edits `src/lib/dashboard/hub/vehicles.ts`. After it lands,
`HubVehiclesData` — the single prop this screen receives — is:

```ts
// src/lib/dashboard/hub/vehicles.ts — after task-05.
// `HubPersona` ("INDEPENDENT" | "ROSTER" | "BUSINESS") and `HubAccountKind`
// ("BUSINESS" | "INDIVIDUAL") are both declared in
// `@/lib/dashboard/hub/account` and type-imported here. This screen reads
// `data.persona` as a value and needs no type import of its own.
export type HubVehiclesData = {
  /**
   * The owner axis: which owner-scoped API route pair applies, and whether the
   * fourth tile is a fleet figure or a personal one. Unchanged by this feature
   * and still `"BUSINESS" | "INDIVIDUAL"`.
   */
  kind: HubAccountKind;
  /** The account-shape axis, for copy. NEW in task-05. */
  persona: HubPersona;
  /**
   * Whether this account may register a vehicle at all — `false` for exactly
   * one persona, `ROSTER`. NEW in task-05. Mirrors the `403` that
   * `POST /api/driver-profile/vehicles` now returns to a roster driver.
   */
  canAddVehicle: boolean;
  /** Complete, unpaginated, newest first. Unchanged. */
  vehicles: HubVehicle[];
  tiles: {
    vehicleCount: number;
    classBreakdown: HubVehicleClassCount[];
    onTheRoadCount: number;
    unassignedCount: number;
    sampled: { fleetCostPerKmGel: number };
  };
};
```

`canAddVehicle` is computed in the loader as `account.persona !== "ROSTER"`.
**Branch the button on `canAddVehicle`, not on `persona === "ROSTER"`.** The
whole point of the field is that the rule lives in one place; a second copy of
it in the client is exactly what it exists to prevent. `persona` is for
*wording*, where three distinct sentences are needed.

task-05 also adds the server-side refusal:

- `POST /api/driver-profile/vehicles` returns `403` with
  `{ error: "Drivers who belong to a company drive their employer's vehicles. Ask your fleet manager to add this vehicle and assign it to you." }`
  when the caller's `DriverProfile.companyId` is non-null.
- `POST /api/logistics-company/vehicles` and both `DELETE` routes are unchanged.
- `src/app/dashboard/(hub)/vehicles/page.tsx` gains **no** redirect. The screen
  stays open to all three personas; only the write is withheld. A roster driver
  reaching this screen is a normal, supported state, not something to bounce.

The `403` is the boundary. Hiding the button is the courtesy — the same
cosmetic/boundary relationship the hub already documents for its nav filtering.

## Files to Create

None.

## Files to Modify

- `src/components/driver-hub/screens/vehicles-screen.tsx` — the substantive
  change: hide the "Add vehicle" button when `!canAddVehicle`, stop the toolbar
  rendering as an empty bar when nothing is left in it, give the empty state a
  third persona-appropriate arm, correct two tile notes that describe
  fleet-management moves to a driver, and give the header subtitle a roster
  wording. Its file-header doc comment ("One screen for both account kinds")
  needs rewriting.
- `src/components/driver-hub/screens/vehicles-add-form.tsx` — **doc comment
  only.** The form's `kind` prop stays exactly as it is; what it gains is a
  recorded statement that it is now unreachable for a roster driver and that the
  endpoint refuses one, so nobody restores an unconditional entry point to it.
- `src/components/driver-hub/screens/vehicles-detail-panel.tsx` — **doc comment
  only.** Its existing `removable` rule and its "belongs to the fleet you drive
  for" copy are already correct for a roster driver and must not change; the
  comment should say so, and say why a `persona` prop is deliberately not added
  here.
- `src/components/driver-hub/screens/vehicles-format.ts` — listed to reserve
  ownership within Wave 3. **No change is expected.** Only add to it if a
  formatting helper genuinely falls out of the copy work below; do not
  manufacture one.

## Technical Details

### 1. Read all four files first

Every line number below was checked against the working tree. Confirm them
before editing — an earlier Wave 3 task cannot have moved them (no other task
owns these files), but a rebase can.

The four persona-shaped branches that exist **today**:

| Location | Code | What it decides |
|---|---|---|
| `vehicles-screen.tsx:198` | `const { kind, vehicles, tiles } = data;` | the destructure everything below reads |
| `vehicles-screen.tsx:337` | `label={kind === "BUSINESS" ? "Fleet cost per km" : "Cost per km"}` | the fourth tile's label |
| `vehicles-screen.tsx:578-584` | `kind === "BUSINESS" ? "No vehicles in the fleet yet." : "You have no vehicle registered yet."` | the empty state |
| `vehicles-screen.tsx:291`, `:298` | `kind={kind}` forwarded to both panels | which owner-scoped route each uses |

and in the children:

| Location | Code | What it decides |
|---|---|---|
| `vehicles-add-form.tsx:247-249` | `kind === "BUSINESS" ? "/api/logistics-company/vehicles" : "/api/driver-profile/vehicles"` | where the create posts |
| `vehicles-detail-panel.tsx:176-179` | `removable = kind === "BUSINESS" ? ownership === "COMPANY" : ownership === "DRIVER"` | whether Remove is offered |
| `vehicles-detail-panel.tsx:181-184` | the `DELETE` endpoint | where the delete goes |

The last three are **ownership** questions, not persona questions, and an
INDEPENDENT and a ROSTER driver answer all three identically. They stay on
`kind`. Do not convert them.

### 2. The destructure and the button

```tsx
// vehicles-screen.tsx:197-198 — before
export function VehiclesScreen({ data }: VehiclesScreenProps) {
  const { kind, vehicles, tiles } = data;

// after
export function VehiclesScreen({ data }: VehiclesScreenProps) {
  const { kind, persona, canAddVehicle, vehicles, tiles } = data;
```

The button today (`vehicles-screen.tsx:395-402`) is unconditional:

```tsx
                <Button
                  type="button"
                  size="lg"
                  onClick={startAdding}
                  className="h-auto rounded-md px-[14px] py-2 text-[13px]"
                >
                  Add vehicle
                </Button>
```

Wrap it:

```tsx
                {/* A driver on a company's roster drives a van their employer
                    owns and assigned to them; there is nothing for them to
                    register, and `POST /api/driver-profile/vehicles` returns a
                    403 if they try. Hiding the button is the courtesy — the
                    route is the boundary — so this reads the loader's decided
                    `canAddVehicle` rather than re-testing the persona, which
                    would be a second copy of a rule that lives on the server. */}
                {canAddVehicle ? (
                  <Button
                    type="button"
                    size="lg"
                    onClick={startAdding}
                    className="h-auto rounded-md px-[14px] py-2 text-[13px]"
                  >
                    Add vehicle
                  </Button>
                ) : null}
```

Nothing renders in place of it. There is no disabled button with a tooltip and
no explanatory line beside where it was: the fleet's van is not something this
driver is being *denied*, it is something that was never theirs to add, and a
greyed-out control implies a permission they might one day be granted on this
screen. The empty state (step 4) carries the one sentence that is needed, in the
one situation where it is needed.

**Also short-circuit `startAdding` itself**, at `vehicles-screen.tsx:255-259`:

```tsx
  const startAdding = React.useCallback(() => {
    // Belt and braces: with the button hidden nothing calls this for a roster
    // driver today, but the rail's add form posts to an endpoint that would
    // 403 them, and a screen that can reach an unusable form is one refactor
    // away from shipping it. Cheaper to make the state machine itself refuse.
    if (!canAddVehicle) {
      return;
    }

    setAdding(true);
    setSelectedId(null);
    setArmed(false);
  }, [canAddVehicle]);
```

Note the new dependency in the `useCallback` array — `canAddVehicle` is a prop
value, so omitting it is a lint error under the exhaustive-deps rule.

Leave the `detail` composition at `vehicles-screen.tsx:289-303` alone. With
`adding` unable to become `true`, the `<VehiclesAddForm>` arm is simply never
taken, and deleting it would mean deleting a working form to express a
condition the guard above already expresses.

### 3. The toolbar must not render as an empty bar

This is the one structural trap in the file. The toolbar row
(`vehicles-screen.tsx:351-404`) holds four things, and every one of them can now
be absent at once:

- the `FilterStrip` — `hasVehicles` only (line 360)
- the "Odometer · Cost/km" sample legend — `hasVehicles && !split` (line 383)
- the "*N* of *M* shown" counter — `hasVehicles` only (line 389)
- the "Add vehicle" button — **now `canAddVehicle`** (line 395)

A roster driver whose employer has not yet assigned them a van has
`hasVehicles === false` and `canAddVehicle === false`, which today would leave a
`mb-[18px]` flex row containing nothing but an empty inner `<div>` — an
18-pixel gap above the empty state, with a `justify-end` on a row that has
nothing to justify. That combination is not reachable before this task, which is
why the existing code did not have to consider it, and the loader's own comment
names the account that produces it: *"an account with no vehicles is an
ordinary, renderable state (a company mid-onboarding, a rostered driver awaiting
an assignment)"* (`src/lib/dashboard/hub/vehicles.ts:243-249`).

Gate the whole row:

```tsx
  // Every item in the toolbar is conditional now, so the row itself has to be:
  // a roster driver waiting on their first assignment has no rows to filter and
  // no button to press, and an empty flex row would still contribute its
  // bottom margin as an unexplained gap above the empty state.
  const showToolbar = hasVehicles || canAddVehicle;
```

and render `{showToolbar ? (<div className={cn("mb-[18px] …")}>…</div>) : null}`
around lines 351-404. Keep the existing `hasVehicles ? "justify-between" :
"justify-end"` inside it exactly as it is — with the row now guaranteed
non-empty, that rule still says the right thing (a lone button sits right, a
strip and a button sit apart), and its comment at lines 354-357 stays accurate.

### 4. The empty state gets a third arm

Today (`vehicles-screen.tsx:576-589`):

```tsx
              // An empty fleet gets a sentence, not a header row over nothing.
              <HubEmptyState
                message={
                  kind === "BUSINESS"
                    ? "No vehicles in the fleet yet."
                    : "You have no vehicle registered yet."
                }
              >
                <p className="mt-1.5 text-[13px]">
                  Add one to start taking jobs. It joins as idle until a driver
                  is assigned to it.
                </p>
              </HubEmptyState>
```

Both halves are wrong for a roster driver: the message says they failed to
register something, and the follow-up instructs an action the endpoint refuses.
Split on `persona` — this is the copy axis, and it is the one place in the file
where all three arms differ:

```tsx
              // An empty fleet gets a sentence, not a header row over nothing.
              // Three arms rather than two: a fleet owner has an empty fleet, an
              // independent driver has not registered their vehicle yet, and a
              // roster driver has not been *given* one yet — which is neither of
              // the first two, and is nothing they can act on. The follow-up
              // line is dropped entirely for them rather than reworded into a
              // softer instruction: there is no next step for them to take on
              // this screen, and inventing one would be the same false
              // affordance the hidden Add button just removed.
              <HubEmptyState
                message={
                  persona === "BUSINESS"
                    ? "No vehicles in the fleet yet."
                    : persona === "ROSTER"
                      ? "No vehicle assigned to you yet."
                      : "You have no vehicle registered yet."
                }
              >
                {persona === "ROSTER" ? (
                  <p className="mt-1.5 text-[13px]">
                    Your fleet manager assigns you a vehicle from the
                    company&apos;s own. It appears here once they do.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[13px]">
                    Add one to start taking jobs. It joins as idle until a
                    driver is assigned to it.
                  </p>
                )}
              </HubEmptyState>
```

Use `&apos;` for the apostrophe in JSX text, as the rest of this codebase does
(`vehicles-add-form.tsx:463` is the nearest example) — a bare `'` trips the
`react/no-unescaped-entities` rule.

This is the only place a `persona === "ROSTER"` test belongs in this file, and
the only place `persona` is read for a full sentence rather than a fragment.

### 5. Two tile notes that describe moves a driver cannot make

`vehicles-screen.tsx:320-343` renders four `MetricTile`s. The fourth already
branches on `kind` for its label (line 337) and is correct. The second and third
do not branch at all, and their notes are written from a fleet manager's chair:

```tsx
        <MetricTile
          label="On the road"
          value={tiles.onTheRoadCount}
          note="Held by a driver right now"
        />
        <MetricTile
          label="Unassigned"
          value={tiles.unassignedCount}
          note="Available to hand to a driver"
        />
```

"Available to hand to a driver" is a fleet-management action. A roster driver
cannot hand a vehicle to anyone — and neither, it turns out, can an independent
one, so this is a pre-existing copy defect that this task is simply the first to
be in a position to fix. Branch both notes on `kind`, which is the correct axis
here (the question is "am I a fleet or am I one driver?", and INDEPENDENT and
ROSTER answer it the same way):

```tsx
        <MetricTile
          label="On the road"
          value={tiles.onTheRoadCount}
          // A fleet's operator reads this as a dispatch fact about somebody
          // else; a driver reads it as a fact about themselves, because the
          // only vehicle they can be shown as holding is one assigned to them.
          note={
            kind === "BUSINESS"
              ? "Held by a driver right now"
              : "In your hands right now"
          }
        />
        <MetricTile
          label="Unassigned"
          value={tiles.unassignedCount}
          // "Available to hand to a driver" is a move only a fleet manager can
          // make. For a single driver the honest reading of the same number is
          // that nobody is currently holding it.
          note={
            kind === "BUSINESS"
              ? "Available to hand to a driver"
              : "Not held by anyone right now"
          }
        />
```

Keep all four tiles for all three personas. Dropping the "Unassigned" tile for a
roster driver was considered and rejected: the grid is
`sm:grid-cols-2 xl:grid-cols-4` (line 320) and three tiles leave it visibly
ragged at `xl`, and the figure is not meaningless — a roster driver who also
holds a legacy personal vehicle has a real non-zero count there.

Do **not** touch the fourth tile's `SampleNote`, `FLEET_COST_NOTE`, or the
sampled-column legend and its `SampledHead` dots. The sample-data convention is
load-bearing and orthogonal to persona: every sampled figure stays sampled and
stays badged for all three.

### 6. The header subtitle

`vehicles-screen.tsx:206-212`:

```tsx
  useHubSubtitle(
    tiles.vehicleCount === 0
      ? "No vehicles yet"
      : `${pluralise(tiles.vehicleCount, "vehicle")} · ${
          tiles.onTheRoadCount
        } on the road`,
  );
```

`useHubSubtitle` replaces the sticky header's 13px subhead with a runtime string
(`src/components/driver-hub/driver-hub-shell.tsx:90-109`); passing `null`
restores `driver-hub-nav.ts`'s static literal. "1 vehicle · 1 on the road" is
technically true for a roster driver and reads like a fleet report about a fleet
of one. Give them the one-vehicle wording:

```tsx
  useHubSubtitle(
    tiles.vehicleCount === 0
      ? persona === "ROSTER"
        ? "No vehicle assigned to you yet"
        : "No vehicles yet"
      : persona === "ROSTER"
        ? `${pluralise(tiles.vehicleCount, "vehicle")} assigned to you`
        : `${pluralise(tiles.vehicleCount, "vehicle")} · ${
            tiles.onTheRoadCount
          } on the road`,
  );
```

`pluralise(count, singular)` is the existing helper in `vehicles-format.ts:60`
and returns `"1 vehicle"` / `"3 vehicles"`. It already handles the roster
driver's legacy-plus-assigned case correctly.

Do not name the employer here. `HubVehiclesData` carries no `companyName` —
task-05 deliberately did not add one — so a string that names the company is not
available without a change to a Wave 2 file this task does not own. See Notes.

### 7. The file's own documentation

`vehicles-screen.tsx:35-72` is a long header comment and its first line is now
false:

> Vehicles — the fleet a company owns, or the vehicle one driver drives.
>
> One screen for both account kinds, because `getHubVehicles()` already
> resolved the scope difference: the only thing that changes here is the
> wording of a tile label and of the empty state…

Rewrite that opening section to say: one screen for all three personas; the
scope difference is still resolved in the loader; what changes here is now the
wording of two tile notes, the empty state, the header subtitle **and one
affordance** — the "Add vehicle" button, which a roster driver does not get
because the endpoint behind it refuses them. Say explicitly that the hidden
button is cosmetic and `POST /api/driver-profile/vehicles` is the boundary, in
the same register the nav file uses for `businessOnly`
(`src/components/driver-hub/driver-hub-nav.ts:24-31`).

Leave the "What the design asks for and what ships", "Sample data" and
"Selection" sections of that comment intact — all three are still accurate.

### 8. `vehicles-add-form.tsx` — comment only

The form's `VehiclesAddFormProps` is unchanged:

```tsx
export type VehiclesAddFormProps = {
  /** Picks the owner-scoped POST route. */
  kind: HubAccountKind;
  onCancel: () => void;
  onCreated: (vehicleId: string | null) => void;
};
```

**Do not add a `persona` or a `canAdd` prop to it.** The form's only account
question is which of two routes to post to, that question is genuinely
two-valued, and a form that is only ever mounted when adding is permitted has no
use for a permission flag. A second axis here would be a second place to get the
roster rule wrong.

Add to its file header comment (lines 14-45) a short paragraph recording that
this form is not reachable for a roster driver — the screen hides its entry
point and `POST /api/driver-profile/vehicles` returns `403` to one regardless —
so the `kind === "BUSINESS" ? … : …` route choice at line 247 is, on the
driver side, always an independent driver's own registration. Its existing error
path already renders the route's own message verbatim
(`payload?.error ?? GENERIC_ERROR`, lines 258-268), so if the form is ever
reached anyway the driver sees the endpoint's sentence rather than "Could not
add this vehicle." — worth saying in the same paragraph, because it is the
reason no client-side duplicate of the refusal message is needed.

### 9. `vehicles-detail-panel.tsx` — comment only

The panel is **already correct for a roster driver** and this is the strongest
evidence that the screen was half-built for this feature. Two facts, both
verified:

- `removable` (lines 176-179) keys off `vehicle.ownership`, not off the persona.
  A driver may remove a `"DRIVER"`-owned vehicle and not a `"COMPANY"`-owned
  one. For a roster driver looking at the van assigned to them that is `false`,
  which is right — and it stays right for a legacy personal vehicle they own,
  which is `true`, which is also right, because removing it is the corrective
  action for exactly the row this feature stops being created.
- The sentence rendered when `removable` is `false` (lines 321-326) —
  *"This vehicle belongs to the fleet you drive for, not to you. Only its owner
  can remove it."* — is already written to a roster driver, and **only a roster
  driver can reach it.** A `BUSINESS` account's list is scoped to
  `{ companyId }` so every row is `"COMPANY"`-owned and every row is removable;
  a driver only sees a `"COMPANY"`-owned row through an open
  `DriverVehicleAssignment`, and
  `POST /api/logistics-company/vehicles/[id]/assignment` requires
  `{ userId: driverUserId, companyId: company.id }` on the driver
  (`src/app/api/logistics-company/vehicles/[id]/assignment/route.ts:242`), so
  the driver is necessarily on that company's roster.

So: **change no behaviour and no copy in this file.** Add to its header comment
(lines 23-42) a short paragraph naming that reachability fact, so the next
reader knows the sentence is a roster-driver sentence by construction, and
stating that `kind` is deliberately kept here rather than swapped for `persona`
because both of the questions this panel asks it — which `DELETE` route, and
whether the caller owns the row — are ownership questions that an independent
and a roster driver answer identically.

### 10. Verification

There is no test suite for this and the spec adds none (`requirements.md`,
Non-Goals). What can be checked:

1. `pnpm lint` and `pnpm typecheck` (or the project's equivalents) — the
   destructure of two new fields, the new `useCallback` dependency and the JSX
   apostrophe are all things these catch.
2. Reading the three persona paths through the file and confirming that
   `persona === "ROSTER"` appears in exactly the places listed above and
   `canAddVehicle` in exactly two (the button, `startAdding`) plus the
   `showToolbar` derivation.
3. If a roster test account is available (see `action-required.md`, "Provide
   test accounts for all three personas"): load `/dashboard/vehicles` as one
   and confirm no "Add vehicle" button, no empty toolbar bar, the assigned van
   listed with `Remove vehicle` replaced by the ownership sentence, and — for a
   roster driver with no assignment — the "No vehicle assigned to you yet."
   empty state with no 18px gap above it.

State in the implementation report which of these you actually did. Do not imply
runtime coverage that did not happen.

## Acceptance Criteria

- [ ] The "Add vehicle" button does not render when `data.canAddVehicle` is
      `false`, and nothing renders in its place — no disabled button, no
      tooltip, no substitute line in the toolbar.
- [ ] The button's condition is `canAddVehicle`, not a re-derivation such as
      `persona === "ROSTER"` or any test involving `kind` and a company id.
- [ ] `startAdding` returns early when `canAddVehicle` is `false`, and
      `canAddVehicle` is listed in its `useCallback` dependency array.
- [ ] The toolbar row (its `mb-[18px]` wrapper) does not render at all when
      there are no vehicles **and** the account may not add one, so a roster
      driver awaiting their first assignment sees no empty bar and no orphan
      margin above the empty state.
- [ ] The `hasVehicles ? "justify-between" : "justify-end"` rule inside the
      toolbar is unchanged.
- [ ] The empty state has three arms keyed on `persona`, the `ROSTER` arm reads
      as an assignment that has not happened rather than a registration the
      driver failed to make, and its follow-up paragraph does not instruct the
      driver to add a vehicle.
- [ ] The "On the road" and "Unassigned" tile notes read correctly for a single
      driver and are unchanged for `kind === "BUSINESS"`.
- [ ] All four `MetricTile`s still render for all three personas, and the fourth
      tile's `SampleNote`, the `SampledHead` accent dots and the
      "Odometer · Cost/km" legend are untouched.
- [ ] The header subtitle set through `useHubSubtitle()` reads as an assignment
      for a `ROSTER` driver and is unchanged for the other two personas.
- [ ] `vehicles-add-form.tsx` has **no** prop, route, validation or copy change
      — only its file-header comment.
- [ ] `vehicles-detail-panel.tsx` has **no** behaviour or copy change — only its
      file-header comment. In particular `removable`, the `DELETE` endpoint
      choice and the "belongs to the fleet you drive for" sentence are
      byte-identical.
- [ ] `kind` is still the axis for the fourth tile's label, the add form's route
      choice and the detail panel's `removable`/`DELETE` rules; none of the
      three is converted to `persona`.
- [ ] No tab is added to `BASE_TABS`. The strip is still
      `All / Active / Idle` plus the conditional `Needs review`.
- [ ] `src/components/driver-hub/driver-hub-nav.ts` is not modified.
- [ ] No file under `src/lib/`, no `page.tsx` and no API route is modified.
- [ ] No file owned by another Wave 3 task is touched — nothing named `today-*`,
      `earnings-*`, `performance-*`, `driver-hub-sidebar.tsx` or
      `driver-hub-header.tsx`.
- [ ] `pnpm lint` and `pnpm typecheck` (or the project's equivalents) pass
      clean.

## Notes

**The missing tabs are out of scope and must stay missing.** The design handoff
specifies five tabs — `All / Active / In service / Idle / Defleeted`
(`UI:UX/Registered Driver account (New)/Driver dashboard header alignment/Driver
Dashboard v2.dc.html:1673`) — and this screen ships three plus a conditional
`Needs review` (`vehicles-screen.tsx:83-93`). That is not an oversight and it is
not this task's to fix: `Vehicle` has no lifecycle column, so "In service" (at a
garage) and "Defleeted" (retired) are facts nothing in the schema records, and
the remove endpoint is a hard delete rather than a state change. `HubVehicleStatus`
is `"Active" | "Idle"` for exactly that reason and its own doc comment
(`src/lib/dashboard/hub/vehicles.ts:57-71`) names the schema change that would
retire the narrowing. **This spec makes no Prisma schema changes and runs no
migrations** (`requirements.md`, Non-Goals), so adding either tab would mean
adding a pill that can never have a row behind it — the precise thing the
screen's own header comment says it refused to do.

**The singular "Vehicle" title is task-01's, not this task's.** The design titles
this screen `Vehicles` for a business account and `Vehicle` for an individual
one (`Driver Dashboard v2.dc.html:1400` and `:1410`,
`isBiz ? 'Vehicles' : 'Vehicle'`). The repo renders the static string
`"Vehicles"` for everyone, and it comes from the `title` field of the `vehicles`
entry in `src/components/driver-hub/driver-hub-nav.ts:151-158`, which the sticky
header looks up by pathname — no screen overrides it, and `useHubSubtitle()`
reaches only the *subhead* beneath it, never the title. **`driver-hub-nav.ts` is
owned by task-01 (Wave 1) and must not appear in this task's diff.** If the
singular title is wanted it needs either a persona-aware `title` on `HubNavItem`
or a `useHubTitle()` counterpart to `useHubSubtitle()`, and both are task-01
shaped. Task-05 corrected the stale claim in `HubVehiclesData`'s `kind` doc
comment that said this screen picks its own heading; do not reintroduce it.

**Naming the employer was considered and deferred.** "Assigned to you by Gizo
Cargo LLC" would be the warmest version of the roster copy, and
`HubAccount.companyName` already holds the string — but `HubVehiclesData` does
not carry it, and adding it means editing `src/lib/dashboard/hub/vehicles.ts`,
which belongs to task-05 in Wave 2. Ship the generic sentences. If the named
version is wanted later it is a one-field change to the loader plus a string
here.

**"Assigned: <driver name>" showing the viewer their own name is a known
wart, also deferred.** The table's Assigned column
(`vehicles-screen.tsx:459-460`, `:509-519`) prints
`vehicle.assignment?.driverName`, so a roster driver reads their own name back
in their own row where "You" would be better. Rendering "You" needs the viewer's
`userId` on `HubVehiclesData` to compare against the existing
`HubVehicleAssignment.driverUserId` (`src/lib/dashboard/hub/vehicles.ts:77-84`),
which again is a Wave 2 loader change this task does not own. Leave it.

**A roster driver may legitimately have two rows.** The loader's driver scope is
`OR: [{ driverProfileId }, { assignments: { some: { driverProfileId,
unassignedAt: null } } }]` (`src/lib/dashboard/hub/vehicles.ts:266-281`), so a
roster driver holding a company van *and* owning a personal vehicle registered
before task-05's guard landed sees both — one `ownership: "COMPANY"` and
`status: "Active"`, one `ownership: "DRIVER"` and `status: "Idle"`. Every branch
in this task must survive that: `vehicleCount` is 2, `unassignedCount` is 1, the
empty state does not fire, and the detail panel offers `Remove vehicle` for the
personal one and the ownership sentence for the van. None of the changes above
assumes a roster driver has at most one vehicle — check yours does not either.

**The six-tone status vocabulary is closed.** `HubStatusBadge` and
`hubStatusTone()` in `src/components/driver-hub/hub-status.ts` define six tones
and no screen may add a seventh. Nothing in this task needs a new badge, and
nothing in it may introduce one.
