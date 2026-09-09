/**
 * Pure weight/dimension fit-checking between a load and a vehicle (or a fleet of
 * vehicles) — the predicate behind the load board's central rule: *"only loads
 * that fit the signed-in driver's vehicle (max weight + L×W×H) are ever shown."*
 *
 * **Deliberately dependency-free.** No `import "server-only"`, no Prisma import,
 * and no Prisma-generated types in any signature. It is plain arithmetic over
 * plain objects, so it is importable from server code — `GET /api/loads`, which
 * MUST run this filter server-side so a driver can neither see nor claim a load
 * their vehicle cannot carry — and from client components alike, and it is
 * testable without constructing a database row.
 *
 * Two vehicle-capacity sources feed this module, both already in
 * `prisma/schema.prisma`:
 *  - `VehicleTypeSpec`: class-level catalogue figures (`maxPayloadKg`,
 *    `cargoLengthM`, `cargoWidthM`, `cargoHeightM`), all non-null — every
 *    vehicle type has a complete set. `cargoHeightM` carries a sentinel: `0`
 *    means an open bed with no height limit, translated in `capabilityOf`.
 *  - `Vehicle`: driver-declared, per-vehicle overrides (`payloadKg`,
 *    `cargoLengthM`, `cargoWidthM`, `cargoHeightM`), all nullable — a specific
 *    truck may be heavier or lighter, bigger or smaller, than its class average,
 *    and a driver may have declared some, all, or none of these at onboarding.
 *
 * **Two shapes of answer, and picking the wrong one is a real bug.** `loadFits`
 * and `fitsAnyVehicle` return a boolean and fold "the envelope was never
 * declared" into `false`, which is the right answer for anything about to commit
 * a vehicle to a load. `classifyFit` and `classifyFitAnyVehicle` return the
 * three-way `LoadFitVerdict` and keep that case apart, which is what any surface
 * *explaining itself to a driver* needs: a load nobody measured is not a load
 * that is too big, and a UI that says otherwise states something false about the
 * driver's own vehicle. See `LoadFitVerdict` for the incident that produced it.
 *
 * **Non-goal: rotation.** No function here ever tries a load turned onto a
 * different axis to see whether it fits that way — a load too long for the hold
 * is not re-checked against the hold's width, even when the width would take it.
 * Axes are compared strictly like-for-like, in the order given. This is an
 * explicit decision rather than an omission: the design handoff does not ask for
 * it, and real cargo — palletised, crated, stacked — is frequently not freely
 * rotatable anyway, so a "fits if you turn it" answer would be one a driver
 * cannot always act on. A plausible refinement if it turns out to matter.
 */

/**
 * A load's physical description, as declared by the client at booking. Mirrors
 * `Order.cargoWeightKg`/`cargoLengthM`/`cargoWidthM`/`cargoHeightM` without
 * importing the generated `Order` type, so this module has no dependency on
 * Prisma and the board's UI can reuse it.
 *
 * Every field is nullable, and `null` means **UNKNOWN** — not zero, not "no
 * requirement". Every order placed before these columns existed has no physical
 * description at all, and nothing backfills one. See `loadFits` for how unknown
 * is resolved, and why it resolves the way it does.
 */
export type LoadDimensions = {
  weightKg: number | null;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
};

/**
 * A fully resolved vehicle capacity: the most a vehicle — or, from
 * `widestCapability`, a fleet — can carry on each of four axes. Unlike
 * `LoadDimensions` every field here is a plain `number`, because resolving away
 * the nullability of `Vehicle`'s per-field overrides is exactly what
 * `capabilityOf` does. A `VehicleCapability` is therefore always complete, and
 * `loadFits` never has to reason about an unknown on the vehicle side.
 */
export type VehicleCapability = {
  payloadKg: number;
  lengthM: number;
  widthM: number;
  heightM: number;
};

