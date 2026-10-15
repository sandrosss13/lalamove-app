/**
 * Pricing model v1 (`ZOMO_Full_Pricing_Model.xlsx`): every formula of the pure
 * engine in `src/lib/pricing-engine.ts`, the creation-time payout split in
 * `src/lib/orders/payout.ts`, and the helper fields of `parseQuoteFields`.
 *
 * Pure functions only — no browser, no server, no database. (Importing
 * `src/lib/pricing.ts` constructs the shared PrismaClient, but Prisma connects
 * lazily and nothing here issues a query.)
 */

import { expect, test } from "@playwright/test";

import {
  overtimeDriverPayoutFor,
  quotedOrderPayout,
} from "@/lib/orders/payout";
import { parseQuoteFields } from "@/lib/pricing";
import {
  classifyTrip,
  clientTotalForServiceLevel,
  commissionRateFor,
  computeQuote,
  computeTransport,
  crewHelperCount,
  DEFAULT_HELPER_FLOOR_BANDS,
  DEFAULT_PRICING_CONFIG,
  helperFloorRate,
  helperOvertimeFeeFor,
  helperOvertimeIncrements,
  helperStandardFee,
  hasUsableRates,
  isManualQuoteRequired,
  ROAD_DETOUR_FACTOR,
  NO_HELP,
  normaliseCityPair,
  orderHelperOvertimeFee,
  quoteExpiresAt,
  returnAllowanceFor,
  serviceLevelAdjustment,
  type RouteAllowanceValues,
  type VehicleRates,
} from "@/lib/pricing-engine";

/** MINIVAN ("Cargo minivan") from the approved rate table. */
const MINIVAN: VehicleRates = {
  cityBaseFare: 15,
  cityPricePerKm: 0.9,
  cityPricePerMinute: 0.2,
  cityMinimumFare: 25,
  intercityBaseFare: 15,
  intercityPricePerKm: 1.1,
  cityCommissionRate: 0.15,
  intercityCommissionRate: 0.12,
};

/** BOX_TRUCK, for the truck-class commission rates. */
const BOX_TRUCK: VehicleRates = {
  cityBaseFare: 45,
  cityPricePerKm: 2.2,
  cityPricePerMinute: 0.4,
  cityMinimumFare: 70,
  intercityBaseFare: 45,
  intercityPricePerKm: 2.5,
  cityCommissionRate: 0.12,
  intercityCommissionRate: 0.1,
};

const ROUTES: RouteAllowanceValues[] = [
  { cityA: "BATUMI", cityB: "TBILISI", allowance: 0.15 },
  { cityA: "MESTIA", cityB: "TBILISI", allowance: 0.65 },
];

test.describe("the sheet's verification case", () => {
  // MINIVAN, INTERCITY, 259.4 km, 300 min, return 0.35, pickup 2 helpers
  // floor 3 no elevator, dropoff 2 helpers floor 6 no elevator, 60 min each.
  const breakdown = computeQuote(
    {
      distanceKm: 259.4,
      durationMinutes: 300,
      // An unlisted pair, so the default 0.35 applies.
      pickupCity: "TBILISI",
      dropoffCity: "AKHALTSIKHE",
      pickupHelp: {
        helpers: 2,
        floor: 3,
        cargoElevator: false,
        passengerElevator: false,
      },
      dropoffHelp: {
        helpers: 2,
        floor: 6,
        cargoElevator: false,
        passengerElevator: false,
      },
    },
    { rates: MINIVAN, routes: ROUTES },
  );

  test("prices transport at 400.21 with the return leg itemised", () => {
    expect(breakdown.tripType).toBe("INTERCITY");
    expect(breakdown.returnAllowance).toBe(0.35);
    expect(breakdown.baseFare).toBe(15);
    expect(breakdown.distanceFare).toBe(285.34);
    expect(breakdown.returnFare).toBe(99.87);
    expect(breakdown.timeFare).toBe(0);
    expect(breakdown.transportFare).toBe(400.21);
  });

  test("prices helpers at 2*15 + 2*25 = 80 and the total at 480.21", () => {
    expect(breakdown.pickupHelperFee).toBe(30);
    expect(breakdown.dropoffHelperFee).toBe(50);
    expect(breakdown.helperFee).toBe(80);
    expect(breakdown.price).toBe(480.21);
  });

  test("commissions 12% of transport only and passes helpers through", () => {
    const rate = commissionRateFor(MINIVAN, breakdown.tripType);
    expect(rate).toBe(0.12);

    const payout = quotedOrderPayout({
      transportFare: breakdown.transportFare,
      serviceLevelAdjustment: 0,
      helperFee: breakdown.helperFee,
      commissionRate: rate,
    });
    expect(payout.commission).toBe(48.03);
    expect(payout.driverTransportPayout).toBe(352.18);
    expect(payout.helperPayout).toBe(80);
    expect(payout.driverPayout).toBe(432.18);
  });

  test("60 minutes at each end is no helper overtime", () => {
    expect(
      orderHelperOvertimeFee({
        pickupHelpers: 2,
        pickupMinutes: 60,
        dropoffHelpers: 2,
        dropoffMinutes: 60,
      }),
    ).toBe(0);
  });
});

