/**
 * `planLoad`, `assessFit` and `recommendVehicles` — how a client's item list
 * becomes the four cargo figures, a category, a body, and a recommended
 * vehicle class.
 *
 * `src/lib/orders/load-plan.ts` is read by the booking form to recommend a
 * vehicle and by `POST /api/orders` to re-derive what goes on the order, so
 * every rule asserted here is a rule both sides apply. Three of them are the
 * kind that look like details and are not: the category tie-break (a paint
 * bucket must not turn a home move into a heavy-truck job), the flatbed height
 * sentinel (which `booking-fit.ts` warns has already been got wrong once), and
 * the hard/soft split (an estimate may steer a recommendation but must never
 * refuse a load the server would accept).
 *
 * **Why this runs with no browser and no database**, exactly as
 * `tests/dispatch-fit.spec.ts` does: the module is free of `server-only`, of
 * Prisma imports and of Prisma types in its signatures, which is what lets
 * every line and every vehicle class below be an object literal. The one
 * Prisma import here is type-only and erased; it pins the module's hand-written
 * body union to the schema's `ChassisType`.
 *
 * **The vehicle catalogue and the item figures are copied by hand** — the
 * vehicles from `prisma/seed.ts`, the items from the catalogue table in
 * `specs/goods-first-booking/tasks/task-01-schema-and-catalogue.md`. The same
 * deliberate duplication `tests/class-substitution.spec.ts` explains: if
 * either is retuned these constants are meant to fail and be reviewed, not to
 * follow along.
 */

import { expect, test } from "@playwright/test";
import type { ChassisType } from "@prisma/client";

import { CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES } from "@/lib/cargo";
import {
  assessFit,
  customLine,
  palletLine,
  planLoad,
  recommendVehicles,
  summariseItems,
  OPEN_BED_NOTIONAL_HEIGHT_M,
  PACKING_FACTOR,
  PALLET_WEIGHT_PRESETS,
  type ChassisTypeKey,
  type LoadLine,
  type LoadPlan,
} from "@/lib/orders/load-plan";

/* -------------------------------------------------------------------------- */
/* Type-level drift check                                                     */
/* -------------------------------------------------------------------------- */

// Both directions: a body added to the schema, or a typo here, fails typecheck.
const chassisFromPrisma: ChassisTypeKey = "DRY_BOX" as ChassisType;
const chassisToPrisma: ChassisType = "DRY_BOX" as ChassisTypeKey;
void chassisFromPrisma;
void chassisToPrisma;

/* -------------------------------------------------------------------------- */
/* The vehicle catalogue, as seeded (cheapest-first by base fare)             */
/* -------------------------------------------------------------------------- */

type FixtureSpec = {
  code: string;
  category: "MEDIUM_DUTY" | "HEAVY_DUTY";
  maxPayloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
  bodyTypes: ChassisTypeKey[];
  baseFare: number;
};

