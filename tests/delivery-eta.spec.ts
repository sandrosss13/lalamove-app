/**
 * The tracking page's arrival estimate — which stop the driver is timed to,
 * what the straight-line fallback says when routing is unavailable, and when
 * the per-order cache reuses a route instead of spending another LocationIQ
 * lookup.
 *
 * The cache rules are the part worth pinning hardest. `GET
 * /api/orders/[id]/location` is polled every five seconds per open tracking
 * page, and LocationIQ's free tier is 2 req/sec shared with every geocode the
 * booking form spends; a cache that recomputes on every poll fails silently
 * (the page still shows a number) until the quote form starts getting 429s.
 * So each reuse/recompute trigger is asserted by counting calls to a stub
 * fetcher.
 *
 * **Why this runs with no browser and no database**, as
 * `tests/dispatch-fit.spec.ts` does: `src/lib/orders/delivery-eta.ts` keeps
 * Prisma out of its imports and signatures (the status is a plain string), and
 * takes the route fetcher and the clock as parameters. The real `getRoute` is
 * never called here.
 */

import { expect, test } from "@playwright/test";

import { AVERAGE_SPEED_KMH, haversineDistanceKm, type Route } from "@/lib/geo";
import {
  buildDeliveryEta,
  canReuseCachedEta,
  createDeliveryEtaCalculator,
  ETA_MAX_AGE_MS,
  estimateMinutesFromDistanceKm,
  etaLegFor,
  etaTargetForStatus,
  roundEtaMinutes,
  type DeliveryEtaInput,
  type RouteFetcher,
} from "@/lib/orders/delivery-eta";

/** Liberty Square, Tbilisi — the driver's starting point in most cases. */
const DRIVER = { lat: 41.6934, lng: 44.8015 };
/** Roughly 1.1 km north-east of `DRIVER`. */
const PICKUP = { lat: 41.7015, lng: 44.8095 };
/** Roughly 6 km from `PICKUP`. */
const DROPOFF = { lat: 41.7451, lng: 44.7769 };

/** A fixed epoch so every arrival instant below is exact. */
const T0 = Date.UTC(2026, 9, 12, 12, 0, 0);

/** Offset a position north by `metres` (one degree of latitude ≈ 111.2 km). */
function northBy(point: { lat: number; lng: number }, metres: number) {
  return { lat: point.lat + metres / 111_195, lng: point.lng };
}

function input(overrides: Partial<DeliveryEtaInput> = {}): DeliveryEtaInput {
  return {
    status: "ACCEPTED",
    driver: DRIVER,
    pickup: PICKUP,
    dropoff: DROPOFF,
    ...overrides,
  };
}

/**
 * A stub fetcher that records each call and answers with a fixed duration (or
 * with null, as `getRoute` does when LocationIQ is unavailable).
 */
function stubFetcher(durationMinutes: number | null) {
  const calls: { from: unknown; to: unknown }[] = [];
  const fetchRoute: RouteFetcher = async (from, to) => {
    calls.push({ from, to });
    if (durationMinutes === null) return null;
    const route: Route = { distanceKm: 1, durationMinutes, path: [from, to] };
    return route;
  };
  return { calls, fetchRoute };
}

