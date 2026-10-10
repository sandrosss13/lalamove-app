// Matches drivers to loads through Prisma; server code only.
import "server-only";

import { after } from "next/server";
import { LoadOfferStatus, OrderStatus, type Prisma } from "@prisma/client";

import type { LatLng } from "@/lib/geo";
import {
  BUSY_ORDER_STATUSES,
  MAX_CANDIDATE_DRIVERS,
  MAX_CANDIDATE_LOADS,
  offerExpiresAt,
  openOfferSlots,
  selectDriversForLoad,
  selectLoadForDriver,
  type MatchLoad,
  type MatchVehicle,
  type OfferMatch,
} from "@/lib/offers/rules";
import { specCapability } from "@/lib/orders/booking-fit";
import {
  driversVehiclesWhere,
  driverVehiclesWhere,
} from "@/lib/orders/driver-vehicles";
import {
  resolveFleet,
  VEHICLE_CAPABILITY_SELECT,
} from "@/lib/orders/load-eligibility";
import { prisma } from "@/lib/prisma";
import {
  notifyOffersCreated,
  type OfferToNotify,
} from "@/lib/push/offer-notification";
import {
  toWorkPreferences,
  WORK_PREFERENCES_SELECT,
} from "@/lib/work-preferences/store";

/*
 * Offer matching.
 *
 * There is no job queue, cron or socket on this stack, so offers are made
 * inline, in the request that changes who could be offered what: a load going
 * on the market, a driver going online, a driver finishing a job, a driver
 * declining. Each match is a handful of indexed queries bounded by the
 * constants in `rules.ts`, and each is wrapped (see the two `dispatch…`
 * functions at the bottom) so that it can never fail the request it rides on.
 *
 * Nor can it *delay* that request beyond a small bound: the `rules.ts`
 * constants bound how much is read, not how long the database takes to answer,
 * so every request-path call goes through `runMatchingWithinBudget`
 * (`src/lib/background/request-budget.ts`), which waits for the match for at
 * most `MATCHING_BUDGET_MS` and lets it finish after the response otherwise.
 *
 * The cost of that: nothing happens *between* requests. An offer nobody
 * answers is not passed on to the next driver when its 30 seconds end — the
 * load simply stays on the public board, where it has been all along, until
 * the next trigger.
 */

/** The order columns the matcher reads. No money, no contacts. */
const MATCH_ORDER_SELECT = {
  id: true,
  status: true,
  driverId: true,
  companyId: true,
  pickupLat: true,
  pickupLng: true,
  // What a driver's work preferences are compared with — see `toMatchLoad`.
  pickupCity: true,
  dropoffCity: true,
  distanceKm: true,
  handlingTags: true,
  helperCount: true,
  bodyType: true,
  cargoWeightKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
  vehicleTypeSpecId: true,
  vehicleTypeSpec: {
    select: {
      maxPayloadKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
    },
  },
  // Rows still `PENDING` after the sweep are, to the second, the live ones.
  _count: {
    select: { loadOffers: { where: { status: LoadOfferStatus.PENDING } } },
  },
} as const;

type MatchOrderRow = Prisma.OrderGetPayload<{
  select: typeof MATCH_ORDER_SELECT;
}>;

/** A vehicle with what is needed to say whose it is. */
const MATCH_VEHICLE_SELECT = {
  id: true,
  driverProfileId: true,
  ...VEHICLE_CAPABILITY_SELECT,
} as const;

function pointOf(lat: number | null, lng: number | null): LatLng | null {
  return lat === null || lng === null ? null : { lat, lng };
}

function toMatchLoad(order: MatchOrderRow): MatchLoad {
  return {
    orderId: order.id,
    pickup: pointOf(order.pickupLat, order.pickupLng),
    dimensions: {
      weightKg: order.cargoWeightKg,
      lengthM: order.cargoLengthM,
      widthM: order.cargoWidthM,
      heightM: order.cargoHeightM,
    },
    // Through `specCapability`, never the four columns by hand — it is where an
    // open bed's `cargoHeightM: 0` becomes "no height limit".
    booked: {
      vehicleTypeSpecId: order.vehicleTypeSpecId,
      floor: specCapability(order.vehicleTypeSpec),
    },
    bodyType: order.bodyType,
    liveOfferCount: order._count.loadOffers,
    preference: {
      pickupCity: order.pickupCity,
      dropoffCity: order.dropoffCity,
      tripKm: order.distanceKm,
      handlingTags: order.handlingTags,
      helperCount: order.helperCount,
    },
  };
}

/**
 * The driver columns a match reads: who they are, where they are, and the
 * work preferences they saved (null when they never did).
 */
const MATCH_DRIVER_SELECT = {
  id: true,
  userId: true,
  currentLat: true,
  currentLng: true,
  workPreferences: { select: WORK_PREFERENCES_SELECT },
} as const;