/**
 * Resolve one vehicle's effective capability: the driver-declared `Vehicle`
 * override where present, falling back to the `VehicleTypeSpec` catalogue value
 * otherwise — resolved independently **per field**, not all-or-nothing.
 *
 * The per-field fallback is the point. A driver may have declared their truck's
 * actual payload (heavier or lighter than its class average) but never entered
 * its cargo height, or the reverse. Falling back field by field means a
 * partially declared vehicle keeps the benefit of whichever overrides it does
 * have, instead of one missing field silently discarding all of them.
 *
 * **This function is also where the height sentinel is translated.** A resolved
 * `cargoHeightM` of `0` does not mean a hold zero metres tall — `VehicleTypeSpec`
 * documents it as *"open / no height limit (an open flatbed has no cargo box),
 * not a literal zero-height constraint"*, and `prisma/seed.ts` seeds exactly
 * that for `FLATBED_TRUCK`. So it is live data, not a hypothetical: read
 * literally, a flatbed operator's board would be permanently empty, because
 * every load declaring any height at all would exceed a limit of zero — the very
 * "hidden from a driver who could carry it" failure this module exists to
 * prevent. It becomes `Infinity` here instead.
 *
 * This boundary is the right place for it. `capabilityOf` is where catalogue
 * data becomes a capability, so interpreting the catalogue's own sentinel is
 * this function's job by definition rather than a special case bolted onto the
 * predicate — which is why `loadFits` stays a pure numeric comparison that has
 * never heard of the sentinel, and why `widestCapability` needs no special
 * handling either (`Math.max` propagates `Infinity` correctly: a fleet with one
 * open bed is unbounded in height, which is true).
 *
 * The translation happens *after* the override/fallback resolution, so it
 * applies to a `0` from either source, and a driver-declared
 * `Vehicle.cargoHeightM` of `0` is read identically to a catalogue `0`. That
 * consistency is deliberate: a driver entering `0` for their open bed means the
 * same thing the catalogue means by it, and having the two sources disagree
 * about the same number would be more confusing than either rule alone.
 *
 * **Only height carries a sentinel.** `cargoLengthM`, `cargoWidthM` and
 * `maxPayloadKg` have no documented `0` meaning in the schema or the seed, and
 * every seeded row gives them a real positive figure — so they are compared
 * literally, and a `0` there is a genuine zero that fits nothing. Do not
 * generalise the height rule to the other axes by guess: a zero-length hold is a
 * data error worth surfacing, not an open one.
 *
 * Note for future readers: `Vehicle`'s override fields carry a schema comment
 * saying they are read only by onboarding compliance review and "never by
 * pricing or order matching". This module is the first consumer of them outside
 * that review. It does not contradict the pricing half of that statement —
 * pricing still ignores these fields entirely (`src/lib/pricing.ts` reads only
 * `VehicleTypeSpec` and `PricingRule`) — it is a new, narrower use specific to
 * vehicle-fit matching for the load board.
 *
 * Accepts plain slices of `Vehicle` and `VehicleTypeSpec` rather than the full
 * Prisma-generated types, so callers and tests can pass exactly the fields this
 * function reads and nothing more.
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
  // whether the `0` came from the catalogue or from the driver's own override.
  const resolvedHeightM = vehicle.cargoHeightM ?? spec.cargoHeightM;

  return {
    payloadKg: vehicle.payloadKg ?? spec.maxPayloadKg,
    lengthM: vehicle.cargoLengthM ?? spec.cargoLengthM,
    widthM: vehicle.cargoWidthM ?? spec.cargoWidthM,
    heightM: resolvedHeightM === 0 ? Number.POSITIVE_INFINITY : resolvedHeightM,
  };
}

/**
 * Does `load` physically fit within `capability`? Weight must be at or under the
 * payload, and each of length/width/height at or under the corresponding hold
 * dimension. Bounds are inclusive: a load exactly at the limit fits.
 *
 * **Any `null` on the load side returns `false`. Unknown is NOT treated as
 * fitting.** This is the single most consequential decision in this module, and
 * it is a deliberate asymmetry rather than caution for its own sake. A driver
 * sent to a load that turns out not to fit has driven to the pickup, spent the
 * fuel, and failed the job on arrival — time and money that cannot be recovered,
 * plus a client whose freight is still sitting on the dock. A load that actually
 * would have fit being hidden because its dimensions were never declared costs
 * nobody anything that was ever promised: it is simply not offered, it reappears
 * on the next board, or another driver takes it. Given that asymmetry, "unknown"
 * resolves to "does not fit". There is no partial-credit path — a load missing
 * only its height is not checked on the three axes it does declare — because a
 * load that clears three limits and is unknown on the fourth is exactly the case
 * that strands a driver at a pickup.
 *
 * **What that `false` does NOT authorise is an explanation.** It says "do not
 * commit this vehicle to this load", and every claim path acts on it in exactly
 * that way. It does not say the load is too big, and callers that go on to tell
 * a driver *why* a load is missing must ask `classifyFit` instead — the board
 * once did not, and told drivers that every order predating the cargo columns
 * was over their vehicle's capacity. See `LoadFitVerdict`.
 *
 * A consequence worth knowing: with `hasDeclaredEnvelope` now guarding every
 * caller, the all-null case below is reached only by a *partially* declared load
 * (some figures, some nulls). For a wholly undeclared one it is a floor rather
 * than a live decision — deliberately kept, because a floor that never fires is
 * what makes a future caller that forgets the guard fail safe.
 *
 * Deliberately a pure numeric comparison, with no knowledge of any sentinel
 * value. `VehicleTypeSpec` documents `cargoHeightM: 0` as "open / no height
 * limit" rather than a zero-height hold, but that is translated to `Infinity`
 * upstream in `capabilityOf`, at the boundary where catalogue data becomes a
 * capability. By the time a `VehicleCapability` reaches this function every
 * figure on it already means exactly what it says, so nothing here needs a
 * branch — and a future sentinel is one edit in one place rather than a hunt
 * through every comparison.
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
 * Is any part of this load's physical envelope declared at all?
 *
 * True when at least one of the four columns carries a figure; false only when
 * every one of them is null. Deliberately the *weakest* possible reading of
 * "declared" — one figure out of four is enough — because a partially described
 * load and an undescribed one are different problems and must not be conflated.
 * `classifyFit` resolves each differently, and this predicate is where the line
 * between them is drawn.
 *
 * **This is exported because three call sites had each written it out inline and
 * a fourth never asked the question at all.** `POST /api/orders/[id]/accept`,
 * the company claim route and the company dispatch route each carried their own
 * copy of these four comparisons, and all three skip the fit check when nothing
 * was declared and let the claim through. `GET /api/loads` asked `loadFits` on
 * its own, got `false`, and both hid the load and counted it into the board
 * footer's "N loads hidden — over your vehicle capacity or dimensions". The two
 * kinds of path therefore gave
 * opposite answers about the same order: absent from the board, yet claimable by
 * POSTing its id — verified live against an order with all four columns null.
 * One exported predicate, read by all four, is what stops that recurring.
 */