/** A clock the test moves by hand. */
function manualClock(start = T0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

test.describe("target by status", () => {
  test("ACCEPTED times the pickup, IN_TRANSIT the dropoff", () => {
    expect(etaTargetForStatus("ACCEPTED")).toBe("PICKUP");
    expect(etaTargetForStatus("IN_TRANSIT")).toBe("DROPOFF");
  });

  test("every other status has no target — CLAIMED has no driver dispatched yet", () => {
    for (const status of [
      "INITIATED",
      "PENDING",
      "CLAIMED",
      "COMPLETED",
      "CANCELLED",
    ]) {
      expect(etaTargetForStatus(status)).toBeNull();
    }
  });

  test("the leg runs from the driver to the status's stop", () => {
    expect(etaLegFor(input())).toEqual({
      target: "PICKUP",
      from: DRIVER,
      to: PICKUP,
    });
    expect(etaLegFor(input({ status: "IN_TRANSIT" }))).toEqual({
      target: "DROPOFF",
      from: DRIVER,
      to: DROPOFF,
    });
  });

  test("no leg without a driver position or without the target's coordinates", () => {
    expect(etaLegFor(input({ driver: null }))).toBeNull();
    expect(etaLegFor(input({ pickup: null }))).toBeNull();
    expect(
      etaLegFor(input({ status: "IN_TRANSIT", dropoff: null })),
    ).toBeNull();
    // The *other* stop missing does not matter.
    expect(etaLegFor(input({ dropoff: null }))?.target).toBe("PICKUP");
  });
});

test.describe("fallback and rounding", () => {
  test("straight-line fallback drives at the shared average speed", () => {
    expect(AVERAGE_SPEED_KMH).toBe(30);
    expect(estimateMinutesFromDistanceKm(15)).toBe(30);
    expect(estimateMinutesFromDistanceKm(1)).toBe(2);
  });

  test("minutes round up and never fall below 1", () => {
    expect(roundEtaMinutes(7.01)).toBe(8);
    expect(roundEtaMinutes(8)).toBe(8);
    expect(roundEtaMinutes(0.2)).toBe(1);
    expect(roundEtaMinutes(0)).toBe(1);
    expect(roundEtaMinutes(-3)).toBe(1);
    expect(roundEtaMinutes(Number.NaN)).toBe(1);
  });

  test("an arrival in the past reads as one minute from now", () => {
    const eta = buildDeliveryEta("DROPOFF", T0 - 120_000, "ROUTE", T0);
    expect(eta.minutes).toBe(1);
    expect(eta.arrivesAt).toBe(new Date(T0 + 60_000).toISOString());
  });
});

test.describe("calculator", () => {
  test("a route gives a ROUTE-basis ETA measured from now", async () => {
    const clock = manualClock();
    const { calls, fetchRoute } = stubFetcher(7.4);
    const calc = createDeliveryEtaCalculator({ fetchRoute, now: clock.now });

    const eta = await calc.getEta("o1", input());

    expect(calls).toHaveLength(1);
    expect(eta).toEqual({
      target: "PICKUP",
      minutes: 8,
      arrivesAt: new Date(T0 + 7.4 * 60_000).toISOString(),
      basis: "ROUTE",
    });
  });

  test("no route falls back to straight-line distance, marked ESTIMATE", async () => {
    const clock = manualClock();
    const { fetchRoute } = stubFetcher(null);
    const calc = createDeliveryEtaCalculator({ fetchRoute, now: clock.now });

    const eta = await calc.getEta("o1", input());
    const expected = estimateMinutesFromDistanceKm(
      haversineDistanceKm(DRIVER, PICKUP),
    );

    expect(eta?.basis).toBe("ESTIMATE");
    expect(eta?.minutes).toBe(Math.ceil(expected));
  });

  test("a throwing fetcher also falls back rather than rejecting", async () => {
    const calc = createDeliveryEtaCalculator({
      fetchRoute: async () => {
        throw new Error("boom");
      },
      now: manualClock().now,
    });
    expect((await calc.getEta("o1", input()))?.basis).toBe("ESTIMATE");
  });

  test("no ETA for an inapplicable order, and no lookup spent on it", async () => {
    const { calls, fetchRoute } = stubFetcher(5);
    const calc = createDeliveryEtaCalculator({ fetchRoute });

    expect(await calc.getEta("o1", input({ status: "CLAIMED" }))).toBeNull();
    expect(await calc.getEta("o1", input({ driver: null }))).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

test.describe("cache", () => {
  test("polls within the window reuse the route and count down", async () => {
    const clock = manualClock();
    const { calls, fetchRoute } = stubFetcher(10);
    const calc = createDeliveryEtaCalculator({ fetchRoute, now: clock.now });

    await calc.getEta("o1", input());
    clock.advance(30_000);
    // A small GPS drift, well under the reroute threshold.
    const eta = await calc.getEta("o1", input({ driver: northBy(DRIVER, 40) }));

    expect(calls).toHaveLength(1);
    // Same arrival instant, half a minute closer to it.
    expect(eta?.arrivesAt).toBe(new Date(T0 + 10 * 60_000).toISOString());
    expect(eta?.minutes).toBe(10); // ceil(9.5)
  });

  test("moving past the threshold recomputes", async () => {
    const clock = manualClock();
    const { calls, fetchRoute } = stubFetcher(10);
    const calc = createDeliveryEtaCalculator({ fetchRoute, now: clock.now });

    await calc.getEta("o1", input());
    clock.advance(5_000);
    await calc.getEta("o1", input({ driver: northBy(DRIVER, 300) }));

    expect(calls).toHaveLength(2);
  });

  test("an entry older than the max age recomputes even if the driver is still", async () => {
    const clock = manualClock();
    const { calls, fetchRoute } = stubFetcher(10);
    const calc = createDeliveryEtaCalculator({ fetchRoute, now: clock.now });

    await calc.getEta("o1", input());
    clock.advance(ETA_MAX_AGE_MS);
    await calc.getEta("o1", input());
    expect(calls).toHaveLength(1);

    clock.advance(1);
    await calc.getEta("o1", input());
    expect(calls).toHaveLength(2);
  });

  test("a change of target recomputes — pickup reached, now heading to dropoff", async () => {
    const clock = manualClock();
    const { calls, fetchRoute } = stubFetcher(10);
    const calc = createDeliveryEtaCalculator({ fetchRoute, now: clock.now });

    await calc.getEta("o1", input());
    const eta = await calc.getEta("o1", input({ status: "IN_TRANSIT" }));

    expect(calls).toHaveLength(2);
    expect(calls[1]?.to).toEqual(DROPOFF);
    expect(eta?.target).toBe("DROPOFF");
  });

  test("a moved target stop recomputes", async () => {
    const clock = manualClock();
    const { calls, fetchRoute } = stubFetcher(10);
    const calc = createDeliveryEtaCalculator({ fetchRoute, now: clock.now });

    await calc.getEta("o1", input());
    await calc.getEta("o1", input({ pickup: northBy(PICKUP, 500) }));

    expect(calls).toHaveLength(2);
  });

  test("an ESTIMATE is cached too, so a failing LocationIQ is not retried every poll", async () => {
    const clock = manualClock();
    const { calls, fetchRoute } = stubFetcher(null);
    const calc = createDeliveryEtaCalculator({ fetchRoute, now: clock.now });

    await calc.getEta("o1", input());
    clock.advance(5_000);
    const eta = await calc.getEta("o1", input());

    expect(calls).toHaveLength(1);
    expect(eta?.basis).toBe("ESTIMATE");
  });

  test("orders are cached independently", async () => {
    const { calls, fetchRoute } = stubFetcher(10);
    const calc = createDeliveryEtaCalculator({
      fetchRoute,
      now: manualClock().now,
    });

    await calc.getEta("o1", input());
    await calc.getEta("o2", input());
    await calc.getEta("o1", input());

    expect(calls).toHaveLength(2);
  });

  test("the cache is bounded, evicting the least recently refreshed order", async () => {
    const { calls, fetchRoute } = stubFetcher(10);
    const calc = createDeliveryEtaCalculator({
      fetchRoute,
      now: manualClock().now,
      maxEntries: 2,
    });

    await calc.getEta("o1", input());
    await calc.getEta("o2", input());
    await calc.getEta("o3", input());
    expect(calc.size()).toBe(2);
    expect(calls).toHaveLength(3);

    // o1 was evicted and routes again; o3 is still cached.
    await calc.getEta("o3", input());
    expect(calls).toHaveLength(3);
    await calc.getEta("o1", input());
    expect(calls).toHaveLength(4);
  });

  test("an order whose ETA stops applying is dropped from the cache", async () => {
    const { fetchRoute } = stubFetcher(10);
    const calc = createDeliveryEtaCalculator({
      fetchRoute,
      now: manualClock().now,
    });

    await calc.getEta("o1", input());
    expect(calc.size()).toBe(1);
    await calc.getEta("o1", input({ status: "COMPLETED" }));
    expect(calc.size()).toBe(0);
  });
});

test("the pure reuse rule agrees with the calculator's thresholds", () => {
  const cached = {
    target: "PICKUP" as const,
    from: DRIVER,
    to: PICKUP,
    arrivesAtMs: T0 + 600_000,
    basis: "ROUTE" as const,
    computedAtMs: T0,
  };
  const leg = { target: "PICKUP" as const, from: DRIVER, to: PICKUP };

  expect(canReuseCachedEta(cached, leg, T0 + 1_000)).toBe(true);
  expect(
    canReuseCachedEta(cached, { ...leg, from: northBy(DRIVER, 140) }, T0),
  ).toBe(true);
  expect(
    canReuseCachedEta(cached, { ...leg, from: northBy(DRIVER, 160) }, T0),
  ).toBe(false);
  expect(canReuseCachedEta(cached, leg, T0 + ETA_MAX_AGE_MS + 1)).toBe(false);
});