const CATALOGUE: FixtureSpec[] = [
  {
    code: "MINIVAN",
    category: "MEDIUM_DUTY",
    maxPayloadKg: 500,
    cargoLengthM: 2.0,
    cargoWidthM: 1.4,
    cargoHeightM: 1.3,
    bodyTypes: ["DRY_BOX"],
    baseFare: 8,
  },
  {
    code: "MPV",
    category: "MEDIUM_DUTY",
    maxPayloadKg: 400,
    cargoLengthM: 1.8,
    cargoWidthM: 1.3,
    cargoHeightM: 1.1,
    bodyTypes: ["DRY_BOX"],
    baseFare: 7,
  },
  {
    code: "CARGO_VAN",
    category: "MEDIUM_DUTY",
    maxPayloadKg: 1000,
    cargoLengthM: 2.5,
    cargoWidthM: 1.6,
    cargoHeightM: 1.6,
    bodyTypes: ["DRY_BOX"],
    baseFare: 10,
  },
  {
    code: "CLOSED_BOX_VAN",
    category: "MEDIUM_DUTY",
    maxPayloadKg: 1200,
    cargoLengthM: 3.0,
    cargoWidthM: 1.7,
    cargoHeightM: 1.8,
    bodyTypes: ["DRY_BOX"],
    baseFare: 12,
  },
  {
    code: "REFRIGERATED_VAN",
    category: "MEDIUM_DUTY",
    maxPayloadKg: 1000,
    cargoLengthM: 2.8,
    cargoWidthM: 1.6,
    cargoHeightM: 1.6,
    bodyTypes: ["REFRIGERATED", "DRY_BOX"],
    baseFare: 14,
  },
  {
    code: "BOX_TRUCK",
    category: "HEAVY_DUTY",
    maxPayloadKg: 3500,
    cargoLengthM: 4.5,
    cargoWidthM: 2.1,
    cargoHeightM: 2.2,
    bodyTypes: ["DRY_BOX"],
    baseFare: 25,
  },
  // Open bed: `cargoHeightM: 0` is the "no height limit" sentinel.
  {
    code: "FLATBED_TRUCK",
    category: "HEAVY_DUTY",
    maxPayloadKg: 5000,
    cargoLengthM: 5.0,
    cargoWidthM: 2.3,
    cargoHeightM: 0,
    bodyTypes: ["OPEN_CHASSIS"],
    baseFare: 28,
  },
  {
    code: "CURTAINSIDER_TRUCK",
    category: "HEAVY_DUTY",
    maxPayloadKg: 6000,
    cargoLengthM: 6.0,
    cargoWidthM: 2.4,
    cargoHeightM: 2.4,
    bodyTypes: ["DRY_BOX", "OPEN_CHASSIS"],
    baseFare: 32,
  },
  {
    code: "REFRIGERATED_TRUCK",
    category: "HEAVY_DUTY",
    maxPayloadKg: 4000,
    cargoLengthM: 4.8,
    cargoWidthM: 2.2,
    cargoHeightM: 2.2,
    bodyTypes: ["REFRIGERATED", "DRY_BOX"],
    baseFare: 30,
  },
  {
    code: "LARGE_FREIGHT_TRUCK",
    category: "HEAVY_DUTY",
    maxPayloadKg: 10000,
    cargoLengthM: 8.0,
    cargoWidthM: 2.5,
    cargoHeightM: 2.6,
    bodyTypes: ["DRY_BOX"],
    baseFare: 45,
  },
  {
    code: "TRAILER_TRUCK",
    category: "HEAVY_DUTY",
    maxPayloadKg: 24000,
    cargoLengthM: 13.6,
    cargoWidthM: 2.48,
    cargoHeightM: 2.7,
    bodyTypes: ["DRY_BOX"],
    baseFare: 67.5,
  },
];

function spec(code: string): FixtureSpec {
  const found = CATALOGUE.find((entry) => entry.code === code);
  if (!found) {
    throw new Error(`No fixture spec ${code}`);
  }
  return found;
}

/**
 * What the booking form hands `recommendVehicles`: cheapest-first, filtered to
 * the plan's eligible vehicle categories. (Every class is treated as
 * serviceable here; serviceability is the caller's filter, not under test.)
 */
function eligibleCheapestFirst(plan: LoadPlan): FixtureSpec[] {
  const allowed: readonly string[] =
    CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[plan.cargoCategory];
  return CATALOGUE.filter((entry) => allowed.includes(entry.category)).sort(
    (a, b) => a.baseFare - b.baseFare,
  );
}

function recommend(lines: LoadLine[]) {
  const plan = mustPlan(lines);
  if (plan.body.kind !== "derived") {
    throw new Error("expected a derived body");
  }
  return {
    plan,
    ...recommendVehicles(plan, eligibleCheapestFirst(plan), plan.body.body),
  };
}

function mustPlan(lines: LoadLine[]): LoadPlan {
  const plan = planLoad(lines);
  if (!plan) {
    throw new Error("expected a plan");
  }
  return plan;
}

function describePlan(plan: LoadPlan): string {
  const e = plan.envelope;
  return (
    `${plan.totalWeightKg} kg, ${plan.packedVolumeM3.toFixed(2)} m³ packed, ` +
    `${plan.floorAreaM2.toFixed(2)} m² floor, envelope ${e.lengthM}×${e.widthM}×${e.heightM}, ` +
    `${plan.cargoCategory}`
  );
}

