/**
 * The Drivers screen's Fleet Availability board — one fleet's roster laid out
 * against the hours of a single day.
 *
 * Business accounts only, like the roster it sits under: `getHubFleetAvailability()`
 * returns `null` for anything else rather than an empty board, so the loader
 * refuses independently of the page guard above it — the same three-independent-
 * checks arrangement `getHubDrivers()` documents.
 *
 * Server-only: it talks to Prisma directly, and the object it returns is handed
 * from a server component into a `"use client"` tree, so every value in it is
 * plain serialisable data. In particular there are **no `Date`s** — a block's
 * bounds are decimal hours within the chosen Tbilisi day (`13.5` = 13:30), which
 * is the unit the board's geometry works in and the unit the export prints.
 *
 * ## Real vs sample
 *
 * Every block on this board is read from the database. There is no `sampled`
 * sub-object and there must not be one: a dispatcher reads this board to decide
 * who can take the next job, and a placeholder bar would be an invented claim
 * about a real person's day.
 *
 * That is also why the handoff's fifth status, `Unavailable` — its hatched
 * "driver rest window" bars — is **not** implemented. It has no source: the
 * schema carries no shift, rest or unavailability model of any kind, so there is
 * nothing to derive one from. The board therefore renders four statuses, and a
 * gap between blocks means "no committed work", not "confirmed free". When a
 * shift model lands, add the status here and the board picks it up.
 *
 * ## Scoping
 *
 * Every read is filtered by `companyId` as well as by the roster's user ids,
 * exactly as `drivers.ts` explains: `Order.driverId` outlives a driver's
 * membership of a roster, so without the company filter a driver who moved here
 * from another fleet would drag their old jobs onto this fleet's board.
 *
 * Day boundaries are Tbilisi days, from `@/lib/dashboard/hub/timezone`, which is
 * the zone every hub screen already agrees on.
 */
import "server-only";

import { OrderStatus } from "@prisma/client";
import type { ChassisType, GeorgianCity, VehicleClass } from "@prisma/client";

import type { HubAccount } from "@/lib/dashboard/hub/account";
import {
  parseHubDayKey,
  startOfHubDay,
  startOfHubDayPlus,
  toHubDayKey,
} from "@/lib/dashboard/hub/timezone";
import {
  BODY_TYPES,
  VEHICLE_CLASSES,
} from "@/lib/driver-onboarding/vehicle-classes";
import { formatCity } from "@/lib/format-city";
import { prisma } from "@/lib/prisma";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What a stretch of a driver's day is doing.
 *
 * `available` is never stored and never appears on a `HubAvailabilityBlock` —
 * it is the complement of the committed blocks, computed by the board and by
 * the export from the gaps between them. It exists in this union because the
 * legend, the status filter and the export's `Status` column all name it.
 *
 * The handoff's `unavailable` is deliberately absent — see the module comment.
 */
export type HubAvailabilityStatus =
  "available" | "assigned" | "enroute" | "booked";

/** The statuses a stored block can actually carry. */
export type HubAvailabilityBlockStatus = Exclude<
  HubAvailabilityStatus,
  "available"
>;

/**
 * One committed stretch of a driver's day, derived from a single order.
 *
 * `start`/`end` are decimal hours inside the board's day, clipped to `[0, 24]`,
 * with `start < end` guaranteed. A job that spans midnight is clipped at the day
 * boundary rather than wrapping, because the board draws one day.
 */
