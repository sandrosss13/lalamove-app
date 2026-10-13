/**
 * The expected arrival time shown on the client's "Track delivery" page — where
 * the assigned driver is heading next, and roughly when they will get there.
 *
 * `GET /api/orders/[id]/location` is polled every five seconds by every open
 * tracking page, and the only real source of a driving time is LocationIQ's
 * directions endpoint (`getRoute` in `@/lib/geo`), which shares one 2 req/sec
 * free-tier budget with every geocode the booking form and the pricing quote
 * spend. Routing on every poll would hand that whole budget to a handful of
 * customers watching a truck, so this module is split in two:
 *
 * - **Pure rules** — which leg the driver is on (`etaLegFor`), how long a
 *   straight-line fallback takes (`estimateMinutesFromDistanceKm`), how a raw
 *   duration becomes the figure shown (`roundEtaMinutes`, `buildDeliveryEta`),
 *   and when a remembered route is still good enough (`canReuseCachedEta`).
 *   None of them touch the network, the clock or the database, so
 *   `tests/delivery-eta.spec.ts` asserts them directly.
 * - **A cached calculator** (`createDeliveryEtaCalculator`) that asks for a
 *   route only when the remembered one has gone stale, and otherwise counts the
 *   remembered arrival down. The route fetcher and the clock are injected, so
 *   the cache rules are tested with a stub in place of LocationIQ.
 *
 * Deliberately free of `server-only`, of Prisma imports and of Prisma types in
 * its signatures — the same property `src/lib/orders/dispatch-fit.ts` keeps for
 * the same reason: it is what lets the spec run with no browser and no
 * database. The order status crosses the boundary as a plain string. It does
 * import `@/lib/geo`, which reads env vars at *call* time only, so loading it in
 * a spec is harmless; the spec never calls the real `getRoute`.
 */

import {
  AVERAGE_SPEED_KMH,
  getRoute,
  haversineDistanceKm,
  type LatLng,
  type Route,
} from "@/lib/geo";

/** Where the driver is heading: the pickup before loading, the dropoff after. */
export type DeliveryEtaTarget = "PICKUP" | "DROPOFF";

/**
 * How the duration was obtained.
 *
 * `ROUTE` is LocationIQ's driving time for the real road route; `ESTIMATE` is
 * straight-line distance at `AVERAGE_SPEED_KMH`, used when routing was not
 * available. The tracking page shows both the same way today, but the field is
 * on the wire so a surface can word an estimate more cautiously if it wants to.
 */
export type DeliveryEtaBasis = "ROUTE" | "ESTIMATE";

/**
 * The `eta` field of `GET /api/orders/[id]/location`.
 *
 * `minutes` is always a whole number of at least 1 — a driver who is "0
 * minutes" away has not arrived, and the page should not say so. `arrivesAt`
 * is an ISO-8601 instant, so the client formats the clock time in the viewer's
 * own locale and timezone rather than the server's.
 */
export type DeliveryEta = {
  target: DeliveryEtaTarget;
  minutes: number;
  arrivesAt: string;
  basis: DeliveryEtaBasis;
};

/**
 * Everything the calculator needs about one order, in plain values.
 *
 * Every coordinate is nullable because every one of them is in the database: a
 * driver can be assigned before ever pushing a position, and geocoding returns
 * null on failure (see `@/lib/geo`). A missing one means "no ETA", never an
 * error.
 */
export type DeliveryEtaInput = {
  /** `Order.status`, as the plain enum string. */
  status: string;
  /** The driver's last reported position, or null if they never sent one. */
  driver: LatLng | null;
  pickup: LatLng | null;
  dropoff: LatLng | null;
};

/** One leg of a delivery: from the driver's position to the next stop. */
export type DeliveryEtaLeg = {
  target: DeliveryEtaTarget;
  from: LatLng;
  to: LatLng;
};

/** The driving-route lookup, injected so the cache can be tested without LocationIQ. */
export type RouteFetcher = (
  origin: LatLng,
  destination: LatLng,
) => Promise<Route | null>;

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;

/**
 * How far, in kilometres, the driver must move from the position a route was
 * computed for before it is recomputed. 150 m is about one city block: below
 * it the remaining driving time barely changes, and GPS jitter on a parked
 * truck alone can drift a few tens of metres between polls.
 */
export const ETA_REROUTE_DISTANCE_KM = 0.15;

/**
 * How long, in milliseconds, a remembered route is trusted regardless of
 * movement. A driver stuck in traffic does not move 150 m but does fall behind
 * the remembered arrival, so the route is refreshed at least this often. At one
 * order per minute this is a negligible share of LocationIQ's budget, even
 * with many tracking pages open at once.
 */
export const ETA_MAX_AGE_MS = 60_000;

/**
 * The most orders the cache remembers at once. Far above the number of
 * deliveries a single process tracks concurrently, and small enough that a
 * full cache is a few hundred kilobytes; past it, the least recently
 * refreshed entry is dropped.
 */
