// Reads notification settings through Prisma; server code only.
import "server-only";

import type { Prisma } from "@prisma/client";

import {
  shouldSendPush,
  type NotificationCategory,
  type NotificationSettings,
} from "@/lib/notifications/rules";
import { prisma } from "@/lib/prisma";

/** Exactly the columns `NotificationSettings` is built from. */
export const NOTIFICATION_SETTINGS_SELECT = {
  loadOffers: true,
  routeAlerts: true,
  jobReminders: true,
  payouts: true,
  tipsAndPromotions: true,
  quietHoursEnabled: true,
  quietHoursStartMinute: true,
  quietHoursEndMinute: true,
} as const;

type NotificationSettingsRow = Prisma.DriverNotificationSettingsGetPayload<{
  select: typeof NOTIFICATION_SETTINGS_SELECT;
}>;

/** A stored row as the rules read it; null (no row) stays null — "defaults". */
export function toNotificationSettings(
  row: NotificationSettingsRow | null,
): NotificationSettings | null {
  return row === null
    ? null
    : {
        loadOffers: row.loadOffers,
        routeAlerts: row.routeAlerts,
        jobReminders: row.jobReminders,
        payouts: row.payouts,
        tipsAndPromotions: row.tipsAndPromotions,
        quietHoursEnabled: row.quietHoursEnabled,
        quietHoursStartMinute: row.quietHoursStartMinute,
        quietHoursEndMinute: row.quietHoursEndMinute,
      };
}

/**
 * Which of `userIds` may be pushed `category` at `now` — the gate every push
 * sender puts its recipients through before it builds a message.
 *
 * One query for the rows that exist; an account with none has the defaults,
 * and `shouldSendPush` is the whole rule.
 */
export async function usersAcceptingPush(
  category: NotificationCategory,
  userIds: readonly string[],
  now: Date,
): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }

  const rows = await prisma.driverNotificationSettings.findMany({
    where: { driverProfile: { userId: { in: [...userIds] } } },
    select: {
      ...NOTIFICATION_SETTINGS_SELECT,
      driverProfile: { select: { userId: true } },
    },
  });

  const settingsByUserId = new Map(
    rows.map((row) => [row.driverProfile.userId, toNotificationSettings(row)]),
  );

  return new Set(
    userIds.filter((userId) =>
      shouldSendPush(category, settingsByUserId.get(userId) ?? null, now),
    ),
  );
}