test.describe("trip classification", () => {
  test("same resolved city is CITY below the 40 km threshold", () => {
    expect(
      classifyTrip({
        pickupCity: "TBILISI",
        dropoffCity: "TBILISI",
        distanceKm: 39.99,
      }),
    ).toBe("CITY");
  });

  test("same resolved city but a long route is INTERCITY", () => {
    // A stray ", Tbilisi" in a long-haul address must not price a 300 km run
    // on the city tariff.
    for (const distanceKm of [40, 55, 300]) {
      expect(
        classifyTrip({
          pickupCity: "TBILISI",
          dropoffCity: "TBILISI",
          distanceKm,
        }),
      ).toBe("INTERCITY");
    }
    expect(
      classifyTrip(
        { pickupCity: "TBILISI", dropoffCity: "TBILISI", distanceKm: 55 },
        60,
      ),
    ).toBe("CITY");
  });

  test("different resolved cities are INTERCITY, however close", () => {
    expect(
      classifyTrip({
        pickupCity: "TBILISI",
        dropoffCity: "RUSTAVI",
        distanceKm: 25,
      }),
    ).toBe("INTERCITY");
  });

  test("an unresolved end falls back to the 40 km threshold", () => {
    for (const [pickupCity, dropoffCity] of [
      [null, "TBILISI"],
      ["TBILISI", null],
      [null, null],
    ] as const) {
      expect(classifyTrip({ pickupCity, dropoffCity, distanceKm: 39.99 })).toBe(
        "CITY",
      );
      expect(classifyTrip({ pickupCity, dropoffCity, distanceKm: 40 })).toBe(
        "INTERCITY",
      );
    }
  });

  test("honours a configured threshold", () => {
    expect(
      classifyTrip({ pickupCity: null, dropoffCity: null, distanceKm: 45 }, 50),
    ).toBe("CITY");
  });
});

test.describe("return allowance", () => {
  test("normalises a city pair by name", () => {
    expect(normaliseCityPair("TBILISI", "BATUMI")).toEqual([
      "BATUMI",
      "TBILISI",
    ]);
    expect(normaliseCityPair("BATUMI", "TBILISI")).toEqual([
      "BATUMI",
      "TBILISI",
    ]);
  });

  test("reads a listed pair in either direction", () => {
    for (const [pickupCity, dropoffCity] of [
      ["TBILISI", "BATUMI"],
      ["BATUMI", "TBILISI"],
    ] as const) {
      expect(
        returnAllowanceFor(
          { tripType: "INTERCITY", pickupCity, dropoffCity },
          ROUTES,
        ),
      ).toBe(0.15);
    }
    expect(
      returnAllowanceFor(
        { tripType: "INTERCITY", pickupCity: "MESTIA", dropoffCity: "TBILISI" },
        ROUTES,
      ),
    ).toBe(0.65);
  });

  test("uses the default for an unlisted pair or an unresolved end", () => {
    expect(
      returnAllowanceFor(
        { tripType: "INTERCITY", pickupCity: "GORI", dropoffCity: "TELAVI" },
        ROUTES,
      ),
    ).toBe(0.35);
    expect(
      returnAllowanceFor(
        { tripType: "INTERCITY", pickupCity: null, dropoffCity: "TBILISI" },
        ROUTES,
        0.4,
      ),
    ).toBe(0.4);
  });

  test("is zero on a city trip", () => {
    expect(
      returnAllowanceFor(
        { tripType: "CITY", pickupCity: null, dropoffCity: null },
        ROUTES,
      ),
    ).toBe(0);
  });
});

