/**
 * Which vehicle classes may fulfil a load booked against another class — the
 * rule that replaced exact-class identity matching.
 *
 * **The rule: a vehicle may fulfil a load when it is registered under the booked
 * class, or meets or beats that class on all four capacity axes — and, either
 * way, offers the body type the order asked for.** The booked class is a
 * *floor*, never a ceiling; identity is one way of clearing that floor and not a
 * requirement to be at it. Upgrades are always allowed; downgrades never are.
 *
 * The identity clause is not redundant with the comparison, for a reason worth
 * having in mind before reading either: the floor is a *catalogue* figure and a
 * vehicle's capability is a *resolved* one, so a vehicle can measure below the
 * very class it is registered as. `meetsBookedClass` documents that at length.
 *
 * **Why identity matching was wrong.** `Order.vehicleTypeSpecId` was read as a
 * contract that a vehicle of exactly that class turns up, and every claim path
 * enforced equality. But step 5 of the booking form is titled *"Recommended
 * vehicle"* (src/components/home/booking-form.tsx): the class is a
 * recommendation and the basis the quote was computed on, not a promise about a
 * specific model. Enforcing it as an identity produced a live incident. A client
 * booked an MPV (400 kg, 1.8 x 1.3 x 1.1, DRY_BOX) to move 30 kg of cargo.
 * Diplomat Georgia owns a Minivan (500 kg, 2.0 x 1.4 x 1.3, DRY_BOX) which beats
 * the MPV on every axis and would have carried that load with room to spare —
 * and the order was invisible to them, purely because two catalogue ids differ.
 * No MPV is registered anywhere on the platform, so the order was unclaimable by
 * anyone: an order the platform had accepted, priced and shown to its client as
 * live, that no carrier on earth could take. The same failure mode
 * `src/lib/orders/booking-fit.ts` documents from the other direction.
 *
 * **Rejected alternative: "anything that physically fits the cargo".** The
 * simplest fix is to drop the class from matching entirely and offer a load to
 * any vehicle whose hold takes the declared envelope. It was considered and
 * rejected, and the reason is the whole reason this module has a floor at all: a
 * client who chose, was quoted for, and paid for a Box Truck would receive a
 * Minivan for a load that happens to be small. The class the client picked sets
 * what they paid; the cargo envelope does not. Matching on the envelope alone
 * silently converts every over-specified booking — and clients over-specify
 * constantly, out of caution — into a cheaper vehicle than the one they bought.
 * Rating the floor off the *booked class* rather than off the *cargo* is what
 * keeps the substitution one the client cannot lose by.
 *
 * **Rejected alternative: a hand-maintained upgrade graph.** An explicit table
 * of "MPV may be served by Minivan, Cargo Van, ..." would give product a knob to
 * turn, but it is a second source of truth about capacity that starts correct
 * and drifts the first time a catalogue figure is retuned or an twelfth class is
 * seeded. Deriving the relation from the same four columns the catalogue already
 * carries means a reseeded figure changes the substitution set the moment it
 * lands, with no code change and nothing to forget. If product later wants
 * substitutions the numbers do not justify — a same-price sideways swap, say —
 * that is a curated *addition* on top of this floor, not a replacement for it.
 *
 * **Rejected alternative: downgrades with a price adjustment.** Letting a
 * smaller vehicle take an over-specified load and refunding the difference is a
 * real product, but it is a pricing and consent change (the client has to agree,
 * and a refund path has to exist), not a matching change. Out of scope here, and
 * deliberately not approximated: silently downgrading without the refund is the
 * failure this module's floor exists to make impossible.
 *
 * **Deliberately dependency-free**, exactly as `src/lib/orders/vehicle-fit.ts`
 * is and for the same reason: no `import "server-only"`, no Prisma import, and
 * no Prisma-generated type in any signature. Body types cross the boundary as
 * `readonly string[]` and `string | null` rather than as `ChassisType`, so the
 * board's client-side repeat of this filter can import the module without
 * dragging the generated client into a browser bundle — and so the functions
 * stay testable from a plain object.
 *
 * **This module answers eligibility, not fit.** It says which vehicles are
 * *allowed* to take a load; whether the cargo physically goes in one is
 * `vehicle-fit.ts`'s question, asked afterwards on the vehicles this module
 * admits. Both are required and neither subsumes the other: a vehicle that
 * beats the booked class can still be too small for a load whose declared
 * envelope exceeds the booked class itself.
 */

import type { VehicleCapability } from "@/lib/orders/vehicle-fit";

