/**
 * Step 5's follow-the-recommendation vs keep-the-client's-choice rule:
 * `src/components/home/vehicle-selection.ts`.
 *
 * Two layers. The first walks `reconcileVehicleSelection` through each
 * transition as bare data. The second drives it with what the booking form
 * actually feeds it — `planLoad`, `assessFit` and `recommendVehicles` over a
 * small fleet — so "adding a wardrobe moves an auto-picked MPV but not a
 * hand-picked one" is checked end to end, not only in the abstract. No browser
 * and no database.
 */

import { expect, test } from "@playwright/test";

import {
  reconcileVehicleSelection,
  selectionOutsideRecommendation,
  type VehicleSelection,
  type VehicleSelectionInput,
} from "@/components/home/vehicle-selection";
import {
  assessFit,
  planLoad,
  recommendVehicles,
  type ChassisTypeKey,
  type LoadLine,
} from "@/lib/orders/load-plan";

const BASE: VehicleSelectionInput = {
  code: "",
  chosenByClient: false,
  judged: true,
  bodyChosen: true,
  recommendedCode: "VAN",
  bookableCodes: ["VAN", "TRUCK"],
  cannotFitCodes: [],
};

test.describe("reconcileVehicleSelection", () => {
  test("following: an empty selection lands on the recommendation", () => {
    expect(reconcileVehicleSelection(BASE)).toEqual({
      code: "VAN",
      chosenByClient: false,
      released: null,
    });
  });

  test("following: the selection moves when the recommendation does", () => {
    expect(
      reconcileVehicleSelection({
        ...BASE,
        code: "MPV",
        bookableCodes: ["MPV", "VAN", "TRUCK"],
      }),
    ).toEqual({ code: "VAN", chosenByClient: false, released: null });
  });

  test("following: nothing to recommend leaves the selection where it is", () => {
    expect(
      reconcileVehicleSelection({
        ...BASE,
        code: "MPV",
        recommendedCode: null,
        bookableCodes: [],
        cannotFitCodes: ["MPV"],
      }),
    ).toEqual({ code: "MPV", chosenByClient: false, released: null });
  });

  test("chosen: a still-bookable hand pick never moves", () => {
    expect(
      reconcileVehicleSelection({
        ...BASE,
        code: "TRUCK",
        chosenByClient: true,
      }),
    ).toEqual({ code: "TRUCK", chosenByClient: true, released: null });
  });

  test("chosen: a hand pick that cannot fit is released to the recommendation", () => {
    expect(
      reconcileVehicleSelection({
        ...BASE,
        code: "MPV",
        chosenByClient: true,
        cannotFitCodes: ["MPV"],
      }),
    ).toEqual({
      code: "VAN",
      chosenByClient: false,
      released: { code: "MPV", reason: "cannot_fit" },
    });
  });

  test("chosen: a hand pick no longer on offer is released as unavailable", () => {
    expect(
      reconcileVehicleSelection({
        ...BASE,
        code: "REEFER",
        chosenByClient: true,
      }),
    ).toEqual({
      code: "VAN",
      chosenByClient: false,
      released: { code: "REEFER", reason: "unavailable" },
    });
  });

  test("chosen: released with nothing bookable keeps the code, back in following mode", () => {
    expect(
      reconcileVehicleSelection({
        ...BASE,
        code: "MPV",
        chosenByClient: true,
        recommendedCode: null,
        bookableCodes: [],
        cannotFitCodes: ["MPV", "VAN", "TRUCK"],
      }),
    ).toEqual({
      code: "MPV",
      chosenByClient: false,
      released: { code: "MPV", reason: "cannot_fit" },
    });
  });

  test("not judged (empty or conflicting list, fetch in flight): nothing moves", () => {
    const input = {
      ...BASE,
      code: "MPV",
      chosenByClient: true,
      judged: false,
      recommendedCode: null,
      bookableCodes: [],
      cannotFitCodes: ["MPV"],
    };
    expect(reconcileVehicleSelection(input)).toEqual({
      code: "MPV",
      chosenByClient: true,
      released: null,
    });
  });

  test("no load space chosen (business): any selection is dropped", () => {
    expect(
      reconcileVehicleSelection({
        ...BASE,
        code: "VAN",
        chosenByClient: true,
        bodyChosen: false,
      }),
    ).toEqual({ code: "", chosenByClient: false, released: null });
  });

  test("idempotent: a result fed back in is a fixed point", () => {
    const inputs: VehicleSelectionInput[] = [
      BASE,
      { ...BASE, code: "MPV", chosenByClient: true, cannotFitCodes: ["MPV"] },
      { ...BASE, code: "TRUCK", chosenByClient: true },
      { ...BASE, code: "VAN", bodyChosen: false },
    ];
    for (const input of inputs) {
      const first = reconcileVehicleSelection(input);
      const second = reconcileVehicleSelection({ ...input, ...first });
      expect(second).toEqual({ ...first, released: null });
    }
  });
});