test.describe("transport", () => {
  test("city: base + km + minutes", () => {
    // 15 + 20*0.9 + 40*0.2 = 15 + 18 + 8 = 41
    expect(
      computeTransport(
        {
          tripType: "CITY",
          distanceKm: 20,
          durationMinutes: 40,
          returnAllowance: 0,
        },
        MINIVAN,
      ),
    ).toEqual({
      baseFare: 15,
      distanceFare: 18,
      timeFare: 8,
      returnFare: 0,
      transportFare: 41,
    });
  });

  test("city: floored at the vehicle's minimum", () => {
    // 15 + 2*0.9 + 5*0.2 = 17.8 -> minimum 25
    const transport = computeTransport(
      {
        tripType: "CITY",
        distanceKm: 2,
        durationMinutes: 5,
        returnAllowance: 0.35,
      },
      MINIVAN,
    );
    expect(transport.transportFare).toBe(25);
    expect(transport.returnFare).toBe(0);
  });

  test("intercity: no time charge and no minimum", () => {
    // 15 + 5*1.1 + 5.5*0.15 = 15 + 5.5 + 0.83 (0.825) = 21.33 — below 25.
    const transport = computeTransport(
      {
        tripType: "INTERCITY",
        distanceKm: 5,
        durationMinutes: 600,
        returnAllowance: 0.15,
      },
      MINIVAN,
    );
    expect(transport.timeFare).toBe(0);
    expect(transport.distanceFare).toBe(5.5);
    expect(transport.returnFare).toBe(0.83);
    expect(transport.transportFare).toBe(21.33);
  });

  test("the itemised lines always add up to the transport charge", () => {
    for (const distanceKm of [0.3, 7.77, 41.2, 123.456, 599.9]) {
      for (const tripType of ["CITY", "INTERCITY"] as const) {
        const t = computeTransport(
          {
            tripType,
            distanceKm,
            durationMinutes: distanceKm * 1.7,
            returnAllowance: 0.35,
          },
          BOX_TRUCK,
        );
        const sum =
          Math.round(
            (t.baseFare + t.distanceFare + t.timeFare + t.returnFare) * 100,
          ) / 100;
        if (tripType === "INTERCITY") {
          expect(t.transportFare).toBe(sum);
        } else {
          expect(t.transportFare).toBe(
            Math.max(BOX_TRUCK.cityMinimumFare, sum),
          );
        }
      }
    }
  });

  test("commission rate by vehicle and trip type", () => {
    expect(commissionRateFor(MINIVAN, "CITY")).toBe(0.15);
    expect(commissionRateFor(MINIVAN, "INTERCITY")).toBe(0.12);
    expect(commissionRateFor(BOX_TRUCK, "CITY")).toBe(0.12);
    expect(commissionRateFor(BOX_TRUCK, "INTERCITY")).toBe(0.1);
  });
});

test.describe("helpers", () => {
  test("floor bands: 0-3 -> 15, 4-6 -> 25, 7-9 -> 35, 10+ -> 50", () => {
    const expected: [number, number][] = [
      [0, 15],
      [3, 15],
      [4, 25],
      [6, 25],
      [7, 35],
      [9, 35],
      [10, 50],
      [42, 50],
    ];
    for (const [floor, rate] of expected) {
      expect(helperFloorRate(floor)).toBe(rate);
    }
  });

  test("bands need not be sorted, and an empty table uses the defaults", () => {
    const shuffled = [...DEFAULT_HELPER_FLOOR_BANDS].reverse();
    expect(helperFloorRate(5, shuffled)).toBe(25);
    expect(helperFloorRate(8, [])).toBe(35);
  });

  test("standard fee is helpers x floor rate", () => {
    expect(
      helperStandardFee({
        helpers: 3,
        floor: 8,
        cargoElevator: false,
        passengerElevator: false,
      }),
    ).toBe(105);
    expect(helperStandardFee(NO_HELP)).toBe(0);
    expect(
      helperStandardFee({
        helpers: 0,
        floor: 12,
        cargoElevator: true,
        passengerElevator: false,
      }),
    ).toBe(0);
  });

  test("a cargo elevator takes 30% off", () => {
    // 2 * 50 * 0.7 = 70
    expect(
      helperStandardFee({
        helpers: 2,
        floor: 10,
        cargoElevator: true,
        passengerElevator: false,
      }),
    ).toBe(70);
    // 1 * 15 * 0.7 = 10.5
    expect(
      helperStandardFee({
        helpers: 1,
        floor: 0,
        cargoElevator: true,
        passengerElevator: false,
      }),
    ).toBe(10.5);
  });

  test("a passenger elevator earns the same discount; both do not stack", () => {
    // 2 * 50 * 0.7 = 70, either elevator
    expect(
      helperStandardFee({
        helpers: 2,
        floor: 10,
        cargoElevator: false,
        passengerElevator: true,
      }),
    ).toBe(70);
    expect(
      helperStandardFee({
        helpers: 2,
        floor: 10,
        cargoElevator: true,
        passengerElevator: true,
      }),
    ).toBe(70);
    // No helpers: the ticks are information only.
    expect(
      helperStandardFee({
        helpers: 0,
        floor: 10,
        cargoElevator: false,
        passengerElevator: true,
      }),
    ).toBe(0);
  });

  test("helperCount is the larger crew of the two ends", () => {
    expect(
      crewHelperCount(
        {
          helpers: 1,
          floor: 0,
          cargoElevator: false,
          passengerElevator: false,
        },
        {
          helpers: 3,
          floor: 0,
          cargoElevator: false,
          passengerElevator: false,
        },
      ),
    ).toBe(3);
  });
});