export const ETA_CACHE_MAX_ENTRIES = 500;

/**
 * Which stop an order's driver is heading for, decided by status alone.
 *
 * - `ACCEPTED` → `PICKUP`. A driver is assigned and has not yet started the
 *   delivery: whether they accepted it themselves or their company dispatched
 *   it to them, `POST /api/orders/[id]/start` (ACCEPTED → IN_TRANSIT) has not
 *   been called, so the cargo is still waiting at the pickup.
 * - `IN_TRANSIT` → `DROPOFF`. The driver started the delivery; the next stop
 *   is the dropoff.
 * - `CLAIMED` → none. A logistics company has taken the load but not yet
 *   dispatched it to one of its drivers (see the `OrderStatus` diagram in
 *   `prisma/schema.prisma`), so there is no driver on the way to anywhere —
 *   dispatch is what moves the order to `ACCEPTED`.
 * - `INITIATED`, `PENDING` → none: no driver. `COMPLETED`, `CANCELLED` → none:
 *   nothing left to arrive at.
 */
export function etaTargetForStatus(status: string): DeliveryEtaTarget | null {
  switch (status) {
    case "ACCEPTED":
      return "PICKUP";
    case "IN_TRANSIT":
      return "DROPOFF";
    default:
      return null;
  }
}

/**
 * The leg to time, or null when an ETA does not apply: the status has no
 * target, the driver has never reported a position, or the target stop was
 * never geocoded.
 */
export function etaLegFor(input: DeliveryEtaInput): DeliveryEtaLeg | null {
  const target = etaTargetForStatus(input.status);
  if (!target || !input.driver) {
    return null;
  }

  const to = target === "PICKUP" ? input.pickup : input.dropoff;
  if (!to) {
    return null;
  }

  return { target, from: input.driver, to };
}

/**
 * Minutes to cover a straight-line distance at `AVERAGE_SPEED_KMH` — the
 * fallback duration when no route is available. Unrounded; rounding happens
 * once, in `roundEtaMinutes`, whatever the basis.
 */
export function estimateMinutesFromDistanceKm(distanceKm: number): number {
  return (distanceKm / AVERAGE_SPEED_KMH) * MINUTES_PER_HOUR;
}

/**
 * The figure the page shows: rounded *up*, so "~8 min" never turns out to be
 * 8½, and at least 1, so a driver a few metres away still reads as arriving
 * rather than arrived. A non-finite input (a malformed route) is treated as 1
 * rather than leaking `NaN` onto the page.
 */
export function roundEtaMinutes(rawMinutes: number): number {
  if (!Number.isFinite(rawMinutes)) {
    return 1;
  }
  return Math.max(1, Math.ceil(rawMinutes));
}

/**
 * The wire shape for an arrival instant, as seen at `nowMs`. `minutes` is
 * derived from the instant rather than stored beside it, so a reused route
 * counts down between polls instead of showing the same figure for a minute.
 */
export function buildDeliveryEta(
  target: DeliveryEtaTarget,
  arrivesAtMs: number,
  basis: DeliveryEtaBasis,
  nowMs: number,
): DeliveryEta {
  const minutes = roundEtaMinutes((arrivesAtMs - nowMs) / MS_PER_MINUTE);
  // An arrival already in the past (a reused route the driver fell behind)
  // would read "~1 min (16:31)" at 16:33; show it as one minute from now so the
  // clock time and the countdown beside it always agree.
  const shownArrivalMs =
    arrivesAtMs > nowMs ? arrivesAtMs : nowMs + MS_PER_MINUTE;
  return {
    target,
    minutes,
    arrivesAt: new Date(shownArrivalMs).toISOString(),
    basis,
  };
}

/** What the cache remembers per order: the leg it timed, and the answer. */
export type CachedEta = {
  target: DeliveryEtaTarget;
  /** The driver's position the duration was computed from. */
  from: LatLng;
  /** The stop it was computed to — compared so a re-geocoded stop reroutes. */
  to: LatLng;
  /** The absolute arrival instant, in epoch milliseconds. */
  arrivesAtMs: number;
  basis: DeliveryEtaBasis;
  /** When the duration was computed, in epoch milliseconds. */
  computedAtMs: number;
};

/**
 * Whether a remembered ETA still answers for `leg` at `nowMs`. All four must
 * hold, otherwise a fresh route is fetched:
 *
 * - the target is the same (an order that went IN_TRANSIT is now timed to the
 *   dropoff, and a pickup ETA would be nonsense);
 * - the target's coordinates are the same (an address corrected by support);
 * - the driver has moved no more than `ETA_REROUTE_DISTANCE_KM` since;
 * - it is no older than `ETA_MAX_AGE_MS`.
 *
 * An `ESTIMATE` is reused by the same rules as a `ROUTE`: it is cheap to
 * recompute, but the reason it exists is usually that LocationIQ just failed or
 * rate-limited, and asking again on the next poll is the worst thing to do to a
 * rate limit.
 */
