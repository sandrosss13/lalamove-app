# Task 03: Vehicle-fit module

## Status

complete

## Wave

1

## Description

Creates `src/lib/orders/vehicle-fit.ts`, the pure predicate the load board's
central rule runs on: *"only loads that fit the signed-in driver's vehicle (max
weight + L×W×H) are ever shown."* Today the physical comparison this needs has
one side but not the other — `VehicleTypeSpec` and `Vehicle` already carry
payload and cargo-hold dimensions, but `Order` has no physical description of
the load at all (task-01 adds it). This module takes both sides — a load's
declared weight/dimensions and a vehicle's resolved capacity — and answers
whether the load fits, plus the fleet-level variant a logistics company's
"claim first, assign a truck afterwards" flow needs. It is consumed by
task-06's `GET /api/loads`, which must run this filter **server-side** so a
driver can neither see nor claim a load their vehicle cannot carry.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-06-loads-api

**Context from dependencies:** None required to implement this task. It needs
only the `VehicleTypeSpec` and `Vehicle` field names already present in
`prisma/schema.prisma` today (quoted below) and, conceptually, the load-side
fields task-01-schema-and-migration.md adds to `Order` (`cargoWeightKg`,
`cargoLengthM`, `cargoWidthM`, `cargoHeightM`, all nullable `Float`) — this
task does not read `Order` directly, it only defines the `LoadDimensions` type
those four columns will be mapped into by task-06.

## Files to Create

- `src/lib/orders/vehicle-fit.ts` — load-vs-vehicle fit predicate and
  fleet-capability aggregation

## Files to Modify

None.

## Technical Details

### Context you need: the two existing schema sources of vehicle capacity

`prisma/schema.prisma` already defines both sides of the vehicle-capacity
comparison this module consumes. Do not change either model — this task only
reads their shape.

**`VehicleTypeSpec`** (the class-level catalogue values — e.g. every "Box
Truck" has the same figures):

```prisma
/// A vehicle "make/model class" the platform supports — e.g. "Box Truck". Specs and
/// pricing are data (seeded), not hardcoded UI constants, so they can be tuned without
/// a code change. `code` is the stable identifier other tables and UI option lists key on.
model VehicleTypeSpec {
  id                String            @id @default(cuid())
  code              String            @unique
  label             String
  category          VehicleCategory
  maxPayloadKg      Float
  cargoLengthM      Float
  cargoWidthM       Float
  /// `0` means "open / no height limit" (an open flatbed has no cargo box), not a
  /// literal zero-height constraint.
  cargoHeightM      Float
  loadingAccessType LoadingAccessType
  ...
}
```

All four fields (`maxPayloadKg`, `cargoLengthM`, `cargoWidthM`,
`cargoHeightM`) are non-nullable `Float` — every vehicle type has a complete
set of class-level figures.

**`Vehicle`** (the individual, driver-declared vehicle — nullable overrides):

```prisma
/// A vehicle owned either by an independent driver or by a logistics company —
/// ...
/// Load capacity and cargo dimensions authoritative for pricing and order
/// matching come from `vehicleTypeSpec` — that remains the single source of
/// truth per vehicle class. `payloadKg`/`cargoLengthM`/`cargoWidthM`/
/// `cargoHeightM` below are separate, driver-declared overrides collected
/// during onboarding for compliance display only; nothing outside the
/// onboarding admin review reads them.
model Vehicle {
  id                String            @id @default(cuid())
  ...
  vehicleTypeSpecId String
  vehicleTypeSpec   VehicleTypeSpec   @relation(fields: [vehicleTypeSpecId], references: [id])
  ...
  // Driver-declared overrides collected during onboarding, distinct from
  // vehicleTypeSpec's class-level values. These are attestations for
  // compliance review, never read by pricing or order matching — both
  // continue to use only vehicleTypeSpec's payload/dimensions, the single
  // source of truth for what a *class* of vehicle can carry. A submit-time
  // server check requires payloadKg to be at or above the resolved spec's
  // maxPayloadKg, so a vehicle can never be registered under a class it
  // physically can't meet.
  payloadKg         Float?
  cargoLengthM      Float?
  cargoWidthM       Float?
  cargoHeightM      Float?
  ...
}
```

All four fields (`payloadKg`, `cargoLengthM`, `cargoWidthM`, `cargoHeightM`)
are **nullable** `Float` — a vehicle may have none, some, or all of them
declared. Note for the implementer: the schema's existing comment says these
overrides are "never read by pricing or order matching" and that
`vehicleTypeSpec` "remains the single source of truth." That was accurate
before this feature — this module is the **first** consumer of `Vehicle`'s
per-field overrides outside onboarding compliance review. It does not
contradict the schema comment about pricing (pricing still ignores these
fields entirely, per the Non-Goals in
`specs/driver-load-board/requirements.md`); it is a new, narrower use for
vehicle-fit matching specifically. Updating that schema comment is out of
scope for this task (the schema file belongs to task-01) but is worth flagging
in review.

**Why the fallback is per-field, not all-or-nothing:** a driver may have
declared their vehicle's actual payload (heavier or lighter than the class
average) but never entered its cargo height, or vice versa. Falling back
field-by-field to the `VehicleTypeSpec` catalogue value means a partially
declared vehicle still gets the benefit of whichever overrides it does have,
instead of a single missing field silently discarding all of them.

