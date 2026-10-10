/**
 * A driver's push-notification settings, and the one rule every push asks:
 * **may this category be pushed to this driver right now?**
 *
 * No runtime dependency on Prisma, Next or `server-only`, so
 * `tests/notification-rules.spec.ts` pins all of it without a server. The row
 * lives in `DriverNotificationSettings`; `src/lib/notifications/settings.ts`
 * reads and writes it.
 */

import { HUB_TIME_ZONE } from "@/lib/dashboard/hub/timezone";
import {
  formatTimeOfDay,
  isWithinDailyWindow,
  minuteOfDayOf,
  parseTimeOfDay,
} from "@/lib/schedule/rules";

/**
 * The design's notification rows (Account → Notifications), in its order:
 *
 * | Category              | Design copy              | Sender today      |
 * | --------------------- | ------------------------ | ----------------- |
 * | `LOAD_OFFERS`         | New load offers          | yes (offer push)  |
 * | `ROUTE_ALERTS`        | Route alerts             | yes (alert push)  |
 * | `JOB_REMINDERS`       | Job reminders            | none              |
 * | `PAYOUTS`             | Payouts and withdrawals  | none              |
 * | `DOCUMENT_EXPIRY`     | Document expiry          | none              |
 * | `TIPS_AND_PROMOTIONS` | Tips and promotions      | none              |
 *
 * The design's seventh switch is quiet hours, which is not a category.
 */
export const NOTIFICATION_CATEGORIES = [
  "LOAD_OFFERS",
  "ROUTE_ALERTS",
  "JOB_REMINDERS",
  "PAYOUTS",
  "DOCUMENT_EXPIRY",
  "TIPS_AND_PROMOTIONS",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Categories the driver cannot switch off — the design's "Always on" row. A
 * lapsed document stops a driver working, so the warning is not optional.
 */
export const LOCKED_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  "DOCUMENT_EXPIRY",
];

/**
 * **The urgent categories: the ones quiet hours do not hold back.**
 *
 * - `LOAD_OFFERS` — an offer is only ever made to a driver who is online, and
 *   lives 30 seconds. The design says it outright: "Offers still ring while
 *   you are online."
 * - `JOB_REMINDERS` — a reminder is about a job the driver has already
 *   accepted and is useless after its pick-up.
 *
 * Everything else — route alerts, payouts, document expiry, tips — can wait
 * for the morning, and during quiet hours is not sent.
 */
export const URGENT_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  "LOAD_OFFERS",
  "JOB_REMINDERS",
];

/** The zone quiet hours are read in. One for every driver; not stored. */
export const QUIET_HOURS_TIME_ZONE = HUB_TIME_ZONE;

/** The stored settings, spelled without Prisma. */
export type NotificationSettings = {
  loadOffers: boolean;
  routeAlerts: boolean;
  jobReminders: boolean;
  payouts: boolean;
  tipsAndPromotions: boolean;
  quietHoursEnabled: boolean;
  quietHoursStartMinute: number;
  quietHoursEndMinute: number;
};

/**
 * What a driver who never opened the screen has — the design's initial state:
 * everything on except tips, quiet hours off, 23:00 → 07:00 when switched on.
 * The column defaults of `DriverNotificationSettings` say the same thing.
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  loadOffers: true,
  routeAlerts: true,
  jobReminders: true,
  payouts: true,
  tipsAndPromotions: false,
  quietHoursEnabled: false,
  quietHoursStartMinute: 23 * 60,
  quietHoursEndMinute: 7 * 60,
};

/** Whether the driver has `category` switched on. Locked ones always are. */
export function isCategoryEnabled(
  category: NotificationCategory,
  settings: NotificationSettings,
): boolean {
  switch (category) {
    case "LOAD_OFFERS":
      return settings.loadOffers;
    case "ROUTE_ALERTS":
      return settings.routeAlerts;
    case "JOB_REMINDERS":
      return settings.jobReminders;
    case "PAYOUTS":
      return settings.payouts;
    case "TIPS_AND_PROMOTIONS":
      return settings.tipsAndPromotions;
    case "DOCUMENT_EXPIRY":
      return true;
  }
}

/** Whether `now` is inside the driver's quiet hours (and they are on). */
export function isInQuietHours(
  settings: NotificationSettings,
  now: Date,
): boolean {
  // Equal start and end would read as "all day" to `isWithinDailyWindow`; the
  // parser refuses to store that, and a quiet window of no length is none.
  if (
    !settings.quietHoursEnabled ||
    settings.quietHoursStartMinute === settings.quietHoursEndMinute
  ) {
    return false;
  }

  return isWithinDailyWindow(
    minuteOfDayOf(now),
    settings.quietHoursStartMinute,
    settings.quietHoursEndMinute,
  );
}

/**
 * **The rule.** A push of `category` goes to a driver when the category is
 * switched on and, during their quiet hours, only when it is urgent.
 *
 * `settings` null is a driver with no row: the defaults.
 *
 * A push this refuses is dropped, not queued — nothing on this stack could
 * deliver it later. What it announced is still in the app.
 */