/* -------------------------------------------------------------------------- */
/* Catalogue items (task-01 figures)                                          */
/* -------------------------------------------------------------------------- */

function item(
  overrides: Partial<LoadLine> &
    Pick<
      LoadLine,
      "unitWeightKg" | "lengthM" | "widthM" | "heightM" | "cargoCategory"
    >,
  quantity = 1,
): LoadLine {
  return {
    quantity,
    stackable: true,
    needsTwoPeople: false,
    requiredBody: null,
    handlingTags: [],
    ...overrides,
  };
}

const BOX_MEDIUM = (qty: number) =>
  item(
    {
      unitWeightKg: 15,
      lengthM: 0.5,
      widthM: 0.4,
      heightM: 0.4,
      cargoCategory: "RETAIL_STOCK",
    },
    qty,
  );
const SOFA_3_SEAT = () =>
  item({
    unitWeightKg: 60,
    lengthM: 2.1,
    widthM: 0.95,
    heightM: 0.85,
    cargoCategory: "FURNITURE_FURNISHINGS",
    stackable: false,
    needsTwoPeople: true,
  });
const FRIDGE_DOUBLE = () =>
  item({
    unitWeightKg: 110,
    lengthM: 0.9,
    widthM: 0.75,
    heightM: 1.8,
    cargoCategory: "APPLIANCES",
    stackable: false,
    needsTwoPeople: true,
    handlingTags: ["UPRIGHT_ONLY", "HEAVY_ITEM"],
  });
const WARDROBE_2_DOOR = () =>
  item({
    unitWeightKg: 80,
    lengthM: 2.0,
    widthM: 1.0,
    heightM: 0.6,
    cargoCategory: "FURNITURE_FURNISHINGS",
    stackable: false,
    needsTwoPeople: true,
  });
const CEMENT_BAG_25 = (qty: number) =>
  item(
    {
      unitWeightKg: 25,
      lengthM: 0.6,
      widthM: 0.4,
      heightM: 0.12,
      cargoCategory: "CONSTRUCTION_MATERIALS",
    },
    qty,
  );
const PAINT_BUCKET = () =>
  item({
    unitWeightKg: 15,
    lengthM: 0.35,
    widthM: 0.35,
    heightM: 0.4,
    cargoCategory: "RETAIL_STOCK",
  });
const TIMBER_LENGTH = () =>
  item({
    unitWeightKg: 15,
    lengthM: 6.0,
    widthM: 0.15,
    heightM: 0.1,
    cargoCategory: "CONSTRUCTION_MATERIALS",
  });
const REBAR_BUNDLE = () =>
  item({
    unitWeightKg: 100,
    lengthM: 6.0,
    widthM: 0.2,
    heightM: 0.2,
    cargoCategory: "CONSTRUCTION_MATERIALS",
    requiredBody: "OPEN_CHASSIS",
    handlingTags: ["HEAVY_ITEM"],
  });
const CHILLED_CRATE = (qty: number) =>
  item(
    {
      unitWeightKg: 15,
      lengthM: 0.6,
      widthM: 0.4,
      heightM: 0.3,
      cargoCategory: "RETAIL_STOCK",
      requiredBody: "REFRIGERATED",
      handlingTags: ["COLD_CHAIN"],
    },
    qty,
  );

/* -------------------------------------------------------------------------- */
/* planLoad                                                                   */
/* -------------------------------------------------------------------------- */

