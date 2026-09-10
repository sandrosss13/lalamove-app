/**
 * Which vehicles may fulfil which bookings — the upgrade-substitution rule, and
 * the two ways it has already been got wrong.
 *
 * `meetsBookedClass`, `offersBodyType`, `specCapability`, `oversizeAxes` and
 * `capabilityOf` decide whether a load appears on a carrier's board, whether a
 * claim stands, and whether a class can be booked at all. They had no test of
 * any kind, and the two defects this file pins had both reached the live fleet:
 * a vehicle refused work in its own class, and an open bed that no registered
 * flatbed could ever clear.
 *
 * **Why this runs with no browser and no database, like
 * `tests/carrier-payload-redaction.spec.ts`.** Every function under test is a
 * pure comparison over plain objects — `src/lib/orders/class-substitution.ts`
 * and `src/lib/orders/vehicle-fit.ts` are deliberately free of `server-only`, of
 * Prisma imports and of Prisma types in their signatures, exactly so that the
 * booking form and the load board can run them client-side. That property is
 * what lets this spec construct a vehicle as an object literal, and it is worth
 * preserving: a Prisma import in either module would turn every assertion below
 * into an integration test.
 *
 * **The catalogue figures below are copied from `prisma/seed.ts`, deliberately
 * and by hand.** Reading them from the seed at test time would make the spec
 * agree with whatever the catalogue happens to say, including after a retune
 * that breaks a rule — and half of what is asserted here is about specific
 * seeded relationships (a Minivan beats an MPV; a Curtainsider does not beat a
 * Flatbed on height). If the catalogue is retuned, these constants are meant to
 * fail and be reviewed, not to follow along.
 */

import { expect, test } from "@playwright/test";

import { oversizeAxes, specCapability } from "@/lib/orders/booking-fit";
import {
  meetsBookedClass,
  offersBodyType,
} from "@/lib/orders/class-substitution";
import {
  capabilityOf,
  classifyFit,
  hasDeclaredEnvelope,
  type LoadDimensions,
} from "@/lib/orders/vehicle-fit";

/* -------------------------------------------------------------------------- */
/* The catalogue, as seeded                                                   */
/* -------------------------------------------------------------------------- */

/** `VehicleTypeSpec.id` is a cuid in the database; any stable string will do here. */
const MINIVAN_ID = "spec_minivan";
const MPV_ID = "spec_mpv";
const BOX_TRUCK_ID = "spec_box_truck";
const REFRIGERATED_TRUCK_ID = "spec_refrigerated_truck";
const FLATBED_ID = "spec_flatbed_truck";
const CURTAINSIDER_ID = "spec_curtainsider_truck";

const MINIVAN_SPEC = {
  maxPayloadKg: 500,
  cargoLengthM: 2.0,
  cargoWidthM: 1.4,
  cargoHeightM: 1.3,
};

const MPV_SPEC = {
  maxPayloadKg: 400,
  cargoLengthM: 1.8,
  cargoWidthM: 1.3,
  cargoHeightM: 1.1,
};

const BOX_TRUCK_SPEC = {
  maxPayloadKg: 3500,
  cargoLengthM: 4.5,
  cargoWidthM: 2.1,
  cargoHeightM: 2.2,
};

const REFRIGERATED_TRUCK_SPEC = {
  maxPayloadKg: 4000,
  cargoLengthM: 4.8,
  cargoWidthM: 2.2,
  cargoHeightM: 2.2,
};

/** The open-bed class. `cargoHeightM: 0` is the "no height limit" sentinel. */
const FLATBED_SPEC = {
  maxPayloadKg: 5000,
  cargoLengthM: 5.0,
  cargoWidthM: 2.3,
  cargoHeightM: 0,
};

const CURTAINSIDER_SPEC = {
  maxPayloadKg: 6000,
  cargoLengthM: 6.0,
  cargoWidthM: 2.4,
  cargoHeightM: 2.4,
};

/** A `Vehicle` row that declares nothing, so every axis falls back to its class. */
const UNDECLARED_VEHICLE = {
  payloadKg: null,
  cargoLengthM: null,
  cargoWidthM: null,
  cargoHeightM: null,
};

/* -------------------------------------------------------------------------- */
/* H1 — a vehicle may always serve its own class                              */
/* -------------------------------------------------------------------------- */

