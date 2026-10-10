// Reads and writes offers through Prisma; server code only.
import "server-only";

import { LoadOfferStatus, type Prisma } from "@prisma/client";

import { formatCity } from "@/lib/format-city";
import { haversineDistanceKm } from "@/lib/geo";
import {
  deriveOfferState,
  isOpenLoad,
  OFFER_LIFETIME_SECONDS,
  secondsRemaining,
  type OfferState,
} from "@/lib/offers/rules";
import { prisma } from "@/lib/prisma";

/**
 * Everything the offer screen shows, in one read. **An allowlist, like the
 * load board's `LOADS_SELECT`**: `price`, the fare components and
 * `commissionRate` are not selected, so they cannot reach a driver; neither
 * are the stop contacts, which belong to whoever holds the job.
 */
const CURRENT_OFFER_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  expiresAt: true,
  driverProfile: { select: { currentLat: true, currentLng: true } },
  vehicle: {
    select: {
      id: true,
      plateNumber: true,
      make: true,
      model: true,
      vehicleTypeSpec: { select: { label: true } },
    },
  },
  order: {
    select: {
      id: true,
      reference: true,
      status: true,
      driverId: true,
      companyId: true,
      driverPayout: true,
      distanceKm: true,
      pickupAddress: true,
      pickupCity: true,
      pickupLat: true,
      pickupLng: true,
      dropoffAddress: true,
      dropoffCity: true,
      dropoffLat: true,
      dropoffLng: true,
      scheduledAt: true,
      pickupWindowStart: true,
      pickupWindowEnd: true,
      deliveryDeadline: true,
      cargoCategory: true,
      description: true,
      packagingDescription: true,
      itemQuantity: true,
      cargoWeightKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
      bodyType: true,
      handlingTags: true,
      helperCount: true,
      serviceLevel: true,
    },
  },
} satisfies Prisma.LoadOfferSelect;

type CurrentOfferRow = Prisma.LoadOfferGetPayload<{
  select: typeof CURRENT_OFFER_SELECT;
}>;

/** A live offer as plain data — what `toHubOffer` puts on the wire. */
export type DriverOfferRecord = {
  id: string;
  orderId: string;
  reference: string;
  createdAt: string;
  expiresAt: string;
  secondsRemaining: number;
  lifetimeSeconds: number;
  driverPayout: number;
  distanceKm: number;
  pickupDistanceKm: number | null;
  pickupAddress: string;
  pickupCity: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string;
  dropoffCity: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  scheduledAt: string | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryDeadline: string | null;
  cargoCategory: string;
  description: string | null;
  packagingDescription: string | null;
  itemQuantity: string | null;
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  bodyType: string | null;
  handlingTags: string[];
  helperCount: number;
  serviceLevel: string;
  fitVehicle: {
    id: string;
    plateNumber: string;
    make: string;
    model: string;
    typeLabel: string;
  } | null;
};

function toDriverOfferRecord(
  row: CurrentOfferRow,
  now: Date,
): DriverOfferRecord {
  const { order, vehicle, driverProfile } = row;

  // Null rather than a wrong number when either end is unknown, as on the board.
  const pickupDistanceKm =
    driverProfile.currentLat === null ||
    driverProfile.currentLng === null ||
    order.pickupLat === null ||
    order.pickupLng === null
      ? null
      : haversineDistanceKm(
          { lat: driverProfile.currentLat, lng: driverProfile.currentLng },
          { lat: order.pickupLat, lng: order.pickupLng },
        );

  return {
    id: row.id,
    orderId: order.id,
    reference: order.reference,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    secondsRemaining: secondsRemaining(row.expiresAt, now),
    lifetimeSeconds: OFFER_LIFETIME_SECONDS,
    driverPayout: order.driverPayout,
    distanceKm: order.distanceKm,
    pickupDistanceKm,
    pickupAddress: order.pickupAddress,
    pickupCity: order.pickupCity === null ? null : formatCity(order.pickupCity),
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    dropoffAddress: order.dropoffAddress,
    dropoffCity:
      order.dropoffCity === null ? null : formatCity(order.dropoffCity),
    dropoffLat: order.dropoffLat,
    dropoffLng: order.dropoffLng,
    scheduledAt: order.scheduledAt?.toISOString() ?? null,
    pickupWindowStart: order.pickupWindowStart?.toISOString() ?? null,
    pickupWindowEnd: order.pickupWindowEnd?.toISOString() ?? null,
    deliveryDeadline: order.deliveryDeadline?.toISOString() ?? null,
    cargoCategory: order.cargoCategory,
    description: order.description,
    packagingDescription: order.packagingDescription,
    itemQuantity: order.itemQuantity,
    cargoWeightKg: order.cargoWeightKg,
    cargoLengthM: order.cargoLengthM,
    cargoWidthM: order.cargoWidthM,
    cargoHeightM: order.cargoHeightM,
    bodyType: order.bodyType,
    handlingTags: order.handlingTags,
    helperCount: order.helperCount,
    serviceLevel: order.serviceLevel,
    fitVehicle:
      vehicle === null
        ? null
        : {
            id: vehicle.id,
            plateNumber: vehicle.plateNumber,
            make: vehicle.make,
            model: vehicle.model,
            typeLabel: vehicle.vehicleTypeSpec.label,
          },
  };
}

