/**
 * The booking form's pricing-model-v1 helpers:
 * `src/components/home/booking-pricing.ts`, the per-location helper fields in
 * the booking draft, and the checkout summary's helper wording.
 *
 * Pure: no browser, no network, no database. Run with
 * `E2E_BASE_URL=http://localhost:1 npx playwright test tests/booking-pricing.spec.ts`.
 */

import { expect, test } from "@playwright/test";

import {
  HELPER_TIME_NOTE_VALUES,
  MAX_BOOKING_FLOOR,
  NO_LOCATION_HELP,
  helperTimeNoteValues,
  isQuoteExpired,
  locationHelpBody,
  locationHelpFromOrder,
  minimumFareApplied,
  normaliseLocationHelp,
  parseFloorInput,
  pricingRefusalOf,
  quotedTotalChanged,
  readLocationHelp,
  transportCharge,
} from "@/components/home/booking-pricing";
import {
  helperFeeSplit,
  helperLocationLabels,
  transportationCost,
} from "@/app/[locale]/checkout/checkout-format";
import { MAX_FLOOR, parseQuoteFields } from "@/lib/pricing";

const BASE_QUOTE_BODY = {
  pickupAddress: "Tbilisi",
  dropoffAddress: "Batumi",
  vehicleTypeCode: "MINIVAN",
  cargoCategory: "APPLIANCES",
};

test.describe("location help normalisation", () => {
  test("with no helpers the floor and elevators are kept (Contact Info)", () => {
    expect(
      normaliseLocationHelp({
        helpers: 0,
        floor: 7,
        cargoElevator: true,
        passengerElevator: true,
      }),
    ).toEqual({
      helpers: 0,
      floor: 7,
      cargoElevator: true,
      passengerElevator: true,
    });
  });

  test("helpers and floor are clamped to whole numbers in range", () => {
    expect(
      normaliseLocationHelp({
        helpers: 9,
        floor: 250,
        cargoElevator: true,
        passengerElevator: false,
      }),
    ).toEqual({
      helpers: 4,
      floor: MAX_BOOKING_FLOOR,
      cargoElevator: true,
      passengerElevator: false,
    });
    expect(
      normaliseLocationHelp({
        helpers: 1.6,
        floor: -3,
        cargoElevator: false,
        passengerElevator: true,
      }),
    ).toEqual({
      helpers: 2,
      floor: 0,
      cargoElevator: false,
      passengerElevator: true,
    });
  });

  test("the form's floor bound matches the server's", () => {
    expect(MAX_BOOKING_FLOOR).toBe(MAX_FLOOR);
  });

  test("the floor field reads digits only, empty as ground floor", () => {
    expect(parseFloorInput("")).toBe(0);
    expect(parseFloorInput("03")).toBe(3);
    expect(parseFloorInput("7a")).toBe(7);
    expect(parseFloorInput("999")).toBe(MAX_BOOKING_FLOOR);
  });

  test("the body is the eight fields parseQuoteFields accepts", () => {
    const body = locationHelpBody(
      { helpers: 2, floor: 3, cargoElevator: false, passengerElevator: true },
      { helpers: 0, floor: 6, cargoElevator: true, passengerElevator: false },
    );
    expect(body).toEqual({
      pickupHelpers: 2,
      pickupFloor: 3,
      pickupCargoElevator: false,
      pickupPassengerElevator: true,
      dropoffHelpers: 0,
      dropoffFloor: 6,
      dropoffCargoElevator: true,
      dropoffPassengerElevator: false,
    });

    const parsed = parseQuoteFields({
      ...BASE_QUOTE_BODY,
      ...body,
      tariffVersion: 3,
    });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.data.pickupHelp).toEqual({
      helpers: 2,
      floor: 3,
      cargoElevator: false,
      passengerElevator: true,
    });
    expect(parsed.data.dropoffHelp).toEqual({
      helpers: 0,
      floor: 6,
      cargoElevator: true,
      passengerElevator: false,
    });
    expect(parsed.data.tariffVersion).toBe(3);
  });
});

