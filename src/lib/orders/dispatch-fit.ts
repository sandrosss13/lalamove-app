/**
 * May this company vehicle be dispatched against this claimed order — and if
 * not, which of the four refusals applies?
 *
 * A logistics company claims a load with its *account* (`Order.companyId`) and
 * names no vehicle; `POST /api/logistics-company/orders/[id]/dispatch` is the
 * separate step that pins `Order.driverId` and `Order.vehicleId`. That handler
 * has always refused four ways — unapproved vehicle, under the booked class,
 * wrong body, cargo over the vehicle — each as an inline block returning a
 * `NextResponse`. This module is those four checks lifted out verbatim, in the
 * same order, answering with a value instead of a response.
 *
 * **Why lift them at all: the dispatch dialog.** The dispatcher's vehicle picker
 * has to say, per vehicle, *before* anything is submitted, which of the fleet
 * can take this load and why the rest cannot. Re-deriving that in the UI would
 * be a second copy of the rule, free to drift from the endpoint that actually
 * decides — the exact failure `hasDeclaredEnvelope` and `driverVehiclesWhere`
 * were each extracted to stop, and the one `GET /api/loads` already lived
 * through when it disagreed with three claim routes about the same order. One
 * function, read by the picker's options endpoint and by the refusing handler,
 * is what makes "the dialog offered it" and "the server accepted it" the same
 * sentence rather than two that happen to agree today.
 *
 * **Deliberately dependency-free**, exactly as `src/lib/orders/vehicle-fit.ts`
 * and `src/lib/orders/class-substitution.ts` are, and for the same reason: no
 * `import "server-only"`, no value import of `@prisma/client`, and no
 * Prisma-generated type in any signature. Everything crosses the boundary as a
 * plain object — a body type is `string | null`, a class's body list is
 * `readonly string[]`, and the fleet-application verdict arrives as a
 * **pre-computed `approved` boolean** rather than as
 * `BusinessApplicationVehicleStatus`. That last one is the only place the rule
 * was tempted to reach for the generated enum, and `isDispatchApproved` below
 * exists precisely so a caller can do the reaching instead. The property is
 * worth the small ceremony: `tests/dispatch-fit.spec.ts` builds its vehicles as
 * object literals, and a Prisma import here would turn every one of those
 * assertions into an integration test against a live database.
 *
 * **This module answers per-vehicle dispatchability, not scope.** Whether the
 * caller owns the order, the vehicle or the driver, whether the fleet is
 * activated, and whether the order is still CLAIMED are all questions for the
 * route — they are about rows and sessions, not about arithmetic. Nothing here
 * has any idea who is asking.
 */

import {
  oversizeAxes,
  specCapability,
  type CargoAxis,
  type SpecCapacitySlice,
} from "@/lib/orders/booking-fit";
import {
  meetsBookedClass,
  offersBodyType,
  type BookedClass,
} from "@/lib/orders/class-substitution";
import {
  capabilityOf,
  hasDeclaredEnvelope,
  loadFits,
  type LoadDimensions,
  type VehicleCapability,
} from "@/lib/orders/vehicle-fit";

/**
 * Why a vehicle may or may not take a claimed order.
 *
 * The four refusals are the four the dispatch route already returned, one
 * discriminant per existing error string, so a caller can map `kind` back to
 * that literal copy without inventing a fifth case or collapsing two into one.
 * They are **ordered and mutually exclusive**: `dispatchVerdictFor` returns the
 * first that applies and never looks further, which is what makes the
 * precedence documented on that function a property of the type as well as of
 * the implementation.
 *
 * `OVER_CARGO` carries its axes because the surface explaining the refusal
 * wants to say *which way* the load is too big — "too heavy and too long" — and
 * recomputing them from the verdict would mean re-running `oversizeAxes` with a
 * capability the caller would have to resolve a second time. See that member's
 * own note for the one case where the array is empty.
 */
export type DispatchVerdict =
  | { kind: "FITS" }
  | { kind: "NOT_APPROVED" }
  | { kind: "UNDER_BOOKED_CLASS" }
  | { kind: "WRONG_BODY_TYPE" }
  | {
      kind: "OVER_CARGO";
      /**
       * Which axes the declared cargo exceeds, in weight/length/width/height
       * order — `oversizeAxes`' output, unmodified.
       *
       * **May be empty, and a caller that renders it must survive that.** The
       * refusal fires on `!loadFits`, which is all-or-nothing about nulls: a
       * *partially* declared load (some figures, one or more nulls) does not
       * fit however small the declared figures are, while `oversizeAxes`
       * reports only axes the client actually declared *and* exceeded — "you
       * did not tell us the height" is not evidence the cargo is too tall. So a
       * load declaring 200 kg and nothing else, against a 3,500 kg truck, is
       * refused with no offending axis to name. The two functions are meant to
       * disagree here; each is right about its own question (see `loadFits` and
       * `oversizeAxes`), and flattening the difference would either strand a
       * dispatcher or fabricate a measurement. Fall back to the generic
       * "exceeds the weight or size limit" sentence when the array is empty,
       * which is exactly what the dispatch route's single error string says.
       */
      axes: CargoAxis[];
    };

