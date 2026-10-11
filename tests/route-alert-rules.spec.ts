/**
 * The rules of a route alert, pinned without a server or a database: what one
 * may hold, how many a driver may save, and which loads it matches.
 */

import { expect, test } from "@playwright/test";

import {
  buildRouteAlertPushMessage,
  ROUTE_ALERT_PUSH_TYPE,
} from "@/lib/push/rules";
import {
  alertMatchesLoad,
  applyRouteAlertInput,
  firstMatchingAlertPerDriver,
  MAX_ALERT_CANDIDATES,
  MAX_ROUTE_ALERT_MIN_PAYOUT,
  MAX_ROUTE_ALERTS_PER_DRIVER,
  ROUTE_ALERT_PUSH_TTL_SECONDS,
  type AlertLoad,
  type RouteAlertFields,
} from "@/lib/route-alerts/rules";
import { WEEKDAYS } from "@/lib/schedule/rules";

const CITIES = ["TBILISI", "BATUMI", "GORI", "RUSTAVI"];

function alert(overrides: Partial<RouteAlertFields> = {}): RouteAlertFields {
  return {
    fromCity: "TBILISI",
    toCity: "BATUMI",
    minPayout: 400,
    days: [...WEEKDAYS],
    enabled: true,
    ...overrides,
  };
}

function load(overrides: Partial<AlertLoad> = {}): AlertLoad {
  return {
    pickupCity: "TBILISI",
    dropoffCity: "BATUMI",
    driverPayout: 450,
    // Monday 5 October 2026, 13:00 in Tbilisi.
    pickupAt: new Date("2026-10-05T09:00:00.000Z"),
    ...overrides,
  };
}

test("the bounds are constants", () => {
  expect(MAX_ROUTE_ALERTS_PER_DRIVER).toBe(10);
  expect(MAX_ALERT_CANDIDATES).toBe(500);
  expect(MAX_ROUTE_ALERT_MIN_PAYOUT).toBe(100_000);
  expect(ROUTE_ALERT_PUSH_TTL_SECONDS).toBe(3600);
});

test.describe("alertMatchesLoad", () => {
  test("matches on both cities, payout and day", () => {
    expect(alertMatchesLoad(alert(), load())).toBe(true);
  });

  test("a switched-off alert matches nothing", () => {
    expect(alertMatchesLoad(alert({ enabled: false }), load())).toBe(false);
  });

  test("the pick-up city must be the alert's", () => {
    expect(alertMatchesLoad(alert(), load({ pickupCity: "GORI" }))).toBe(false);
    expect(alertMatchesLoad(alert(), load({ pickupCity: null }))).toBe(false);
  });

  test("the drop-off city must be the alert's, unless it says anywhere", () => {
    expect(alertMatchesLoad(alert(), load({ dropoffCity: "GORI" }))).toBe(
      false,
    );
    expect(alertMatchesLoad(alert(), load({ dropoffCity: null }))).toBe(false);

    const anywhere = alert({ toCity: null });

    expect(alertMatchesLoad(anywhere, load({ dropoffCity: "GORI" }))).toBe(
      true,
    );
    expect(alertMatchesLoad(anywhere, load({ dropoffCity: null }))).toBe(true);
  });

  test("the driver's payout must reach the minimum", () => {
    expect(alertMatchesLoad(alert(), load({ driverPayout: 399.99 }))).toBe(
      false,
    );
    expect(alertMatchesLoad(alert(), load({ driverPayout: 400 }))).toBe(true);
    expect(
      alertMatchesLoad(alert({ minPayout: 0 }), load({ driverPayout: 1 })),
    ).toBe(true);
  });

  test("the pick-up's Tbilisi weekday must be one of the alert's days", () => {
    const weekdays = alert({ days: ["MON", "TUE", "WED", "THU", "FRI"] });

    expect(alertMatchesLoad(weekdays, load())).toBe(true);
    // Friday 21:00 UTC is Saturday 01:00 in Tbilisi.
    expect(
      alertMatchesLoad(
        weekdays,
        load({ pickupAt: new Date("2026-10-02T21:00:00.000Z") }),
      ),
    ).toBe(false);
    expect(
      alertMatchesLoad(
        alert({ days: ["SAT", "SUN"] }),
        load({ pickupAt: new Date("2026-10-02T21:00:00.000Z") }),
      ),
    ).toBe(true);
  });

  test("a load with no pick-up time matches only an any-day alert", () => {
    expect(alertMatchesLoad(alert(), load({ pickupAt: null }))).toBe(true);
    expect(
      alertMatchesLoad(alert({ days: ["MON"] }), load({ pickupAt: null })),
    ).toBe(false);
  });
});