/**
 * Write down a state the read path has just derived for a row still stored as
 * `PENDING` — the lazy half of "status is derived or lazily updated on read".
 * Conditional on the row still being `PENDING`, so it can never overwrite an
 * answer, and never throws: the derived state is already what the caller is
 * told.
 */
async function recordSettledState(
  offerId: string,
  state: Extract<OfferState, "EXPIRED" | "WITHDRAWN">,
): Promise<void> {
  try {
    await prisma.loadOffer.updateMany({
      where: { id: offerId, status: LoadOfferStatus.PENDING },
      data: { status: state },
    });
  } catch (error) {
    console.error("Failed to record a load offer's settled state:", error);
  }
}

/**
 * The driver's live offer, or null — the polling read.
 *
 * One query in the steady state: the partial unique index guarantees a driver
 * has at most one `PENDING` row, so there is nothing to sort or page. A row
 * that turns out to be expired or withdrawn is settled on the way out and
 * reported as "no offer".
 */
export async function getCurrentOffer(
  driverProfileId: string,
  now: Date,
): Promise<DriverOfferRecord | null> {
  const row = await prisma.loadOffer.findFirst({
    where: { driverProfileId, status: LoadOfferStatus.PENDING },
    select: CURRENT_OFFER_SELECT,
    orderBy: { createdAt: "desc" },
  });

  if (row === null) {
    return null;
  }

  const state = deriveOfferState(row, isOpenLoad(row.order), now);

  if (state === "EXPIRED" || state === "WITHDRAWN") {
    await recordSettledState(row.id, state);
    return null;
  }

  return state === "LIVE" ? toDriverOfferRecord(row, now) : null;
}

/** One of a driver's offers with its state resolved against the clock. */
export type DriverOfferState = {
  id: string;
  orderId: string;
  /** The load's human reference, for the "someone else took it" refusal. */
  reference: string;
  state: OfferState;
};

/**
 * One offer, **scoped to the driver it was made to** — another driver's offer
 * is indistinguishable from one that does not exist. The state is derived
 * here, on every call, and settled lazily like `getCurrentOffer`'s.
 */
export async function getOfferState(
  offerId: string,
  driverProfileId: string,
  now: Date,
): Promise<DriverOfferState | null> {
  const row = await prisma.loadOffer.findFirst({
    where: { id: offerId, driverProfileId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      order: {
        select: {
          id: true,
          reference: true,
          status: true,
          driverId: true,
          companyId: true,
        },
      },
    },
  });

  if (row === null) {
    return null;
  }

  const state = deriveOfferState(row, isOpenLoad(row.order), now);

  if (
    row.status === LoadOfferStatus.PENDING &&
    (state === "EXPIRED" || state === "WITHDRAWN")
  ) {
    await recordSettledState(row.id, state);
  }

  return {
    id: row.id,
    orderId: row.order.id,
    reference: row.order.reference,
    state,
  };
}

/**
 * Decline a live offer. Conditional on the row still being `PENDING` and
 * unexpired, so a decline racing an accept or the deadline changes nothing;
 * returns whether this call was the one that declined it.
 */
export async function declineLiveOffer(
  offerId: string,
  driverProfileId: string,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.loadOffer.updateMany({
    where: {
      id: offerId,
      driverProfileId,
      status: LoadOfferStatus.PENDING,
      expiresAt: { gt: now },
    },
    data: { status: LoadOfferStatus.DECLINED, respondedAt: now },
  });

  return count === 1;
}

/**
 * Record that the driver's accept won the claim. `settleOffersAfterClaim` has
 * normally done this already; it skips an offer whose deadline passed in the
 * instant between the route's check and the claim, and this does not, so a
 * repeated accept is answered "accepted" rather than "expired". Never throws —
 * the job is already the driver's.
 */
export async function markOfferAccepted(
  offerId: string,
  driverProfileId: string,
  now: Date,
): Promise<void> {
  try {
    await prisma.loadOffer.updateMany({
      where: {
        id: offerId,
        driverProfileId,
        status: { not: LoadOfferStatus.ACCEPTED },
      },
      data: { status: LoadOfferStatus.ACCEPTED, respondedAt: now },
    });
  } catch (error) {
    console.error("Failed to mark a load offer accepted:", error);
  }
}