/**
 * One vehicle, as the dispatch rule sees it.
 *
 * A plain slice of `Vehicle` joined to its `VehicleTypeSpec`, plus `approved`.
 * Structurally the same capacity fields `capabilityOf` reads, so a caller's
 * Prisma `select` and a test's object literal state the same shape.
 *
 * `vehicleTypeSpecId` is here for exactly one consumer — `meetsBookedClass`'s
 * identity clause — and is never compared against the order's class by hand;
 * `vehicleTypeSpec.bodyTypes` is the only non-capacity field, and is what
 * `offersBodyType` reads.
 */
export type DispatchVehicle = {
  vehicleTypeSpecId: string;
  /**
   * Whether this vehicle cleared fleet review. A **pre-computed boolean, never
   * the `BusinessApplicationVehicleStatus` enum** — that substitution is what
   * keeps this module free of Prisma (see the module doc). Derive it with
   * `isDispatchApproved` rather than by hand, so the grandfathering rule stays
   * stated in one place.
   */
  approved: boolean;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  vehicleTypeSpec: SpecCapacitySlice & { bodyTypes: readonly string[] };
};

/**
 * One claimed order, as the dispatch rule sees it: what the client asked for and
 * what they are owed.
 *
 * `bookedClass.floor` must come from `bookedClassFor` (or from `specCapability`
 * directly) and never from the four catalogue columns read into an object
 * literal — `capabilityOf` is the one boundary where a `cargoHeightM` of `0`
 * becomes `Infinity` for an open bed, and a literal would hand a flatbed
 * booking a height floor of zero that every vehicle on the platform clears.
 */
export type DispatchOrder = {
  bodyType: string | null;
  cargo: LoadDimensions;
  bookedClass: BookedClass;
};

/** `dispatchVerdictFor`'s answer: the verdict, and the capability it was reached from. */
export type DispatchAssessment = {
  verdict: DispatchVerdict;
  /**
   * The vehicle's resolved capability — its own declared figures, class spec as
   * the per-field fallback, open-bed sentinel already translated to `Infinity`.
   *
   * Returned rather than left for the caller to recompute because `capabilityOf`
   * is called **exactly once** here and callers need the same figures: the
   * options endpoint puts them in its response, and a picker sorts on payload.
   * `claimCandidatesFor` in the load board's context module records why — three
   * independent `capabilityOf` calls over one vehicle are three chances for one
   * of them to be handed the wrong spec and disagree with the other two, which
   * is cheap to prevent and expensive to notice.
   *
   * **`heightM` may be `Infinity`.** Anything serialising this to JSON has to
   * translate it deliberately; `JSON.stringify(Infinity)` is `null`, and a
   * silent `null` is indistinguishable from "unknown".
   */
  capability: VehicleCapability;
};

/**
 * The capacity floor a booking sets, built the one safe way.
 *
 * A thin wrapper over `specCapability` that pairs the resulting floor with the
 * booked class's own id, because `meetsBookedClass` needs both and needs them to
 * be about the same class. Exported so no caller has to remember that the floor
 * goes through `capabilityOf` — the mistake this guards against looks correct at
 * the call site (four columns, copied across) and silently makes the strictest
 * class in the catalogue the most substitutable one.
 */
export function bookedClassFor(order: {
  vehicleTypeSpecId: string;
  vehicleTypeSpec: SpecCapacitySlice;
}): BookedClass {
  return {
    vehicleTypeSpecId: order.vehicleTypeSpecId,
    floor: specCapability(order.vehicleTypeSpec),
  };
}

/**
 * Whether a vehicle's fleet-application verdict permits dispatch: no review row
 * at all, or one that reads `APPROVED`.
 *
 * **The null case is grandfathering, not an oversight.** A vehicle that predates
 * business applications — admin-created, or added through the company's own
 * fleet form — has no `BusinessApplicationVehicle` row, there is no column on
 * `Vehicle` to backfill a verdict onto, and manufacturing review rows for
 * vehicles no reviewer ever looked at would fabricate a compliance record. The
 * new onboarding flow cannot produce a null: the submit route creates a review
 * row for every vehicle in the same transaction that creates the vehicle.
 *
 * **This is the one definition, and it had already been written out three
 * times**: the `dispatchable` field in `src/lib/dashboard/hub/vehicles.ts`
 * (whose own comment says it "mirrors the gate in [the dispatch route]"), the
 * dispatch route's inline `!== "APPROVED"` guard, and — as a Prisma `where`
 * rather than a predicate — `visibleVehicleTypeWhere` in
 * `src/lib/vehicle-type-visibility.ts`. All three agreed. The first two now call
 * this function; the third cannot, because a query clause is not a boolean over
 * a row already fetched, and rewriting it as one would turn an indexed read into
 * a full fleet scan. It is left as the deliberate second *expression* of one
 * rule, and is cross-referenced from here so a change to either is a change
 * somebody sees.
 *
 * Takes `{ status: string } | null` rather than the generated
 * `BusinessApplicationVehicleStatus`, so this module stays importable from a
 * test and from a client bundle; the enum's values are plain strings at runtime
 * and the comparison is exact-match on one of them.
 */
