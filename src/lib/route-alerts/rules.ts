/**
 * The rules of a route alert — "tell me about loads from A to B paying at
 * least X on these days" — as pure functions and constants: what one may hold,
 * how many a driver may save, and which loads it matches.
 *
 * No runtime dependency on Prisma, Next or `server-only`, so
 * `tests/route-alert-rules.spec.ts` pins all of it without a server.
 * `src/lib/route-alerts/dispatch.ts` supplies the rows; this module decides.
 */

import {
  parseWeekdays,
  WEEKDAYS,
  weekdayOf,
  type WeekdayName,
} from "@/lib/schedule/rules";

/**
 * How many alerts one driver may save. A saved route is a standing query run
 * against every new load, so the number is bounded; ten is far more routes
 * than one truck works.
 */
export const MAX_ROUTE_ALERTS_PER_DRIVER = 10;

/** The largest minimum payout accepted, in GEL — a sanity bound, not a tier. */
export const MAX_ROUTE_ALERT_MIN_PAYOUT = 100_000;

/**
 * The most matching alerts one new load reads, oldest first. Matching runs
 * inline in the request that opens the load (there is no job queue on this
 * stack), so its cost is bounded by a constant, not by how many drivers saved
 * the route.
 */
export const MAX_ALERT_CANDIDATES = 500;

/**
 * How long the push service keeps trying to deliver an alert. An alert is a
 * heads-up about a load that may be claimed within the hour; one delivered the
 * next morning is noise.
 */
export const ROUTE_ALERT_PUSH_TTL_SECONDS = 60 * 60;

/** What a saved alert holds, spelled without Prisma. */
export type RouteAlertFields = {
  fromCity: string;
  /** Null is the design's "anywhere". */
  toCity: string | null;
  /** GEL, compared with the driver's payout. `0` is "any payout". */
  minPayout: number;
  /** Never empty. All seven is "any day". */
  days: WeekdayName[];
  enabled: boolean;
};

export type RouteAlertRefusal =
  | { reason: "NOT_AN_OBJECT" }
  | { reason: "NOTHING_TO_UPDATE" }
  | { reason: "INVALID_CITY"; field: "fromCity" | "toCity" }
  | { reason: "INVALID_MIN_PAYOUT" }
  | { reason: "INVALID_DAYS" }
  | { reason: "NOT_A_BOOLEAN"; field: "enabled" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A request body applied over an alert: the alert as it would be stored, or
 * why not.
 *
 * `current` null is a create: `fromCity` is then required, and the rest take
 * the design's defaults for a new alert — anywhere, any payout, any day, on.
 * Otherwise it is an update, and fields left out keep their value.
 *
 * `cities` is the real city enum's values, handed in so this module needs no
 * Prisma. Pick-up and drop-off may be the same city: loads within one city
 * are most of the board.
 */
export function applyRouteAlertInput(
  current: RouteAlertFields | null,
  body: unknown,
  cities: readonly string[],
): { alert: RouteAlertFields } | { refusal: RouteAlertRefusal } {
  if (!isRecord(body)) {
    return { refusal: { reason: "NOT_AN_OBJECT" } };
  }

  const isCity = (value: unknown): value is string =>
    typeof value === "string" && cities.includes(value);

  const next: RouteAlertFields = current ?? {
    fromCity: "",
    toCity: null,
    minPayout: 0,
    days: [...WEEKDAYS],
    enabled: true,
  };
  const alert = { ...next };
  let changed = false;

  if (body.fromCity !== undefined || current === null) {
    if (!isCity(body.fromCity)) {
      return { refusal: { reason: "INVALID_CITY", field: "fromCity" } };
    }

    alert.fromCity = body.fromCity;
    changed = true;
  }

  if (body.toCity !== undefined) {
    if (body.toCity !== null && !isCity(body.toCity)) {
      return { refusal: { reason: "INVALID_CITY", field: "toCity" } };
    }

    alert.toCity = body.toCity;
    changed = true;
  }

  if (body.minPayout !== undefined) {
    const { minPayout } = body;

    if (
      typeof minPayout !== "number" ||
      !Number.isFinite(minPayout) ||
      minPayout < 0 ||
      minPayout > MAX_ROUTE_ALERT_MIN_PAYOUT
    ) {
      return { refusal: { reason: "INVALID_MIN_PAYOUT" } };
    }

    alert.minPayout = minPayout;
    changed = true;
  }

  if (body.days !== undefined) {
    const days = parseWeekdays(body.days);

    if (days === null) {
      return { refusal: { reason: "INVALID_DAYS" } };
    }

    alert.days = days;
    changed = true;
  }

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return { refusal: { reason: "NOT_A_BOOLEAN", field: "enabled" } };
    }

    alert.enabled = body.enabled;
    changed = true;
  }

  return changed ? { alert } : { refusal: { reason: "NOTHING_TO_UPDATE" } };
}

/** A newly open load, as an alert sees it. No address, no client price. */
export type AlertLoad = {
  /** Null when the booking's address resolved to no listed city. */
  pickupCity: string | null;
  dropoffCity: string | null;
  /** The driver's side of the money — `Order.driverPayout`. */
  driverPayout: number;
  /** When the pick-up is due, or null when the booking gave no time. */
  pickupAt: Date | null;
};

/**
 * Whether one alert matches one load:
 *
 * - it is switched on;
 * - the load is picked up in the alert's `fromCity` (a load whose pick-up city
 *   is unknown matches no alert);
 * - it is delivered in `toCity`, or the alert says anywhere;
 * - the driver's payout is at least `minPayout`;
 * - the pick-up falls on one of `days`, in Tbilisi time. A load with no pick-up
 *   time has no day, and matches only an any-day alert.
 *
 * Whether the driver could *take* the load is not asked here — the dispatcher
 * asks the load board's own eligibility rule.
 */
export function alertMatchesLoad(
  alert: RouteAlertFields,
  load: AlertLoad,
): boolean {
  if (!alert.enabled || load.pickupCity !== alert.fromCity) {
    return false;
  }

  if (alert.toCity !== null && alert.toCity !== load.dropoffCity) {
    return false;
  }

  if (load.driverPayout < alert.minPayout) {
    return false;
  }

  return load.pickupAt === null
    ? WEEKDAYS.every((day) => alert.days.includes(day))
    : alert.days.includes(weekdayOf(load.pickupAt));
}

/**
 * The alert each driver is told about for one load: their first that matches,
 * in the order given. One per driver, however many of their alerts match —
 * a driver gets one push per load.
 */
export function firstMatchingAlertPerDriver<
  T extends RouteAlertFields & { id: string; driverProfileId: string },
>(alerts: readonly T[], load: AlertLoad): Map<string, T> {
  const byDriver = new Map<string, T>();

  for (const alert of alerts) {
    if (!byDriver.has(alert.driverProfileId) && alertMatchesLoad(alert, load)) {
      byDriver.set(alert.driverProfileId, alert);
    }
  }

  return byDriver;
}