test.describe("meetsBookedClass: a vehicle's own class", () => {
  /**
   * The regression this file exists for.
   *
   * `capabilityOf` prefers the carrier's declared columns over the catalogue's,
   * and registration floors only `payloadKg` against the class spec — the three
   * dimensions are stored verbatim
   * (`src/lib/fleet-onboarding/vehicle-validation.ts` asks only that each be
   * greater than zero) and the company onboarding path floors nothing at all. So
   * a registered vehicle can resolve *below* the class it is approved to operate
   * in, and comparing figures alone then refuses it work in that class: on the
   * live fleet, a Minivan declaring 1.9 x 1.22 x 1.21 against its class's
   * 2.0 x 1.4 x 1.3 failed all three dimensions.
   *
   * The consequences ran further than one refused claim. `GET /api/loads` hides
   * such a load from that carrier, all three claim routes refuse it, and
   * `src/lib/orders/class-serviceability.ts` asks this same question of the
   * whole fleet — so a class whose only registered vehicles under-declare is
   * reported unserviceable and clients are refused at booking for freight
   * carriers actively run.
   */
  test("admits a vehicle whose declared width is below its own class spec", () => {
    const underDeclaredMinivan = capabilityOf(
      // DD111DD on the live fleet: payload at the class floor, every dimension
      // under it.
      {
        payloadKg: 500,
        cargoLengthM: 1.9,
        cargoWidthM: 1.22,
        cargoHeightM: 1.21,
      },
      MINIVAN_SPEC,
    );

    // The premise, asserted rather than assumed: this vehicle really is smaller
    // than its own class on the axis the failure was reported on.
    expect(underDeclaredMinivan.widthM).toBeLessThan(MINIVAN_SPEC.cargoWidthM);

    expect(
      meetsBookedClass(
        {
          vehicleTypeSpecId: MINIVAN_ID,
          capability: underDeclaredMinivan,
        },
        {
          vehicleTypeSpecId: MINIVAN_ID,
          floor: specCapability(MINIVAN_SPEC),
        },
      ),
    ).toBe(true);
  });

  test("admits a vehicle whose declared height is 1 cm below its own class spec", () => {
    // DD555DD on the live fleet: a Refrigerated Truck declaring a 2.19 m hold
    // against a class figure of 2.20. Halving refrigerated supply on a
    // rounding-scale difference is the shape of failure the identity clause
    // exists to make impossible.
    const underDeclaredReefer = capabilityOf(
      {
        payloadKg: 4000,
        cargoLengthM: 4.8,
        cargoWidthM: 2.2,
        cargoHeightM: 2.19,
      },
      REFRIGERATED_TRUCK_SPEC,
    );

    expect(
      meetsBookedClass(
        {
          vehicleTypeSpecId: REFRIGERATED_TRUCK_ID,
          capability: underDeclaredReefer,
        },
        {
          vehicleTypeSpecId: REFRIGERATED_TRUCK_ID,
          floor: specCapability(REFRIGERATED_TRUCK_SPEC),
        },
      ),
    ).toBe(true);
  });

  test("does not extend that pass to another class with the same figures", () => {
    // The identity clause must admit a vehicle to *its own* class and to nothing
    // else on those grounds. Same vehicle, same numbers, a different booked
    // class id whose floor it does not clear: refused. Without this, a fix for
    // the case above could just as well have been a loosened comparison, which
    // would let a genuinely too-small vehicle take a booking it does not meet.
    const underDeclaredMinivan = capabilityOf(
      {
        payloadKg: 500,
        cargoLengthM: 1.9,
        cargoWidthM: 1.22,
        cargoHeightM: 1.21,
      },
      MINIVAN_SPEC,
    );

    expect(
      meetsBookedClass(
        {
          vehicleTypeSpecId: MINIVAN_ID,
          capability: underDeclaredMinivan,
        },
        // The MPV floor is 1.8 x 1.3 x 1.1; this Minivan is 1.22 m wide.
        { vehicleTypeSpecId: MPV_ID, floor: specCapability(MPV_SPEC) },
      ),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Upgrades and downgrades                                                    */
/* -------------------------------------------------------------------------- */

test.describe("meetsBookedClass: upgrades and downgrades", () => {
  test("a Minivan may fulfil an MPV booking", () => {
    // The incident that produced the substitution rule. A Minivan (500 kg,
    // 2.0 x 1.4 x 1.3) beats an MPV (400 kg, 1.8 x 1.3 x 1.1) on every axis, and
    // no MPV is registered anywhere on the platform, so the MPV booking was
    // claimable by nobody until this stopped being an identity test.
    expect(
      meetsBookedClass(
        {
          vehicleTypeSpecId: MINIVAN_ID,
          capability: capabilityOf(UNDECLARED_VEHICLE, MINIVAN_SPEC),
        },
        { vehicleTypeSpecId: MPV_ID, floor: specCapability(MPV_SPEC) },
      ),
    ).toBe(true);
  });

  test("an MPV may not fulfil a Minivan booking", () => {
    // The other direction is the whole reason there is a floor. A client who
    // chose, was quoted for and paid for a Minivan must not silently receive a
    // smaller vehicle because the cargo happens to be light.
    expect(
      meetsBookedClass(
        {
          vehicleTypeSpecId: MPV_ID,
          capability: capabilityOf(UNDECLARED_VEHICLE, MPV_SPEC),
        },
        { vehicleTypeSpecId: MINIVAN_ID, floor: specCapability(MINIVAN_SPEC) },
      ),
    ).toBe(false);
  });

  test("refuses a vehicle that beats the floor on three axes and misses on one", () => {
    // No compensation between axes: being enormous in one direction is not
    // evidence about another, and a client who booked a class was promised the
    // whole envelope rather than its largest number.
    const longButNarrow = capabilityOf(
      { payloadKg: 9000, cargoLengthM: 12, cargoWidthM: 2.0, cargoHeightM: 3 },
      BOX_TRUCK_SPEC,
    );

    expect(
      meetsBookedClass(
        { vehicleTypeSpecId: CURTAINSIDER_ID, capability: longButNarrow },
        // Box Truck is 2.1 m wide; this vehicle is 2.0 m.
        {
          vehicleTypeSpecId: BOX_TRUCK_ID,
          floor: specCapability(BOX_TRUCK_SPEC),
        },
      ),
    ).toBe(false);
  });

  test("a class exactly at the floor qualifies — bounds are inclusive", () => {
    expect(
      meetsBookedClass(
        {
          vehicleTypeSpecId: CURTAINSIDER_ID,
          capability: capabilityOf(UNDECLARED_VEHICLE, BOX_TRUCK_SPEC),
        },
        {
          vehicleTypeSpecId: BOX_TRUCK_ID,
          floor: specCapability(BOX_TRUCK_SPEC),
        },
      ),
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* H2 — the open-bed sentinel and its infinite floor                          */
/* -------------------------------------------------------------------------- */

test.describe("the open-bed height sentinel", () => {
  test("a flatbed booking's floor is unlimited in height", () => {
    // `specCapability` routes through `capabilityOf`, the one place
    // `cargoHeightM === 0` is translated. Read literally the floor would be zero
    // — the loosest in the catalogue rather than the strictest — and every
    // vehicle on the platform would clear it.
    expect(specCapability(FLATBED_SPEC).heightM).toBe(Number.POSITIVE_INFINITY);
  });

  test("an onboarded flatbed is unlimited in height despite declaring one", () => {
    // The H2 defect. Fleet onboarding requires every dimension to be greater
    // than zero, so a carrier registering a flatbed has to type *some* height —
    // there is no way to express "open bed" on the vehicle row. While that
    // figure was preferred over the class's sentinel, an onboarded flatbed
    // resolved to a finite height and no finite height clears an infinite floor:
    // it could not claim a flatbed booking, and could not make the flatbed class
    // serviceable, so whether flatbed freight worked at all depended on which
    // registration route the carrier had used.
    const onboardedFlatbed = capabilityOf(
      {
        payloadKg: 5000,
        cargoLengthM: 5.0,
        cargoWidthM: 2.3,
        cargoHeightM: 2.5,
      },
      FLATBED_SPEC,
    );

    expect(onboardedFlatbed.heightM).toBe(Number.POSITIVE_INFINITY);

    expect(
      meetsBookedClass(
        // A *different* class id, so this asserts the height handling rather
        // than the identity clause: the numbers alone must clear the floor.
        {
          vehicleTypeSpecId: "spec_some_other_open_bed",
          capability: onboardedFlatbed,
        },
        { vehicleTypeSpecId: FLATBED_ID, floor: specCapability(FLATBED_SPEC) },
      ),
    ).toBe(true);
  });

  test("a Curtainsider may not fulfil a flatbed booking", () => {
    // Bigger on payload, length and width, and `OPEN_CHASSIS` among its bodies —
    // and still refused, because 2.4 m is not "no limit". A flatbed client may
    // be shipping something that does not go under a roof at all, and the
    // platform has no figure that says otherwise. Documented as a consequence
    // rather than special-cased; asserted here so it stays deliberate.
    expect(
      meetsBookedClass(
        {
          vehicleTypeSpecId: CURTAINSIDER_ID,
          capability: capabilityOf(UNDECLARED_VEHICLE, CURTAINSIDER_SPEC),
        },
        { vehicleTypeSpecId: FLATBED_ID, floor: specCapability(FLATBED_SPEC) },
      ),
    ).toBe(false);
  });

  test("a load taller than any enclosed hold is bookable on a flatbed", () => {
    // `CARGO_MEASUREMENT_BOUNDS.cargoHeightM.max` is 4 m rather than the 2.7 m of
    // the tallest enclosed hold, and `src/lib/cargo.ts` justifies that ceiling by
    // this exact case. If the flatbed floor ever stops being infinite, every
    // load between 2.7 m and 4 m becomes unbookable on every class in the
    // catalogue and this assertion is what says so.
    const tallLoad: LoadDimensions = {
      weightKg: 2000,
      lengthM: 4,
      widthM: 2,
      heightM: 3.2,
    };

    expect(oversizeAxes(tallLoad, specCapability(FLATBED_SPEC))).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Body type                                                                  */
/* -------------------------------------------------------------------------- */

test.describe("offersBodyType", () => {
  test("a null requirement admits every class", () => {
    // `Order.bodyType` is nullable and most historical orders carry no value.
    // A null is "the client did not ask for a particular load space", never
    // "the client asked for none", so it must exclude nothing.
    expect(offersBodyType(["DRY_BOX"], null)).toBe(true);
    expect(offersBodyType([], null)).toBe(true);
  });

  test("a dry box does not fulfil a refrigerated booking", () => {
    // Not subsumed by the capacity rule: no amount of payload makes a hold cold.
    expect(offersBodyType(["DRY_BOX"], "REFRIGERATED")).toBe(false);
  });

  test("a reefer running its box dry fulfils a dry booking", () => {
    expect(offersBodyType(["REFRIGERATED", "DRY_BOX"], "DRY_BOX")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* An undeclared envelope is not a refusal                                    */
/* -------------------------------------------------------------------------- */

test.describe("an undeclared cargo envelope", () => {
  /**
   * Every order placed before the cargo columns existed has all four null and
   * nothing backfills one. No claim path in the codebase refuses a load on that
   * ground, so nothing may hide one on it or report it as oversized either —
   * a load nobody measured is not a load that is too big, and the board once
   * told drivers otherwise about the entire pre-cutover book.
   */
  const UNMEASURED: LoadDimensions = {
    weightKg: null,
    lengthM: null,
    widthM: null,
    heightM: null,
  };

  test("is not a declared envelope", () => {
    expect(hasDeclaredEnvelope(UNMEASURED)).toBe(false);
  });

  test("classifies as UNDECLARED rather than DOES_NOT_FIT", () => {
    // Against the smallest class in the catalogue: however little capacity is
    // offered, an unmeasured load has not been shown to exceed it.
    expect(classifyFit(UNMEASURED, specCapability(MPV_SPEC))).toBe(
      "UNDECLARED",
    );
  });

  test("reports no oversize axis at booking", () => {
    expect(oversizeAxes(UNMEASURED, specCapability(MPV_SPEC))).toEqual([]);
  });

  test("a partially declared load is still measured on the axes it gives", () => {
    // The other half of the same rule: "you did not tell us the height" is not
    // evidence that the cargo is too tall, but a declared 15 m length against a
    // 4.5 m class is still a refusal — that is the incident this whole change
    // set began with.
    const partial: LoadDimensions = {
      weightKg: null,
      lengthM: 15,
      widthM: null,
      heightM: null,
    };

    expect(oversizeAxes(partial, specCapability(BOX_TRUCK_SPEC))).toEqual([
      "length",
    ]);
  });
});