test.describe("planLoad", () => {
  test("an empty list has no plan", () => {
    expect(planLoad([])).toBeNull();
  });

  test("weight, volume and floor area sum by quantity", () => {
    const plan = mustPlan([BOX_MEDIUM(10), SOFA_3_SEAT()]);

    expect(plan.totalWeightKg).toBe(210);
    expect(plan.itemVolumeM3).toBeCloseTo(10 * 0.08 + 2.1 * 0.95 * 0.85, 9);
    expect(plan.packedVolumeM3).toBeCloseTo(
      plan.itemVolumeM3 * PACKING_FACTOR,
      9,
    );
    // Only the sofa is non-stackable.
    expect(plan.floorAreaM2).toBeCloseTo(2.1 * 0.95, 9);
    expect(plan.envelope.weightKg).toBe(210);
  });

  test("the envelope is the per-axis max after length ≥ width normalisation", () => {
    const plan = mustPlan([
      // Listed width-first: 0.3 × 1.5 is a 1.5 m long item.
      item({
        unitWeightKg: 5,
        lengthM: 0.3,
        widthM: 1.5,
        heightM: 0.2,
        cargoCategory: "RETAIL_STOCK",
      }),
      item({
        unitWeightKg: 5,
        lengthM: 1.0,
        widthM: 0.9,
        heightM: 1.1,
        cargoCategory: "RETAIL_STOCK",
      }),
    ]);

    expect(plan.envelope).toEqual({
      weightKg: 10,
      lengthM: 1.5,
      widthM: 0.9,
      heightM: 1.1,
    });
  });

  test("handling tags are a union in enum order, and crew follows needsTwoPeople", () => {
    const plan = mustPlan([REBAR_BUNDLE(), FRIDGE_DOUBLE(), CHILLED_CRATE(1)]);
    expect(plan.handlingTags).toEqual([
      "COLD_CHAIN",
      "UPRIGHT_ONLY",
      "HEAVY_ITEM",
    ]);
    expect(plan.suggestedCrew).toBe(2);
    expect(mustPlan([BOX_MEDIUM(3)]).suggestedCrew).toBe(1);
  });
});

test.describe("derived cargo category", () => {
  test("furniture + building materials ⇒ CONSTRUCTION_MATERIALS (heavy-only is narrower)", () => {
    // Even when the furniture outweighs the cement.
    const plan = mustPlan([SOFA_3_SEAT(), CEMENT_BAG_25(1)]);
    expect(plan.cargoCategory).toBe("CONSTRUCTION_MATERIALS");
  });

  test("a paint bucket + sofa ⇒ FURNITURE_FURNISHINGS, not CONSTRUCTION_MATERIALS", () => {
    const plan = mustPlan([PAINT_BUCKET(), SOFA_3_SEAT()]);
    expect(plan.cargoCategory).toBe("FURNITURE_FURNISHINGS");
  });

  test("equal-width categories tie-break on weight, then enum order", () => {
    // 300 kg of boxes outweigh 110 kg of fridge and 60 kg of sofa.
    expect(
      mustPlan([FRIDGE_DOUBLE(), SOFA_3_SEAT(), BOX_MEDIUM(20)]).cargoCategory,
    ).toBe("RETAIL_STOCK");
    // Equal weight: FURNITURE_FURNISHINGS precedes RETAIL_STOCK in the enum.
    expect(
      mustPlan([
        item({
          unitWeightKg: 10,
          lengthM: 1,
          widthM: 1,
          heightM: 1,
          cargoCategory: "RETAIL_STOCK",
        }),
        item({
          unitWeightKg: 10,
          lengthM: 1,
          widthM: 1,
          heightM: 1,
          cargoCategory: "FURNITURE_FURNISHINGS",
        }),
      ]).cargoCategory,
    ).toBe("FURNITURE_FURNISHINGS");
  });
});