test.describe("firstMatchingAlertPerDriver", () => {
  test("one alert per driver, the first that matches", () => {
    const matched = firstMatchingAlertPerDriver(
      [
        { ...alert({ toCity: "GORI" }), id: "a1", driverProfileId: "a" },
        { ...alert(), id: "a2", driverProfileId: "a" },
        { ...alert({ toCity: null }), id: "a3", driverProfileId: "a" },
        { ...alert({ minPayout: 900 }), id: "b1", driverProfileId: "b" },
        {
          ...alert({ toCity: null, minPayout: 0 }),
          id: "c1",
          driverProfileId: "c",
        },
      ],
      load(),
    );

    expect([...matched.keys()]).toEqual(["a", "c"]);
    expect(matched.get("a")?.id).toBe("a2");
    expect(matched.get("c")?.id).toBe("c1");
  });
});

test.describe("applyRouteAlertInput", () => {
  const create = (body: unknown) => applyRouteAlertInput(null, body, CITIES);

  test("a new alert needs only a pick-up city; the rest default", () => {
    expect(create({ fromCity: "TBILISI" })).toEqual({
      alert: {
        fromCity: "TBILISI",
        toCity: null,
        minPayout: 0,
        days: [...WEEKDAYS],
        enabled: true,
      },
    });
  });

  test("takes every field", () => {
    expect(
      create({
        fromCity: "GORI",
        toCity: "TBILISI",
        minPayout: 250,
        days: ["SUN", "SAT"],
        enabled: false,
      }),
    ).toEqual({
      alert: {
        fromCity: "GORI",
        toCity: "TBILISI",
        minPayout: 250,
        days: ["SAT", "SUN"],
        enabled: false,
      },
    });
  });

  test("the same city at both ends is allowed", () => {
    expect(create({ fromCity: "TBILISI", toCity: "TBILISI" })).toMatchObject({
      alert: { fromCity: "TBILISI", toCity: "TBILISI" },
    });
  });

  test("refuses a city that is not in the real list", () => {
    expect(create({})).toEqual({
      refusal: { reason: "INVALID_CITY", field: "fromCity" },
    });
    expect(create({ fromCity: "Tbilisi" })).toEqual({
      refusal: { reason: "INVALID_CITY", field: "fromCity" },
    });
    expect(create({ fromCity: "TBILISI", toCity: "PARIS" })).toEqual({
      refusal: { reason: "INVALID_CITY", field: "toCity" },
    });
  });

  test("refuses a bad minimum payout, day list or switch", () => {
    for (const minPayout of [-1, MAX_ROUTE_ALERT_MIN_PAYOUT + 1, "400", NaN]) {
      expect(create({ fromCity: "TBILISI", minPayout })).toEqual({
        refusal: { reason: "INVALID_MIN_PAYOUT" },
      });
    }

    expect(create({ fromCity: "TBILISI", days: [] })).toEqual({
      refusal: { reason: "INVALID_DAYS" },
    });
    expect(create({ fromCity: "TBILISI", days: ["Weekdays"] })).toEqual({
      refusal: { reason: "INVALID_DAYS" },
    });
    expect(create({ fromCity: "TBILISI", enabled: "on" })).toEqual({
      refusal: { reason: "NOT_A_BOOLEAN", field: "enabled" },
    });
    expect(create(null)).toEqual({ refusal: { reason: "NOT_AN_OBJECT" } });
  });

  test("an update changes only what is sent, and must change something", () => {
    const current = alert();

    expect(applyRouteAlertInput(current, { enabled: false }, CITIES)).toEqual({
      alert: { ...current, enabled: false },
    });
    expect(applyRouteAlertInput(current, { toCity: null }, CITIES)).toEqual({
      alert: { ...current, toCity: null },
    });
    expect(applyRouteAlertInput(current, {}, CITIES)).toEqual({
      refusal: { reason: "NOTHING_TO_UPDATE" },
    });
    expect(current).toEqual(alert());
  });
});

test.describe("buildRouteAlertPushMessage", () => {
  const message = buildRouteAlertPushMessage({
    token: "ExponentPushToken[abc]",
    alertId: "alert_1",
    orderId: "order_1",
    title: "New load on your route",
    body: "A load matching one of your route alerts was just posted.",
    ttlSeconds: ROUTE_ALERT_PUSH_TTL_SECONDS,
  });

  test("carries ids and generic wording, and nothing about the load", () => {
    expect(message).toEqual({
      to: "ExponentPushToken[abc]",
      title: "New load on your route",
      body: "A load matching one of your route alerts was just posted.",
      sound: "default",
      priority: "default",
      ttl: 3600,
      data: { type: "ROUTE_ALERT", alertId: "alert_1", orderId: "order_1" },
    });
    expect(ROUTE_ALERT_PUSH_TYPE).toBe("ROUTE_ALERT");
  });
});