export function isDispatchApproved(
  applicationVehicle: { status: string } | null,
): boolean {
  return (
    applicationVehicle === null || applicationVehicle.status === "APPROVED"
  );
}

/**
 * The four dispatch checks, in the order the route has always applied them,
 * answered as a value.
 *
 * **The order is load-bearing and is not a style choice.**
 *
 *  1. **Approval first, deliberately.** A vehicle that is both unapproved *and*
 *     unfit for the booking is reported as unapproved, which is the precedence
 *     the dispatch route's own comment records ("Placed before the substitution
 *     checks below so a vehicle that is both unapproved and unfit for the
 *     booking is reported as unapproved"). It is also the more actionable of the
 *     two answers: a dispatcher can send an unapproved vehicle to review, and
 *     telling them it is too small for a load it is not yet allowed to carry
 *     sends them to fix the wrong thing.
 *  2. **`meetsBookedClass`** — is this at least the vehicle *class* the client
 *     paid for? Its identity clause admits a vehicle registered under the booked
 *     class regardless of its declared figures, because registration floors only
 *     `payloadKg` and a real vehicle can measure under its own class.
 *  3. **`offersBodyType`** — the right *kind* of hold, which no amount of
 *     payload substitutes for. A null `Order.bodyType` asked for no particular
 *     load space and imposes no requirement.
 *  4. **The cargo fit**, guarded by `hasDeclaredEnvelope`. The guard is why
 *     every order claimed before cargo capture existed is still dispatchable:
 *     `loadFits` resolves a null dimension to "does not fit", which would strand
 *     all of them in CLAIMED forever. An order declaring nothing skips the
 *     check; an order declaring anything is measured exactly as the board
 *     measures it.
 *
 * Steps 2 and 3 are two tests rather than one because a bigger hold is not the
 * same promise as the right kind of hold, and step 4 is independent of both:
 * clearing the booked *class* says nothing about whether this particular truck
 * takes this particular load — two trucks of one class no longer resolve to the
 * same capacity, and a load can be oversized for the very class it was booked
 * as.
 *
 * **`capabilityOf` is called once, before the approval branch**, so the returned
 * `capability` is present on every path including the refusals. That is
 * deliberate: the options endpoint renders a rejected vehicle's figures beside
 * the reason it was rejected ("2,000 kg · 4.5 × 2.1 × 2.2 m — not approved"),
 * and a capability that existed only on the accepting path would have to be
 * resolved a second time to show it. The call is pure arithmetic over four
 * fields, so paying for it on the unapproved path costs nothing worth branching
 * to avoid.
 *
 * **Rejected alternative: collecting every failing check and returning a list.**
 * A vehicle can fail several at once, and a "tell them everything" verdict looks
 * more helpful. It was not taken, because this function's other caller is the
 * handler that *refuses* the dispatch, and that handler answers with a single
 * `error` string — so a list would have to be collapsed back to one reason at
 * the moment of refusal, and the collapsing rule would be a second, unwritten
 * precedence order living in the route. One ordered verdict means the dialog and
 * the refusal name the same problem by construction. `OVER_CARGO.axes` is the
 * one place multiplicity survives, because there one refusal genuinely has
 * several parts and one sentence already names them all.
 */
export function dispatchVerdictFor(
  vehicle: DispatchVehicle,
  order: DispatchOrder,
): DispatchAssessment {
  // Resolved once and shared by every branch below and by the caller — see
  // `DispatchAssessment.capability`. Never compare `vehicle.vehicleTypeSpec
  // .cargoHeightM` directly anywhere downstream: a spec height of `0` is the
  // open-bed sentinel, and this is the call that turns it into `Infinity`.
  const capability = capabilityOf(vehicle, vehicle.vehicleTypeSpec);

  if (!vehicle.approved) {
    return { verdict: { kind: "NOT_APPROVED" }, capability };
  }

  if (
    !meetsBookedClass(
      { vehicleTypeSpecId: vehicle.vehicleTypeSpecId, capability },
      order.bookedClass,
    )
  ) {
    return { verdict: { kind: "UNDER_BOOKED_CLASS" }, capability };
  }

  if (!offersBodyType(vehicle.vehicleTypeSpec.bodyTypes, order.bodyType)) {
    return { verdict: { kind: "WRONG_BODY_TYPE" }, capability };
  }

  if (hasDeclaredEnvelope(order.cargo) && !loadFits(order.cargo, capability)) {
    return {
      verdict: {
        kind: "OVER_CARGO",
        axes: oversizeAxes(order.cargo, capability),
      },
      capability,
    };
  }

  return { verdict: { kind: "FITS" }, capability };
}