test.describe("derived body", () => {
  test("nothing forced ⇒ DRY_BOX", () => {
    expect(mustPlan([BOX_MEDIUM(1)]).body).toEqual({
      kind: "derived",
      body: "DRY_BOX",
    });
  });

  test("chilled ⇒ REFRIGERATED", () => {
    expect(mustPlan([CHILLED_CRATE(4), BOX_MEDIUM(2)]).body).toEqual({
      kind: "derived",
      body: "REFRIGERATED",
    });
  });

  test("rebar ⇒ OPEN_CHASSIS", () => {
    expect(mustPlan([REBAR_BUNDLE()]).body).toEqual({
      kind: "derived",
      body: "OPEN_CHASSIS",
    });
  });

  test("chilled + rebar ⇒ conflict, bodies in enum order", () => {
    expect(mustPlan([REBAR_BUNDLE(), CHILLED_CRATE(1)]).body).toEqual({
      kind: "conflict",
      bodies: ["REFRIGERATED", "OPEN_CHASSIS"],
    });
  });

  test("a CHILLED pallet line ⇒ REFRIGERATED with the cold-chain tag", () => {
    const plan = mustPlan([palletLine("EUR", "CHILLED", 2, 1.2, 400)]);
    expect(plan.body).toEqual({ kind: "derived", body: "REFRIGERATED" });
    expect(plan.handlingTags).toEqual(["COLD_CHAIN"]);
    expect(plan.cargoCategory).toBe("RETAIL_STOCK");
  });

  test("a conflicted plan offers no body to any class", () => {
    const plan = mustPlan([REBAR_BUNDLE(), CHILLED_CRATE(1)]);
    for (const entry of CATALOGUE) {
      expect(assessFit(plan, entry).bodyOk).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Pallet and custom lines                                                    */
/* -------------------------------------------------------------------------- */

test.describe("palletLine and customLine", () => {
  test("33 heavy pallets ⇒ overMaximum", () => {
    const plan = mustPlan([
      palletLine("EUR", "BUILDING", 33, 1.2, PALLET_WEIGHT_PRESETS.HEAVY),
    ]);
    expect(plan.totalWeightKg).toBe(26_400);
    expect(plan.overMaximum).toBe(true);
    expect(plan.cargoCategory).toBe("CONSTRUCTION_MATERIALS");
  });

  test("a full trailer of medium pallets is not overMaximum", () => {
    const plan = mustPlan([
      palletLine("EUR", "GENERAL", 33, 1.2, PALLET_WEIGHT_PRESETS.MEDIUM),
    ]);
    expect(plan.overMaximum).toBe(false);
  });

  test("pallets are not stackable and are clamped to the bounds", () => {
    const line = palletLine("INDUSTRIAL", "INDUSTRIAL", 50, 9, 99_999);
    expect(line).toMatchObject({
      quantity: 33,
      lengthM: 1.2,
      widthM: 1.0,
      heightM: 4,
      unitWeightKg: 24_000,
      stackable: false,
      cargoCategory: "INDUSTRIAL_SUPPLIES",
    });
  });

  test("custom presets: stackable unless XL, booked as furniture", () => {
    expect(customLine({ quantity: 2, preset: "M" })).toMatchObject({
      quantity: 2,
      lengthM: 1.0,
      widthM: 0.6,
      heightM: 0.6,
      unitWeightKg: 30,
      stackable: true,
      cargoCategory: "FURNITURE_FURNISHINGS",
    });
    expect(customLine({ quantity: 1, preset: "XL" }).stackable).toBe(false);
  });

  test("custom exact figures are normalised and clamped", () => {
    expect(
      customLine({
        quantity: 0,
        exact: { lengthM: 0.4, widthM: 3, heightM: 0.01, weightKg: 0 },
      }),
    ).toMatchObject({
      quantity: 1,
      lengthM: 3,
      widthM: 0.4,
      heightM: 0.1,
      unitWeightKg: 1,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* assessFit                                                                  */
/* -------------------------------------------------------------------------- */

test.describe("assessFit", () => {
  test("flatbed height sentinel: any height fits on height, and volume uses 2.0 m", () => {
    const tall = item({
      unitWeightKg: 50,
      lengthM: 1,
      widthM: 1,
      heightM: 3.5,
      cargoCategory: "CONSTRUCTION_MATERIALS",
      requiredBody: "OPEN_CHASSIS",
    });
    const flatbed = spec("FLATBED_TRUCK");
    const flatbedVolume = 5.0 * 2.3 * OPEN_BED_NOTIONAL_HEIGHT_M; // 23 m³

    const fits = assessFit(mustPlan([tall]), flatbed);
    expect(fits.hardAxes).toEqual([]);
    expect(fits.verdict).toBe("fits");

    // Packed volume just under / just over 23 m³ of notional bed.
    const cube = (qty: number) =>
      item(
        {
          unitWeightKg: 10,
          lengthM: 1,
          widthM: 1,
          heightM: 1,
          cargoCategory: "CONSTRUCTION_MATERIALS",
        },
        qty,
      );
    const under = mustPlan([tall, cube(12)]); // (3.5 + 12) × 1.4 = 21.7
    const over = mustPlan([tall, cube(14)]); // (3.5 + 14) × 1.4 = 24.5
    expect(under.packedVolumeM3).toBeLessThan(flatbedVolume);
    expect(over.packedVolumeM3).toBeGreaterThan(flatbedVolume);
    expect(assessFit(under, flatbed).soft).not.toContain("volume");
    expect(assessFit(over, flatbed)).toMatchObject({
      hardAxes: [],
      soft: ["volume"],
      verdict: "may_not_fit",
    });
  });

  test("a 6 m timber length: Box Truck cannot_fit on length, Curtainsider fits", () => {
    // Asserted on the fit reasons directly, against every class regardless
    // of category, so a category filter cannot make it pass by accident.
    const plan = mustPlan([TIMBER_LENGTH()]);

    const boxTruck = assessFit(plan, spec("BOX_TRUCK"));
    expect(boxTruck.hardAxes).toEqual(["length"]);
    expect(boxTruck.verdict).toBe("cannot_fit");

    expect(assessFit(plan, spec("CURTAINSIDER_TRUCK")).verdict).toBe("fits");

    const verdicts = Object.fromEntries(
      CATALOGUE.map((entry) => [entry.code, assessFit(plan, entry).verdict]),
    );
    expect(verdicts).toEqual({
      MINIVAN: "cannot_fit",
      MPV: "cannot_fit",
      CARGO_VAN: "cannot_fit",
      CLOSED_BOX_VAN: "cannot_fit",
      REFRIGERATED_VAN: "cannot_fit",
      BOX_TRUCK: "cannot_fit",
      FLATBED_TRUCK: "cannot_fit", // 5.0 m, and no dry box
      CURTAINSIDER_TRUCK: "fits",
      REFRIGERATED_TRUCK: "cannot_fit",
      LARGE_FREIGHT_TRUCK: "fits",
      TRAILER_TRUCK: "fits",
    });
  });

  test("a wardrobe (lying down) + double fridge fits CLOSED_BOX_VAN", () => {
    const plan = mustPlan([WARDROBE_2_DOOR(), FRIDGE_DOUBLE()]);
    expect(assessFit(plan, spec("CLOSED_BOX_VAN"))).toEqual({
      hardAxes: [],
      soft: [],
      bodyOk: true,
      verdict: "fits",
    });
  });

  test("a double fridge alone does not fit CARGO_VAN (1.6 m high)", () => {
    const plan = mustPlan([FRIDGE_DOUBLE()]);
    const fit = assessFit(plan, spec("CARGO_VAN"));
    expect(fit.hardAxes).toEqual(["height"]);
    expect(fit.verdict).toBe("cannot_fit");
  });

  test("weight safety: 95 % of payload is may_not_fit, not cannot_fit", () => {
    const plan = mustPlan([
      item({
        unitWeightKg: 475,
        lengthM: 0.5,
        widthM: 0.5,
        heightM: 0.5,
        cargoCategory: "RETAIL_STOCK",
      }),
    ]);
    expect(assessFit(plan, spec("MINIVAN"))).toEqual({
      hardAxes: [],
      soft: ["weight_margin"],
      bodyOk: true,
      verdict: "may_not_fit",
    });
  });

  test("floor area of non-stackable items is a soft reason", () => {
    // Three sofas: 3 × 2.1 × 0.95 = 5.985 m² against a 3.0 × 1.7 = 5.1 m² deck.
    const plan = mustPlan([SOFA_3_SEAT(), SOFA_3_SEAT(), SOFA_3_SEAT()]);
    const fit = assessFit(plan, spec("CLOSED_BOX_VAN"));
    expect(fit.soft).toContain("floor_area");
    expect(fit.verdict).toBe("may_not_fit");
  });

  test("a body the class does not offer is cannot_fit", () => {
    const plan = mustPlan([CHILLED_CRATE(2)]);
    expect(assessFit(plan, spec("CARGO_VAN"))).toMatchObject({
      bodyOk: false,
      verdict: "cannot_fit",
    });
    expect(assessFit(plan, spec("REFRIGERATED_VAN")).verdict).toBe("fits");
  });
});

/* -------------------------------------------------------------------------- */
/* recommendVehicles on the seeded catalogue                                  */
/* -------------------------------------------------------------------------- */

test.describe("recommendVehicles", () => {
  test("10 medium boxes ⇒ MPV (cheaper than the Minivan by base fare)", () => {
    const { recommended, oneSizeUp } = recommend([BOX_MEDIUM(10)]);
    expect(spec("MPV").baseFare).toBeLessThan(spec("MINIVAN").baseFare);
    expect(recommended?.spec.code).toBe("MPV");
    expect(recommended?.fit.verdict).toBe("fits");
    expect(oneSizeUp?.spec.code).toBe("MINIVAN");
  });

  const homeMove = () => [FRIDGE_DOUBLE(), SOFA_3_SEAT(), BOX_MEDIUM(20)];

  test(`double fridge + 3-seat sofa + 20 medium boxes ⇒ CLOSED_BOX_VAN [${describePlan(mustPlan(homeMove()))}]`, () => {
    const { plan, recommended, oneSizeUp } = recommend(homeMove());
    expect(plan.totalWeightKg).toBe(470);
    expect(plan.envelope).toEqual({
      weightKg: 470,
      lengthM: 2.1,
      widthM: 0.95,
      heightM: 1.8,
    });
    expect(recommended?.spec.code).toBe("CLOSED_BOX_VAN");
    expect(recommended?.spec.category).toBe("MEDIUM_DUTY");
    expect(recommended?.fit.verdict).toBe("fits");
    expect(oneSizeUp?.spec.code).toBe("BOX_TRUCK");
  });

  test("one size up is strictly bigger, never an equal class", () => {
    const plan = mustPlan([BOX_MEDIUM(2)]);
    const twin = { ...spec("MPV"), code: "MPV_TWIN", baseFare: 7.5 };
    const { recommended, oneSizeUp } = recommendVehicles(
      plan,
      [spec("MPV"), twin, spec("MINIVAN")],
      "DRY_BOX",
    );
    expect(recommended?.spec.code).toBe("MPV");
    expect(oneSizeUp?.spec.code).toBe("MINIVAN");

    const onlyTwins = recommendVehicles(plan, [spec("MPV"), twin], "DRY_BOX");
    expect(onlyTwins.oneSizeUp).toBeNull();
  });

  test("nothing fits ⇒ the first may_not_fit, flagged; nothing at all ⇒ null", () => {
    // 380 kg × 1.1 = 418 kg: over the MPV's margin, within its raw payload.
    const plan = mustPlan([
      item({
        unitWeightKg: 380,
        lengthM: 0.5,
        widthM: 0.5,
        heightM: 0.5,
        cargoCategory: "RETAIL_STOCK",
      }),
    ]);
    const marginal = recommendVehicles(plan, [spec("MPV")], "DRY_BOX");
    expect(marginal.recommended?.spec.code).toBe("MPV");
    expect(marginal.recommended?.fit.verdict).toBe("may_not_fit");
    expect(marginal.oneSizeUp).toBeNull();

    const fridge = mustPlan([FRIDGE_DOUBLE()]);
    expect(
      recommendVehicles(fridge, [spec("MPV"), spec("CARGO_VAN")], "DRY_BOX"),
    ).toEqual({ recommended: null, oneSizeUp: null });
  });
});

/* -------------------------------------------------------------------------- */
/* summariseItems                                                             */
/* -------------------------------------------------------------------------- */

test.describe("summariseItems", () => {
  const lines = [
    { label: "Fridge, double door", quantity: 1 },
    { label: "Box, medium", quantity: 15 },
    { label: "Sofa, 3-seat", quantity: 1 },
  ];

  test("joins every entry when it fits", () => {
    expect(summariseItems(lines.slice(0, 2), 100)).toBe(
      "1 × Fridge, double door, 15 × Box, medium",
    );
  });

  test("truncates on a whole entry", () => {
    expect(summariseItems(lines, 45)).toBe(
      "1 × Fridge, double door, 15 × Box, medium, …",
    );
    expect(summariseItems(lines, 30)).toBe("1 × Fridge, double door, …");
  });

  test("cuts the first entry only when nothing else fits", () => {
    const summary = summariseItems(lines, 10);
    expect(summary).toBe("1 × Fridg…");
    expect(summary.length).toBe(10);
  });
});