export type HubAvailabilityBlock = {
  /** The order's id — stable, and what a row click would open. */
  id: string;
  /** Decimal hours from the start of the Tbilisi day, `0`–`24`. */
  start: number;
  end: number;
  status: HubAvailabilityBlockStatus;
  /** `Order.reference`, e.g. `GE-48210` — the tooltip's and export's handle. */
  reference: string;
  /** Humanised `{pickup} → {dropoff}`, for the tooltip and the export. */
  route: string;
  /**
   * The plate of the vehicle this particular job ran on, which is not
   * necessarily the driver's currently assigned vehicle: a driver can be moved
   * between vehicles within a day, and the row keeps one line while each bar
   * names the vehicle it actually used. `null` when the order recorded none —
   * `Order.vehicleId` stays unset until the job is accepted.
   */
  vehiclePlate: string | null;
  /**
   * Whether `end` is a recorded fact or a fallback.
   *
   * `false` means the instant came from the database — `completedAt` for a
   * finished job, `deliveryDeadline` for one that carries a deadline. `true`
   * means neither existed and the bar was given a nominal width so it could be
   * drawn at all.
   *
   * This flag is not decoration. `Order` stores no job duration and no ETA —
   * `timeFare` is the only trace of the estimate, and it was computed at quote
   * time from a route lookup that is not kept. A dispatcher reading
   * "09:00 – 11:30" off this board will move real trucks on it, so a bar whose
   * end was invented has to say so in its tooltip rather than pass for a
   * measurement. The board renders these with the dashed treatment.
   */
  derivedEnd: boolean;
};

/** The vehicle a driver is paired with right now, for the row's second line. */
export type HubAvailabilityVehicle = {
  id: string;
  plateNumber: string;
  /** `{make} {model}`, e.g. "Isuzu NPR". */
  model: string;
  vehicleClass: VehicleClass | null;
  /** The declared class's label, falling back to the type spec's. */
  vehicleClassLabel: string;
  bodyType: ChassisType | null;
  /** The body's label, or an em dash when the vehicle declares none. */
  bodyTypeLabel: string;
  /**
   * The vehicle's own declared payload, falling back to its class spec — the
   * same preference `capabilityOf()` in `src/lib/orders/vehicle-fit.ts` makes,
   * because the capacity filter is about the truck that actually turns up.
   * `null` when neither is known.
   */
  capacityKg: number | null;
};

/** One row of the board: a driver, their vehicle, and their day. */
export type HubAvailabilityRow = {
  /** `DriverProfile.id`. */
  driverId: string;
  /** `User.id` — what `Order.driverId` points at. */
  userId: string;
  name: string;
  phone: string;
  city: GeorgianCity;
  /** Humanised city, e.g. "Tbilisi". */
  cityLabel: string;
  /**
   * The vehicle the row's second line names — the driver's pairing for this
   * day. `null` when they have none, which is a real state the board draws
   * rather than hides: the line reads "No vehicle assigned".
   *
   * A driver holds a vehicle two different ways and both count — they own it
   * (`Vehicle.driverProfileId`, an independent driver) or they are paired with
   * one of the company's (an open `DriverVehicleAssignment`, a roster driver).
   * `driverVehiclesWhere()` in `@/lib/orders/driver-vehicles` is the canonical
   * clause for that `OR`; a bare `driverProfileId` filter finds nothing for a
   * roster driver, which is every driver this board is about.
   */
  vehicle: HubAvailabilityVehicle | null;
  /**
   * Every vehicle the driver was paired with at any point during the day, newest
   * pairing first, for the vehicle-type and capacity filters to match against.
   *
   * Separate from `vehicle` because assignments are read across the whole day
   * rather than as "the live one": a driver moved between trucks at noon has two
   * entries here and still one row, and a filter for the morning truck has to
   * keep that row. Contains `vehicle` when there is one, so a caller filtering
   * on this list never has to check both.
   */
  vehiclesInDay: HubAvailabilityVehicle[];
  /** Committed stretches, sorted by `start`, non-overlapping-ish but not merged. */
  blocks: HubAvailabilityBlock[];
};

/** Everything the board needs for one day. */
export type HubFleetAvailability = {
  /** The day being shown, `YYYY-MM-DD` in Tbilisi. */
  dayKey: string;
  /**
   * Decimal hour of "now" inside that day, or `null` when `dayKey` is not
   * today in Tbilisi — which is exactly when the board hides its now marker.
   * Resolved on the server so the marker cannot disagree with the blocks'
   * statuses, which were derived against the same instant.
   */
  nowHour: number | null;
  rows: HubAvailabilityRow[];
};

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** What the row's second line and the sheet's Body column print for no body. */
const EM_DASH = "—";