export function hasDeclaredEnvelope(load: LoadDimensions): boolean {
  return (
    load.weightKg !== null ||
    load.lengthM !== null ||
    load.widthM !== null ||
    load.heightM !== null
  );
}

/**
 * Why a load is or is not carryable — the three-way answer `loadFits`'s boolean
 * cannot give.
 *
 *  - `FITS` — measured against a real capability and within it on all four axes.
 *  - `DOES_NOT_FIT` — measured and outside: over the payload, or over one of the
 *    three dimensions.
 *  - `UNDECLARED` — there was nothing to measure. **Not a refusal.** No claim
 *    path in the codebase refuses a load on this ground, so no listing may hide
 *    one on it either.
 *
 * **The distinction is not cosmetic; collapsing it is the bug this type was
 * added to fix.** `GET /api/loads` mapped every non-fit to `OVER_CAPACITY`,
 * which both dropped the load from the board and incremented
 * `hiddenByCapacityCount` — the figure the driver reads as "N loads hidden —
 * over your vehicle capacity or dimensions". An order whose envelope was never
 * declared was therefore hidden *and* explained with a claim about the driver's
 * vehicle that was simply untrue, while `POST /api/orders/[id]/accept` happily
 * assigned that same order to that same driver on request. The claim path is the
 * authority: a load a driver can successfully claim must not be hidden from
 * them, and a count that says "capacity" must contain only loads excluded by
 * capacity.
 *
 * That was not a theoretical case at the time of writing.
 * `prisma/migrations/20260908120000_driver_load_board/migration.sql` adds the
 * four cargo columns as plain nullable and backfills `driverPayout` and
 * `reference` but not the envelope, so **every order already open at cutover has
 * all four null** — the entire live PENDING book, hidden on day one behind a
 * false explanation. New orders are unaffected: `POST /api/orders` requires all
 * four.
 *
 * **A partially declared load counts as `DOES_NOT_FIT`, deliberately.** It is
 * not literally over capacity; it is unmeasurable, and `loadFits` refuses it
 * all-or-nothing because a load that clears three limits and is unknown on the
 * fourth is exactly the one that strands a driver at a pickup. Grouping it with
 * the refusals is what keeps the board and all three claim routes agreeing about
 * it — they refuse it too, so listing it would recreate the divergence in the
 * other direction, which is the worse one (a wasted trip rather than an
 * unoffered load). No write path can currently produce such a row anyway: the
 * booking API requires all four figures and the migration backfills none, so a
 * real envelope is all-present or all-null. Should partial capture ever ship,
 * this is the decision to revisit first, and a fourth verdict is the shape to
 * revisit it with — not a quiet reclassification of this one.
 */
export type LoadFitVerdict = "FITS" | "DOES_NOT_FIT" | "UNDECLARED";