/** The board's eligibility facts for each vehicle, keeping its id. */
function toMatchVehicles(
  vehicles: readonly Prisma.VehicleGetPayload<{
    select: typeof MATCH_VEHICLE_SELECT;
  }>[],
): MatchVehicle[] {
  const fleet = resolveFleet(vehicles);

  return vehicles.flatMap((vehicle, index) => {
    const resolved = fleet[index];

    return resolved === undefined ? [] : [{ ...resolved, id: vehicle.id }];
  });
}

/**
 * A driver who may be offered work right now: online, approved, able to act on
 * the account (not suspended, no forced password change — the conditions the
 * accept path would refuse them on), not on a job, and with no unanswered
 * offer already in front of them.
 *
 * Run after `sweepExpiredOffers`, so "no `PENDING` offer" means "no live one".
 */
function availableDriverWhere(): Prisma.DriverProfileWhereInput {
  return {
    isOnline: true,
    activatedAt: { not: null },
    user: {
      role: "DRIVER",
      isSuspended: false,
      mustChangePassword: false,
      deliveries: { none: { status: { in: [...BUSY_ORDER_STATUSES] } } },
    },
  };
}

/**
 * Mark every offer whose deadline has passed as `EXPIRED`.
 *
 * This is the only "timer" offers have: it runs at the start of each match.
 * It is also what keeps the one-pending-offer-per-driver index from blocking a
 * driver on an offer that ran out — the row must stop being `PENDING` before a
 * new one can be inserted.
 */
async function sweepExpiredOffers(now: Date): Promise<void> {
  await prisma.loadOffer.updateMany({
    where: { status: LoadOfferStatus.PENDING, expiresAt: { lte: now } },
    data: { status: LoadOfferStatus.EXPIRED },
  });
}

/**
 * Insert the offers and report the ones that were actually created.
 *
 * `skipDuplicates` (`ON CONFLICT DO NOTHING`) is what makes concurrent matches
 * safe: a driver already offered this load, or already holding a pending offer
 * from a match that ran at the same instant, is skipped by the database's two
 * unique indexes rather than raising.
 */
async function createOffers(
  matches: readonly OfferMatch[],
  userIdByDriverProfileId: ReadonlyMap<string, string>,
  now: Date,
): Promise<OfferToNotify[]> {
  if (matches.length === 0) {
    return [];
  }

  const expiresAt = offerExpiresAt(now);

  const created = await prisma.loadOffer.createManyAndReturn({
    data: matches.map((match) => ({ ...match, createdAt: now, expiresAt })),
    skipDuplicates: true,
    select: { id: true, driverProfileId: true, expiresAt: true },
  });

  return created.flatMap((offer) => {
    const userId = userIdByDriverProfileId.get(offer.driverProfileId);

    return userId === undefined
      ? []
      : [{ id: offer.id, userId, expiresAt: offer.expiresAt }];
  });
}

/**
 * Offer one open load to the drivers it fits — nearest to the pickup first, up
 * to `MAX_LIVE_OFFERS_PER_LOAD` at a time. Returns the offers created.
 *
 * Throws on a database error — request handlers call `dispatchOffersForLoad`,
 * which does not.
 */