/** The board's unit is a decimal hour, so this is its only conversion factor. */
const MS_PER_HOUR = 3_600_000;

/** The width of the board's axis, and the upper clip for every block. */
const HOURS_PER_DAY = 24;

/**
 * How wide a bar is drawn when nothing in the database says when it ends.
 *
 * One hour, and the figure is arbitrary — which is exactly why every block that
 * uses it carries `derivedEnd: true`. `Order` records no duration and no ETA
 * (see `HubAvailabilityBlock.derivedEnd`), so the alternative to a nominal width
 * is a zero-width bar, i.e. dropping a real commitment off a dispatcher's board.
 * A visible, flagged hour is the lesser error of the two.
 */
const NOMINAL_BLOCK_HOURS = 1;

/** `YYYY-MM-DD`, the only shape accepted from the query string. */
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The only statuses that put a bar on a driver's day.
 *
 * `INITIATED` and `PENDING` are unclaimed work — nobody is committed to them, so
 * they belong to no row. `CANCELLED` is work that was called off, and drawing it
 * would mark a driver busy for a job that is not happening. `CLAIMED` is the
 * interesting exclusion: a claimed order belongs to a *company*, and
 * `Order.driverId` stays null until dispatch picks the driver — so it has no row
 * to sit on, and inventing one would put a load on somebody who has not been
 * given it.
 */
const COMMITTED_ORDER_STATUSES = [
  OrderStatus.ACCEPTED,
  OrderStatus.IN_TRANSIT,
  OrderStatus.COMPLETED,
] as const;

/**
 * The vehicle columns a row needs, read identically down both of the two routes
 * a driver can hold a vehicle.
 *
 * One constant rather than the same nine lines written twice: the owned-vehicle
 * branch and the assignment branch feed the *same* `HubAvailabilityVehicle`
 * mapper, so a column added to one and not the other would make a row's
 * capacity depend on which way its driver happens to hold the truck.
 */
const AVAILABILITY_VEHICLE_SELECT = {
  id: true,
  plateNumber: true,
  make: true,
  model: true,
  chassisType: true,
  vehicleClass: true,
  payloadKg: true,
  // The class-level fallbacks for the two fields a `Vehicle` may leave null.
  vehicleTypeSpec: { select: { label: true, maxPayloadKg: true } },
} as const;

/* -------------------------------------------------------------------------- */
/* Row shapes as Prisma returns them                                          */
/* -------------------------------------------------------------------------- */

/** A vehicle exactly as `AVAILABILITY_VEHICLE_SELECT` reads it. */
type AvailabilityVehicleRow = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  chassisType: ChassisType | null;
  vehicleClass: VehicleClass | null;
  payloadKg: number | null;
  vehicleTypeSpec: { label: string; maxPayloadKg: number };
};

/** The `Order` columns a block is derived from, and nothing else. */
type AvailabilityOrderRow = {
  id: string;
  driverId: string | null;
  reference: string;
  status: OrderStatus;
  scheduledAt: Date | null;
  pickupWindowStart: Date | null;
  pickupWindowEnd: Date | null;
  deliveryDeadline: Date | null;
  inTransitAt: Date | null;
  completedAt: Date | null;
  pickupCity: GeorgianCity | null;
  dropoffCity: GeorgianCity | null;
  pickupAddress: string;
  dropoffAddress: string;
  vehicle: { plateNumber: string } | null;
};

/** A block's bounds as instants, before they are clipped to the board's day. */
type BlockBounds = {
  startAt: Date;
  endAt: Date;
  derivedEnd: boolean;
};

/* -------------------------------------------------------------------------- */
/* Vehicle shaping                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A declared class's display name, or `undefined` for a class this build has
 * never heard of.
 *
 * Total rather than `findVehicleClass()`, which throws, for the reason
 * `vehicles.ts` gives for its own copy of this lookup: `VehicleClass` is a
 * database enum and `VEHICLE_CLASSES` is a hand-maintained TypeScript list, so a
 * class added to the schema first must degrade to the spec label rather than
 * take the Drivers screen down.
 */