test.describe("re-opening an order", () => {
  const v1 = {
    helperCount: 2,
    pickupHelpers: 2,
    pickupFloor: 3,
    pickupCargoElevator: true,
    pickupPassengerElevator: true,
    dropoffHelpers: 0,
    dropoffFloor: 0,
    dropoffCargoElevator: false,
    dropoffPassengerElevator: false,
    tariffVersion: 1,
  };

  test("a v1 order re-opens with its own per-location values", () => {
    expect(locationHelpFromOrder(v1)).toEqual({
      pickup: {
        helpers: 2,
        floor: 3,
        cargoElevator: true,
        passengerElevator: true,
      },
      dropoff: NO_LOCATION_HELP,
    });
  });

  test("a pre-v1 order re-opens with its crew at both ends", () => {
    expect(
      locationHelpFromOrder({
        ...v1,
        pickupHelpers: 0,
        pickupFloor: 0,
        pickupCargoElevator: false,
        pickupPassengerElevator: false,
        tariffVersion: null,
      }),
    ).toEqual({
      pickup: { ...NO_LOCATION_HELP, helpers: 2 },
      dropoff: { ...NO_LOCATION_HELP, helpers: 2 },
    });
  });

  test("a draft location is parsed, not trusted", () => {
    expect(
      readLocationHelp({
        helpers: 3,
        floor: 12,
        cargoElevator: true,
        passengerElevator: true,
      }),
    ).toEqual({
      helpers: 3,
      floor: 12,
      cargoElevator: true,
      passengerElevator: true,
    });
    expect(readLocationHelp({ helpers: 7, floor: 2 })).toEqual({
      helpers: 4,
      floor: 2,
      cargoElevator: false,
      passengerElevator: false,
    });
    expect(readLocationHelp("2 helpers")).toBeNull();
    expect(readLocationHelp({ helpers: "2", floor: 0 })).toBeNull();
    expect(readLocationHelp(undefined)).toBeNull();
  });
});

test.describe("reading a quote back", () => {
  // The sheet's verification case: MINIVAN intercity, 259.4 km, return 0.35,
  // 2 helpers floor 3 at pickup + 2 helpers floor 6 at drop-off.
  const intercity = {
    tripType: "INTERCITY" as const,
    baseFare: 15,
    distanceFare: 285.34,
    timeFare: 0,
    returnFare: 99.87,
    transportFare: 400.21,
    helperFee: 80,
    price: 480.21,
  };

  test("transport is the server's transportFare", () => {
    expect(transportCharge(intercity)).toBe(400.21);
    expect(transportationCost(intercity)).toBe(400.21);
  });

  test("a pre-v1 order falls back to price minus helpers", () => {
    const legacy = {
      baseFare: 20,
      distanceFare: 10,
      timeFare: 5,
      helperFee: 30,
      price: 65,
    };
    expect(transportCharge(legacy)).toBe(35);
    expect(transportationCost({ ...legacy, transportFare: null })).toBe(35);
  });

  test("intercity never shows the minimum-fare note", () => {
    expect(minimumFareApplied(intercity)).toBe(false);
  });

  test("a city trip floored at its minimum shows the note", () => {
    const floored = {
      tripType: "CITY" as const,
      baseFare: 15,
      distanceFare: 2.7,
      timeFare: 1.6,
      returnFare: 0,
      transportFare: 25,
      helperFee: 30,
      price: 55,
    };
    expect(minimumFareApplied(floored)).toBe(true);
    expect(
      minimumFareApplied({ ...floored, transportFare: 19.3, price: 49.3 }),
    ).toBe(false);
  });

  test("the helper-time note quotes the 60 / 30 / 10 GEL rule", () => {
    expect(HELPER_TIME_NOTE_VALUES).toEqual({
      includedMinutes: 60,
      incrementMinutes: 30,
      fee: 10,
    });
  });

  test("the note uses the live rules a quote carries, defaults otherwise", () => {
    expect(
      helperTimeNoteValues({
        includedMinutes: 45,
        overtimeIncrementMinutes: 15,
        overtimeFeePerIncrement: 12.5,
      }),
    ).toEqual({ includedMinutes: 45, incrementMinutes: 15, fee: 12.5 });
    expect(helperTimeNoteValues(undefined)).toEqual(HELPER_TIME_NOTE_VALUES);
    expect(
      helperTimeNoteValues({
        includedMinutes: -1,
        overtimeIncrementMinutes: "30",
        overtimeFeePerIncrement: Number.NaN,
      }),
    ).toEqual(HELPER_TIME_NOTE_VALUES);
  });
});

