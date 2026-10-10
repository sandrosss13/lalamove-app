/**
 * The rules of a pushed load offer, as pure functions and constants: how long
 * one lives, what state it is in, and who is offered what.
 *
 * Free of runtime dependencies on Prisma, Next or `server-only`, so every rule
 * here is pinned by `tests/offer-rules.spec.ts` without a server or a database.
 * `src/lib/offers/dispatch.ts` supplies the rows; this module decides.
 */

import { haversineDistanceKm, type LatLng } from "@/lib/geo";
import type { BookedClass } from "@/lib/orders/class-substitution";
import {
  firstFittingVehicle,
  permittedVehicles,
  type FleetVehicle,
} from "@/lib/orders/load-eligibility";
import type { LoadDimensions } from "@/lib/orders/vehicle-fit";
import {
  wantsOffer,
  type PreferenceLoad,
  type WorkPreferences,
} from "@/lib/work-preferences/rules";

/**
 * How long a driver has to answer an offer — the design's 30-second countdown.
 * `expiresAt` is stamped from this once, at creation, and never moved.
 */
export const OFFER_LIFETIME_SECONDS = 30;

const MS_PER_SECOND = 1000;

/**
 * How many drivers may hold a live offer for the same load at once. Offers are
 * not exclusive — the first to accept wins — so this is how wide a new load
 * fans out, traded against how many drivers are interrupted for a job only one
 * of them can have.
 */
export const MAX_LIVE_OFFERS_PER_LOAD = 3;

/**
 * The most online drivers one match reads. Matching runs inline in a request
 * (there is no job queue on this stack), so its cost has to be bounded by a
 * constant rather than by how many drivers happen to be online.
 */
export const MAX_CANDIDATE_DRIVERS = 200;

/** The most open loads one driver-side match reads, oldest first. */
export const MAX_CANDIDATE_LOADS = 50;

/**
 * The order statuses that make a driver busy, and so not offered work: the
 * hub's own definition of a job in progress (`ACTIVE_JOB_STATUSES` in
 * `src/lib/dashboard/hub/header.ts`).
 */
export const BUSY_ORDER_STATUSES = ["ACCEPTED", "IN_TRANSIT"] as const;

/** `LoadOfferStatus` in `prisma/schema.prisma`, spelled without Prisma. */
export type OfferStatus =
  "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "WITHDRAWN";

/**
 * What an offer *is* right now. The stored status with `PENDING` resolved:
 * a pending row is `LIVE` only while its deadline is ahead and its load is
 * still open.
 */
export type OfferState =
  "LIVE" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "WITHDRAWN";

/** When an offer created at `createdAt` stops being answerable. */
export function offerExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + OFFER_LIFETIME_SECONDS * MS_PER_SECOND);
}

/** An order nobody holds yet — the board's own definition of "open". */
export function isOpenLoad(order: {
  status: string;
  driverId: string | null;
  companyId: string | null;
}): boolean {
  return (
    order.status === "PENDING" &&
    order.driverId === null &&
    order.companyId === null
  );
}

/**
 * The one reading of an offer's state. Nothing flips a row when its time runs
 * out — there is no timer on this stack — so the stored status alone is not
 * the answer: every endpoint derives it here, from the server's clock.
 *
 * The deadline is checked before the load: an offer that ran out *and* whose
 * load was then taken was not answered in time, which is what the driver
 * should be told.
 */
export function deriveOfferState(
  offer: { status: OfferStatus; expiresAt: Date },
  orderIsOpen: boolean,
  now: Date,
): OfferState {
  if (offer.status !== "PENDING") {
    return offer.status;
  }

  if (now.getTime() >= offer.expiresAt.getTime()) {
    return "EXPIRED";
  }

  return orderIsOpen ? "LIVE" : "WITHDRAWN";
}

/** Whole seconds left on the countdown, never negative. */
export function secondsRemaining(expiresAt: Date, now: Date): number {
  return Math.max(
    0,
    Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_SECOND),
  );
}

/** How many more drivers a load with `liveOfferCount` live offers may reach. */
export function openOfferSlots(liveOfferCount: number): number {
  return Math.max(0, MAX_LIVE_OFFERS_PER_LOAD - liveOfferCount);
}

/** One of a driver's vehicles: the board's eligibility facts, plus its id. */
export type MatchVehicle = FleetVehicle & { id: string };

