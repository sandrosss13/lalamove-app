/**
 * The admin Pricing editor's rules (`/admin/pricing/*`): what a vehicle
 * tariff, a helper tariff, a route allowance and a general-config patch may
 * carry, and the percent <-> fraction conversion the pages do at the edge.
 *
 * `src/lib/admin/pricing-validation.ts` is run by the API routes (the real
 * boundary) and by the pages (for faster feedback), so every rule asserted
 * here holds on both sides.
 *
 * **Why this runs with no browser and no database**, as
 * `tests/item-catalogue-admin-validation.spec.ts` does: the module has no
 * `server-only`, no Prisma runtime and no translator. Errors are asserted by
 * message key, which is also what the routes translate.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  DEFAULT_HELPER_FLOOR_BANDS,
  DEFAULT_PRICING_CONFIG,
} from "@/lib/pricing-engine";
import {
  fractionToPercent,
  numberFromInput,
  parseGeneralConfigBody,
  parseHelperBands,
  parseHelperRules,
  parseHelperTariffBody,
  parseRouteAllowanceBody,
  parseVehicleTariffBody,
  percentToFraction,
  PRICING_BOUNDS,
  ROUTE_ALLOWANCE_PRESETS,
  translatePricingError,
} from "@/lib/admin/pricing-validation";

const K = "admin.pricingValidation";

/** The spec's MINIVAN row — a valid vehicle tariff. */
function minivan(overrides: Record<string, unknown> = {}) {
  return {
    cityBaseFare: 15,
    cityPricePerKm: 0.9,
    cityPricePerMinute: 0.2,
    cityMinimumFare: 25,
    intercityBaseFare: 15,
    intercityPricePerKm: 1.1,
    cityCommissionRate: 0.15,
    intercityCommissionRate: 0.12,
    freeLoadingMinutes: 30,
    overtimeRatePerMinute: 0.5,
    ...overrides,
  };
}

const RULES = {
  maxHelpers: 4,
  helperIncludedMinutes: 60,
  helperOvertimeIncrementMinutes: 30,
  helperOvertimeFeePerIncrement: 10,
  elevatorDiscount: 0.3,
};

const CURRENT_CONFIG = {
  intercityThresholdKm: 40,
  manualQuoteThresholdKm: 600,
  quoteValidityMinutes: 20,
  defaultReturnAllowance: 0.35,
};

function errorKey(result: { error: { key: string } } | { data: unknown }) {
  return "error" in result ? result.error.key : null;
}

