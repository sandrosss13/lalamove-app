/**
 * Which vehicle classes anybody on the platform can actually serve — the supply
 * question, asked at booking time so a client cannot buy a class no carrier
 * operates.
 *
 * **The failure this closes is the third instance of one pattern.** An order is
 * created, priced, shown to its client as live, and then invisible to every
 * carrier on the platform: nobody claims it, nothing errors, and it waits there
 * until a human notices. `src/lib/orders/booking-fit.ts` closed the first
 * instance (cargo declared larger than the class it was booked against) and
 * `src/lib/orders/class-substitution.ts` the second (a class matched by identity
 * when a bigger vehicle would have done). Both were about the *load*. This one is
 * about the *market*: four of the eleven seeded classes — `FLATBED_TRUCK`,
 * `CURTAINSIDER_TRUCK`, `LARGE_FREIGHT_TRUCK` and `TRAILER_TRUCK` — have no
 * activated carrier able to serve them even under upgrade substitution, so every
 * booking against one of them strands, however small and well-declared its cargo
 * is. A refusal at booking is information the client can act on at the moment
 * they can still act on it; a stranded order is not.
 *
 * **Serviceable means: at least one `Vehicle` on an activated account is
 * registered under the class, or has a resolved capability that
 * `meetsBookedClass` the class's own floor** (and, when the booking names one,
 * whose class `offersBodyType` it). That is deliberately
 * the *same* pair of predicates `GET /api/loads` filters the board with and the
 * three claim routes enforce at commit — read from the same module, not
 * reimplemented here. Serviceability is precisely the question "could this order
 * appear on anybody's board at all", so it must be answered by the code that
 * decides what appears on a board. A second, parallel comparison written here
 * would start correct and drift the first time either rule is retuned, which is
 * the whole reason `class-substitution.ts` exists as a shared module rather than
 * as four copies of an inequality.
 *
 * **This module MAY import Prisma and `server-only`, unlike its two
 * neighbours.** `vehicle-fit.ts`, `booking-fit.ts` and `class-substitution.ts`
 * are deliberately dependency-free so the booking form and the load board can run
 * the same predicates client-side; this one cannot be, because its whole input is
 * the live fleet. That is why it is a separate file rather than three more
 * functions in `booking-fit.ts`: adding a Prisma import there would drag the
 * generated client into every browser bundle that imports the fit helpers.
 *
 * **Cost, and why it is shaped this way.** Two indexed reads, run in parallel,
 * and then an in-memory pass of (classes × activated vehicles) plain numeric
 * comparisons. Explicitly NOT one query per class: an `exists`-per-class shape
 * would be eleven round trips today and one per catalogue row forever after, on
 * the booking path. The fleet scan is the figure that grows with the business —
 * the catalogue is a handful of rows and stays that way — so if this ever becomes
 * hot, the answer is to cache the resulting set and revalidate it when a vehicle
 * or an activation is written, not to split it back into per-caller queries. A
 * narrowing parameter ("just tell me about this one class") was considered and
 * rejected for the same reason: it would shrink the cheap half of the work and
 * leave the expensive half untouched.
 *
 * **Known limitation: serviceability is not scoped by city.** A class counts as
 * serviceable if a qualifying vehicle exists *anywhere* on the platform, so a
 * Tbilisi client can still book a class only a Batumi carrier operates. That is
 * deliberate for this version and not an oversight.
 * `LogisticsCompany.citiesOfOperation` exists and could narrow this to the pickup
 * city, but a `DriverProfile` has no equivalent field today, so a city-scoped rule
 * would either exclude every independent driver from supply or need a second,
 * guessed source of truth for where a driver works — and cross-city work is
 * legitimate freight, not an edge case, so a carrier declining to leave their
 * city is not something the platform currently knows. The refinement is a real
 * one; it wants a driver-side coverage field first.
 *
 * **A vehicle registered to a roster driver counts, and that is now simply
 * correct.** A `DriverProfile` with a `companyId` is an employed driver, and
 * this block used to record a known false positive: the board refused them
 * entirely, the company dispatch route assigns only vehicles whose `companyId`
 * is the company's, so a vehicle hanging off a roster driver's own profile was
 * invisible to both paths and a class held up only by one would be bookable and
 * then strand. That decision — the open business question
 * specs/driver-load-board/action-required.md recorded — was settled the other
 * way: `GET /api/loads` gives every driver a board, employed or not, and
 * `POST /api/orders/[id]/accept` lets them claim with any vehicle they own or
 * hold on an open fleet assignment (see `driverVehiclesWhere`). Such a vehicle
 * can therefore be offered work, so counting it as supply advertises a class
 * somebody can actually serve. The activation test below is unchanged: it is
 * still the load board's own rule (`company.activatedAt !== null` OR
 * `driverProfile.activatedAt !== null`) and nothing more.
 */