/**
 * One vehicle, as the substitution rule sees it: the class it is registered
 * under, and what it can actually carry.
 *
 * The two travel together in one argument because the rule needs both and needs
 * them to be about the *same* vehicle. `vehicleTypeSpecId` is `Vehicle
 * .vehicleTypeSpecId` — the class the carrier registered this truck as — and
 * `capability` is `capabilityOf(vehicle, vehicle.vehicleTypeSpec)`, the resolved
 * figures, which prefer the driver's own declarations over the catalogue's.
 * Those two facts can disagree, and the disagreement is the whole reason the id
 * is here; see `meetsBookedClass`.
 */
export type SubstitutionCandidate = {
  vehicleTypeSpecId: string;
  capability: VehicleCapability;
};

/**
 * One booking, as the substitution rule sees it: the class the client chose and
 * was quoted on, and the capacity floor that class sets.
 *
 * `vehicleTypeSpecId` is `Order.vehicleTypeSpecId`; `floor` is
 * `specCapability(order.vehicleTypeSpec)` — always built through that helper and
 * never from the four catalogue columns by hand, because it is the one place a
 * `cargoHeightM` of `0` becomes `Infinity` for an open bed.
 */
export type BookedClass = {
  vehicleTypeSpecId: string;
  floor: VehicleCapability;
};

/**
 * Whether `candidate` may fulfil a load booked against `booked`: a vehicle of
 * the booked class always may, and so does any vehicle at or above that class's
 * floor on payload, length, width and height.
 *
 * **The identity disjunct is not a shortcut for the comparison — it is a
 * separate, load-bearing case, and leaving it out was a live defect.** The two
 * sides of the comparison are not symmetrical: `floor` is the *catalogue* figure
 * for the booked class, while `candidate.capability` is a *resolved* figure that
 * `capabilityOf` takes from the carrier's own declarations wherever they exist.
 * Registration floors only `payloadKg` against the class spec — the three
 * dimensions are written verbatim, `src/lib/fleet-onboarding/vehicle-validation
 * .ts` asking only that each be greater than zero, and the company onboarding
 * path floors nothing at all. So a vehicle can and does resolve *below its own
 * class's* catalogue figures: on the live fleet at the time of writing, a
 * registered Minivan declares 1.9 x 1.22 x 1.21 m against its class's
 * 2.0 x 1.4 x 1.3, and a registered Refrigerated Truck declares a hold 2.19 m
 * tall against a class figure of 2.20. Compared on the numbers alone, both are
 * refused work *in the class they are registered and approved to do*, and — since
 * `src/lib/orders/class-serviceability.ts` asks this same question of the whole
 * fleet — a class whose only registered vehicles under-declare becomes
 * unserviceable, so clients are refused at booking for freight carriers actively
 * operate. A vehicle admitted by the identity case is one the platform has
 * already accepted as a member of that class; refusing it here would be the
 * platform disagreeing with its own onboarding.
 *
 * **All four axes, with no compensation between them.** A vehicle with double
 * the payload but a shorter hold does not qualify — being enormous in one
 * direction is not evidence about another, and a client who booked a class got
 * a promise about the whole envelope, not about its largest number. The axes are
 * compared like-for-like and in the same order `loadFits` compares them, so the
 * two predicates can be read side by side.
 *
 * **Bounds are inclusive, and with the identity disjunct this rule is a strict
 * superset of the identity matching it replaces.** The superset property is the
 * disjunct's doing and not the comparison's: a class does *not* trivially meet
 * itself here, because the resolved figures on the left and the catalogue
 * figures on the right are not the same numbers. Stated the other way round, so
 * that it stays true if this is ever revisited: **the first clause is what
 * guarantees nothing that used to work stops working, and the second is what
 * adds candidates on top.** Neither clause can be dropped without changing which
 * claims stand.
 *
 * **Physical safety is untouched by the identity case.** This function answers
 * eligibility only. Every consumer goes on to ask `loadFits` / `classifyFit`
 * about the actual cargo against the actual truck, so an under-declared vehicle
 * admitted here is still refused any load it cannot physically take — it is
 * measured against its own declared figures, which is exactly the measurement a
 * driver is entitled to.
 *
 * **`Infinity` is a real value on both sides and is handled by the plain
 * comparison, not by a special case.** `VehicleTypeSpec.cargoHeightM` carries a
 * `0` sentinel meaning "open bed, no height limit" — seeded for `FLATBED_TRUCK`
 * — which `capabilityOf` translates to `Infinity` at the one boundary where
 * catalogue data becomes a capability. So both operands here may be infinite,
 * and `>=` gives the right answer in three of the four combinations without
 * help: an open bed beats any finite height, a finite height never beats an open
 * bed, and `Infinity >= Infinity` is `true`, so one open bed does substitute for
 * another.
 *
 * **An open bed is a property of the class, and `capabilityOf` now reads it from
 * the class alone — which is what makes the fourth combination reachable at
 * all.** A vehicle registered under an open-bed class used to resolve to
 * whatever finite height its carrier typed at onboarding (the validator demands
 * a figure above zero and so cannot accept the sentinel), and a finite height
 * never clears an infinite floor. The result was that an onboarded flatbed could
 * not take a flatbed booking, could not make the flatbed class serviceable, and
 * — because `CARGO_MEASUREMENT_BOUNDS`'s 4 m height ceiling is justified *by* the
 * flatbed exception — left every load over the tallest enclosed hold unbookable
 * on every class. The translation belongs to the catalogue row rather than to
 * the carrier's form, so `capabilityOf` takes it from there; see that function.
 *
 * **The consequence, stated rather than special-cased: a load booked as a
 * flatbed can only be fulfilled by a vehicle of that class or by another with no
 * height limit.** A Curtainsider (6000 kg, 6.0 x 2.4 x 2.4, and `OPEN_CHASSIS`
 * among its body types) beats the seeded Flatbed on payload, length and width,
 * and still fails the comparison, because 2.4 is not greater than or equal to
 * "no limit". Read as a capacity claim that is exactly right: a flatbed client
 * may be shipping something that does not go under a roof at all — an excavator,
 * a stacked load, a crane-loaded module — and the platform has no figure that
 * says otherwise, because "unlimited" is precisely the absence of one. Refusing
 * the substitution costs an offer that might have worked; allowing it risks a
 * truck arriving at a pickup it cannot physically load. That is the same
 * asymmetry `loadFits` resolves the same way, and it is why this is left alone
 * rather than papered over with a "treat `Infinity` as 4 m" rule that would be a
 * guess dressed as a measurement. If flatbed substitution turns out to matter
 * commercially, the fix is a real maximum-height figure on the catalogue row,
 * not a comparison exception here.
 */
