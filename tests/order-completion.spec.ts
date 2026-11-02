/**
 * Closing a delivery (`POST /api/orders/[id]/complete`): the helper-minute
 * rules and the money completion writes, from `src/lib/orders/completion.ts`,
 * plus how the client's total picks up helper overtime (`adminOrderTotalGel`,
 * which the service document prints).
 *
 * Pure functions only — no browser, no server, no database. The route itself
 * writes to the shared production database and is not exercised here.
 */

import { expect, test } from "@playwright/test";

import { adminOrderTotalGel } from "@/lib/admin/orders-filters";
import {
  completionMoney,
  MAX_HELPER_MINUTES,
  resolveHelperMinutes,
} from "@/lib/orders/completion";
import {
  hasStopWork,
  helperMinutesRequired,
  stopWorkOf,
} from "@/lib/orders/stop-work";
import { DEFAULT_PRICING_CONFIG } from "@/lib/pricing-engine";

const V1_ORDER = {
  tariffVersion: 3,
  commissionRate: 0.12,
  pickupHelpers: 2,
  dropoffHelpers: 0,
};

const PRE_V1_ORDER = {
  tariffVersion: null,
  commissionRate: 0.15,
  pickupHelpers: 0,
  dropoffHelpers: 0,
};

test.describe("resolveHelperMinutes", () => {
  test("requires the minutes at a stop that had helpers", () => {
    expect(
      resolveHelperMinutes(
        { pickupHelperMinutes: undefined, dropoffHelperMinutes: undefined },
        V1_ORDER,
      ),
    ).toEqual({ denial: { kind: "REQUIRED", stop: "pickup" } });

    expect(
      resolveHelperMinutes(
        { pickupHelperMinutes: null, dropoffHelperMinutes: 10 },
        { ...V1_ORDER, dropoffHelpers: 1 },
      ),
    ).toEqual({ denial: { kind: "REQUIRED", stop: "pickup" } });

    expect(
      resolveHelperMinutes(
        { pickupHelperMinutes: 45, dropoffHelperMinutes: undefined },
        { ...V1_ORDER, dropoffHelpers: 1 },
      ),
    ).toEqual({ denial: { kind: "REQUIRED", stop: "dropoff" } });
  });

  test("stores null at a stop without helpers, whatever was sent", () => {
    expect(
      resolveHelperMinutes(
        { pickupHelperMinutes: 75, dropoffHelperMinutes: 30 },
        V1_ORDER,
      ),
    ).toEqual({
      data: { pickupHelperMinutes: 75, dropoffHelperMinutes: null },
    });
  });

  for (const bad of [-1, 1.5, "60", true, MAX_HELPER_MINUTES + 1, Number.NaN]) {
    test(`refuses ${String(bad)} as minutes, at either stop`, () => {
      expect(
        resolveHelperMinutes(
          { pickupHelperMinutes: bad, dropoffHelperMinutes: undefined },
          V1_ORDER,
        ),
      ).toEqual({ denial: { kind: "INVALID", stop: "pickup" } });
      expect(
        resolveHelperMinutes(
          { pickupHelperMinutes: 0, dropoffHelperMinutes: bad },
          V1_ORDER,
        ),
      ).toEqual({ denial: { kind: "INVALID", stop: "dropoff" } });
    });
  }

  test("accepts 0 and a full day", () => {
    expect(
      resolveHelperMinutes(
        { pickupHelperMinutes: 0, dropoffHelperMinutes: MAX_HELPER_MINUTES },
        { ...V1_ORDER, dropoffHelpers: 1 },
      ),
    ).toEqual({
      data: {
        pickupHelperMinutes: 0,
        dropoffHelperMinutes: MAX_HELPER_MINUTES,
      },
    });
  });

  test("asks a pre-v1 order for nothing and stores nothing", () => {
    expect(
      resolveHelperMinutes(
        { pickupHelperMinutes: undefined, dropoffHelperMinutes: undefined },
        PRE_V1_ORDER,
      ),
    ).toEqual({
      data: { pickupHelperMinutes: null, dropoffHelperMinutes: null },
    });
    // Even helpers on the row (never written pre-v1) do not make it required.
    expect(
      resolveHelperMinutes(
        { pickupHelperMinutes: 200, dropoffHelperMinutes: undefined },
        { ...PRE_V1_ORDER, pickupHelpers: 2 },
      ),
    ).toEqual({
      data: { pickupHelperMinutes: null, dropoffHelperMinutes: null },
    });
  });
});