import "server-only";

import type { Prisma } from "@prisma/client";

import { specCapability } from "@/lib/orders/booking-fit";
import {
  meetsBookedClass,
  offersBodyType,
  type BookedClass,
  type SubstitutionCandidate,
} from "@/lib/orders/class-substitution";
import { capabilityOf } from "@/lib/orders/vehicle-fit";
import { prisma } from "@/lib/prisma";

/**
 * Whose vehicles count as supply: those on an account whose application has been
 * approved.
 *
 * **This mirrors `GET /api/loads`'s activation gate, and mirroring it exactly is
 * the point.** That route returns an empty board to any account with
 * `isActivated === false`, which is `activatedAt !== null` on `DriverProfile` for
 * a driver and on `LogisticsCompany` for a fleet. A vehicle belonging to an
 * account that has not been approved therefore cannot be offered a single load,
 * so counting it as supply here would license bookings that strand exactly as if
 * the vehicle did not exist — which, for every purpose this module has, it does
 * not.
 *
 * **Deliberately not narrowed further to *dispatchable* vehicles**, the stricter
 * per-vehicle rule `src/lib/vehicle-type-visibility.ts` applies (no
 * `applicationVehicle`, or one in `APPROVED`). The board does not apply it —
 * `GET /api/loads` takes every vehicle on the account — so applying it here would
 * make serviceability *stricter* than the surface it exists to agree with, and
 * refuse bookings for a class whose loads a carrier would in fact have been shown
 * and could in fact have claimed. The two gates answer different questions and
 * are meant to disagree; see the note on `HIDDEN_UNTIL_STOCKED` below.
 *
 * A vehicle with neither owner is unreachable — `Vehicle` is created with one or
 * the other by every onboarding path — and matches neither branch, so it counts
 * as no supply. That is the right way for the impossible case to fail.
 */
const ACTIVATED_CARRIER_VEHICLE_WHERE: Prisma.VehicleWhereInput = {
  OR: [
    { company: { activatedAt: { not: null } } },
    { driverProfile: { activatedAt: { not: null } } },
  ],
};

/**
 * Exactly what one supply vehicle is measured from: its own declared capacity,
 * its class's catalogue figures to fall back on per field, and the load spaces
 * its class offers.
 *
 * The same slice `VEHICLE_CAPABILITY_SELECT` in `src/app/api/loads/route.ts`
 * takes, for the same reasons its doc comment gives at length: `capabilityOf`
 * prefers the driver-declared column and falls back to the spec field by field,
 * so a truck that beats its class average is credited for it, and the body list
 * comes from the class rather than from the nullable `Vehicle.chassisType`.
 *
 * `vehicleTypeSpecId` is present for exactly one reason and is never compared
 * here by hand. Which class a vehicle is registered under does not decide which
 * *other* classes it can serve — that is the whole content of upgrade
 * substitution — but it does decide one thing outright: a vehicle can always
 * serve its own class. `meetsBookedClass` holds that clause, and it is not
 * cosmetic. Registration floors only `payloadKg` against the class spec, so a
 * registered vehicle can resolve below its own class's catalogue dimensions;
 * without the id, such a vehicle counts as no supply for the class it is
 * approved to operate in, and a class whose only registered vehicles
 * under-declare is reported unserviceable — refusing clients at booking for
 * freight carriers actively run. Two of the eight vehicles on the live fleet
 * were in exactly that position.
 */