test.describe("quote validity and refusals", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");

  test("a quote past its expiry is re-quoted; one still valid is not", () => {
    expect(isQuoteExpired("2026-10-16T11:59:59Z", now)).toBe(true);
    expect(isQuoteExpired("2026-10-16T12:00:00Z", now)).toBe(true);
    expect(isQuoteExpired("2026-10-16T12:19:00Z", now)).toBe(false);
  });

  test("a missing or unreadable expiry counts as expired", () => {
    expect(isQuoteExpired(undefined, now)).toBe(true);
    expect(isQuoteExpired(null, now)).toBe(true);
    expect(isQuoteExpired("soon", now)).toBe(true);
  });

  test("refusals are read from the machine-readable reason", () => {
    expect(pricingRefusalOf({ reason: "manual_quote_required" })).toBe(
      "manual_quote",
    );
    expect(pricingRefusalOf({ reason: "tariff_changed" })).toBe(
      "tariff_changed",
    );
    expect(pricingRefusalOf({ reason: "unresolved_address" })).toBeNull();
    expect(pricingRefusalOf({ error: "Prices were updated" })).toBeNull();
    expect(pricingRefusalOf(null)).toBeNull();
  });

  test("a re-quote only interrupts when the total moved by a tetri", () => {
    expect(quotedTotalChanged(480.21, 480.21)).toBe(false);
    expect(quotedTotalChanged(480.21, 480.2100001)).toBe(false);
    expect(quotedTotalChanged(480.21, 480.22)).toBe(true);
  });
});

test.describe("checkout helper wording", () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    `${key}${values ? JSON.stringify(values) : ""}`;

  test("a v1 order gets one line per end, floor and elevator only with helpers", () => {
    const labels = helperLocationLabels(
      {
        helperCount: 2,
        pickupHelpers: 2,
        pickupFloor: 3,
        pickupCargoElevator: true,
        pickupPassengerElevator: true,
        dropoffHelpers: 0,
        dropoffFloor: 4,
        dropoffCargoElevator: false,
        dropoffPassengerElevator: true,
        tariffVersion: 1,
      },
      t,
    );
    expect(labels).toEqual({
      pickup:
        'checkout.helperCount{"count":2} · checkout.helperFloor{"floor":3} · checkout.passengerElevator · checkout.cargoElevator',
      dropoff: 'checkout.helperCount{"count":0}',
    });
  });

  test("a pre-v1 order keeps its single helpers row", () => {
    expect(
      helperLocationLabels(
        {
          helperCount: 2,
          pickupHelpers: 0,
          pickupFloor: 0,
          pickupCargoElevator: false,
          pickupPassengerElevator: false,
          dropoffHelpers: 0,
          dropoffFloor: 0,
          dropoffCargoElevator: false,
          dropoffPassengerElevator: false,
          tariffVersion: null,
        },
        t,
      ),
    ).toBeNull();
  });
});

test.describe("checkout helper charge per end", () => {
  test("a v1 order splits the helper charge by end", () => {
    // The sheet's verification case: 2 helpers floor 3 + 2 helpers floor 6.
    expect(
      helperFeeSplit({
        tariffVersion: 1,
        helperFee: 80,
        pickupHelperFee: 30,
        dropoffHelperFee: 50,
      }),
    ).toEqual({ pickup: 30, dropoff: 50 });
  });

  test("a pre-v1 order, or a split that fails to reconcile, keeps one line", () => {
    const legacy = {
      tariffVersion: null,
      helperFee: 40,
      pickupHelperFee: 0,
      dropoffHelperFee: 0,
    };
    expect(helperFeeSplit(legacy)).toBeNull();
    expect(helperFeeSplit({ ...legacy, tariffVersion: 1 })).toBeNull();
    expect(
      helperFeeSplit({
        tariffVersion: 1,
        helperFee: 0,
        pickupHelperFee: 0,
        dropoffHelperFee: 0,
      }),
    ).toBeNull();
  });
});