test.describe("parseVehicleTariffBody", () => {
  test("accepts the spec's MINIVAN rates unchanged", () => {
    expect(parseVehicleTariffBody(minivan())).toEqual({ data: minivan() });
  });

  test("accepts zero everywhere except the city minimum and intercity per-km", () => {
    const zeros = Object.fromEntries(
      Object.keys(minivan()).map((field) => [field, 0]),
    );
    expect(
      errorKey(
        parseVehicleTariffBody({
          ...zeros,
          cityMinimumFare: 1,
          intercityPricePerKm: 0.1,
        }),
      ),
    ).toBeNull();
  });

  for (const field of ["cityMinimumFare", "intercityPricePerKm"] as const) {
    test(`refuses ${field} = 0 (the engine would quote at ~nothing)`, () => {
      expect(parseVehicleTariffBody(minivan({ [field]: 0 }))).toEqual({
        error: {
          key: `${K}.positiveOutOfRange`,
          values: { field, max: PRICING_BOUNDS.maxMoney },
        },
      });
    });
  }

  test("drops fields it does not know, including the legacy helperFee", () => {
    const result = parseVehicleTariffBody(minivan({ helperFee: 99, id: "x" }));
    expect(result).toEqual({ data: minivan() });
  });

  for (const [field, value] of [
    ["cityBaseFare", -1],
    ["cityPricePerKm", Number.NaN],
    ["cityMinimumFare", "25"],
    ["intercityPricePerKm", PRICING_BOUNDS.maxMoney + 1],
    ["overtimeRatePerMinute", null],
  ] as const) {
    test(`rejects ${field} = ${String(value)}`, () => {
      const result = parseVehicleTariffBody(minivan({ [field]: value }));
      const mustBePositive =
        field === "cityMinimumFare" || field === "intercityPricePerKm";
      expect(result).toEqual({
        error: {
          key: mustBePositive
            ? `${K}.positiveOutOfRange`
            : `${K}.amountOutOfRange`,
          values: { field, max: PRICING_BOUNDS.maxMoney },
        },
      });
    });
  }

  test("rejects a missing field", () => {
    const body: Record<string, unknown> = minivan();
    delete body.intercityBaseFare;
    expect(errorKey(parseVehicleTariffBody(body))).toBe(
      `${K}.amountOutOfRange`,
    );
  });

  test("commission rates are fractions 0..1", () => {
    expect(
      errorKey(parseVehicleTariffBody(minivan({ cityCommissionRate: 1 }))),
    ).toBeNull();
    expect(parseVehicleTariffBody(minivan({ cityCommissionRate: 15 }))).toEqual(
      {
        error: {
          key: `${K}.rateOutOfRange`,
          values: { field: "cityCommissionRate" },
        },
      },
    );
    expect(
      errorKey(
        parseVehicleTariffBody(minivan({ intercityCommissionRate: -0.01 })),
      ),
    ).toBe(`${K}.rateOutOfRange`);
  });

  test("free waiting minutes are a whole number", () => {
    expect(
      errorKey(parseVehicleTariffBody(minivan({ freeLoadingMinutes: 12.5 }))),
    ).toBe(`${K}.wholeOutOfRange`);
    expect(
      errorKey(
        parseVehicleTariffBody(
          minivan({ freeLoadingMinutes: PRICING_BOUNDS.maxMinutes + 1 }),
        ),
      ),
    ).toBe(`${K}.wholeOutOfRange`);
  });

  test("rejects a non-object body", () => {
    for (const body of [null, "x", 3, [minivan()]]) {
      expect(errorKey(parseVehicleTariffBody(body))).toBe(
        `${K}.bodyMustBeObject`,
      );
    }
  });
});

test.describe("parseHelperBands", () => {
  test("accepts the seeded bands and sorts by floor", () => {
    const shuffled = [...DEFAULT_HELPER_FLOOR_BANDS].reverse();
    expect(parseHelperBands(shuffled)).toEqual({
      data: [...DEFAULT_HELPER_FLOOR_BANDS],
    });
  });

  test("a single ground-floor band is enough", () => {
    expect(parseHelperBands([{ minFloor: 0, ratePerHelper: 20 }])).toEqual({
      data: [{ minFloor: 0, ratePerHelper: 20 }],
    });
  });

  test("the floor-0 band must always exist", () => {
    expect(
      errorKey(
        parseHelperBands([
          { minFloor: 1, ratePerHelper: 15 },
          { minFloor: 4, ratePerHelper: 25 },
        ]),
      ),
    ).toBe(`${K}.groundFloorBandRequired`);
  });

  test("rejects duplicate floors", () => {
    expect(
      parseHelperBands([
        { minFloor: 0, ratePerHelper: 15 },
        { minFloor: 4, ratePerHelper: 25 },
        { minFloor: 4, ratePerHelper: 30 },
      ]),
    ).toEqual({
      error: { key: `${K}.duplicateBandFloor`, values: { floor: 4 } },
    });
  });

  test("rejects an empty list, too many bands and malformed entries", () => {
    expect(errorKey(parseHelperBands([]))).toBe(`${K}.bandsRequired`);
    expect(errorKey(parseHelperBands(undefined))).toBe(`${K}.bandsRequired`);
    const many = Array.from(
      { length: PRICING_BOUNDS.maxBands + 1 },
      (_, i) => ({
        minFloor: i,
        ratePerHelper: 10,
      }),
    );
    expect(errorKey(parseHelperBands(many))).toBe(`${K}.tooManyBands`);
    expect(errorKey(parseHelperBands([0]))).toBe(`${K}.bandMalformed`);
  });

  test("floors are whole 0..maxFloor, rates non-negative", () => {
    expect(
      errorKey(
        parseHelperBands([
          { minFloor: 0, ratePerHelper: 15 },
          { minFloor: 2.5, ratePerHelper: 20 },
        ]),
      ),
    ).toBe(`${K}.wholeOutOfRange`);
    expect(
      errorKey(
        parseHelperBands([
          { minFloor: 0, ratePerHelper: 15 },
          { minFloor: PRICING_BOUNDS.maxFloor + 1, ratePerHelper: 20 },
        ]),
      ),
    ).toBe(`${K}.wholeOutOfRange`);
    expect(
      errorKey(parseHelperBands([{ minFloor: 0, ratePerHelper: -5 }])),
    ).toBe(`${K}.amountOutOfRange`);
  });
});