export function canReuseCachedEta(
  cached: CachedEta,
  leg: DeliveryEtaLeg,
  nowMs: number,
): boolean {
  if (cached.target !== leg.target) {
    return false;
  }
  if (cached.to.lat !== leg.to.lat || cached.to.lng !== leg.to.lng) {
    return false;
  }
  if (nowMs - cached.computedAtMs > ETA_MAX_AGE_MS) {
    return false;
  }
  return haversineDistanceKm(cached.from, leg.from) <= ETA_REROUTE_DISTANCE_KM;
}

/** Options for `createDeliveryEtaCalculator`; everything but the fetcher has a default. */
export type DeliveryEtaCalculatorOptions = {
  fetchRoute: RouteFetcher;
  /** Epoch milliseconds; injectable so specs can move time. */
  now?: () => number;
  maxEntries?: number;
};

/** A calculator with its own private cache — see `createDeliveryEtaCalculator`. */
export type DeliveryEtaCalculator = {
  /** The ETA for one order, or null when none applies. Never throws. */
  getEta(orderId: string, input: DeliveryEtaInput): Promise<DeliveryEta | null>;
  /** How many orders are currently remembered (for specs). */
  size(): number;
};

/**
 * Build an ETA calculator with an in-memory, per-order cache.
 *
 * **The cache is per-process and best-effort.** It lives in this module's
 * memory, so each serverless instance or dev-server reload starts empty, and
 * two instances serving the same order each fetch their own route. That is
 * fine: losing it costs one extra LocationIQ call, never a wrong answer —
 * nothing here is a source of truth, only a way to avoid repeating a lookup.
 *
 * **It is bounded.** A `Map` iterates in insertion order, and every write
 * deletes before re-inserting, so the first key is always the least recently
 * refreshed; past `maxEntries` that one is dropped. An order whose ETA stops
 * applying (delivered, cancelled, no position) is dropped on its next poll.
 *
 * Two polls for the same order arriving together may both miss and both route;
 * de-duplicating in-flight lookups is not worth the complexity at one route a
 * minute per order, and `getRoute`'s own queue already spaces them out.
 */
export function createDeliveryEtaCalculator({
  fetchRoute,
  now = Date.now,
  maxEntries = ETA_CACHE_MAX_ENTRIES,
}: DeliveryEtaCalculatorOptions): DeliveryEtaCalculator {
  const cache = new Map<string, CachedEta>();

  function remember(orderId: string, entry: CachedEta): void {
    cache.delete(orderId);
    cache.set(orderId, entry);
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      cache.delete(oldest);
    }
  }

  async function getEta(
    orderId: string,
    input: DeliveryEtaInput,
  ): Promise<DeliveryEta | null> {
    const leg = etaLegFor(input);
    if (!leg) {
      cache.delete(orderId);
      return null;
    }

    const cached = cache.get(orderId);
    const nowMs = now();
    if (cached && canReuseCachedEta(cached, leg, nowMs)) {
      return buildDeliveryEta(
        cached.target,
        cached.arrivesAtMs,
        cached.basis,
        nowMs,
      );
    }

    // `getRoute` never throws, but the fetcher is injected; an ETA is a nicety
    // on a page polled every five seconds, and must never turn a working
    // location response into a 500.
    let route: Route | null = null;
    try {
      route = await fetchRoute(leg.from, leg.to);
    } catch {
      route = null;
    }

    const basis: DeliveryEtaBasis = route ? "ROUTE" : "ESTIMATE";
    const durationMinutes = route
      ? route.durationMinutes
      : estimateMinutesFromDistanceKm(haversineDistanceKm(leg.from, leg.to));

    // Read the clock after the lookup: `getRoute` may have waited in its
    // throttling queue, and the arrival is measured from when we answer.
    const computedAtMs = now();
    const arrivesAtMs =
      computedAtMs +
      (Number.isFinite(durationMinutes) ? durationMinutes : 0) * MS_PER_MINUTE;

    remember(orderId, {
      target: leg.target,
      from: leg.from,
      to: leg.to,
      arrivesAtMs,
      basis,
      computedAtMs,
    });

    return buildDeliveryEta(leg.target, arrivesAtMs, basis, computedAtMs);
  }

  return { getEta, size: () => cache.size };
}

/** The process-wide calculator the location route uses, backed by LocationIQ. */
const deliveryEtaCalculator = createDeliveryEtaCalculator({
  fetchRoute: getRoute,
});

/**
 * The ETA for one order, through the shared per-process cache. Returns null
 * when none applies; never throws.
 */
export function getDeliveryEta(
  orderId: string,
  input: DeliveryEtaInput,
): Promise<DeliveryEta | null> {
  return deliveryEtaCalculator.getEta(orderId, input);
}
