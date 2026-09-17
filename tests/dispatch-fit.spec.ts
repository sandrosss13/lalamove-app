/**
 * `dispatchVerdictFor` — the four refusals a fleet meets when it puts a vehicle
 * behind a load it has already claimed, and the traps hiding in each of them —
 * and `rankDispatchVehicles`, which turns a fleet of those verdicts into the
 * order the dispatch picker renders and the one truck the platform suggests.
 *
 * The function is a transcription of the four inline checks that lived in
 * `POST /api/logistics-company/orders/[id]/dispatch`, lifted so the dispatch
 * dialog can pre-judge a fleet with the *same* rule the endpoint refuses by
 * rather than a second copy of it. Lifting it is only worth anything if the
 * transcription is faithful, and three of its properties are the kind that look
 * like details and are not: the order the checks run in, the height sentinel,
 * and what an undeclared cargo envelope means. Each is asserted below.
 *
 * **Why this runs with no browser and no database**, exactly as
 * `tests/class-substitution.spec.ts` does and for the reason its header gives:
 * `src/lib/orders/dispatch-fit.ts` is deliberately free of `server-only`, of
 * Prisma imports and of Prisma types in its signatures — the fleet-application
 * verdict crosses its boundary as a plain `approved` boolean precisely so the
 * generated client never has to. That property is what lets this spec build a
 * vehicle as an object literal, and it is worth preserving: a Prisma import in
 * that module would turn every assertion here into an integration test against
 * a live database. The ranking cases below lean on it harder still: they build
 * a whole fleet per test, and each is a statement about a product rule — "the
 * smallest truck that fits, and only one is ever recommended" — that is worth
 * asserting directly rather than inferring from the shape of a JSON response.
 *
 * **The catalogue figures below are copied from `prisma/seed.ts` by hand**, the
 * same deliberate duplication `tests/class-substitution.spec.ts` explains:
 * reading them from the seed would make this spec agree with whatever the
 * catalogue happens to say, including after a retune that breaks a rule. If the
 * catalogue is retuned these constants are meant to fail and be reviewed.
 */

import { expect, test } from "@playwright/test";

import {
  bookedClassFor,
  dispatchVerdictFor,
  rankDispatchVehicles,
  type DispatchVerdict,
} from "@/lib/orders/dispatch-fit";
import type { LoadDimensions } from "@/lib/orders/vehicle-fit";

/* -------------------------------------------------------------------------- */
/* The catalogue, as seeded                                                   */
/* -------------------------------------------------------------------------- */

/** `VehicleTypeSpec.id` is a cuid in the database; any stable string will do here. */
const MINIVAN_ID = "spec_minivan";
const BOX_TRUCK_ID = "spec_box_truck";
const REFRIGERATED_TRUCK_ID = "spec_refrigerated_truck";
const FLATBED_ID = "spec_flatbed_truck";

const MINIVAN_SPEC = {
  maxPayloadKg: 500,
  cargoLengthM: 2.0,
  cargoWidthM: 1.4,
  cargoHeightM: 1.3,
  bodyTypes: ["DRY_BOX"],
};

const BOX_TRUCK_SPEC = {
  maxPayloadKg: 3500,
  cargoLengthM: 4.5,
  cargoWidthM: 2.1,
  cargoHeightM: 2.2,
  bodyTypes: ["DRY_BOX"],
};

/** The only seeded class offering a refrigerated body alongside a dry one. */
const REFRIGERATED_TRUCK_SPEC = {
  maxPayloadKg: 4000,
  cargoLengthM: 4.8,
  cargoWidthM: 2.2,
  cargoHeightM: 2.2,
  bodyTypes: ["REFRIGERATED", "DRY_BOX"],
};

/** The open-bed class. `cargoHeightM: 0` is the "no height limit" sentinel. */
const FLATBED_SPEC = {
  maxPayloadKg: 5000,
  cargoLengthM: 5.0,
  cargoWidthM: 2.3,
  cargoHeightM: 0,
  bodyTypes: ["OPEN_CHASSIS"],
};

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** A `Vehicle` row that declares nothing, so every axis falls back to its class. */
const DECLARES_NOTHING = {
  payloadKg: null,
  cargoLengthM: null,
  cargoWidthM: null,
  cargoHeightM: null,
};

/** A load nobody measured — all four `Order` cargo columns null. */
const UNMEASURED: LoadDimensions = {
  weightKg: null,
  lengthM: null,
  widthM: null,
  heightM: null,
};