### The `cargoHeightM: 0` sentinel — an open bed, not a zero-height hold

`VehicleTypeSpec.cargoHeightM` is not a plain measurement. Its schema doc
comment reads:

```prisma
/// `0` means "open / no height limit" (an open flatbed has no cargo box), not a
/// literal zero-height constraint.
cargoHeightM      Float
```

and `prisma/seed.ts` seeds exactly that for the open-bed type, with its own
comment pointing back at the note:

```ts
{
  code: "FLATBED_TRUCK",
  ...
  cargoWidthM: 2.3,
  // Open bed, no cargo box — see the `cargoHeightM` note above.
  cargoHeightM: 0,
```

This is live seeded data, not a hypothetical. Compared literally, a load
declaring any height at all exceeds a limit of `0`, so **every** load would be
hidden from a flatbed operator and their board would be permanently empty —
precisely the "a load is hidden from a driver who could carry it" failure this
module exists to prevent, and the exact inverse of the tradeoff the unknown rule
below is making.

**`capabilityOf` translates a resolved `cargoHeightM` of `0` to `Infinity`.**
The translation belongs there rather than in `loadFits` because `capabilityOf`
is the boundary where catalogue data becomes a capability — interpreting the
catalogue's own sentinel is that function's job by definition, not a special
case bolted onto the predicate. Consequences worth stating:

- It runs **after** the per-field override/fallback resolution, so it applies to
  a `0` from either source. A driver-declared `Vehicle.cargoHeightM` of `0` is
  read identically to a catalogue `0`: a driver entering `0` for their open bed
  means what the catalogue means by it, and two sources disagreeing about the
  same number would be worse than either rule alone.
- `loadFits` stays a pure numeric comparison that has never heard of the
  sentinel. Every figure on a `VehicleCapability` already means what it says.
- `widestCapability` needs no special handling: `Math.max` propagates `Infinity`
  correctly, so a fleet containing one open bed is unbounded in height, which is
  true.

**Only height carries a sentinel.** `cargoLengthM`, `cargoWidthM` and
`maxPayloadKg` have no documented `0` meaning in either the schema or the seed's
own type declaration, and every seeded row gives them a real positive figure.
They are compared literally, and a `0` there is a genuine zero that fits
nothing — a data error worth surfacing rather than an open dimension. Do not
generalise the height rule to the other axes by guess.

### The fit direction and why unknown is treated as "does not fit"

Per `specs/driver-load-board/requirements.md`'s Assumptions: "The fit filter
treats a load with unknown weight or dimensions as **not fitting** and hides
it, rather than assuming it fits — the failure direction that costs a driver a
wasted trip is the one to avoid." Concretely: if a driver accepts a load
believed to fit and it does not, they have driven to a pickup, loaded (or
failed to load) cargo, and burned time and fuel for nothing — a costly,
irreversible failure. If a load that actually would have fit is hidden
because its dimensions are unknown, the driver has lost nothing but a
opportunity that will likely reappear, or that another driver takes instead —
a cheap, recoverable failure. `loadFits` therefore returns `false` the moment
any load-side figure is `null`, with no partial-credit path. This also means
every pre-existing `Order` (all of which have null cargo weight/dimensions,
since the columns did not exist before task-01) is correctly hidden from every
board until it ages out — see the Notes.

### Implementation Steps