test.describe("helper overtime", () => {
  test("rounds every started 30 minutes beyond the included 60 up", () => {
    const cases: [number, number][] = [
      [0, 0],
      [60, 0],
      [61, 1],
      [90, 1],
      [91, 2],
      [120, 2],
      [121, 3],
    ];
    for (const [minutes, increments] of cases) {
      expect(helperOvertimeIncrements(minutes)).toBe(increments);
    }
  });

  test("charges helpers x increments x 10, with no elevator discount", () => {
    expect(helperOvertimeFeeFor({ helpers: 2, actualMinutes: 95 })).toBe(40);
    expect(helperOvertimeFeeFor({ helpers: 3, actualMinutes: 61 })).toBe(30);
    expect(helperOvertimeFeeFor({ helpers: 0, actualMinutes: 300 })).toBe(0);
  });

  test("sums both ends, treating unreported minutes as none", () => {
    expect(
      orderHelperOvertimeFee({
        pickupHelpers: 2,
        pickupMinutes: 100, // 2 increments -> 40
        dropoffHelpers: 1,
        dropoffMinutes: null,
      }),
    ).toBe(40);
  });

  test("follows configured rules", () => {
    expect(
      helperOvertimeFeeFor(
        { helpers: 1, actualMinutes: 50 },
        {
          helperIncludedMinutes: 30,
          helperOvertimeIncrementMinutes: 15,
          helperOvertimeFeePerIncrement: 7.5,
        },
      ),
    ).toBe(15);
  });

  test("reaches the driver in full, beside the commissioned waiting overtime", () => {
    // Waiting overtime 20 at 12% -> 17.60, plus helper overtime 40 untouched.
    expect(
      overtimeDriverPayoutFor({
        overtimeFee: 20,
        helperOvertimeFee: 40,
        commissionRate: 0.12,
      }),
    ).toBe(57.6);
  });
});

test.describe("service level on transport only", () => {
  const quote = { transportFare: 100, helperFee: 60 };

  test("tiers move the transport charge, never the helpers", () => {
    expect(serviceLevelAdjustment("PRIORITY", quote.transportFare)).toBe(25);
    expect(serviceLevelAdjustment("POOLING", quote.transportFare)).toBe(-10);
    expect(clientTotalForServiceLevel("PRIORITY", quote)).toBe(185);
    expect(clientTotalForServiceLevel("REGULAR", quote)).toBe(160);
    expect(clientTotalForServiceLevel("POOLING", quote)).toBe(150);
  });

  test("the tier adjustment is commissioned with the transport", () => {
    const payout = quotedOrderPayout({
      transportFare: 100,
      serviceLevelAdjustment: 25,
      helperFee: 60,
      commissionRate: 0.15,
    });
    expect(payout.commissionBasis).toBe(125);
    expect(payout.commission).toBe(18.75);
    expect(payout.driverTransportPayout).toBe(106.25);
    expect(payout.driverPayout).toBe(166.25);
  });

  test("commission and driver transport always sum back to the basis", () => {
    for (const transportFare of [25, 33.33, 41.07, 400.21, 1234.56]) {
      for (const rate of [0.1, 0.12, 0.15]) {
        const payout = quotedOrderPayout({
          transportFare,
          serviceLevelAdjustment: serviceLevelAdjustment(
            "POOLING",
            transportFare,
          ),
          helperFee: 0,
          commissionRate: rate,
        });
        expect(
          Math.round((payout.commission + payout.driverTransportPayout) * 100) /
            100,
        ).toBe(payout.commissionBasis);
      }
    }
  });
});