/**
 * The class slice `dispatchVerdictFor` reads: the four capacity columns plus the
 * body list. Spelled out rather than inferred from one of the constants above,
 * so `bodyTypes` widens to `readonly string[]` — the `ChassisType`-free shape
 * the module's boundary is defined in — instead of to that one constant's
 * literal tuple.
 */
type Spec = {
  maxPayloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
  bodyTypes: readonly string[];
};

/**
 * A vehicle argument, assembled from a class and the parts a given test cares
 * about. Defaults to approved and to declaring nothing of its own, because most
 * tests here are about some *other* check and an explicit `approved: true` at
 * every call site would bury the one test that turns it off.
 */
function vehicleOf(
  vehicleTypeSpecId: string,
  vehicleTypeSpec: Spec,
  overrides: Partial<{
    approved: boolean;
    payloadKg: number | null;
    cargoLengthM: number | null;
    cargoWidthM: number | null;
    cargoHeightM: number | null;
  }> = {},
) {
  return {
    vehicleTypeSpecId,
    approved: true,
    ...DECLARES_NOTHING,
    ...overrides,
    vehicleTypeSpec,
  };
}

/**
 * An order argument. `bookedClassFor` rather than a literal floor, for the
 * reason that helper exists: `capabilityOf` is the one place a spec
 * `cargoHeightM` of `0` becomes `Infinity`, and a hand-built floor would make
 * the flatbed cases below silently meaningless.
 */
function orderOf(
  vehicleTypeSpecId: string,
  vehicleTypeSpec: Spec,
  options: { bodyType?: string | null; cargo?: LoadDimensions } = {},
) {
  return {
    bodyType: options.bodyType ?? null,
    cargo: options.cargo ?? UNMEASURED,
    bookedClass: bookedClassFor({ vehicleTypeSpecId, vehicleTypeSpec }),
  };
}

/* -------------------------------------------------------------------------- */
/* H1 — approval takes precedence over every other refusal                    */
/* -------------------------------------------------------------------------- */

test.describe("approval precedence", () => {
  /**
   * The route's own comment fixes this order: *"Placed before the substitution
   * checks below so a vehicle that is both unapproved and unfit for the booking
   * is reported as unapproved."* It is also the more actionable answer — a
   * dispatcher can send an unapproved vehicle to review, and being told instead
   * that it is too small for a load it is not yet allowed to carry sends them
   * to fix the wrong thing, then to discover the approval gate afterwards.
   *
   * Asserted with a vehicle that fails *three* of the other checks at once, so
   * a reordering cannot pass this test by landing on some other refusal that
   * happens to be "close enough".
   */
  test("an unapproved vehicle that is also unfit reports NOT_APPROVED", () => {
    const { verdict } = dispatchVerdictFor(
      vehicleOf(MINIVAN_ID, MINIVAN_SPEC, { approved: false }),
      orderOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC, {
        // Under the booked class, wrong body is not in play (Box Truck is dry
        // box, as is the Minivan), and far over the cargo on three axes.
        cargo: { weightKg: 3000, lengthM: 4, widthM: 2, heightM: 2 },
      }),
    );

    expect(verdict.kind).toBe("NOT_APPROVED");
  });

  test("the same vehicle, approved, falls through to the next refusal", () => {
    // The control. Without it the test above would pass just as well against an
    // implementation that returned NOT_APPROVED unconditionally.
    const { verdict } = dispatchVerdictFor(
      vehicleOf(MINIVAN_ID, MINIVAN_SPEC, { approved: true }),
      orderOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC, {
        cargo: { weightKg: 3000, lengthM: 4, widthM: 2, heightM: 2 },
      }),
    );

    expect(verdict.kind).toBe("UNDER_BOOKED_CLASS");
  });

  /**
   * `approved` is a pre-computed boolean and nothing else. This pins the
   * consequence that matters for the module's dependency rule: the function
   * never inspects a status string, so it can never grow a dependency on
   * `BusinessApplicationVehicleStatus`. A vehicle with no review row at all is
   * grandfathered — `isDispatchApproved` turns that null into `true` — and this
   * is the same `true` arriving by any route.
   */
  test("approval is read as a boolean, never as a status", () => {
    const approved = dispatchVerdictFor(
      vehicleOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC, { approved: true }),
      orderOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC),
    );
    const unapproved = dispatchVerdictFor(
      vehicleOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC, { approved: false }),
      orderOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC),
    );

    expect(approved.verdict.kind).toBe("FITS");
    expect(unapproved.verdict.kind).toBe("NOT_APPROVED");
  });
});