test.describe("parseHelperRules", () => {
  test("accepts the seeded rules", () => {
    expect(parseHelperRules(RULES)).toEqual({ data: RULES });
  });

  test("max helpers is a whole number 1..the booking parser's bound", () => {
    expect(errorKey(parseHelperRules({ ...RULES, maxHelpers: 0 }))).toBe(
      `${K}.wholeOutOfRange`,
    );
    expect(errorKey(parseHelperRules({ ...RULES, maxHelpers: 1 }))).toBeNull();
    expect(
      errorKey(
        parseHelperRules({ ...RULES, maxHelpers: PRICING_BOUNDS.maxHelpers }),
      ),
    ).toBeNull();
    expect(
      errorKey(
        parseHelperRules({
          ...RULES,
          maxHelpers: PRICING_BOUNDS.maxHelpers + 1,
        }),
      ),
    ).toBe(`${K}.wholeOutOfRange`);
  });

  test("the overtime increment is at least one minute (it is a divisor)", () => {
    expect(
      errorKey(
        parseHelperRules({ ...RULES, helperOvertimeIncrementMinutes: 0 }),
      ),
    ).toBe(`${K}.wholeOutOfRange`);
  });

  test("included minutes may be 0; the elevator discount is a fraction", () => {
    expect(
      errorKey(parseHelperRules({ ...RULES, helperIncludedMinutes: 0 })),
    ).toBeNull();
    expect(errorKey(parseHelperRules({ ...RULES, elevatorDiscount: 30 }))).toBe(
      `${K}.rateOutOfRange`,
    );
    expect(
      errorKey(
        parseHelperRules({ ...RULES, helperOvertimeFeePerIncrement: -1 }),
      ),
    ).toBe(`${K}.amountOutOfRange`);
  });

  test("parseHelperTariffBody needs both halves", () => {
    expect(
      parseHelperTariffBody({
        bands: DEFAULT_HELPER_FLOOR_BANDS,
        rules: RULES,
      }),
    ).toEqual({
      data: { bands: [...DEFAULT_HELPER_FLOOR_BANDS], rules: RULES },
    });
    expect(
      errorKey(parseHelperTariffBody({ bands: DEFAULT_HELPER_FLOOR_BANDS })),
    ).toBe(`${K}.bodyMustBeObject`);
    expect(errorKey(parseHelperTariffBody({ rules: RULES }))).toBe(
      `${K}.bandsRequired`,
    );
  });
});