const SUPPLY_VEHICLE_SELECT = {
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
      bodyTypes: true,
    },
  },
} as const;

/**
 * The catalogue columns a class's capacity floor is built from, plus the id the
 * answer is keyed by.
 *
 * Keyed by `id` rather than by `code` because `id` is what `Order
 * .vehicleTypeSpecId` carries: a caller holding an order — this module's likely
 * next consumer — has the id and not the code, and a set keyed the same way as
 * the foreign key cannot be joined against the wrong column by accident. The two
 * routes that consume it today both have the id in hand or can select it.
 */
const CLASS_FLOOR_SELECT = {
  id: true,
  maxPayloadKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
} as const;

/**
 * The class spec ids at least one activated carrier can serve — optionally
 * constrained to bookings asking for a particular load space.
 *
 * `bodyType` is the `Order.bodyType` a booking would carry: pass it to ask "which
 * classes can be served *for this body*", or omit it (or pass `null`) to ask the
 * unconstrained question. `null` imposes no constraint and admits every vehicle,
 * which is `offersBodyType`'s contract and the right reading of a client who
 * never used the body filter — see that function for why a null must not exclude
 * anything.
 *
 * **One fleet scan answers every class**, which is why this returns a whole set
 * rather than a per-class boolean. Both callers need it that way for different
 * reasons: `GET /api/vehicle-types` labels the entire catalogue in one response,
 * and `POST /api/orders` runs on the booking path where a per-class query would
 * be a round trip per booking with no upside. A caller wanting one class asks
 * `.has(id)`.
 *
 * **What the answer means, precisely: a load booked against this class could
 * appear on at least one carrier's board.** It does *not* promise that any
 * particular cargo fits (that is `oversizeAxes` at booking and `loadFits` on the
 * board), that the carrier is free, or that they will take the job. Supply is a
 * necessary condition, never a sufficient one.
 *
 * **An empty platform makes every class unserviceable, and that is correct.** A
 * fresh environment with no vehicles — or one where no account has been activated
 * yet — returns an empty set, so every booking is refused until the first carrier
 * is approved. It reads alarming and it is the honest answer: an order placed
 * into a market with no carriers is unfulfillable in exactly the same way as one
 * placed into a market with only the wrong trucks, and there is no version of
 * "accept it anyway" that does not recreate the stranded-order state in the one
 * environment where nobody is watching for it. Failing open below some fleet-size
 * threshold was considered and rejected on those grounds: it would make the guard
 * silently absent precisely when the platform is least able to serve anyone. The
 * operational consequence is worth stating plainly — a new deployment cannot take
 * bookings until one carrier is activated with one vehicle — and the remedy is to
 * activate one, which is a thing that has to happen for the deployment to work
 * anyway.
 *
 * **What activating one carrier buys, precisely.** Registering one vehicle makes
 * *the class it is registered under* bookable, immediately and with no deploy —
 * that is `meetsBookedClass`'s identity clause, and it holds even for
 * `FLATBED_TRUCK`, whose floor is infinite on height and which no set of declared
 * figures can clear (`capabilityOf` reads the open-bed sentinel from the class,
 * so a flatbed also clears its own floor on the numbers). It additionally makes
 * bookable every *smaller* class that vehicle out-measures on all four axes and
 * whose body it offers, which on a real catalogue is usually several. It does
 * **not** make the whole catalogue bookable: a class larger than the registered
 * vehicle stays unserviceable until somebody registers for it. "Register one
 * Trailer Truck and that class is bookable" is a statement about that class, not
 * about the platform.
 *
 * **Related but distinct: `HIDDEN_UNTIL_STOCKED`** in
 * `src/lib/vehicle-type-visibility.ts`. That is a hand-maintained list of codes
 * withheld from the public pickers until a *dispatchable vehicle of exactly that
 * class* exists; this is derived, substitution-aware, and applies to every class.
 * They overlap on `TRAILER_TRUCK` and neither subsumes the other: the curated
 * list can withhold a class the numbers say is serviceable (a business call), and
 * this function catches the ten classes nobody thought to list. Note that the
 * curated list only ever filtered a *listing* — `POST /api/orders` looks a class
 * up by code with no visibility filter at all, so a hand-written request could
 * always book a hidden class. This guard is what closes that.
 */
