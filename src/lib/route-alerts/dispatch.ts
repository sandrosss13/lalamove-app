// Matches saved route alerts to a load through Prisma and pushes; server only.
import "server-only";

import { after } from "next/server";
import { OrderStatus } from "@prisma/client";

import { recordRouteAlertNotifications } from "@/lib/notifications/inbox";
import { usersAcceptingPush } from "@/lib/notifications/settings";
import { specCapability } from "@/lib/orders/booking-fit";
import { driversVehiclesWhere } from "@/lib/orders/driver-vehicles";
import {
  firstFittingVehicle,
  permittedVehicles,
  resolveFleet,
  VEHICLE_CAPABILITY_SELECT,
  type FleetVehicle,
} from "@/lib/orders/load-eligibility";
import { prisma } from "@/lib/prisma";
import { ROUTE_ALERT_PUSH_COPY } from "@/lib/push/copy";
import { buildRouteAlertPushMessage } from "@/lib/push/rules";
import { getPushSender } from "@/lib/push/sender";
import {
  firstMatchingAlertPerDriver,
  MAX_ALERT_CANDIDATES,
  ROUTE_ALERT_PUSH_TTL_SECONDS,
} from "@/lib/route-alerts/rules";

/*
 * Route alerts.
 *
 * Fired where load offers are: inline, in the request that puts a load on the
 * market (`settleOrderPayment`). There is no job queue, cron or socket on this
 * stack, so this is the only moment an alert can fire — a load that changes
 * afterwards, or an alert saved afterwards, alerts nobody; the app shows what
 * currently matches from the board itself.
 *
 * The cost is bounded by `MAX_ALERT_CANDIDATES`: at most that many alerts are
 * read for one load, oldest first, so beyond that many matching alerts on one
 * route the newest are not told. It is five indexed queries and one push
 * request per hundred devices, and `dispatchRouteAlertsForLoad` can never fail
 * the request it rides on.
 *
 * A fired alert is recorded in the driver's notification inbox whether or not
 * it is pushed: the push is gated on the driver's notification settings (and
 * on push being configured at all), the inbox entry is not.
 */

/** A route alert that fired, reduced to what its push and inbox entry need. */
type AlertToNotify = {
  alertId: string;
  orderId: string;
  /** The driver's `User.id` — device tokens are registered per account. */
  userId: string;
};

/** The order columns an alert is matched on. No address, no client price. */
const ALERT_ORDER_SELECT = {
  id: true,
  status: true,
  driverId: true,
  companyId: true,
  pickupCity: true,
  dropoffCity: true,
  driverPayout: true,
  pickupWindowStart: true,
  scheduledAt: true,
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
} as const;

/**
 * Record which drivers are alerted about a newly open load, and return those
 * alerts for the inbox and the push. Returns nothing — and writes nothing — when the load is
 * not open, has no resolved pick-up city, or matches nobody.
 *
 * A driver is alerted when
 *
 * 1. one of their enabled alerts matches the load (`alertMatchesLoad`: cities,
 *    minimum driver payout, pick-up weekday in Tbilisi);
 * 2. they could act on it — an activated driver account, not suspended, not
 *    holding a temporary password — and have not hidden this load;
 * 3. one of their vehicles can take it, by the load board's own rule
 *    (`permittedVehicles` then a fit — what `GET /api/loads` lists);
 * 4. they have not been alerted about this load already, and are not holding
 *    an offer of it — the offer is the stronger signal for the same load.
 *
 * Their notification settings are not a rule here: they decide whether the
 * alert is *pushed* (`notifyRouteAlertsFired`), not whether it lands in the
 * inbox.
 *
 * Rule 4's first half is `RouteAlertFire`'s unique index: the insert skips a
 * driver already recorded, so a second trigger for the same load — or two at
 * once — pushes nothing twice.
 *
 * Throws on a database error; request handlers call
 * `dispatchRouteAlertsForLoad`, which does not.
 */