test.describe("parseRouteAllowanceBody", () => {
  test("accepts a pair in either order (the route normalises it)", () => {
    expect(
      parseRouteAllowanceBody({
        cityA: "TBILISI",
        cityB: "BATUMI",
        allowance: 0.15,
      }),
    ).toEqual({
      data: { cityA: "TBILISI", cityB: "BATUMI", allowance: 0.15 },
    });
  });

  test("an empty return (100%) and 0% are both allowed", () => {
    for (const allowance of [0, 1]) {
      expect(
        errorKey(
          parseRouteAllowanceBody({ cityA: "GORI", cityB: "POTI", allowance }),
        ),
      ).toBeNull();
    }
  });

  test("rejects unknown cities, the same city twice and rates outside 0..1", () => {
    expect(
      errorKey(
        parseRouteAllowanceBody({
          cityA: "LONDON",
          cityB: "TBILISI",
          allowance: 0.3,
        }),
      ),
    ).toBe(`${K}.unknownCity`);
    expect(
      errorKey(
        parseRouteAllowanceBody({
          cityA: "toString",
          cityB: "TBILISI",
          allowance: 0.3,
        }),
      ),
    ).toBe(`${K}.unknownCity`);
    expect(
      errorKey(
        parseRouteAllowanceBody({
          cityA: "TBILISI",
          cityB: "TBILISI",
          allowance: 0.3,
        }),
      ),
    ).toBe(`${K}.citiesMustDiffer`);
    expect(
      errorKey(
        parseRouteAllowanceBody({
          cityA: "TBILISI",
          cityB: "BATUMI",
          allowance: 35,
        }),
      ),
    ).toBe(`${K}.rateOutOfRange`);
  });

  test("the presets are the sheet's 15 / 35 / 65 / 100%", () => {
    expect(ROUTE_ALLOWANCE_PRESETS.map((preset) => preset.allowance)).toEqual([
      0.15, 0.35, 0.65, 1,
    ]);
  });
});

test.describe("parseGeneralConfigBody", () => {
  test("accepts any non-empty subset", () => {
    expect(
      parseGeneralConfigBody({ defaultReturnAllowance: 0.4 }, CURRENT_CONFIG),
    ).toEqual({ data: { defaultReturnAllowance: 0.4 } });
    expect(
      parseGeneralConfigBody(
        {
          intercityThresholdKm: 50,
          manualQuoteThresholdKm: 700,
          quoteValidityMinutes: 30,
        },
        CURRENT_CONFIG,
      ),
    ).toEqual({
      data: {
        intercityThresholdKm: 50,
        manualQuoteThresholdKm: 700,
        quoteValidityMinutes: 30,
      },
    });
  });

  test("ignores unknown fields and refuses an empty patch", () => {
    expect(
      errorKey(parseGeneralConfigBody({ tariffVersion: 99 }, CURRENT_CONFIG)),
    ).toBe(`${K}.nothingToUpdate`);
    expect(errorKey(parseGeneralConfigBody({}, CURRENT_CONFIG))).toBe(
      `${K}.nothingToUpdate`,
    );
  });

  test("thresholds are strictly positive; validity is whole minutes ≥ 1", () => {
    expect(
      errorKey(
        parseGeneralConfigBody({ intercityThresholdKm: 0 }, CURRENT_CONFIG),
      ),
    ).toBe(`${K}.positiveOutOfRange`);
    expect(
      errorKey(
        parseGeneralConfigBody({ quoteValidityMinutes: 0 }, CURRENT_CONFIG),
      ),
    ).toBe(`${K}.wholeOutOfRange`);
    expect(
      errorKey(
        parseGeneralConfigBody({ quoteValidityMinutes: 2.5 }, CURRENT_CONFIG),
      ),
    ).toBe(`${K}.wholeOutOfRange`);
    expect(
      errorKey(
        parseGeneralConfigBody(
          { defaultReturnAllowance: -0.1 },
          CURRENT_CONFIG,
        ),
      ),
    ).toBe(`${K}.rateOutOfRange`);
  });

  test("the manual-quote threshold must stay above the intercity one, against the stored row", () => {
    // Patch alone is fine, but the stored manual threshold (600) is lower.
    expect(
      errorKey(
        parseGeneralConfigBody({ intercityThresholdKm: 600 }, CURRENT_CONFIG),
      ),
    ).toBe(`${K}.manualBelowIntercity`);
    expect(
      errorKey(
        parseGeneralConfigBody({ manualQuoteThresholdKm: 40 }, CURRENT_CONFIG),
      ),
    ).toBe(`${K}.manualBelowIntercity`);
    expect(
      errorKey(
        parseGeneralConfigBody(
          { intercityThresholdKm: 600, manualQuoteThresholdKm: 800 },
          CURRENT_CONFIG,
        ),
      ),
    ).toBeNull();
  });

  test("the engine's defaults are themselves valid", () => {
    const {
      intercityThresholdKm,
      manualQuoteThresholdKm,
      quoteValidityMinutes,
      defaultReturnAllowance,
    } = DEFAULT_PRICING_CONFIG;
    expect(
      errorKey(
        parseGeneralConfigBody(
          {
            intercityThresholdKm,
            manualQuoteThresholdKm,
            quoteValidityMinutes,
            defaultReturnAllowance,
          },
          CURRENT_CONFIG,
        ),
      ),
    ).toBeNull();
    expect(errorKey(parseHelperRules(DEFAULT_PRICING_CONFIG))).toBeNull();
  });
});