export function shouldSendPush(
  category: NotificationCategory,
  settings: NotificationSettings | null,
  now: Date,
): boolean {
  const effective = settings ?? DEFAULT_NOTIFICATION_SETTINGS;

  if (!isCategoryEnabled(category, effective)) {
    return false;
  }

  return (
    URGENT_NOTIFICATION_CATEGORIES.includes(category) ||
    !isInQuietHours(effective, now)
  );
}

/** Why a settings update is refused. */
export type NotificationSettingsRefusal =
  | { reason: "NOT_AN_OBJECT" }
  | { reason: "NOTHING_TO_UPDATE" }
  | { reason: "NOT_A_BOOLEAN"; field: string }
  | { reason: "LOCKED_CATEGORY"; field: string }
  | { reason: "INVALID_TIME"; field: string }
  | { reason: "EMPTY_QUIET_WINDOW" };

/** The wire name of each switch a driver can move, and the column behind it. */
const TOGGLE_COLUMNS = {
  loadOffers: "loadOffers",
  routeAlerts: "routeAlerts",
  jobReminders: "jobReminders",
  payouts: "payouts",
  tipsAndPromotions: "tipsAndPromotions",
} as const satisfies Record<string, keyof NotificationSettings>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A `PATCH` body applied over the driver's current settings: the settings as
 * they would be stored, or why not. Fields left out keep their value.
 *
 * `documentExpiry` may be sent as `true` (it is on the `GET` body, and a
 * client that echoes the whole object back should not be refused) but not as
 * `false`.
 */
export function applyNotificationSettingsUpdate(
  current: NotificationSettings,
  body: unknown,
):
  | { settings: NotificationSettings }
  | { refusal: NotificationSettingsRefusal } {
  if (!isRecord(body)) {
    return { refusal: { reason: "NOT_AN_OBJECT" } };
  }

  const next: NotificationSettings = { ...current };
  let changed = false;

  for (const [field, column] of Object.entries(TOGGLE_COLUMNS)) {
    const value = body[field];

    if (value === undefined) {
      continue;
    }

    if (typeof value !== "boolean") {
      return { refusal: { reason: "NOT_A_BOOLEAN", field } };
    }

    next[column] = value;
    changed = true;
  }

  if (body.documentExpiry !== undefined) {
    if (typeof body.documentExpiry !== "boolean") {
      return { refusal: { reason: "NOT_A_BOOLEAN", field: "documentExpiry" } };
    }

    if (!body.documentExpiry) {
      return {
        refusal: { reason: "LOCKED_CATEGORY", field: "documentExpiry" },
      };
    }

    changed = true;
  }

  if (body.quietHours !== undefined) {
    const quietHours = body.quietHours;

    if (!isRecord(quietHours)) {
      return {
        refusal: { reason: "NOT_A_BOOLEAN", field: "quietHours.enabled" },
      };
    }

    if (quietHours.enabled !== undefined) {
      if (typeof quietHours.enabled !== "boolean") {
        return {
          refusal: { reason: "NOT_A_BOOLEAN", field: "quietHours.enabled" },
        };
      }

      next.quietHoursEnabled = quietHours.enabled;
      changed = true;
    }

    for (const [field, column] of [
      ["start", "quietHoursStartMinute"],
      ["end", "quietHoursEndMinute"],
    ] as const) {
      if (quietHours[field] === undefined) {
        continue;
      }

      const minute = parseTimeOfDay(quietHours[field]);

      if (minute === null) {
        return {
          refusal: { reason: "INVALID_TIME", field: `quietHours.${field}` },
        };
      }

      next[column] = minute;
      changed = true;
    }
  }

  if (!changed) {
    return { refusal: { reason: "NOTHING_TO_UPDATE" } };
  }

  if (next.quietHoursStartMinute === next.quietHoursEndMinute) {
    return { refusal: { reason: "EMPTY_QUIET_WINDOW" } };
  }

  return { settings: next };
}

/** The settings as the app reads them — `HubNotificationSettings` on the wire. */
export function describeNotificationSettings(settings: NotificationSettings): {
  loadOffers: boolean;
  routeAlerts: boolean;
  jobReminders: boolean;
  payouts: boolean;
  documentExpiry: true;
  tipsAndPromotions: boolean;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timeZone: typeof QUIET_HOURS_TIME_ZONE;
  };
} {
  return {
    loadOffers: settings.loadOffers,
    routeAlerts: settings.routeAlerts,
    jobReminders: settings.jobReminders,
    payouts: settings.payouts,
    documentExpiry: true,
    tipsAndPromotions: settings.tipsAndPromotions,
    quietHours: {
      enabled: settings.quietHoursEnabled,
      start: formatTimeOfDay(settings.quietHoursStartMinute),
      end: formatTimeOfDay(settings.quietHoursEndMinute),
      timeZone: QUIET_HOURS_TIME_ZONE,
    },
  };
}