export async function serviceableSpecIds(
  bodyType: string | null = null,
): Promise<Set<string>> {
  // Issued together: neither depends on the other, so the pair costs one round
  // trip's latency rather than two on a path a client is waiting on.
  const [classes, vehicles] = await Promise.all([
    prisma.vehicleTypeSpec.findMany({ select: CLASS_FLOOR_SELECT }),
    prisma.vehicle.findMany({
      where: ACTIVATED_CARRIER_VEHICLE_WHERE,
      select: SUPPLY_VEHICLE_SELECT,
    }),
  ]);

  // The body test is a fact about the vehicle alone, so it is applied once here
  // rather than inside the per-class loop below — where it would be re-evaluated
  // for every class against every vehicle and could not change its answer.
  //
  // The class id travels with the capability because `meetsBookedClass` needs
  // both: a vehicle registered under a class serves that class whatever its
  // declared figures resolve to. See `SUPPLY_VEHICLE_SELECT`.
  const candidates: SubstitutionCandidate[] = vehicles
    .filter((vehicle) =>
      offersBodyType(vehicle.vehicleTypeSpec.bodyTypes, bodyType),
    )
    .map((vehicle) => ({
      vehicleTypeSpecId: vehicle.vehicleTypeSpecId,
      capability: capabilityOf(vehicle, vehicle.vehicleTypeSpec),
    }));

  const serviceable = new Set<string>();

  for (const vehicleClass of classes) {
    // Through `specCapability`, never from the four columns by hand: it routes
    // via `capabilityOf`, the one place `cargoHeightM === 0` becomes `Infinity`
    // for an open bed. A literal here would give `FLATBED_TRUCK` a floor of zero
    // height that every vehicle on the platform trivially clears — turning the
    // strictest floor in the catalogue into the loosest, and reporting as
    // serviceable the very class this module was written to refuse.
    const booked: BookedClass = {
      vehicleTypeSpecId: vehicleClass.id,
      floor: specCapability(vehicleClass),
    };

    if (candidates.some((candidate) => meetsBookedClass(candidate, booked))) {
      serviceable.add(vehicleClass.id);
    }
  }

  return serviceable;
}

/**
 * The refusal a client reads when they picked a class nobody operates.
 *
 * One sentence, sentence case, full stop — the shape every rejection in
 * `POST /api/orders` uses, because that handler answers with a single `error`
 * string and the booking form renders it as it arrives.
 *
 * It names the remedy rather than only the problem. "No carrier operates this"
 * alone leaves a client staring at a picker wondering whether to wait or to
 * complain; the actionable half is that another class will work, and on any real
 * catalogue several will. "Currently" is load-bearing too — this is a fact about
 * today's fleet that changes the moment a carrier is activated, not a statement
 * that the platform does not do this kind of freight.
 *
 * Deliberately does not name *which* class would work instead. Computing that
 * needs the client's cargo, their body type and the whole serviceable set, and
 * offering a specific alternative in an error string would quote a class without
 * quoting its price — the picker, which shows both, is where that choice belongs.
 *
 * The indefinite article is a plain "a", the same call `cargoFitMessage` makes
 * and for the same reason: only "MPV / Estate" reads "an" aloud, and getting that
 * one label right needs initialism awareness. See that function for the full
 * argument.
 */
export function unserviceableClassMessage(specLabel: string): string {
  return `No carrier on the platform currently operates a ${specLabel}, so please choose another vehicle type.`;
}