/* -------------------------------------------------------------------------- */
/* H2 — the identity clause survives the transcription                        */
/* -------------------------------------------------------------------------- */

test.describe("the booked class's identity clause", () => {
  /**
   * A vehicle registered under the booked class qualifies whatever its declared
   * figures say, because registration floors only `payloadKg` and the three
   * dimensions are stored verbatim — so a real, approved vehicle routinely
   * resolves *below* its own class's catalogue figures. On the live fleet a
   * Minivan declaring 1.9 x 1.22 x 1.21 against a class figure of
   * 2.0 x 1.4 x 1.3 was refused work in the class it is approved to do.
   *
   * `meetsBookedClass` owns that rule and `tests/class-substitution.spec.ts`
   * pins it directly. What this test adds is that `dispatchVerdictFor` really
   * delegates to it rather than having quietly reimplemented a four-axis
   * comparison during the lift — which would look identical on every vehicle
   * except exactly this one.
   */
  test("a sub-class vehicle still clears its own class", () => {
    const { verdict, capability } = dispatchVerdictFor(
      vehicleOf(MINIVAN_ID, MINIVAN_SPEC, {
        payloadKg: 500,
        cargoLengthM: 1.9,
        cargoWidthM: 1.22,
        cargoHeightM: 1.21,
      }),
      orderOf(MINIVAN_ID, MINIVAN_SPEC),
    );

    // The premise, asserted rather than assumed: this vehicle really is smaller
    // than its own class on the axis the live failure was reported on.
    expect(capability.widthM).toBeLessThan(MINIVAN_SPEC.cargoWidthM);
    expect(verdict.kind).toBe("FITS");
  });

  test("and that pass does not extend to a different class of the same size", () => {
    // The identity clause admits a vehicle to *its own* class and to nothing
    // else on those grounds. Same vehicle, same numbers, a different booked
    // class whose floor it does not clear: refused. Without this, the case above
    // could be satisfied by a loosened comparison instead of an identity test.
    const { verdict } = dispatchVerdictFor(
      vehicleOf(MINIVAN_ID, MINIVAN_SPEC, {
        payloadKg: 500,
        cargoLengthM: 1.9,
        cargoWidthM: 1.22,
        cargoHeightM: 1.21,
      }),
      orderOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC),
    );

    expect(verdict.kind).toBe("UNDER_BOOKED_CLASS");
  });
});

/* -------------------------------------------------------------------------- */
/* H3 — the open-bed height sentinel                                          */
/* -------------------------------------------------------------------------- */

test.describe("the open-bed height sentinel", () => {
  /**
   * `VehicleTypeSpec.cargoHeightM: 0` means "open / no height limit", not a hold
   * zero metres tall, and `capabilityOf` is the one boundary where that becomes
   * `Infinity`. Read literally instead, a flatbed would refuse every load
   * declaring any height at all — the failure mode that made an onboarded
   * flatbed unable to take a flatbed booking, and, because `CARGO_MEASUREMENT
   * _BOUNDS`' 4 m ceiling is justified *by* the flatbed exception, left every
   * load taller than the tallest enclosed hold unbookable on every class.
   *
   * The 3.8 m load here is the point: taller than any enclosed class in the
   * catalogue, so nothing but an open bed can take it.
   */
  test("an open bed takes a load taller than every enclosed class", () => {
    const { verdict, capability } = dispatchVerdictFor(
      // Declares a finite 2.5 m height of its own — which is what an onboarded
      // flatbed always carries, since the onboarding validator requires every
      // dimension to be greater than zero and so cannot accept the sentinel.
      // The *class's* sentinel must win over it.
      vehicleOf(FLATBED_ID, FLATBED_SPEC, { cargoHeightM: 2.5 }),
      orderOf(FLATBED_ID, FLATBED_SPEC, {
        bodyType: "OPEN_CHASSIS",
        cargo: { weightKg: 4000, lengthM: 4.5, widthM: 2.2, heightM: 3.8 },
      }),
    );

    expect(capability.heightM).toBe(Number.POSITIVE_INFINITY);
    expect(verdict.kind).toBe("FITS");
  });

  /**
   * The other direction, and the reason the sentinel has to be read from the
   * class rather than from the vehicle's own column: a load that clears the open
   * bed on height is still refused if it is over on an axis that has no
   * sentinel. Only height carries one — a `0` in payload, length or width is a
   * genuine zero that fits nothing.
   */
  test("an unbounded height does not excuse an over-length load", () => {
    const { verdict } = dispatchVerdictFor(
      vehicleOf(FLATBED_ID, FLATBED_SPEC),
      orderOf(FLATBED_ID, FLATBED_SPEC, {
        bodyType: "OPEN_CHASSIS",
        cargo: { weightKg: 1000, lengthM: 9, widthM: 2.2, heightM: 3.8 },
      }),
    );

    expect(verdict).toEqual({ kind: "OVER_CARGO", axes: ["length"] });
  });
});