/** A driver who is free to be offered work, as the matcher sees them. */
export type MatchDriver = {
  driverProfileId: string;
  /** Last reported position, or null when the driver never reported one. */
  location: LatLng | null;
  vehicles: readonly MatchVehicle[];
  /**
   * The driver's saved work preferences, or null when they never saved any —
   * in which case nothing below filters on them.
   */
  preferences: WorkPreferences | null;
};

/** An open load, as the matcher sees it. */
export type MatchLoad = {
  orderId: string;
  /** Null when the booking's pickup was never geocoded. */
  pickup: LatLng | null;
  dimensions: LoadDimensions;
  /** The booked class's floor; `undefined` fails closed. */
  booked: BookedClass | undefined;
  bodyType: string | null;
  liveOfferCount: number;
  /** What a driver's work preferences are compared with. */
  preference: PreferenceLoad;
};

export type OfferMatch = {
  orderId: string;
  driverProfileId: string;
  /** The vehicle the load fits — what the offer's fit confirmation names. */
  vehicleId: string;
};

/**
 * The driver's vehicle this load would be offered against, or null when the
 * load board would not list the load for them. This *is* the board's rule —
 * `permittedVehicles` then a fit — applied to someone other than the caller.
 */
export function fittingVehicleFor(
  load: MatchLoad,
  vehicles: readonly MatchVehicle[],
): MatchVehicle | null {
  return firstFittingVehicle(
    load.dimensions,
    permittedVehicles(vehicles, load.booked, load.bodyType),
  );
}

/** Kilometres between two points, or null when either is unknown. */
function distanceOrNull(a: LatLng | null, b: LatLng | null): number | null {
  return a === null || b === null ? null : haversineDistanceKm(a, b);
}

/**
 * Nearest first; an unknown distance sorts after every known one. Ties keep
 * their input order (`Array.prototype.sort` is stable).
 */
function byDistance(a: number | null, b: number | null): number {
  if (a === null || b === null) {
    return a === b ? 0 : a === null ? 1 : -1;
  }

  return a - b;
}

/**
 * Who a newly open load is offered to: the drivers it fits, nearest to the
 * pickup first, as many as the load has open slots.
 *
 * `drivers` are already free to work (online, activated, not on a job, no
 * live offer, never offered or rejected this load) — the query decides that;
 * this decides fit, preference and order.
 *
 * A driver whose saved work preferences rule the load out at `now` is skipped
 * (`wantsOffer`); one with none saved is never skipped for that.
 */
export function selectDriversForLoad(
  load: MatchLoad,
  drivers: readonly MatchDriver[],
  now: Date,
): OfferMatch[] {
  const slots = openOfferSlots(load.liveOfferCount);

  if (slots === 0) {
    return [];
  }

  return drivers
    .flatMap((driver) => {
      if (!wantsOffer(driver.preferences, load.preference, now)) {
        return [];
      }

      const vehicle = fittingVehicleFor(load, driver.vehicles);

      return vehicle === null
        ? []
        : [
            {
              match: {
                orderId: load.orderId,
                driverProfileId: driver.driverProfileId,
                vehicleId: vehicle.id,
              },
              distanceKm: distanceOrNull(driver.location, load.pickup),
            },
          ];
    })
    .sort((a, b) => byDistance(a.distanceKm, b.distanceKm))
    .slice(0, slots)
    .map((entry) => entry.match);
}

/**
 * Which waiting load a driver who has just become free is offered: one that
 * fits and still has an open slot, nearest pickup first.
 *
 * `loads` arrive oldest first, so with no position to measure from — or
 * between loads equally far away — the one that has waited longest wins.
 *
 * Loads the driver's saved work preferences rule out at `now` are skipped.
 */
export function selectLoadForDriver(
  driver: MatchDriver,
  loads: readonly MatchLoad[],
  now: Date,
): OfferMatch | null {
  const [best] = loads
    .flatMap((load) => {
      if (
        openOfferSlots(load.liveOfferCount) === 0 ||
        !wantsOffer(driver.preferences, load.preference, now)
      ) {
        return [];
      }

      const vehicle = fittingVehicleFor(load, driver.vehicles);

      return vehicle === null
        ? []
        : [
            {
              match: {
                orderId: load.orderId,
                driverProfileId: driver.driverProfileId,
                vehicleId: vehicle.id,
              },
              distanceKm: distanceOrNull(driver.location, load.pickup),
            },
          ];
    })
    .sort((a, b) => byDistance(a.distanceKm, b.distanceKm));

  return best?.match ?? null;
}
