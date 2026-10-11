/**
 * "May this account take that load?" — the load board's eligibility rule, as
 * pure functions over plain data.
 *
 * These definitions lived inside `src/app/api/loads/route.ts` until the load
 * offer matcher (`src/lib/offers/dispatch.ts`) needed to ask the same question
 * about a driver who is not the one making the request. They were moved, not
 * copied: the board and the matcher read this one module, so an offer can never
 * be made for a load the board would not list for that driver, and neither can
 * disagree with the claim route, which reads the same two predicates from
 * `class-substitution` and `vehicle-fit`.
 *
 * Deliberately free of runtime dependencies on Prisma, Next or `server-only`,
 * like the two modules it builds on, so the rules are testable without a
 * server.
 */

import {
  meetsBookedClass,
  offersBodyType,
  type BookedClass,
} from "@/lib/orders/class-substitution";
import {
  capabilityOf,
  classifyFit,
  classifyFitAnyVehicle,
  type LoadDimensions,
  type VehicleCapability,
} from "@/lib/orders/vehicle-fit";

/**
 * Exactly what one capability is built from: the vehicle's own declared
 * capacity, plus its class spec to fall back on — and the class's `bodyTypes`,
 * which is the *commercial* half of eligibility and is read for a different
 * purpose from the four capacity columns.
 *
 * **`vehicleTypeSpecId` is selected, and it is no longer a grouping key.** It
 * once was: a load was offered only to a vehicle registered under exactly the
 * class the client booked, and the eligibility filter bucketed the fleet by that
 * id before measuring anything. Under upgrade-based substitution the id is one
 * *input* to the rule rather than the rule itself — `meetsBookedClass` admits a
 * vehicle registered under the booked class unconditionally, because a vehicle's
 * resolved capability can measure below its own class's catalogue figures and
 * refusing it would put this route at odds with the onboarding that approved it.
 * It is handed to that function and compared nowhere else in this file; the
 * equality test `src/lib/orders/class-substitution.ts` exists to have removed
 * was the *only* test, not this clause of it.
 *
 * **Both halves are selected deliberately, and the vehicle's own columns are
 * the more important half.** `capabilityOf` prefers the driver-declared
 * `payloadKg`/`cargoLengthM`/`cargoWidthM`/`cargoHeightM` and falls back to the
 * spec per field where one is null, and that is the behaviour the fit filter
 * wants: the filter is about the truck that actually turns up at the pickup,
 * not about the average of its class. A driver whose registered truck declares
 * a bigger hold than its class figures would otherwise be denied loads their
 * vehicle can demonstrably carry — the exact hidden-load failure this filter
 * exists to prevent, and one that is invisible in testing because `prisma/
 * seed.ts` seeds the `VehicleTypeSpec` catalogue only and creates no `Vehicle`
 * rows at all. Only vehicles registered through onboarding carry overrides.
 *
 * `model Vehicle`'s schema comment is the authority here and says so directly:
 * these columns "began as attestations for compliance review only", which is
 * "still true of *pricing* ... and of dispatch matching, which keys on
 * `vehicleTypeSpecId`", but is "no longer true in general" — `capabilityOf`
 * reads them for the load board, "preferring the declared value and falling
 * back to the spec when it is null". What makes them trustworthy enough to
 * filter on is the submit-time server check recorded in the same comment: a
 * vehicle's `payloadKg` must be at or above its resolved spec's
 * `maxPayloadKg`, so one can never be registered under a class it physically
 * cannot meet.
 *
 * Routing everything through `capabilityOf` rather than assembling a
 * capability by hand is also what keeps the `cargoHeightM: 0` sentinel ("open
 * bed / no height limit", seeded for `FLATBED_TRUCK`) translated to `Infinity`
 * in exactly one place. Read literally, a flatbed operator's board would
 * otherwise be permanently empty.
 */
export const VEHICLE_CAPABILITY_SELECT = {
  // The class this vehicle is registered under, read only by the substitution
  // rule's identity clause — see the note above.
  vehicleTypeSpecId: true,
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
      // The load spaces this vehicle's class offers, matched against
      // `Order.bodyType`. Read from the class rather than from
      // `Vehicle.chassisType`, which is null for every vehicle onboarded before
      // that column existed — see `offersBodyType`.
      bodyTypes: true,
    },
  },
} as const;

/**
 * Why one open load is, or is not, offered to this account.
 *
 * Three outcomes rather than a boolean, because the two ways of failing are not
 * the same fact and the response reports them differently: `OVER_CAPACITY`
 * feeds `hiddenByCapacityCount` and the footer note that explains it, while
 * `NO_ELIGIBLE_VEHICLE` is silent. See `eligibilityOf` in the GET handler for
 * the reasoning behind both the two-part test and that asymmetry.
 *
 * `NO_ELIGIBLE_VEHICLE` is the successor to an outcome called `WRONG_CLASS`,
 * renamed with the rule it described. Nothing about this load is *wrong* for a
 * class any more: the account simply owns no vehicle that both offers the body
 * the client asked for and meets the booked class's capacity floor. The name is
 * about the fleet, because that is what the test is now about.
 *
 * There is deliberately no fourth outcome for "envelope undeclared". That is a
 * distinction `classifyFit` draws and this type does not need, because the
 * board's answer for such a load is `ELIGIBLE` — the same offer, on the same
 * terms, as any other listed load, exactly as the claim routes already treat
 * it. Adding an outcome here would imply the response says something about
 * these loads, and it says nothing: they are simply on the board.
 */
export type LoadEligibility =
  "ELIGIBLE" | "NO_ELIGIBLE_VEHICLE" | "OVER_CAPACITY";