test.describe("percent <-> fraction", () => {
  test("round-trips the figures admins type", () => {
    expect(percentToFraction("12")).toBe(0.12);
    expect(percentToFraction("12.5")).toBe(0.125);
    expect(percentToFraction("7")).toBe(0.07);
    expect(percentToFraction("100")).toBe(1);
    expect(fractionToPercent(0.12)).toBe("12");
    expect(fractionToPercent(0.07)).toBe("7");
    expect(fractionToPercent(0.125)).toBe("12.5");
    expect(fractionToPercent(1)).toBe("100");
  });

  test("blank or junk input is NaN, so the parser rejects it", () => {
    expect(percentToFraction("")).toBeNaN();
    expect(percentToFraction("abc")).toBeNaN();
    expect(numberFromInput("  ")).toBeNaN();
    expect(numberFromInput("2.5")).toBe(2.5);
    expect(
      errorKey(
        parseVehicleTariffBody(minivan({ cityBaseFare: numberFromInput("") })),
      ),
    ).toBe(`${K}.amountOutOfRange`);
  });
});

test.describe("translatePricingError", () => {
  test("swaps a field name for its label before translating", () => {
    const calls: [string, unknown][] = [];
    const t = (key: string, values?: Record<string, string | number>) => {
      calls.push([key, values]);
      return key.startsWith("admin.adminPricing.fields.") ? "LABEL" : "MSG";
    };
    expect(
      translatePricingError(t, {
        key: `${K}.amountOutOfRange`,
        values: { field: "cityBaseFare", max: 10 },
      }),
    ).toBe("MSG");
    expect(calls).toEqual([
      ["admin.adminPricing.fields.cityBaseFare", undefined],
      [`${K}.amountOutOfRange`, { field: "LABEL", max: 10 }],
    ]);
  });

  test("every key the validator can return, and every field label, exists in both catalogs", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/admin/pricing-validation.ts"),
      "utf8",
    );
    const keys = [...source.matchAll(/`\$\{K\}\.(\w+)`/g)].map(
      (match) => match[1],
    );
    const fields = [
      ...source.matchAll(
        /read(?:Amount|Whole|Rate|Positive)\(\s*record,\s*"(\w+)"/g,
      ),
    ].map((match) => match[1]);
    const vehicleFields = Object.keys(minivan());

    for (const locale of ["en", "ka"]) {
      const admin = JSON.parse(
        readFileSync(
          join(process.cwd(), `src/messages/${locale}/admin.json`),
          "utf8",
        ),
      ) as {
        pricingValidation: Record<string, string>;
        adminPricing: { fields: Record<string, string> };
      };
      for (const key of keys) {
        expect(
          admin.pricingValidation[key ?? ""],
          `${locale}: ${key}`,
        ).toBeTruthy();
      }
      for (const field of [
        ...fields,
        ...vehicleFields,
        "minFloor",
        "ratePerHelper",
      ]) {
        expect(
          admin.adminPricing.fields[field ?? ""],
          `${locale}: ${field}`,
        ).toBeTruthy();
      }
    }
  });
});