/**
 * `loadFits` for callers that have to explain themselves: the same arithmetic,
 * with "nothing was declared" separated out instead of folded into `false`.
 *
 * The envelope test is answered **before any vehicle is consulted**, because it
 * is a fact about the load and no capability can change it. One consequence to
 * hold onto: this returns `UNDECLARED`, never `DOES_NOT_FIT`, however small the
 * capability passed in — so a caller reading `UNDECLARED` as "offer it" must
 * have already established that there is a vehicle to offer it *with*.
 * `GET /api/loads` does: it answers `NO_ELIGIBLE_VEHICLE` and returns before
 * this function is ever reached whenever no vehicle of this account is
 * permitted to take the load — see `src/lib/orders/class-substitution.ts`.
 */
export function classifyFit(
  load: LoadDimensions,
  capability: VehicleCapability,
): LoadFitVerdict {
  if (!hasDeclaredEnvelope(load)) {
    return "UNDECLARED";
  }

  return loadFits(load, capability) ? "FITS" : "DOES_NOT_FIT";
}

/**
 * The per-axis maximum across a fleet of vehicle capabilities — used for
 * logistics-company accounts, which claim a load with the COMPANY's account and
 * assign a specific truck to it only afterwards ("claim first, assign
 * afterwards"). At claim time there is no single vehicle to check against yet,
 * so the fit filter runs against the widest capability the fleet has on each
 * axis.
 *
 * **This is deliberately optimistic and can admit a load no SINGLE vehicle in
 * the fleet can carry.** If the heaviest truck in a two-truck fleet is not also
 * the longest, the result reports a payload only the heavy truck has alongside a
 * length only the long truck has, describing a composite vehicle that does not
 * exist. That is an accepted tradeoff, not an oversight: the company assigns a
 * real vehicle to the claimed load afterwards and sees the mismatch then, before
 * anything is dispatched, so a false admit here costs a re-assignment at a desk
 * rather than a driver a wasted trip — the failure direction `loadFits` is built
 * to avoid stays avoided. `fitsAnyVehicle` below is the strict alternative if
 * this proves too permissive in practice.
 *
 * Returns `null` for an empty fleet: a company with no vehicles has no capacity
 * to claim against, which is distinct from having zero capacity, and callers
 * must decide what an empty board means rather than be handed a capability of
 * all zeroes that silently rejects everything.
 */
export function widestCapability(
  capabilities: VehicleCapability[],
): VehicleCapability | null {
  if (capabilities.length === 0) {
    return null;
  }

  // No seed value: `reduce` over a non-empty array starts from its first
  // element, so the result is always a real capability widened by the rest, and
  // a fleet of one returns that one vehicle's figures unchanged.
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
 * `widestCapability`, this never admits a load that no individual vehicle could
 * actually carry.
 *
 * Not used by the company claim flow — see `widestCapability` for why the
 * optimistic per-axis-max check was chosen there instead. This is provided for
 * callers needing the stricter guarantee: an individual driver or sole
 * proprietor with more than one vehicle who wants to see only loads at least one
 * of their trucks can take alone, or a future tightening of the company flow.
 *
 * An empty fleet returns `false`, which is the correct strict answer (no vehicle
 * fits the load because there is no vehicle) and is why this function has no
 * `null` case where `widestCapability` needs one.
 */
export function fitsAnyVehicle(
  load: LoadDimensions,
  capabilities: VehicleCapability[],
): boolean {
  return capabilities.some((capability) => loadFits(load, capability));
}

/**
 * `fitsAnyVehicle` for callers that have to explain themselves — the fleet
 * counterpart of `classifyFit`, standing to `fitsAnyVehicle` exactly as that
 * function stands to `loadFits`.
 *
 * Used by `GET /api/loads` for an individual driver, who claims with one named
 * vehicle and so needs the strict "at least one of these trucks takes the whole
 * load" reading rather than the per-axis composite `widestCapability` builds.
 *
 * The empty-fleet caveat from `classifyFit` applies with more force here,
 * because an empty list is a shape this function can actually be handed: the
 * envelope is tested first, so an undeclared load returns `UNDECLARED` even
 * against no vehicles at all, where `fitsAnyVehicle` would return `false`. That
 * is the honest answer to the question this function asks — the load was never
 * measured, and a fleet of zero does not make it measurable — but it is not the
 * answer to "may this account claim it", so establish that a vehicle exists
 * first. The board's class lookup does, before it calls this.
 */
export function classifyFitAnyVehicle(
  load: LoadDimensions,
  capabilities: VehicleCapability[],
): LoadFitVerdict {
  if (!hasDeclaredEnvelope(load)) {
    return "UNDECLARED";
  }

  return fitsAnyVehicle(load, capabilities) ? "FITS" : "DOES_NOT_FIT";
}