export async function fireRouteAlertsForLoad(
  orderId: string,
): Promise<AlertToNotify[]> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: ALERT_ORDER_SELECT,
  });

  if (
    order === null ||
    order.status !== OrderStatus.PENDING ||
    order.driverId !== null ||
    order.companyId !== null ||
    order.pickupCity === null
  ) {
    return [];
  }

  // City and payout narrow the read in the database; `alertMatchesLoad` then
  // decides, so the rule is stated once and pinned by its spec.
  const candidates = await prisma.routeAlert.findMany({
    where: {
      enabled: true,
      fromCity: order.pickupCity,
      OR: [
        { toCity: null },
        ...(order.dropoffCity === null ? [] : [{ toCity: order.dropoffCity }]),
      ],
      minPayout: { lte: order.driverPayout },
      driverProfile: {
        activatedAt: { not: null },
        user: { role: "DRIVER", isSuspended: false, mustChangePassword: false },
        loadRejections: { none: { orderId } },
        loadOffers: { none: { orderId } },
        routeAlertFires: { none: { orderId } },
      },
    },
    select: {
      id: true,
      driverProfileId: true,
      fromCity: true,
      toCity: true,
      minPayout: true,
      days: true,
      enabled: true,
      driverProfile: { select: { userId: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_ALERT_CANDIDATES,
  });

  const matched = firstMatchingAlertPerDriver(candidates, {
    pickupCity: order.pickupCity,
    dropoffCity: order.dropoffCity,
    driverPayout: order.driverPayout,
    pickupAt: order.pickupWindowStart ?? order.scheduledAt,
  });

  if (matched.size === 0) {
    return [];
  }

  const driverIds = [...matched.values()].map((alert) => alert.driverProfileId);

  const vehicles = await prisma.vehicle.findMany({
    where: driversVehiclesWhere(driverIds),
    select: {
      driverProfileId: true,
      ...VEHICLE_CAPABILITY_SELECT,
      assignments: {
        where: { unassignedAt: null, driverProfileId: { in: driverIds } },
        select: { driverProfileId: true },
      },
    },
  });

  // A vehicle belongs to its owner and to whoever holds it on an open fleet
  // assignment — the two halves of `driverVehiclesWhere`.
  const fleet = resolveFleet(vehicles);
  const fleetByDriver = new Map<string, FleetVehicle[]>();

  vehicles.forEach((vehicle, index) => {
    const resolved = fleet[index];

    if (resolved === undefined) {
      return;
    }

    const holders = new Set(
      [
        vehicle.driverProfileId,
        ...vehicle.assignments.map((assignment) => assignment.driverProfileId),
      ].filter((holder): holder is string => holder !== null),
    );

    for (const holder of holders) {
      fleetByDriver.set(holder, [
        ...(fleetByDriver.get(holder) ?? []),
        resolved,
      ]);
    }
  });

  // Through `specCapability`, never the four columns by hand — it is where an
  // open bed's `cargoHeightM: 0` becomes "no height limit".
  const booked = {
    vehicleTypeSpecId: order.vehicleTypeSpecId,
    floor: specCapability(order.vehicleTypeSpec),
  };
  const dimensions = {
    weightKg: order.cargoWeightKg,
    lengthM: order.cargoLengthM,
    widthM: order.cargoWidthM,
    heightM: order.cargoHeightM,
  };

  const eligible = driverIds.filter(
    (driverId) =>
      firstFittingVehicle(
        dimensions,
        permittedVehicles(
          fleetByDriver.get(driverId) ?? [],
          booked,
          order.bodyType,
        ),
      ) !== null,
  );

  if (eligible.length === 0) {
    return [];
  }

  const fired = await prisma.routeAlertFire.createManyAndReturn({
    data: eligible.flatMap((driverProfileId) => {
      const alert = matched.get(driverProfileId);

      return alert === undefined
        ? []
        : [{ orderId, driverProfileId, alertId: alert.id }];
    }),
    skipDuplicates: true,
    select: { driverProfileId: true },
  });

  return fired.flatMap((fire) => {
    const alert = matched.get(fire.driverProfileId);

    return alert === undefined
      ? []
      : [{ alertId: alert.id, orderId, userId: alert.driverProfile.userId }];
  });
}

/**
 * Push each fired alert to its driver's devices. **Never throws.** With push
 * unconfigured it returns before touching the database.
 *
 * A driver whose notification settings refuse a route alert right now
 * (`shouldSendPush`: the category is off, or it is their quiet hours) is not
 * pushed — the alert is still in their inbox.
 *
 * Only devices whose session is still valid are sent to; tokens the push
 * service reports dead are deleted — both as an offer push does.
 */
async function notifyRouteAlertsFired(
  alerts: readonly AlertToNotify[],
): Promise<void> {
  try {
    const sender = getPushSender();

    if (!sender.enabled) {
      return;
    }

    const now = new Date();
    const alertByUserId = new Map(alerts.map((alert) => [alert.userId, alert]));

    const recipients = await usersAcceptingPush(
      "ROUTE_ALERTS",
      [...alertByUserId.keys()],
      now,
    );

    if (recipients.size === 0) {
      return;
    }

    const devices = await prisma.deviceToken.findMany({
      where: {
        userId: { in: [...recipients] },
        session: { expiresAt: { gt: now } },
      },
      select: { userId: true, token: true, locale: true },
    });

    const messages = devices.flatMap((device) => {
      const alert = alertByUserId.get(device.userId);

      return alert === undefined
        ? []
        : [
            buildRouteAlertPushMessage({
              token: device.token,
              alertId: alert.alertId,
              orderId: alert.orderId,
              ...ROUTE_ALERT_PUSH_COPY[device.locale],
              ttlSeconds: ROUTE_ALERT_PUSH_TTL_SECONDS,
            }),
          ];
    });

    if (messages.length === 0) {
      return;
    }

    const { invalidTokens } = await sender.send(messages);

    if (invalidTokens.length > 0) {
      await prisma.deviceToken.deleteMany({
        where: { token: { in: invalidTokens } },
      });
    }
  } catch (error) {
    console.error("Failed to push route alerts:", error);
  }
}

/**
 * The request-path form: match, record, write the inbox and push, and **never
 * throw**. Whatever goes wrong is logged and swallowed — the request this
 * rides on has already put the load on the market and must report that, not
 * this.
 *
 * Matching runs with push unconfigured too: the inbox entry is the alert's
 * in-app record, and the push only its nudge.
 *
 * The inbox write and the send wait until the response has gone out
 * (`after`); outside a request there is no response and `after` throws, so
 * they are simply started. Neither throws.
 */
export async function dispatchRouteAlertsForLoad(
  orderId: string,
): Promise<void> {
  try {
    const alerts = await fireRouteAlertsForLoad(orderId);

    if (alerts.length === 0) {
      return;
    }

    const notify = async (): Promise<void> => {
      await Promise.all([
        recordRouteAlertNotifications(alerts),
        notifyRouteAlertsFired(alerts),
      ]);
    };

    try {
      after(notify);
    } catch {
      void notify();
    }
  } catch (error) {
    console.error("Failed to fire route alerts for a load:", error);
  }
}