1. Create `src/lib/orders/vehicle-fit.ts`. No Prisma import, no
   `"server-only"` import — this module is pure arithmetic and comparisons
   over plain numbers, so it can run in `GET /api/loads` (task-06, a server
   module) as well as any client-side pre-filtering the board's UI chooses to
   layer on top for responsiveness (the requirements note the server-side
   filter must exist regardless; a client-side repeat is optional and not
   this task's concern).
2. Define `LoadDimensions` — the shape of a load's physical description, with
   every field nullable (mirrors `Order.cargoWeightKg` /
   `cargoLengthM`/`cargoWidthM`/`cargoHeightM` from task-01, without
   importing the `Order` type itself, so this module stays decoupled from
   Prisma's generated types).
3. Define `VehicleCapability` — the same four axes, but non-null: a fully
   resolved capacity for one vehicle (or, from `widestCapability`, for a
   fleet).
4. Implement `capabilityOf(vehicle, spec)`, taking plain objects shaped like
   the relevant slices of `Vehicle` and `VehicleTypeSpec` (do not require the
   full Prisma types — accept the four override fields and the four spec
   fields, so callers can pass partial objects or test fixtures without
   constructing a complete Prisma row). Translate the `cargoHeightM: 0`
   open-bed sentinel to `Infinity` here, after the per-field resolution — see
   the section above.
5. Implement `loadFits(load, capability)` per the null-handling rule above.
6. Implement `widestCapability(capabilities)` — per-axis maximum, `null` for
   an empty array.
7. Implement `fitsAnyVehicle(load, capabilities)` — the strict, per-vehicle
   variant.
8. Do not implement any rotation/orientation logic — see Notes.

### Code Snippets

```ts
/**
 * Pure weight/dimension fit-checking between a load and a vehicle (or a
 * fleet of vehicles). No Prisma import, no `server-only` — this module is
 * plain arithmetic over plain objects, importable from server code
 * (task-06's `GET /api/loads`, which MUST run this filter server-side so a
 * driver can neither see nor claim a load their vehicle cannot carry) and
 * from client components alike.
 *
 * Two vehicle-capacity sources feed this module, both already in
 * `prisma/schema.prisma`:
 *  - `VehicleTypeSpec`: class-level catalogue figures (`maxPayloadKg`,
 *    `cargoLengthM`, `cargoWidthM`, `cargoHeightM`), all non-null — every
 *    vehicle type has a complete set.
 *  - `Vehicle`: driver-declared, per-vehicle overrides (`payloadKg`,
 *    `cargoLengthM`, `cargoWidthM`, `cargoHeightM`), all nullable — a
 *    specific truck may be heavier or lighter, bigger or smaller, than its
 *    class average, and a driver may have declared some, all, or none of
 *    these at onboarding.
 */

/**
 * A load's physical description, as declared by the client at booking.
 * Mirrors `Order.cargoWeightKg`/`cargoLengthM`/`cargoWidthM`/`cargoHeightM`
 * (added by task-01) without importing the generated `Order` type, so this
 * module has no dependency on Prisma.
 *
 * Every field is nullable. `null` means UNKNOWN — not zero, not "no
 * requirement" — because every order placed before this feature (and any
 * order a client somehow submits without cargo data) has no physical
 * description at all. See `loadFits` for how unknown is resolved.
 */
export type LoadDimensions = {
  weightKg: number | null;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
};

/**
 * A fully resolved vehicle capacity: the most a vehicle (or, from
 * `widestCapability`, a fleet) can carry on each of four axes. Unlike
 * `LoadDimensions`, every field here is a plain `number` — resolving away the
 * nullability of `Vehicle`'s per-field overrides is exactly what
 * `capabilityOf` does.
 */
export type VehicleCapability = {
  payloadKg: number;
  lengthM: number;
  widthM: number;
  heightM: number;
};

/**
 * Resolve one vehicle's effective capability: the driver-declared `Vehicle`
 * override where present, falling back to the `VehicleTypeSpec` catalogue
 * value otherwise — resolved independently PER FIELD, not all-or-nothing. A
 * vehicle that declared only its actual payload (heavier than its class's
 * average) still benefits from that one override even though it never
 * declared its cargo height; the height falls back to the spec on its own.
 *
 * This is also where the `cargoHeightM: 0` open-bed sentinel is translated to
 * `Infinity` — after the override/fallback resolution, so it applies to a `0`
 * from either source. Only height carries a sentinel; length, width and
 * payload are compared literally. See the "cargoHeightM: 0 sentinel" section
 * above for the full reasoning.
 *
 * Accepts plain slices of `Vehicle` and `VehicleTypeSpec` rather than the
 * full Prisma-generated types, so callers (and tests) can pass exactly the
 * fields this function reads.
 */
export function capabilityOf(
  vehicle: {
    payloadKg: number | null;
    cargoLengthM: number | null;
    cargoWidthM: number | null;
    cargoHeightM: number | null;
  },
  spec: {
    maxPayloadKg: number;
    cargoLengthM: number;
    cargoWidthM: number;
    cargoHeightM: number;
  },
): VehicleCapability {
  // Resolved first, sentinel-translated second, so an open bed is recognised
  // whether the `0` came from the catalogue or from the driver's override.
  const resolvedHeightM = vehicle.cargoHeightM ?? spec.cargoHeightM;

  return {
    payloadKg: vehicle.payloadKg ?? spec.maxPayloadKg,
    lengthM: vehicle.cargoLengthM ?? spec.cargoLengthM,
    widthM: vehicle.cargoWidthM ?? spec.cargoWidthM,
    heightM:
      resolvedHeightM === 0 ? Number.POSITIVE_INFINITY : resolvedHeightM,
  };
}

/**
 * Does `load` physically fit within `capability`? Weight must be at or under
 * the payload, and each of length/width/height must be at or under the
 * corresponding hold dimension.
 *
 * **Any `null` on the load side returns `false`.** Unknown is NOT treated as
 * fitting. A driver sent to a load that turns out not to fit has wasted a
 * trip — loaded time, fuel, and a failed pickup or delivery — which is a
 * costlier, less recoverable failure than a load that actually would have
 * fit being hidden because its dimensions were never declared (a hidden load
 * simply is not offered; nothing is lost that was ever promised). Given that
 * asymmetry, "unknown" resolves to "does not fit" rather than "fits." This
 * also means every order predating task-01's cargo columns — which all have
 * null weight and dimensions — is correctly excluded from every driver's
 * board until legacy orders age out.
 */
export function loadFits(
  load: LoadDimensions,
  capability: VehicleCapability,
): boolean {
  if (
    load.weightKg === null ||
    load.lengthM === null ||
    load.widthM === null ||
    load.heightM === null
  ) {
    return false;
  }

  return (
    load.weightKg <= capability.payloadKg &&
    load.lengthM <= capability.lengthM &&
    load.widthM <= capability.widthM &&
    load.heightM <= capability.heightM
  );
}

/**
 * The per-axis maximum across a fleet of vehicle capabilities — used for
 * logistics-company accounts, which (per
 * `specs/driver-load-board/requirements.md`'s "claim first, assign
 * afterwards" resolution) claim a load with the COMPANY's account and assign
 * a specific truck to it only afterwards. At claim time there is no single
 * vehicle to check against yet, so the fit filter runs against the widest
 * capability the fleet has on each axis.
 *
 * **This is deliberately optimistic and can admit a load no SINGLE vehicle in
 * the fleet can carry** — e.g. if the heaviest truck in a two-truck fleet is
 * not also the longest, `widestCapability` reports a payload only the heavy
 * truck has and a length only the long truck has, as though one vehicle had
 * both. This is accepted as a deliberate tradeoff, not an oversight: the
 * company assigns a specific vehicle to the claimed load afterwards and can
 * see the mismatch then, before dispatching it, and a false-admit here costs
 * the company a re-assignment rather than a driver a wasted trip. If this
 * proves too permissive in practice, the stricter alternative is
 * `fitsAnyVehicle` (below) — true only when at least one single vehicle in
 * the fleet fits the whole load unassisted.
 *
 * Returns `null` for an empty fleet (nothing to claim against).
 */
export function widestCapability(
  capabilities: VehicleCapability[],
): VehicleCapability | null {
  if (capabilities.length === 0) {
    return null;
  }

  return capabilities.reduce((widest, capability) => ({
    payloadKg: Math.max(widest.payloadKg, capability.payloadKg),
    lengthM: Math.max(widest.lengthM, capability.lengthM),
    widthM: Math.max(widest.widthM, capability.widthM),
    heightM: Math.max(widest.heightM, capability.heightM),
  }));
}

/**
 * The strict variant of fleet fit-checking: true only if at least ONE single
 * capability in `capabilities` fits the whole load by itself. Unlike
 * `widestCapability`, this never admits a load that no individual vehicle
 * could actually carry.
 *
 * Not used by the company claim flow (see `widestCapability`'s doc comment
 * for why the optimistic per-axis-max check was chosen there instead). This
 * is provided for callers that need the stricter guarantee — e.g. an
 * individual driver or sole proprietor with more than one vehicle who wants
 * to see only loads at least one of their trucks can take alone, or a future
 * tightening of the company flow if the optimistic check proves too
 * permissive in practice.
 */
export function fitsAnyVehicle(
  load: LoadDimensions,
  capabilities: VehicleCapability[],
): boolean {
  return capabilities.some((capability) => loadFits(load, capability));
}
```

## Acceptance Criteria

- [ ] `LoadDimensions` has exactly `weightKg`, `lengthM`, `widthM`, `heightM`,
      each typed `number | null`.
- [ ] `VehicleCapability` has exactly `payloadKg`, `lengthM`, `widthM`,
      `heightM`, each typed `number` (non-null).
- [ ] `capabilityOf` resolves each field independently: a vehicle with
      `payloadKg: 900` and `cargoLengthM: null` against a spec with
      `maxPayloadKg: 1000, cargoLengthM: 4.2, ...` returns `payloadKg: 900`
      (the override) and `lengthM: 4.2` (the spec fallback) in the same
      result.
- [ ] `capabilityOf` translates the open-bed sentinel: a spec with
      `cargoHeightM: 0` (the seeded `FLATBED_TRUCK`) and a vehicle declaring no
      height override resolves to `heightM: Infinity`, and a load declaring a
      real height — `loadFits({ weightKg: 2000, lengthM: 4, widthM: 2,
      heightM: 2.5 }, capabilityOf({ payloadKg: null, cargoLengthM: null,
      cargoWidthM: null, cargoHeightM: null }, { maxPayloadKg: 5000,
      cargoLengthM: 5, cargoWidthM: 2.3, cargoHeightM: 0 }))` — returns `true`
      rather than being hidden. A driver-declared `Vehicle.cargoHeightM: 0` is
      translated identically.
- [ ] `loadFits` — fitting load: `loadFits({ weightKg: 500, lengthM: 3,
      widthM: 1.8, heightM: 1.9 }, { payloadKg: 1000, lengthM: 4.2, widthM:
      2.1, heightM: 2.2 })` returns `true`.
- [ ] `loadFits` — overweight load: same capability, `weightKg: 1200` returns
      `false`.
- [ ] `loadFits` — over-length load: same capability, `lengthM: 5` returns
      `false`.
- [ ] `loadFits` — unknown weight: same capability, `weightKg: null` (all
      other fields valid and within capacity) returns `false`.
- [ ] `widestCapability([])` returns `null`.
- [ ] `widestCapability` takes the per-axis max: given `{ payloadKg: 1000,
      lengthM: 3, widthM: 2, heightM: 2 }` and `{ payloadKg: 800, lengthM: 6,
      widthM: 2, heightM: 2 }`, returns `{ payloadKg: 1000, lengthM: 6,
      widthM: 2, heightM: 2 }` — a combination neither individual vehicle has.
- [ ] `fitsAnyVehicle` with the same two capabilities and a load requiring
      `weightKg: 1000, lengthM: 6, ...` returns `false` (no single vehicle has
      both), even though `widestCapability` of the same two would make
      `loadFits` return `true` against the fleet-wide figure.
- [ ] `src/lib/orders/vehicle-fit.ts` imports neither `"server-only"` nor
      anything from `@prisma/client` or `@/lib/prisma` — verified by grep and
      by successful import from a client component.
- [ ] `pnpm check` passes.

## Notes

- **No dimension rotation/orientation logic.** `loadFits` compares
  `lengthM`/`widthM`/`heightM` axis-to-axis in the order they are given; it
  never tries a load rotated onto a different axis to see if it fits that way
  (e.g. a load too long for the hold's length but that would fit if turned
  sideways, when the hold's width is greater). This is an explicit non-goal
  for this task, not an oversight — the design handoff does not call for it,
  and real cargo (pallets, crates) is frequently not freely rotatable anyway.
  A plausible future refinement if it turns out to matter in practice.
- **`Vehicle`'s override fields were previously "never read by pricing or
  order matching."** This module is the first consumer of them outside
  onboarding compliance review. This does not change pricing (which continues
  to ignore these fields entirely) — it is a new, separate use specific to
  vehicle-fit matching for the load board.
- The existing schema comment on `Vehicle` (`prisma/schema.prisma`) may be
  worth updating to reflect this new consumer, but editing the schema file is
  task-01's responsibility, not this task's — this task only reads the shape
  already there.
</content>