test.describe("selectionOutsideRecommendation", () => {
  test("inside when on either recommended card, or nothing selected", () => {
    expect(selectionOutsideRecommendation("VAN", "VAN", "TRUCK")).toBe(false);
    expect(selectionOutsideRecommendation("TRUCK", "VAN", "TRUCK")).toBe(false);
    expect(selectionOutsideRecommendation("", "VAN", null)).toBe(false);
  });

  test("outside on any other class, or when there is no recommendation", () => {
    expect(selectionOutsideRecommendation("LORRY", "VAN", "TRUCK")).toBe(true);
    expect(selectionOutsideRecommendation("MPV", null, null)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* End to end over the real fit functions                                     */
/* -------------------------------------------------------------------------- */

type FleetSpec = {
  code: string;
  maxPayloadKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
  bodyTypes: ChassisTypeKey[];
};

/** Cheapest first, as the form sorts its eligible list. */
const FLEET: FleetSpec[] = [
  {
    code: "MPV",
    maxPayloadKg: 500,
    cargoLengthM: 1.6,
    cargoWidthM: 1.2,
    cargoHeightM: 1.0,
    bodyTypes: ["DRY_BOX"],
  },
  {
    code: "VAN",
    maxPayloadKg: 1200,
    cargoLengthM: 3.0,
    cargoWidthM: 1.7,
    cargoHeightM: 1.8,
    bodyTypes: ["DRY_BOX"],
  },
  {
    code: "TRUCK",
    maxPayloadKg: 3000,
    cargoLengthM: 4.5,
    cargoWidthM: 2.1,
    cargoHeightM: 2.2,
    bodyTypes: ["DRY_BOX"],
  },
];

function line(overrides: Partial<LoadLine>): LoadLine {
  return {
    quantity: 1,
    unitWeightKg: 10,
    lengthM: 0.5,
    widthM: 0.4,
    heightM: 0.4,
    stackable: true,
    needsTwoPeople: false,
    requiredBody: null,
    handlingTags: [],
    cargoCategory: "FURNITURE_FURNISHINGS",
    ...overrides,
  };
}

const BOX = line({});
const WARDROBE = line({
  unitWeightKg: 90,
  lengthM: 2.0,
  widthM: 0.6,
  heightM: 1.0,
  stackable: false,
  needsTwoPeople: true,
});

/** What the form's effect computes from the list, then applies. */
function step(lines: LoadLine[], current: VehicleSelection) {
  const plan = planLoad(lines);
  if (plan === null) throw new Error("fixture lists at least one line");
  const body = "DRY_BOX";
  const cannotFitCodes = FLEET.filter(
    (spec) => assessFit(plan, spec, body).verdict === "cannot_fit",
  ).map((spec) => spec.code);
  const bookable = FLEET.filter((spec) => !cannotFitCodes.includes(spec.code));
  const { recommended } = recommendVehicles(plan, bookable, body);
  return reconcileVehicleSelection({
    ...current,
    judged: true,
    bodyChosen: true,
    recommendedCode: recommended?.spec.code ?? null,
    bookableCodes: bookable.map((spec) => spec.code),
    cannotFitCodes,
  });
}

test.describe("with the real load plan", () => {
  test("an auto-picked MPV follows the recommendation when a wardrobe is added", () => {
    const first = step([BOX], { code: "", chosenByClient: false });
    expect(first.code).toBe("MPV");

    const second = step([BOX, WARDROBE], first);
    expect(second).toEqual({
      code: "VAN",
      chosenByClient: false,
      released: null,
    });
  });

  test("a hand-picked truck survives adding a small item", () => {
    const picked = { code: "TRUCK", chosenByClient: true };
    expect(step([BOX, BOX], picked)).toEqual({ ...picked, released: null });
  });

  test("a hand-picked MPV is released, with the reason, when a wardrobe will not fit", () => {
    const picked = { code: "MPV", chosenByClient: true };
    expect(step([BOX, WARDROBE], picked)).toEqual({
      code: "VAN",
      chosenByClient: false,
      released: { code: "MPV", reason: "cannot_fit" },
    });
  });
});
