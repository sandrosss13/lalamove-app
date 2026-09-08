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
 * The consequence to expect in production: every order predating the cargo
 * columns has null weight and dimensions and is therefore correctly hidden from
 * every driver's board. That is intended, and it is self-correcting as legacy
 * orders age out. The board's footer counts these among the loads hidden by
 * capacity.
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