function vehicleClassName(vehicleClass: VehicleClass): string | undefined {
  return VEHICLE_CLASSES.find((entry) => entry.id === vehicleClass)?.name;
}

/**
 * A chassis type as the row's second line and the sheet's Body column print it.
 *
 * `shortLabel`, not `label`: `BODY_TYPES` documents the short form as the one
 * for "table rows, chips and summary lines", and both call sites here are
 * exactly that — an ellipsised 11px line and a spreadsheet column, neither of
 * which has room for "Refrigerated Vehicle".
 *
 * Looked up rather than `findBodyType()`d for the same reason as the class
 * above, and an unknown or absent body resolves to an em dash — the design's own
 * null rendering — instead of a guess about what a truck's body is.
 */
function bodyTypeLabelOf(bodyType: ChassisType | null): string {
  if (bodyType === null) {
    return EM_DASH;
  }

  return (
    BODY_TYPES.find((entry) => entry.id === bodyType)?.shortLabel ?? EM_DASH
  );
}

/**
 * One `Vehicle` row as the board's vehicle shape.
 *
 * `capacityKg` prefers the vehicle's own declared payload over its class's
 * catalogue figure, which is the same preference `capabilityOf()` in
 * `src/lib/orders/vehicle-fit.ts` makes and for the same reason: the capacity
 * filter is a question about the truck that actually turns up, not about the
 * average of its class. No sentinel translation is needed here — the `0`-means-
 * open sentinel that function handles belongs to `cargoHeightM`, and this board
 * reads no dimension at all.
 */
function toAvailabilityVehicle(
  vehicle: AvailabilityVehicleRow,
): HubAvailabilityVehicle {
  const declaredClassName =
    vehicle.vehicleClass === null
      ? undefined
      : vehicleClassName(vehicle.vehicleClass);

  return {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    model: `${vehicle.make} ${vehicle.model}`,
    vehicleClass: vehicle.vehicleClass,
    vehicleClassLabel: declaredClassName ?? vehicle.vehicleTypeSpec.label,
    bodyType: vehicle.chassisType,
    bodyTypeLabel: bodyTypeLabelOf(vehicle.chassisType),
    capacityKg: vehicle.payloadKg ?? vehicle.vehicleTypeSpec.maxPayloadKg,
  };
}

/**
 * The vehicles in `candidates`, first occurrence wins, later duplicates dropped.
 *
 * A driver can reach the same vehicle down both routes at once — they own it
 * *and* a manager wrote an assignment row for it — and a day with two handovers
 * back to the same truck produces two assignment rows for it as well. Either
 * would list one plate twice in `vehiclesInDay` and count it twice in any tally
 * built from that list. Order is preserved, so the newest pairing stays first.
 */
