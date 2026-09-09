/**
 * Which vehicle classes may fulfil a load booked against another class — the
 * rule that replaced exact-class identity matching.
 *
 * **The rule: a vehicle may fulfil a load when it meets or beats the booked
 * class on all four capacity axes AND offers the body type the order asked
 * for.** The booked class is a *floor*, never a ceiling and never an identity.
 * Upgrades are always allowed; downgrades never are.
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
 * Whether `candidate` may fulfil a load booked against `booked` on capacity
 * grounds: at or above the booked class on payload, length, width and height.
 *
 * **All four axes, with no compensation between them.** A vehicle with double
 * the payload but a shorter hold does not qualify — being enormous in one
 * direction is not evidence about another, and a client who booked a class got
 * a promise about the whole envelope, not about its largest number. The axes are
 * compared like-for-like and in the same order `loadFits` compares them, so the
 * two predicates can be read side by side.
 *
 * **Bounds are inclusive, which is what makes this a strict superset of the
 * identity matching it replaces.** A class trivially meets itself on every axis,
 * so every claim the old exact-match rule allowed is still allowed; this rule
 * only ever *adds* candidates. Nothing that used to work can stop working
 * because of this function — a property worth keeping if the comparison is ever
 * revisited.
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
 * **The consequence, stated rather than special-cased: a load booked as a
 * flatbed can only be fulfilled by another vehicle with no height limit.** A
 * Curtainsider (6000 kg, 6.0 x 2.4 x 2.4, and `OPEN_CHASSIS` among its body
 * types) beats the seeded Flatbed on payload, length and width, and still fails
 * here, because 2.4 is not greater than or equal to "no limit". Read as a
 * capacity claim that is exactly right: a flatbed client may be shipping
 * something that does not go under a roof at all — an excavator, a stacked load,
 * a crane-loaded module — and the platform has no figure that says otherwise,
 * because "unlimited" is precisely the absence of one. Refusing the substitution
 * costs an offer that might have worked; allowing it risks a truck arriving at a
 * pickup it cannot physically load. That is the same asymmetry `loadFits`
 * resolves the same way, and it is why this is left alone rather than papered
 * over with a "treat `Infinity` as 4 m" rule that would be a guess dressed as a
 * measurement. If flatbed substitution turns out to matter commercially, the fix
 * is a real maximum-height figure on the catalogue row, not a comparison
 * exception here.
 */
export function meetsBookedClass(
  candidate: VehicleCapability,
  booked: VehicleCapability,
): boolean {
  return (
    candidate.payloadKg >= booked.payloadKg &&
    candidate.lengthM >= booked.lengthM &&
    candidate.widthM >= booked.widthM &&
    candidate.heightM >= booked.heightM
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