/* -------------------------------------------------------------------------- */
/* H4 — what an undeclared envelope means                                     */
/* -------------------------------------------------------------------------- */

test.describe("the declared-envelope guard", () => {
  /**
   * Every order claimed before cargo capture existed has all four columns null,
   * and nothing backfills them. `loadFits` folds any null into "does not fit",
   * which is the right answer before committing a truck to a job but the wrong
   * one here: applied to those orders it would strand every one of them in
   * CLAIMED, undispatchable by the endpoint that has always dispatched them.
   * `hasDeclaredEnvelope` is the guard that keeps them dispatchable, and this is
   * the assertion that the guard survived the lift.
   */
  test("an all-null cargo envelope is FITS, not OVER_CARGO", () => {
    const { verdict } = dispatchVerdictFor(
      // The smallest class in the catalogue, so a missing guard could not be
      // masked by a generous capability.
      vehicleOf(MINIVAN_ID, MINIVAN_SPEC),
      orderOf(MINIVAN_ID, MINIVAN_SPEC, { cargo: UNMEASURED }),
    );

    expect(verdict).toEqual({ kind: "FITS" });
  });

  /**
   * The other half of the same rule, and the case where `loadFits` and
   * `oversizeAxes` are *meant* to disagree.
   *
   * A partially declared load is refused all-or-nothing — a load that clears
   * three limits and is unknown on the fourth is exactly the one that strands a
   * driver at a pickup — so the verdict is `OVER_CARGO`. But `oversizeAxes`
   * reports only axes the client declared *and* exceeded, because "you did not
   * tell us the height" is not evidence the cargo is too tall. With a 200 kg
   * weight well inside a 500 kg Minivan and nothing else declared, that is an
   * `OVER_CARGO` naming **no axis at all**.
   *
   * It looks like a contradiction and is not: each function is right about its
   * own question. It is pinned here because a client rendering "too heavy and
   * too long" from this array must survive an empty one — the dispatch route's
   * own refusal copy names no axis for exactly this reason, and a dialog that
   * printed "this vehicle is " would be the visible form of the same
   * misunderstanding.
   */
  test("a partially declared envelope is OVER_CARGO, possibly naming no axis", () => {
    const { verdict } = dispatchVerdictFor(
      vehicleOf(MINIVAN_ID, MINIVAN_SPEC),
      orderOf(MINIVAN_ID, MINIVAN_SPEC, {
        cargo: { weightKg: 200, lengthM: null, widthM: null, heightM: null },
      }),
    );

    expect(verdict).toEqual({ kind: "OVER_CARGO", axes: [] });
  });
});

/* -------------------------------------------------------------------------- */
/* H5 — the body type                                                         */
/* -------------------------------------------------------------------------- */

test.describe("body type", () => {
  /**
   * `Order.bodyType` is nullable and most historical orders carry no value: the
   * column postdates them, nothing backfills one, and a client who never used
   * the booking form's body filter never chose one. Null is "the client did not
   * ask for a particular load space", not "asked for none", so it must exclude
   * nothing — including a class whose body list would not match any value the
   * order could have carried.
   */
  test("a null Order.bodyType imposes no requirement", () => {
    const { verdict } = dispatchVerdictFor(
      // An open-chassis flatbed against an open-chassis booking, with the body
      // requirement left null. Nothing about OPEN_CHASSIS is special here; the
      // point is that no body comparison happens at all.
      vehicleOf(FLATBED_ID, FLATBED_SPEC),
      orderOf(FLATBED_ID, FLATBED_SPEC, { bodyType: null }),
    );

    expect(verdict.kind).toBe("FITS");
  });

  test("a dry box cannot serve a refrigerated booking however large it is", () => {
    // Capacity says nothing about whether a hold is refrigerated, and the
    // substitution rule is otherwise happy to hand a REFRIGERATED booking to any
    // large enough dry box — delivering something other than what was bought,
    // with the client's cargo spoiling in it. The flatbed here beats the reefer
    // class on payload, length and width and is unbounded on height, so only the
    // body check can refuse it.
    const { verdict } = dispatchVerdictFor(
      vehicleOf(FLATBED_ID, FLATBED_SPEC),
      orderOf(REFRIGERATED_TRUCK_ID, REFRIGERATED_TRUCK_SPEC, {
        bodyType: "REFRIGERATED",
      }),
    );

    expect(verdict.kind).toBe("WRONG_BODY_TYPE");
  });
});