function distinctVehicles(
  candidates: HubAvailabilityVehicle[],
): HubAvailabilityVehicle[] {
  const seen = new Set<string>();

  return candidates.filter((vehicle) => {
    if (seen.has(vehicle.id)) {
      return false;
    }

    seen.add(vehicle.id);

    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Day and hour arithmetic                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The instant a `YYYY-MM-DD` query-string day begins in Tbilisi, falling back to
 * today for anything that is not a real calendar date.
 *
 * Round-tripped through `toHubDayKey` rather than trusted, the same idiom
 * `earnings.ts`'s `parseHubDayParam` uses: `parseHubDayKey("2026-02-31")` rolls
 * forward into March rather than failing, so the shape test alone would silently
 * show a different day from the one the URL names. Falling back rather than
 * throwing because this value arrives from a query string — a hand-edited URL
 * should render today's board, not a 500.
 */
function resolveHubDayStart(dayKey: string, now: Date): Date {
  if (!DATE_PARAM_PATTERN.test(dayKey)) {
    return startOfHubDay(now);
  }

  const parsed = parseHubDayKey(dayKey);

  return toHubDayKey(parsed) === dayKey ? parsed : startOfHubDay(now);
}

/**
 * How far `instant` is into the board's day, as a decimal hour.
 *
 * Elapsed real time divided by an hour, which is exact for Tbilisi: the zone has
 * observed no daylight saving since 2005, so the day is 24 real hours long and a
 * wall-clock hour and an elapsed hour are the same thing. Were that to change,
 * this is the second place to fix after `timezone.ts` — the board's axis is
 * drawn as 24 equal columns, so a 23- or 25-hour day needs the axis changed too,
 * not just the arithmetic. Callers clamp the result into `[0, 24]` regardless,
 * so nothing can be drawn outside the grid in the meantime.
 */
function hoursIntoDay(dayStart: Date, instant: Date): number {
  return (instant.getTime() - dayStart.getTime()) / MS_PER_HOUR;
}

/** `instant` advanced by a whole number of hours. */
function plusHours(instant: Date, hours: number): Date {
  return new Date(instant.getTime() + hours * MS_PER_HOUR);
}

/* -------------------------------------------------------------------------- */
/* Block derivation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * When an order occupies its driver, as two instants plus whether the second one
 * was recorded or invented.
 *
 * Each status reads the timestamps that are actually settled at that point in an
 * order's life, which is why this is a switch rather than one coalesce chain:
 *
 * | status       | start                                              | end                                  |
 * |--------------|----------------------------------------------------|--------------------------------------|
 * | `COMPLETED`  | `inTransitAt` → `pickupWindowStart` → `scheduledAt` | `completedAt`                        |
 * | `IN_TRANSIT` | `inTransitAt`                                      | `deliveryDeadline`, else still running |
 * | `ACCEPTED`   | `pickupWindowStart` → `scheduledAt`                | `deliveryDeadline` → `pickupWindowEnd` |
 *
 * **`createdAt` is deliberately not in any of those chains, and returning `null`
 * is deliberately preferred to using it.** `createdAt` is when the order was
 * *booked*; a load booked on Monday for Thursday would draw Thursday's job
 * across Monday morning and mark a driver busy on a day they were free. A bar in
 * the wrong place is worse than no bar: the dispatcher who believes it sends the
 * next job somewhere else.
 *
 * An `IN_TRANSIT` order with no `inTransitAt` is dropped for the same reason
 * rather than falling back to its pickup window. The column is stamped by the
 * transition that sets the status, so a row missing it is a data anomaly, and
 * the pickup window is when the job was *meant* to start — printing that as
 * though it were a measurement is the invention this board exists not to make.
 */
function blockBoundsOf(
  order: AvailabilityOrderRow,
  now: Date,
): BlockBounds | null {
  switch (order.status) {
    case OrderStatus.COMPLETED: {
      const startAt =
        order.inTransitAt ?? order.pickupWindowStart ?? order.scheduledAt;

      if (startAt === null) {
        return null;
      }

      // A completed order almost always carries its completion instant — the
      // transition writes it — but the column is nullable, and a row that lost
      // it still describes work that happened. It gets a nominal width flagged
      // as derived rather than being dropped, and notably is NOT stretched to
      // `now`: the job is over, and a bar running to the present moment would
      // say the opposite.
      if (order.completedAt === null) {
        return {
          startAt,
          endAt: plusHours(startAt, NOMINAL_BLOCK_HOURS),
          derivedEnd: true,
        };
      }

      return { startAt, endAt: order.completedAt, derivedEnd: false };
    }

    case OrderStatus.IN_TRANSIT: {
      const startAt = order.inTransitAt;

      if (startAt === null) {
        return null;
      }

      if (order.deliveryDeadline !== null) {
        return { startAt, endAt: order.deliveryDeadline, derivedEnd: false };
      }

      // Still running and with no agreed deadline: the bar reaches the present
      // moment, because that much is known to have been spent on it. The
      // `start + 1h` floor is what keeps a job that went in transit seconds ago
      // from rendering as a hairline nobody can see or hover.
      const runningEnd = new Date(
        Math.max(
          now.getTime(),
          plusHours(startAt, NOMINAL_BLOCK_HOURS).getTime(),
        ),
      );

      return { startAt, endAt: runningEnd, derivedEnd: true };
    }

    case OrderStatus.ACCEPTED: {
      const startAt = order.pickupWindowStart ?? order.scheduledAt;

      if (startAt === null) {
        return null;
      }

      // The deadline first, then the far edge of the pickup window: both are
      // agreed with the client, so either is a real commitment rather than a
      // guess. Only when neither exists is a width invented.
      const agreedEnd = order.deliveryDeadline ?? order.pickupWindowEnd;

      if (agreedEnd !== null) {
        return { startAt, endAt: agreedEnd, derivedEnd: false };
      }

      return {
        startAt,
        endAt: plusHours(startAt, NOMINAL_BLOCK_HOURS),
        derivedEnd: true,
      };
    }

    default:
      // Unreachable: the query asks for exactly the three statuses above. Kept
      // so that widening `COMMITTED_ORDER_STATUSES` without deciding what the
      // new status's bounds are drops the bar rather than drawing a wrong one.
      return null;
  }
}

/**
 * A block's bounds as decimal hours inside the board's day, or `null` when
 * nothing of it falls on this day.
 *
 * Clipped rather than wrapped: the board draws one day, so a job that runs
 * overnight is a bar that reaches the right edge on one day and starts at the
 * left edge on the next. The zero-width test is what discards the orders the
 * query's cross-midnight arm pulls in that turn out to have finished before this
 * day began.
 */
function clipToDay(
  bounds: BlockBounds,
  dayStart: Date,
  dayEnd: Date,
): { start: number; end: number } | null {
  const startMs = Math.max(bounds.startAt.getTime(), dayStart.getTime());
  const endMs = Math.min(bounds.endAt.getTime(), dayEnd.getTime());

  if (endMs <= startMs) {
    return null;
  }

  return {
    start: Math.max(0, hoursIntoDay(dayStart, new Date(startMs))),
    end: Math.min(HOURS_PER_DAY, hoursIntoDay(dayStart, new Date(endMs))),
  };
}

/**
 * Which of the three stored statuses a block carries.
 *
 * `IN_TRANSIT` and `COMPLETED` say what they are. `ACCEPTED` is the one that
 * depends on the clock: accepted work that has already run is indistinguishable
 * on the board from work that ran — it occupied the driver — while accepted work
 * still ahead is the design's "Booked (future)" dashed bar.
 *
 * `nowHour` is the *effective* present moment for this board: the real one on
 * today's board, `+∞` on a past day (everything on it has run) and `-∞` on a
 * future one (nothing on it has). Passing infinities rather than branching on
 * "is this today" keeps one comparison here instead of three cases, and makes
 * the past/future answer fall out of the same rule the live board uses.
 */
function blockStatusOf(
  status: OrderStatus,
  end: number,
  nowHour: number,
): HubAvailabilityBlockStatus {
  if (status === OrderStatus.IN_TRANSIT) {
    return "enroute";
  }

  if (status === OrderStatus.COMPLETED) {
    return "assigned";
  }

  return end <= nowHour ? "assigned" : "booked";
}

/**
 * `{pickup} → {dropoff}` for the tooltip and the sheet's Route column.
 *
 * The enum columns first, humanised — they are what the load board's own city
 * filters read, and they are resolved server-side at booking. The free-text
 * address is the fallback for an address outside the 63-value `GeorgianCity`
 * enum (a village, a roadside depot), which the schema stores as null on
 * purpose rather than forcing into the nearest wrong city. Printing "—" for
 * those would drop the one piece of information a dispatcher actually needs
 * about the leg.
 */
function routeLabel(order: AvailabilityOrderRow): string {
  const pickup =
    order.pickupCity === null
      ? order.pickupAddress
      : formatCity(order.pickupCity);
  const dropoff =
    order.dropoffCity === null
      ? order.dropoffAddress
      : formatCity(order.dropoffCity);

  return `${pickup} → ${dropoff}`;
}

/* -------------------------------------------------------------------------- */
/* Loader                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The roster's day, or `null` for any account that is not a fleet owner.
 *
 * `dayKey` is a `YYYY-MM-DD` Tbilisi day; an unparseable one is treated as
 * today rather than throwing, because it arrives from a query string.
 *
 * Two passes, not one per driver. Prisma cannot express "this driver's orders"
 * as a lateral join, so the roster is read first and every one of its drivers'
 * orders for the day is read in a second query and bucketed by `driverId` in
 * memory — the same shape, and the same reasoning, as `drivers.ts`'s recent-jobs
 * pass. A per-driver query would be one round trip per row on a screen whose
 * whole point is showing the roster at once.
 */
export async function getHubFleetAvailability(
  account: HubAccount,
  dayKey: string,
): Promise<HubFleetAvailability | null> {
  const { companyId } = account;

  // Both halves of the guard are load-bearing, as in `getHubDrivers()`: `kind`
  // is the product rule, and the null check is what lets `companyId` narrow to
  // a string for the two scope clauses below.
  if (account.kind !== "BUSINESS" || companyId === null) {
    return null;
  }

  const now = new Date();
  const dayStart = resolveHubDayStart(dayKey, now);
  const dayEnd = startOfHubDayPlus(dayStart, 1);
  // The key the board labels itself with is the one that was actually loaded,
  // not the one that was asked for — otherwise a rejected `2026-02-31` would
  // render today's bars under February's heading.
  const resolvedDayKey = toHubDayKey(dayStart);

  const driverRows = await prisma.driverProfile.findMany({
    where: { companyId },
    select: {
      id: true,
      userId: true,
      phone: true,
      city: true,
      user: { select: { name: true } },
      // Both routes to a vehicle, because a fleet's roster can contain either
      // kind of driver — see `HubAvailabilityRow.vehicle`. Owned vehicles are
      // read unfiltered: ownership carries no interval in the schema, so there
      // is no "during this day" to ask about.
      vehicles: { select: AVAILABILITY_VEHICLE_SELECT },
      // Assignments **overlapping the day**, not open ones. A bare
      // `unassignedAt: null` filter — which is what the roster screen wants, and
      // what an earlier draft of this used — answers "which truck is this driver
      // on right now", and that is the wrong question for a board of a *past*
      // day, or for the handoff's "a driver assigned more than one vehicle in a
      // day keeps one row": both of those need every pairing the day contained.
      // The half-open interval below is the standard overlap test — it started
      // before the day ended, and it had not ended before the day started.
      assignments: {
        where: {
          assignedAt: { lt: dayEnd },
          OR: [{ unassignedAt: null }, { unassignedAt: { gt: dayStart } }],
        },
        select: { vehicle: { select: AVAILABILITY_VEHICLE_SELECT } },
        orderBy: { assignedAt: "desc" },
      },
    },
  });

  const driverUserIds = driverRows.map((driver) => driver.userId);

  const orderRows = await prisma.order.findMany({
    where: {
      // Both clauses, and this pair IS the tenancy boundary — the same one
      // `hubOrderScope()` draws in `jobs.ts`, `header.ts`, `performance.ts` and
      // `earnings.ts`. `companyId` alone would put a fleet's whole order book on
      // whichever rows happened to match; `driverId` alone would be worse, since
      // `Order.driverId` outlives a driver's membership of a roster
      // (`DriverProfile.companyId` is nullable and nulled on removal), so a
      // driver who moved here from another fleet would drag that fleet's jobs
      // onto this board — a cross-tenant read, not merely a wrong figure.
      companyId,
      driverId: { in: driverUserIds },
      status: { in: [...COMMITTED_ORDER_STATUSES] },
      OR: [
        // Four independent ways for an order to *begin* inside the day, because
        // which timestamp an order carries depends on how far through its life
        // it is and which of the optional scheduling columns the client filled
        // in. Any one of them landing in the day is enough to bring the row
        // back; `blockBoundsOf` then decides where it actually sits, and
        // `clipToDay` drops whatever turns out not to overlap after all.
        { pickupWindowStart: { gte: dayStart, lt: dayEnd } },
        { scheduledAt: { gte: dayStart, lt: dayEnd } },
        { inTransitAt: { gte: dayStart, lt: dayEnd } },
        { completedAt: { gte: dayStart, lt: dayEnd } },
        // The cross-midnight arm: a job that went in transit before this day
        // began and has not completed is still running through it. Without this
        // clause a driver who has been on the road since 23:00 yesterday renders
        // free all morning — the single most misleading thing this board could
        // tell a dispatcher, because it invites them to send the next load to
        // somebody who is hours away.
        { inTransitAt: { lt: dayStart }, completedAt: null },
      ],
    },
    select: {
      id: true,
      driverId: true,
      reference: true,
      status: true,
      scheduledAt: true,
      pickupWindowStart: true,
      pickupWindowEnd: true,
      deliveryDeadline: true,
      inTransitAt: true,
      completedAt: true,
      pickupCity: true,
      dropoffCity: true,
      pickupAddress: true,
      dropoffAddress: true,
      // The vehicle the job actually ran on, which is not necessarily the
      // driver's current pairing — see `HubAvailabilityBlock.vehiclePlate`.
      vehicle: { select: { plateNumber: true } },
    },
  });

  // Today's board gets the real clock; any other day gets an infinity, so that
  // `blockStatusOf` can answer "has this run yet" with one comparison on every
  // board rather than branching on the date. `nowHour` itself — the marker the
  // board draws — stays null off today, which is exactly when the design hides
  // it.
  const isToday = toHubDayKey(now) === resolvedDayKey;
  const nowHour = isToday ? hoursIntoDay(dayStart, now) : null;
  const effectiveNowHour =
    nowHour ??
    (dayStart.getTime() < now.getTime()
      ? Number.POSITIVE_INFINITY
      : Number.NEGATIVE_INFINITY);

  const blocksByDriver = new Map<string, HubAvailabilityBlock[]>();

  for (const order of orderRows) {
    // `driverId: { in: [...] }` already excludes nulls; the check is what
    // narrows the type so it can key the map without a cast — the same idiom
    // `drivers.ts` uses on its recent-jobs pass.
    if (order.driverId === null) {
      continue;
    }

    const bounds = blockBoundsOf(order, now);

    if (bounds === null) {
      continue;
    }

    const clipped = clipToDay(bounds, dayStart, dayEnd);

    if (clipped === null) {
      continue;
    }

    const blocks = blocksByDriver.get(order.driverId) ?? [];

    blocks.push({
      id: order.id,
      start: clipped.start,
      end: clipped.end,
      status: blockStatusOf(order.status, clipped.end, effectiveNowHour),
      reference: order.reference,
      route: routeLabel(order),
      vehiclePlate: order.vehicle?.plateNumber ?? null,
      derivedEnd: bounds.derivedEnd,
    });
    blocksByDriver.set(order.driverId, blocks);
  }

  const rows: HubAvailabilityRow[] = driverRows.map((driver) => {
    // Newest overlapping assignment first (the query orders them), then the
    // owned vehicles. `vehicle` is the head of that list, so a roster driver
    // paired with a company truck shows that truck rather than one they happen
    // to own privately — the pairing is what they are driving for this fleet.
    const pairedVehicles = driver.assignments.map((assignment) =>
      toAvailabilityVehicle(assignment.vehicle),
    );
    const ownedVehicles = driver.vehicles.map(toAvailabilityVehicle);
    const vehiclesInDay = distinctVehicles([
      ...pairedVehicles,
      ...ownedVehicles,
    ]);

    return {
      driverId: driver.id,
      userId: driver.userId,
      name: driver.user.name,
      phone: driver.phone,
      city: driver.city,
      cityLabel: formatCity(driver.city),
      vehicle: vehiclesInDay[0] ?? null,
      vehiclesInDay,
      // Sorted here rather than by the query, because the sort key is a derived
      // decimal hour and not a column: an order's start can come from any of
      // three timestamps, so no `orderBy` expresses it.
      blocks: (blocksByDriver.get(driver.userId) ?? []).sort(
        (left, right) => left.start - right.start,
      ),
    };
  });

  // By name, because that is what the board's label column shows and what a
  // dispatcher scans down it looking for. `localeCompare` rather than `<` so
  // Georgian-script names collate by their own alphabet instead of by code
  // point.
  rows.sort((left, right) => left.name.localeCompare(right.name));

  return { dayKey: resolvedDayKey, nowHour, rows };
}