/**
 * Exactly the vehicle columns a capability is resolved from, plus the bodies its
 * class offers. Written out rather than derived from Prisma's generated payload
 * type so this helper states its own contract, matching the plain-slice
 * convention `capabilityOf` itself follows.
 */
export type CapabilitySource = {
  vehicleTypeSpecId: string;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  vehicleTypeSpec: {
    maxPayloadKg: number;
    cargoLengthM: number;
    cargoWidthM: number;
    cargoHeightM: number;
    bodyTypes: readonly string[];
  };
};

/**
 * One of this account's vehicles, reduced to the three facts eligibility asks
 * about: which class it is registered under, what it can carry, and which load
 * spaces that class offers.
 *
 * They travel together on one object because they are only meaningful together —
 * they are the halves of "may *this* vehicle take that load", and the bug the
 * old code structure invited was answering them from two different vehicles.
 * Keeping them on the same record makes that mistake unrepresentable rather than
 * merely avoided: there is no list of capabilities to filter independently of a
 * list of body types.
 *
 * The first two fields are named exactly as `SubstitutionCandidate` names them,
 * so this record *is* one and goes to `meetsBookedClass` whole rather than being
 * unpacked and reassembled at the call site.
 */
export type FleetVehicle = {
  vehicleTypeSpecId: string;
  capability: VehicleCapability;
  bodyTypes: readonly string[];
};

/**
 * Resolve every vehicle to the pair eligibility measures.
 *
 * **This replaced a `Map` keyed by `vehicleTypeSpecId`.** Under exact-class
 * matching the fleet had to be bucketed by class before anything was measured,
 * because the class test was a lookup and only the vehicles it returned could be
 * measured against the cargo. Upgrade-based substitution has no lookup: which
 * vehicles qualify depends on the *order* (its booked class's four figures and
 * its body type), not on any key the fleet can be filed under in advance, so the
 * fleet is a flat list and the per-order filtering happens in `candidatesFor`.
 *
 * The safety property that made the map worth having is preserved by
 * `FleetVehicle`, not by the flat shape: both tests still apply to one vehicle
 * at a time, so an account whose big truck is the wrong body and whose
 * right-body van is too small still qualifies for nothing.
 *
 * Each capability comes from `capabilityOf(vehicle, vehicle.vehicleTypeSpec)` —
 * the real vehicle with its declared overrides, spec as the per-field fallback.
 * See `VEHICLE_CAPABILITY_SELECT` for why that pairing is not optional. The body
 * list comes from the class alone: it describes what the class *is*, and a
 * driver declares no override for it.
 */
export function resolveFleet(
  vehicles: readonly CapabilitySource[],
): FleetVehicle[] {
  return vehicles.map((vehicle) => ({
    vehicleTypeSpecId: vehicle.vehicleTypeSpecId,
    capability: capabilityOf(vehicle, vehicle.vehicleTypeSpec),
    bodyTypes: vehicle.vehicleTypeSpec.bodyTypes,
  }));
}

/**
 * Which of an account's vehicles are *permitted* to take one booking: those
 * whose class offers the body the client asked for and whose capability meets
 * or beats the booked class on every axis. Nothing here measures the cargo —
 * that is the next step, and it runs only over what this returns.
 *
 * `booked` is `undefined` when the booked class's figures could not be found.
 * That is unreachable (`Order.vehicleTypeSpecId` is a foreign key) and fails
 * closed: with no floor to enforce, admitting every vehicle would be the one
 * failure direction this rule refuses.
 *
 * Generic over the record so a caller that carries more than the three
 * eligibility facts — the offer matcher keeps each vehicle's id — gets its own
 * records back.
 */
export function permittedVehicles<T extends FleetVehicle>(
  fleet: readonly T[],
  booked: BookedClass | undefined,
  bodyType: string | null,
): T[] {
  if (booked === undefined) {
    return [];
  }

  return fleet.filter(
    (vehicle) =>
      offersBodyType(vehicle.bodyTypes, bodyType) &&
      meetsBookedClass(vehicle, booked),
  );
}

/**
 * Whether one open load is claimable by an individual driver holding the
 * `permitted` vehicles, and if not, why not.
 *
 * Strict: a driver claims with one named vehicle (`POST
 * /api/orders/[id]/accept` takes a `vehicleId`), so the load must fit one of
 * these outright — never a per-axis composite, which is the company board's
 * rule and stays in the route. `UNDECLARED` maps to `ELIGIBLE`: a load whose
 * envelope was never declared has not been shown to exceed anything, and every
 * claim route lets it through.
 */
export function driverLoadEligibility(
  load: LoadDimensions,
  permitted: readonly FleetVehicle[],
): LoadEligibility {
  if (permitted.length === 0) {
    return "NO_ELIGIBLE_VEHICLE";
  }

  return classifyFitAnyVehicle(
    load,
    permitted.map((vehicle) => vehicle.capability),
  ) === "DOES_NOT_FIT"
    ? "OVER_CAPACITY"
    : "ELIGIBLE";
}

/**
 * The first permitted vehicle the load fits — the one an offer names in its
 * fit confirmation — or null when `driverLoadEligibility` would not say
 * `ELIGIBLE`. The two agree by construction: both ask `classifyFit` and treat
 * an undeclared envelope as fitting.
 */
export function firstFittingVehicle<T extends FleetVehicle>(
  load: LoadDimensions,
  permitted: readonly T[],
): T | null {
  return (
    permitted.find(
      (vehicle) => classifyFit(load, vehicle.capability) !== "DOES_NOT_FIT",
    ) ?? null
  );
}