export async function offerLoadToDrivers(
  orderId: string,
): Promise<OfferToNotify[]> {
  const now = new Date();

  await sweepExpiredOffers(now);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: MATCH_ORDER_SELECT,
  });

  if (
    order === null ||
    order.status !== OrderStatus.PENDING ||
    order.driverId !== null ||
    order.companyId !== null
  ) {
    return [];
  }

  const load = toMatchLoad(order);

  if (openOfferSlots(load.liveOfferCount) === 0) {
    return [];
  }

  const drivers = await prisma.driverProfile.findMany({
    where: {
      ...availableDriverWhere(),
      // The board's rejected-load rule: a load the driver hid is not pushed.
      loadRejections: { none: { orderId } },
      // No live offer of any load, and never one of this load before —
      // declined, expired and withdrawn rows all count.
      loadOffers: {
        none: { OR: [{ status: LoadOfferStatus.PENDING }, { orderId }] },
      },
    },
    select: MATCH_DRIVER_SELECT,
    // Freshest position first, so the bounded read prefers drivers the
    // distance ranking can actually place.
    orderBy: [{ locationUpdatedAt: { sort: "desc", nulls: "last" } }],
    take: MAX_CANDIDATE_DRIVERS,
  });

  if (drivers.length === 0) {
    return [];
  }

  const driverIds = drivers.map((driver) => driver.id);
  const candidateIds = new Set(driverIds);

  const vehicles = await prisma.vehicle.findMany({
    where: driversVehiclesWhere(driverIds),
    select: {
      ...MATCH_VEHICLE_SELECT,
      assignments: {
        where: { unassignedAt: null, driverProfileId: { in: driverIds } },
        select: { driverProfileId: true },
      },
    },
  });

  // A vehicle belongs to its owner and to whoever holds it on an open fleet
  // assignment — the two halves of `driverVehiclesWhere`.
  const matchVehicles = toMatchVehicles(vehicles);
  const vehiclesByDriver = new Map<string, MatchVehicle[]>();

  vehicles.forEach((vehicle, index) => {
    const matchVehicle = matchVehicles[index];

    if (matchVehicle === undefined) {
      return;
    }

    const holders = new Set(
      [
        vehicle.driverProfileId,
        ...vehicle.assignments.map((assignment) => assignment.driverProfileId),
      ].filter(
        (holder): holder is string =>
          holder !== null && candidateIds.has(holder),
      ),
    );

    for (const holder of holders) {
      vehiclesByDriver.set(holder, [
        ...(vehiclesByDriver.get(holder) ?? []),
        matchVehicle,
      ]);
    }
  });

  const matches = selectDriversForLoad(
    load,
    drivers.map((driver) => ({
      driverProfileId: driver.id,
      location: pointOf(driver.currentLat, driver.currentLng),
      vehicles: vehiclesByDriver.get(driver.id) ?? [],
      preferences: toWorkPreferences(driver.workPreferences),
    })),
    now,
  );

  return createOffers(
    matches,
    new Map(drivers.map((driver) => [driver.id, driver.userId])),
    now,
  );
}

/**
 * Offer a driver who has just become free — gone online, or finished a job —
 * the best waiting load: one that fits, nearest pickup first, oldest first
 * when distance cannot decide. At most one offer; none if the driver is not
 * free to be offered work.
 *
 * Throws on a database error — request handlers call `dispatchOfferForDriver`.
 */
export async function offerWaitingLoadToDriver(
  userId: string,
): Promise<OfferToNotify[]> {
  const now = new Date();

  await sweepExpiredOffers(now);

  const driver = await prisma.driverProfile.findFirst({
    where: {
      ...availableDriverWhere(),
      userId,
      loadOffers: { none: { status: LoadOfferStatus.PENDING } },
    },
    select: MATCH_DRIVER_SELECT,
  });

  if (driver === null) {
    return [];
  }

  const [vehicles, orders] = await Promise.all([
    prisma.vehicle.findMany({
      where: driverVehiclesWhere(driver.id),
      select: MATCH_VEHICLE_SELECT,
    }),
    prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        driverId: null,
        companyId: null,
        rejections: { none: { driverProfileId: driver.id } },
        loadOffers: { none: { driverProfileId: driver.id } },
      },
      select: MATCH_ORDER_SELECT,
      orderBy: { createdAt: "asc" },
      take: MAX_CANDIDATE_LOADS,
    }),
  ]);

  if (vehicles.length === 0 || orders.length === 0) {
    return [];
  }

  const match = selectLoadForDriver(
    {
      driverProfileId: driver.id,
      location: pointOf(driver.currentLat, driver.currentLng),
      vehicles: toMatchVehicles(vehicles),
      preferences: toWorkPreferences(driver.workPreferences),
    },
    orders.map(toMatchLoad),
    now,
  );

  return createOffers(
    match === null ? [] : [match],
    new Map([[driver.id, driver.userId]]),
    now,
  );
}

/**
 * Send the pushes once the response has gone out.
 *
 * `after` keeps the serverless invocation alive for the send without making
 * the caller wait for it. Outside a request (a script) there is no response to
 * wait for and `after` throws, so the send is simply started.
 */
function pushAfterResponse(offers: readonly OfferToNotify[]): void {
  if (offers.length === 0) {
    return;
  }

  try {
    after(() => notifyOffersCreated(offers));
  } catch {
    void notifyOffersCreated(offers);
  }
}

/**
 * The request-path form of `offerLoadToDrivers`: **never throws**. Whatever
 * goes wrong while matching — the database, a bug — is logged and swallowed,
 * because the request this rides on (a payment settling, a driver declining)
 * has already done its own work and must report that, not this.
 */
export async function dispatchOffersForLoad(orderId: string): Promise<void> {
  try {
    pushAfterResponse(await offerLoadToDrivers(orderId));
  } catch (error) {
    console.error("Failed to offer a load to drivers:", error);
  }
}

/** The request-path form of `offerWaitingLoadToDriver`: **never throws**. */
export async function dispatchOfferForDriver(userId: string): Promise<void> {
  try {
    pushAfterResponse(await offerWaitingLoadToDriver(userId));
  } catch (error) {
    console.error("Failed to offer a waiting load to a driver:", error);
  }
}
