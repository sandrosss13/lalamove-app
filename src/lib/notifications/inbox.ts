// Writes the driver notification inbox through Prisma; server code only.
import "server-only";

import type { DriverNotificationType, Prisma } from "@prisma/client";

import { pickInboxLocale } from "@/lib/notifications/inbox-rules";
import { prisma } from "@/lib/prisma";
import {
  OFFER_PUSH_COPY,
  ROUTE_ALERT_PUSH_COPY,
  type NotificationCopy,
} from "@/lib/push/copy";
import {
  offerPushData,
  routeAlertPushData,
  type PushData,
} from "@/lib/push/rules";

/** One inbox entry to write, before its wording is chosen. */
type InboxEntry = {
  /** The driver's `User.id`. */
  userId: string;
  type: DriverNotificationType;
  copy: Record<"KA" | "EN", NotificationCopy>;
  data: PushData;
};

/**
 * Write one inbox entry per item, in each driver's language. **Never
 * throws**: the offer or alert already exists, and the inbox is a record of
 * it, not a condition of it — a failure is logged and the dispatch goes on,
 * as a failed push does.
 *
 * Written whether or not a push goes out (push unconfigured, the category
 * switched off, no device registered): the inbox is the in-app record.
 *
 * The language is that of the driver's most recently seen device — what a
 * push to them is written in — or the platform default with none.
 */
async function recordInboxEntries(
  entries: readonly InboxEntry[],
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  try {
    const devices = await prisma.deviceToken.findMany({
      where: { userId: { in: [...new Set(entries.map((e) => e.userId))] } },
      select: { userId: true, locale: true, lastSeenAt: true },
    });

    const devicesByUserId = new Map<string, typeof devices>();

    for (const device of devices) {
      devicesByUserId.set(device.userId, [
        ...(devicesByUserId.get(device.userId) ?? []),
        device,
      ]);
    }

    await prisma.driverNotification.createMany({
      data: entries.map((entry) => {
        const locale = pickInboxLocale(devicesByUserId.get(entry.userId) ?? []);

        return {
          userId: entry.userId,
          type: entry.type,
          ...entry.copy[locale],
          data: entry.data as Prisma.InputJsonObject,
        };
      }),
    });
  } catch (error) {
    console.error("Failed to record driver notifications:", error);
  }
}

/** An inbox entry for each new load offer. **Never throws.** */
export function recordOfferNotifications(
  offers: readonly { id: string; userId: string }[],
): Promise<void> {
  return recordInboxEntries(
    offers.map((offer) => ({
      userId: offer.userId,
      type: "LOAD_OFFER",
      copy: OFFER_PUSH_COPY,
      data: offerPushData(offer.id),
    })),
  );
}

/** An inbox entry for each fired route alert. **Never throws.** */
export function recordRouteAlertNotifications(
  alerts: readonly { alertId: string; orderId: string; userId: string }[],
): Promise<void> {
  return recordInboxEntries(
    alerts.map((alert) => ({
      userId: alert.userId,
      type: "ROUTE_ALERT",
      copy: ROUTE_ALERT_PUSH_COPY,
      data: routeAlertPushData(alert.alertId, alert.orderId),
    })),
  );
}