/* -------------------------------------------------------------------------- */
/* H6 — OVER_CARGO names the right axis                                       */
/* -------------------------------------------------------------------------- */

test.describe("OVER_CARGO axes", () => {
  /**
   * The axes travel with the verdict so the dialog can say *which way* the load
   * is too big before a dispatcher submits anything. Getting the axis wrong is
   * worse than omitting it — "too long" on a load that is merely heavy sends
   * someone looking for a longer truck — and a pair of parallel per-axis
   * comparisons is exactly the mistake `CARGO_AXIS_DESCRIPTORS` was tabulated to
   * prevent. These two cases differ on one axis each, so a crossed wiring shows
   * up as a swapped name rather than as a still-plausible refusal.
   */
  test("too heavy names weight and nothing else", () => {
    const { verdict } = dispatchVerdictFor(
      vehicleOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC),
      orderOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC, {
        cargo: { weightKg: 4000, lengthM: 4, widthM: 2, heightM: 2 },
      }),
    );

    expect(verdict).toEqual({ kind: "OVER_CARGO", axes: ["weight"] });
  });

  test("too long names length and nothing else", () => {
    const { verdict } = dispatchVerdictFor(
      vehicleOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC),
      orderOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC, {
        // The 15 m declaration from the incident that began this whole line of
        // work, against the Box Truck's 4.5 m hold.
        cargo: { weightKg: 1000, lengthM: 15, widthM: 2, heightM: 2 },
      }),
    );

    expect(verdict).toEqual({ kind: "OVER_CARGO", axes: ["length"] });
  });

  test("two offending axes are both named, in weight/length/width/height order", () => {
    const { verdict } = dispatchVerdictFor(
      vehicleOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC),
      orderOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC, {
        cargo: { weightKg: 4000, lengthM: 15, widthM: 2, heightM: 2 },
      }),
    );

    expect(verdict).toEqual({
      kind: "OVER_CARGO",
      axes: ["weight", "length"],
    });
  });

  /**
   * A load exactly at the limit fits — bounds are inclusive throughout
   * `vehicle-fit.ts`, and an off-by-one here would refuse a dispatch a
   * dispatcher can see should work.
   */
  test("a load exactly at every limit fits", () => {
    const { verdict } = dispatchVerdictFor(
      vehicleOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC),
      orderOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC, {
        cargo: {
          weightKg: BOX_TRUCK_SPEC.maxPayloadKg,
          lengthM: BOX_TRUCK_SPEC.cargoLengthM,
          widthM: BOX_TRUCK_SPEC.cargoWidthM,
          heightM: BOX_TRUCK_SPEC.cargoHeightM,
        },
      }),
    );

    expect(verdict.kind).toBe("FITS");
  });
});

/* -------------------------------------------------------------------------- */
/* H7 — the capability comes back with the verdict                            */
/* -------------------------------------------------------------------------- */