test.describe("completionMoney", () => {
  const vehicle = { freeLoadingMinutes: 30, overtimeRatePerMinute: 0.5 };

  test("a pre-v1 order completes exactly as before", () => {
    // 50 waiting minutes, 30 free -> 20 * 0.5 = 10 GEL; 85% to the driver.
    expect(
      completionMoney({
        order: PRE_V1_ORDER,
        waitingMinutes: 50,
        ...vehicle,
        pickupHelperMinutes: null,
        dropoffHelperMinutes: null,
        helperRules: null,
      }),
    ).toEqual({
      overtimeFee: 10,
      helperOvertimeFee: 0,
      overtimeDriverPayout: 8.5,
    });
  });

  test("helper overtime is charged per started half hour and paid in full", () => {
    // Pickup: 2 helpers, 95 min -> ceil(35/30) = 2 increments * 2 * 10 = 40.
    // Waiting: 40 min, 30 free -> 10 * 0.5 = 5, commissioned at 12% -> 4.40.
    const money = completionMoney({
      order: V1_ORDER,
      waitingMinutes: 40,
      ...vehicle,
      pickupHelperMinutes: 95,
      dropoffHelperMinutes: null,
      helperRules: DEFAULT_PRICING_CONFIG,
    });

    expect(money).toEqual({
      overtimeFee: 5,
      helperOvertimeFee: 40,
      overtimeDriverPayout: 44.4,
    });
  });

  test("no helper overtime within the included hour", () => {
    expect(
      completionMoney({
        order: { ...V1_ORDER, dropoffHelpers: 3 },
        waitingMinutes: 0,
        ...vehicle,
        pickupHelperMinutes: 60,
        dropoffHelperMinutes: 61,
        helperRules: DEFAULT_PRICING_CONFIG,
      }),
    ).toEqual({
      overtimeFee: 0,
      // Dropoff: 3 helpers * 1 started increment * 10.
      helperOvertimeFee: 30,
      overtimeDriverPayout: 30,
    });
  });

  test("uses the configured helper rules", () => {
    expect(
      completionMoney({
        order: V1_ORDER,
        waitingMinutes: 0,
        ...vehicle,
        pickupHelperMinutes: 50,
        dropoffHelperMinutes: null,
        helperRules: {
          helperIncludedMinutes: 30,
          helperOvertimeIncrementMinutes: 15,
          helperOvertimeFeePerIncrement: 7.5,
        },
      }).helperOvertimeFee,
    ).toBe(2 * 2 * 7.5);
  });
});

test.describe("the client's total", () => {
  test("adds helper overtime exactly as it adds waiting overtime", () => {
    expect(
      adminOrderTotalGel({
        price: 480.21,
        serviceLevelAdjustment: 0,
        overtimeFee: 5,
        helperOvertimeFee: 40,
      }),
    ).toBe(525.21);
    // A caller without the column still gets the pre-v1 sum.
    expect(
      adminOrderTotalGel({
        price: 100,
        serviceLevelAdjustment: 25,
        overtimeFee: 0,
      }),
    ).toBe(125);
  });
});

test.describe("stop work", () => {
  const row = {
    pickupHelpers: 2,
    pickupFloor: 3,
    pickupCargoElevator: false,
    pickupPassengerElevator: true,
    dropoffHelpers: 0,
    dropoffFloor: 0,
    dropoffCargoElevator: false,
    dropoffPassengerElevator: false,
    tariffVersion: 1,
  };

  test("shapes both stops from the row", () => {
    expect(stopWorkOf(row)).toEqual({
      pickupWork: {
        helpers: 2,
        floor: 3,
        cargoElevator: false,
        passengerElevator: true,
        helperMinutesRequired: true,
      },
      dropoffWork: {
        helpers: 0,
        floor: 0,
        cargoElevator: false,
        passengerElevator: false,
        helperMinutesRequired: false,
      },
    });
  });

  test("helper minutes are required only on a v1 order, where helpers were booked", () => {
    // A pre-v1 order's per-stop helpers were backfilled from helperCount by
    // the migration; it had no helper overtime, so no minutes are asked for.
    const legacy = stopWorkOf({ ...row, tariffVersion: null });
    expect(legacy.pickupWork.helperMinutesRequired).toBe(false);
    expect(legacy.dropoffWork.helperMinutesRequired).toBe(false);
    expect(helperMinutesRequired(1, 2)).toBe(true);
    expect(helperMinutesRequired(1, 0)).toBe(false);
    expect(helperMinutesRequired(null, 2)).toBe(false);
  });

  test("a stop at the column defaults says nothing", () => {
    const { pickupWork, dropoffWork } = stopWorkOf(row);
    expect(hasStopWork(pickupWork)).toBe(true);
    expect(hasStopWork(dropoffWork)).toBe(false);
    expect(
      hasStopWork({
        helpers: 0,
        floor: 0,
        cargoElevator: true,
        passengerElevator: false,
        helperMinutesRequired: false,
      }),
    ).toBe(true);
    expect(
      hasStopWork({
        helpers: 0,
        floor: 0,
        cargoElevator: false,
        passengerElevator: true,
        helperMinutesRequired: false,
      }),
    ).toBe(true);
  });
});