test.describe("manual quote, usable rates and validity", () => {
  test("only a route strictly over 600 km needs a manual quote", () => {
    expect(isManualQuoteRequired(600)).toBe(false);
    expect(isManualQuoteRequired(600.01)).toBe(true);
    expect(isManualQuoteRequired(450, 400)).toBe(true);
  });

  test("a straight-line fallback distance is scaled by the road detour factor", () => {
    expect(ROAD_DETOUR_FACTOR).toBe(1.3);
    // 470 km as the crow flies is ~611 km by road: no automatic quote.
    expect(isManualQuoteRequired(470, 600, { straightLine: true })).toBe(true);
    expect(isManualQuoteRequired(470, 600)).toBe(false);
    // 460 * 1.3 = 598 km: still quoted.
    expect(isManualQuoteRequired(460, 600, { straightLine: true })).toBe(false);
  });
  test("a zero intercity per-km or city minimum is refused", () => {
    expect(hasUsableRates(MINIVAN)).toBe(true);
    expect(hasUsableRates({ ...MINIVAN, intercityPricePerKm: 0 })).toBe(false);
    expect(hasUsableRates({ ...MINIVAN, cityMinimumFare: 0 })).toBe(false);
    expect(hasUsableRates({ ...MINIVAN, cityMinimumFare: Number.NaN })).toBe(
      false,
    );
  });

  test("a quote is honoured for 20 minutes", () => {
    const quotedAt = new Date("2026-10-16T12:00:00.000Z");
    expect(quoteExpiresAt(quotedAt).toISOString()).toBe(
      "2026-10-16T12:20:00.000Z",
    );
    expect(DEFAULT_PRICING_CONFIG.quoteValidityMinutes).toBe(20);
  });
});

test.describe("parseQuoteFields helper fields", () => {
  const base = {
    pickupAddress: "Rustaveli Ave 1, Tbilisi",
    dropoffAddress: "Chavchavadze Ave 2, Tbilisi",
    vehicleTypeCode: "MINIVAN",
    cargoCategory: "FURNITURE_FURNISHINGS",
  };

  test("maps a legacy helperCount onto both ends, ground floor", () => {
    const result = parseQuoteFields({ ...base, helperCount: 2 });
    expect("data" in result).toBe(true);
    if (!("data" in result)) return;
    expect(result.data.pickupHelp).toEqual({
      helpers: 2,
      floor: 0,
      cargoElevator: false,
      passengerElevator: false,
    });
    expect(result.data.dropoffHelp).toEqual(result.data.pickupHelp);
    expect(result.data.helperCount).toBe(2);
    expect(result.data.tariffVersion).toBeNull();
  });

  test("reads per-location fields and derives helperCount", () => {
    const result = parseQuoteFields({
      ...base,
      helperCount: 4, // ignored once a location field is sent
      pickupHelpers: 1,
      pickupFloor: 5,
      dropoffHelpers: 3,
      pickupPassengerElevator: true,
      dropoffCargoElevator: true,
      tariffVersion: 7,
    });
    expect("data" in result).toBe(true);
    if (!("data" in result)) return;
    expect(result.data.pickupHelp).toEqual({
      helpers: 1,
      floor: 5,
      cargoElevator: false,
      passengerElevator: true,
    });
    expect(result.data.dropoffHelp).toEqual({
      helpers: 3,
      floor: 0,
      cargoElevator: true,
      passengerElevator: false,
    });
    expect(result.data.helperCount).toBe(3);
    expect(result.data.tariffVersion).toBe(7);
  });

  test("refuses out-of-range or mistyped location fields", () => {
    const bad: Record<string, unknown>[] = [
      { pickupHelpers: 5 },
      { dropoffHelpers: -1 },
      { pickupHelpers: 1.5 },
      { pickupFloor: -1 },
      { dropoffFloor: 101 },
      { pickupCargoElevator: "yes" },
      { dropoffPassengerElevator: 1 },
      { tariffVersion: 0 },
      { tariffVersion: "3" },
    ];
    for (const fields of bad) {
      expect("error" in parseQuoteFields({ ...base, ...fields })).toBe(true);
    }
  });
});