test.describe("the returned capability", () => {
  /**
   * `capabilityOf` is called once and its result is returned alongside the
   * verdict, so the figures a dialog displays are by construction the figures
   * the verdict was reached from. `claimCandidatesFor` in the load board's
   * context module records the hazard this avoids: three independent
   * `capabilityOf` calls over one vehicle are three chances for one of them to
   * be handed the wrong spec and disagree with the other two.
   *
   * Asserted on a *refusing* path as well, because the options endpoint renders
   * a rejected vehicle's figures beside its reason — a capability present only
   * on the accepting path would have to be resolved a second time to show them.
   */
  test("is resolved per field and returned even when the vehicle is refused", () => {
    const { verdict, capability } = dispatchVerdictFor(
      // Declares a heavier payload than its class and nothing else, so the
      // per-field fallback is visible: payload from the vehicle, the three
      // dimensions from the spec.
      vehicleOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC, {
        approved: false,
        payloadKg: 4200,
      }),
      orderOf(BOX_TRUCK_ID, BOX_TRUCK_SPEC),
    );

    expect(verdict.kind).toBe("NOT_APPROVED");
    expect(capability).toEqual({
      payloadKg: 4200,
      lengthM: BOX_TRUCK_SPEC.cargoLengthM,
      widthM: BOX_TRUCK_SPEC.cargoWidthM,
      heightM: BOX_TRUCK_SPEC.cargoHeightM,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* H8 — the recommendation: the smallest vehicle that fits                    */
/* -------------------------------------------------------------------------- */

/**
 * A driver, as `rankDispatchVehicles` sees one: a non-null object and nothing
 * more. The function never reads a field on it — only whether there is one — so
 * the id is here to make the fixtures readable rather than because anything
 * compares it.
 */
const PAIRED = { userId: "user_driver" };

/** The two verdicts these cases need, named so the fixtures read as prose. */
const FITS: DispatchVerdict = { kind: "FITS" };
const UNDER_CLASS: DispatchVerdict = { kind: "UNDER_BOOKED_CLASS" };

/**
 * The minimal vehicle the ranking is defined over.
 *
 * Spelled out rather than inferred from a fixture, so `verdict` is the union and
 * not one member's literal type, and so this spec states the module's boundary
 * in the same terms the module does.
 */
type Rankable = {
  plateNumber: string;
  capability: { payloadKg: number };
  pairedDriver: { userId: string } | null;
  verdict: DispatchVerdict;
};

/**
 * A rankable vehicle, defaulting to the dispatchable case — fits, and somebody
 * drives it — because most cases below vary exactly one thing away from that and
 * an explicit `verdict: FITS, pairedDriver: PAIRED` at every call site would
 * bury which one.
 *
 * The payload is the *resolved* capability, as the route passes it: the
 * vehicle's own declared figure where it has one. Nothing in these fixtures goes
 * near a class catalogue, which is the point of the function being pure.
 */
function rankable(
  plateNumber: string,
  payloadKg: number,
  overrides: Partial<Omit<Rankable, "plateNumber" | "capability">> = {},
): Rankable {
  return {
    plateNumber,
    capability: { payloadKg },
    pairedDriver: PAIRED,
    verdict: FITS,
    ...overrides,
  };
}

/** The plates of whichever vehicles came back recommended, in returned order. */
function recommendedPlates(
  vehicles: readonly (Rankable & { recommended: boolean })[],
): string[] {
  return vehicles.filter((v) => v.recommended).map((v) => v.plateNumber);
}

test.describe("the recommendation", () => {
  /**
   * The rule, and the whole reason this function exists: the platform suggests
   * the **smallest** vehicle that fits, not the first one the fleet query
   * returned. Every dispatchable vehicle already clears the booked class — that
   * floor is what `meetsBookedClass` guarantees — so the extra tonnes on a
   * larger truck buy the client nothing and cost the fleet a truck it will want
   * for the next job.
   *
   * The input here is deliberately ordered largest-first, which is a plausible
   * real ordering (the endpoint reads its fleet newest-first, and fleets tend to
   * buy bigger over time). An implementation that simply took `vehicles[0]`, or
   * that sorted descending, passes nothing here.
   */
  test("the smallest fitting vehicle is recommended, not the first one given", () => {
    const ranked = rankDispatchVehicles([
      rankable("BIG-500", 5000),
      rankable("MID-350", 3500),
      rankable("SML-050", 500),
    ]);

    expect(ranked.map((v) => v.plateNumber)).toEqual([
      "SML-050",
      "MID-350",
      "BIG-500",
    ]);
    expect(recommendedPlates(ranked)).toEqual(["SML-050"]);
  });

  /**
   * "Smallest" is only ever read among vehicles that *fit*. A 500 kg van is the
   * smallest thing in this fleet and is refused — it is under the booked class —
   * so the recommendation is the smallest of what remains.
   *
   * This is the case that separates the rule from a naive `sort by payload asc`
   * with no fit key, which would hand the dispatcher a van the POST then
   * bounces. It is the same failure `claimCandidatesFor`'s `fits` key was added
   * to fix on the driver side, where the picker defaulted to a truck that
   * cleared the class but not the cargo and said so only after the driver
   * committed.
   */
  test("a smaller vehicle that does not fit is not recommended", () => {
    const ranked = rankDispatchVehicles([
      rankable("TINY-050", 500, { verdict: UNDER_CLASS }),
      rankable("MID-350", 3500),
      rankable("BIG-500", 5000),
    ]);

    expect(recommendedPlates(ranked)).toEqual(["MID-350"]);
    // And the refused van is below both vehicles that can actually take the job,
    // however small it is.
    expect(ranked.map((v) => v.plateNumber)).toEqual([
      "MID-350",
      "BIG-500",
      "TINY-050",
    ]);
  });

  /**
   * The second half of "dispatchable", and it is not implied by the first.
   *
   * `dispatchVerdictFor` answers a question about capacity, class, body and
   * cargo; it has never known anything about assignments. A `FITS` verdict on a
   * vehicle nobody is paired with is a truck perfectly suited to the load that
   * cannot leave the yard — and since the dialog's roster override was removed,
   * there is no `driverUserId` to submit for it at all. So it is not a near miss
   * to be offered hopefully: it is unselectable, it is not the recommendation
   * however small it is, and it sorts into the tail with the refusals.
   *
   * The driverless van here is the smallest vehicle in the fleet *and* fits, so
   * an implementation that ranked on the verdict alone would recommend it.
   *
   * **`pairedDriver: null` covers two real situations, not one.** The obvious
   * one is a vehicle nobody was ever assigned to. The other is a vehicle with a
   * live assignment to a driver who has since been taken off the roster —
   * `DELETE /api/logistics-company/drivers/[userId]` only nulls
   * `DriverProfile.companyId` and closes no assignment, so that state is
   * reachable through supported actions — which the options endpoint filters out
   * in its query so that it and `POST .../dispatch` agree on who is eligible.
   * That scoping is a Prisma `where` and cannot be reached from here; this test
   * pins the half of the behaviour that is pure, which is that a null pairing
   * is excluded from the ranking however good the vehicle is.
   */
  test("a fitting vehicle with no paired driver is neither recommended nor ranked with the dispatchable", () => {
    const ranked = rankDispatchVehicles([
      rankable("NODRV-050", 500, { pairedDriver: null }),
      rankable("MID-350", 3500),
    ]);

    expect(ranked.map((v) => v.plateNumber)).toEqual(["MID-350", "NODRV-050"]);
    expect(recommendedPlates(ranked)).toEqual(["MID-350"]);
  });

  /**
   * The invariant the client codes against, asserted on a fleet containing every
   * kind of row at once: two dispatchable trucks, one that fits with nobody
   * driving it, and one refused outright.
   *
   * **Exactly one `true`.** A dialog that pre-selects "the recommended one", or
   * prints a badge beside it, has no sensible behaviour if two rows claim the
   * title — and a rule stated only as "the first element" in a doc comment is
   * one a later comparator change can quietly break. Both halves are asserted
   * (which vehicle, and that it is the only one) because either alone passes
   * against an implementation that is wrong in the other direction.
   */
  test("exactly one vehicle is recommended across a mixed fleet", () => {
    const ranked = rankDispatchVehicles([
      rankable("REFUSED-350", 3500, { verdict: UNDER_CLASS }),
      rankable("BIG-500", 5000),
      rankable("NODRV-050", 500, { pairedDriver: null }),
      rankable("MID-350", 3500),
    ]);

    expect(recommendedPlates(ranked)).toEqual(["MID-350"]);
    expect(ranked.filter((v) => v.recommended)).toHaveLength(1);
    expect(ranked.filter((v) => !v.recommended)).toHaveLength(3);
  });

  /**
   * And no vehicle at all when nothing can be dispatched — a fleet where every
   * truck is refused, driverless, or both.
   *
   * This is the case a "recommend index 0" implementation gets wrong, and gets
   * wrong in the worst available direction: it would badge the leading *unfit*
   * vehicle as the platform's suggestion, which is both false and the one thing
   * a recommendation must never be. A company whose whole fleet is under review
   * sees no suggestion rather than a confident wrong one.
   */
  test("nothing is recommended when nothing is dispatchable", () => {
    const ranked = rankDispatchVehicles([
      rankable("REFUSED-050", 500, { verdict: UNDER_CLASS }),
      rankable("NODRV-350", 3500, { pairedDriver: null }),
      rankable("BOTH-500", 5000, {
        verdict: UNDER_CLASS,
        pairedDriver: null,
      }),
    ]);

    expect(recommendedPlates(ranked)).toEqual([]);
    expect(ranked.every((v) => v.recommended === false)).toBe(true);
    // Nothing was dropped: an empty recommendation is not an empty picker, and a
    // dispatcher still needs to read why each of these is unavailable.
    expect(ranked).toHaveLength(3);
  });
});

/* -------------------------------------------------------------------------- */
/* H9 — the ordering itself                                                    */
/* -------------------------------------------------------------------------- */

test.describe("dispatch ordering", () => {
  /**
   * Two trucks of one class that both declared nothing resolve to identical
   * capabilities, so payload cannot separate them and something else must — or
   * the recommendation flips between two equally good vehicles from one poll of
   * the dialog to the next, and a dispatcher learns not to trust a suggestion
   * that had not actually changed.
   *
   * The plate is that something else, compared with `localeCompare` rather than
   * `<` for the reason `claimCandidatesFor` uses it: plates on this platform are
   * not ASCII. The input is in the opposite order to the answer, so a comparator
   * that returned `0` on the tie would fail here rather than pass by luck.
   */
  test("equal payloads are broken on the plate, not on input order", () => {
    const ranked = rankDispatchVehicles([
      rankable("ZZ-999", 3500),
      rankable("AA-111", 3500),
    ]);

    expect(ranked.map((v) => v.plateNumber)).toEqual(["AA-111", "ZZ-999"]);
    expect(recommendedPlates(ranked)).toEqual(["AA-111"]);
  });

  /**
   * The tail — everything not dispatchable — keeps the order it arrived in,
   * which for the options endpoint is the fleet newest-first.
   *
   * It is a documented guarantee rather than an accident of the implementation,
   * and it rests on `Array.prototype.sort` being stable (specified since ES2019;
   * this project targets ES2022). The four tail rows below are deliberately
   * *not* in payload order and mix both reasons for being there, so any
   * accidental sub-sort — floating the driverless above the refused, ranking the
   * refusals by size — shows up as a reordering rather than being masked by a
   * tail that happened to already be sorted.
   */
  test("the non-dispatchable tail keeps its input order", () => {
    const ranked = rankDispatchVehicles([
      rankable("TAIL-A", 5000, { verdict: UNDER_CLASS }),
      rankable("HEAD-B", 3500),
      rankable("TAIL-C", 500, { pairedDriver: null }),
      rankable("TAIL-D", 4000, { verdict: UNDER_CLASS, pairedDriver: null }),
      rankable("HEAD-A", 1000),
      rankable("TAIL-E", 2000, { pairedDriver: null }),
    ]);

    expect(ranked.map((v) => v.plateNumber)).toEqual([
      // Dispatchable, smallest payload first.
      "HEAD-A",
      "HEAD-B",
      // Then the rest, exactly as given.
      "TAIL-A",
      "TAIL-C",
      "TAIL-D",
      "TAIL-E",
    ]);
    expect(recommendedPlates(ranked)).toEqual(["HEAD-A"]);
  });

  /**
   * The function is pure: it neither reorders the array it was handed nor writes
   * `recommended` onto the caller's objects.
   *
   * Both halves matter. The options route passes an array it built and would not
   * notice either mutation, but the ranking is deliberately importable from a
   * client component — that is the whole point of this module carrying no
   * `server-only` and no Prisma — and there the input is routinely derived from
   * props or state. Sorting such an array in place mutates React's data behind
   * its back, producing a render that disagrees with the state that caused it;
   * `claimCandidatesFor` sorts in place only because its `map` had already
   * returned a fresh array, and that reasoning does not transfer to a function
   * handed an array it did not build.
   */
  test("neither reorders nor annotates its input", () => {
    const input: Rankable[] = [
      rankable("BIG-500", 5000),
      rankable("SML-050", 500),
    ];

    const ranked = rankDispatchVehicles(input);

    // The caller's array is untouched, in both membership and order.
    expect(input.map((v) => v.plateNumber)).toEqual(["BIG-500", "SML-050"]);
    expect(ranked).not.toBe(input);
    // And the caller's *elements* are untouched: the flag went onto copies, so
    // nothing upstream acquires a field it never declared.
    expect(input.every((v) => !("recommended" in v))).toBe(true);
    expect(ranked.every((v) => "recommended" in v)).toBe(true);
  });
});