export function meetsBookedClass(
  candidate: SubstitutionCandidate,
  booked: BookedClass,
): boolean {
  // The identity case, first and unconditional: a vehicle registered under the
  // class the client booked is by definition a vehicle of that class, whatever
  // its declared figures say. Never fold this into the comparison below — the
  // two sides measure different things (see above).
  if (candidate.vehicleTypeSpecId === booked.vehicleTypeSpecId) {
    return true;
  }

  return (
    candidate.capability.payloadKg >= booked.floor.payloadKg &&
    candidate.capability.lengthM >= booked.floor.lengthM &&
    candidate.capability.widthM >= booked.floor.widthM &&
    candidate.capability.heightM >= booked.floor.heightM
  );
}

/**
 * Whether a vehicle class offers the body type an order requires.
 *
 * `required === null` imposes no constraint and returns `true` for every class.
 * `Order.bodyType` is nullable and most historical orders carry no value: the
 * column postdates them, nothing backfills one, and a client who never used the
 * booking form's body filter never chose one. A null is "the client did not ask
 * for a particular load space", not "the client asked for none", so it must not
 * exclude anything.
 *
 * **This test is not subsumed by `meetsBookedClass` and must be applied
 * alongside it.** Capacity says nothing about whether a hold is refrigerated or
 * open, and the substitution rule is otherwise happy to hand a `REFRIGERATED`
 * booking to any large enough dry box — delivering something other than what was
 * bought, with the client's cargo spoiling in it. The body type is the part of
 * the booking that survives the class becoming a mere floor.
 *
 * Compared against the *class's* `VehicleTypeSpec.bodyTypes`, not against
 * `Vehicle.chassisType`: the latter is nullable for every vehicle onboarded
 * before it existed, so keying on it would silently exclude a large part of the
 * live fleet. The schema's own comment on `ChassisType` names the class list as
 * the authority for this mapping.
 *
 * **The identity case can never fail this test**, which is the other half of why
 * this rule is a superset of exact-class matching: `POST /api/orders` refuses a
 * booking whose `bodyType` is not in its own spec's `bodyTypes` ("That vehicle
 * does not offer the load space you selected."), so an order's booked class
 * always offers the order's body. Should that guard ever be relaxed, an order
 * could be created that not even its own class may fulfil — which this function
 * would report honestly rather than mask.
 *
 * Takes `readonly string[]` and `string | null` rather than `ChassisType[]` and
 * `ChassisType | null` to keep this module free of the generated Prisma client;
 * `ChassisType` values are plain strings at runtime, and the comparison is
 * exact-match on those strings. See the module doc comment.
 */
export function offersBodyType(
  specBodyTypes: readonly string[],
  required: string | null,
): boolean {
  return required === null || specBodyTypes.includes(required);
}
