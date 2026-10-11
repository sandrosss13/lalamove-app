/**
 * A driver's notification settings and the one rule every push asks — "may
 * this category be pushed to this driver right now?" — pinned without a
 * server.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  applyNotificationSettingsUpdate,
  DEFAULT_NOTIFICATION_SETTINGS,
  describeNotificationSettings,
  isInQuietHours,
  LOCKED_NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORIES,
  QUIET_HOURS_TIME_ZONE,
  shouldSendPush,
  URGENT_NOTIFICATION_CATEGORIES,
  type NotificationSettings,
} from "@/lib/notifications/rules";

const REPO = process.cwd();

/** 14:00 on a Friday in Tbilisi. */
const AFTERNOON = new Date("2026-10-02T10:00:00.000Z");
/** 02:00 on a Saturday in Tbilisi — inside the default quiet hours. */
const NIGHT = new Date("2026-10-02T22:00:00.000Z");

const QUIET: NotificationSettings = {
  ...DEFAULT_NOTIFICATION_SETTINGS,
  quietHoursEnabled: true,
};

test.describe("the design's settings", () => {
  test("six categories, in the design's order", () => {
    expect([...NOTIFICATION_CATEGORIES]).toEqual([
      "LOAD_OFFERS",
      "ROUTE_ALERTS",
      "JOB_REMINDERS",
      "PAYOUTS",
      "DOCUMENT_EXPIRY",
      "TIPS_AND_PROMOTIONS",
    ]);
  });

  test("document expiry is the one a driver cannot switch off", () => {
    expect([...LOCKED_NOTIFICATION_CATEGORIES]).toEqual(["DOCUMENT_EXPIRY"]);
  });

  test("the defaults are the design's initial state", () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS).toEqual({
      loadOffers: true,
      routeAlerts: true,
      jobReminders: true,
      payouts: true,
      tipsAndPromotions: false,
      quietHoursEnabled: false,
      quietHoursStartMinute: 23 * 60,
      quietHoursEndMinute: 7 * 60,
    });
    expect(QUIET_HOURS_TIME_ZONE).toBe("Asia/Tbilisi");
  });

  test("the column defaults say the same thing", () => {
    const schema = readFileSync(join(REPO, "prisma", "schema.prisma"), "utf8");
    const model =
      /model DriverNotificationSettings \{([\s\S]*?)\n\}/.exec(schema)?.[1] ??
      "";

    for (const [column, value] of Object.entries(
      DEFAULT_NOTIFICATION_SETTINGS,
    )) {
      expect(model).toMatch(
        new RegExp(`\\b${column}\\s+(Boolean|Int)\\s+@default\\(${value}\\)`),
      );
    }
  });
});

test.describe("shouldSendPush", () => {
  test("offers and job reminders are the urgent categories", () => {
    expect([...URGENT_NOTIFICATION_CATEGORIES]).toEqual([
      "LOAD_OFFERS",
      "JOB_REMINDERS",
    ]);
  });

  test("a driver with no saved settings gets the defaults", () => {
    expect(shouldSendPush("LOAD_OFFERS", null, AFTERNOON)).toBe(true);
    expect(shouldSendPush("ROUTE_ALERTS", null, NIGHT)).toBe(true);
    expect(shouldSendPush("TIPS_AND_PROMOTIONS", null, AFTERNOON)).toBe(false);
  });

  test("a category switched off sends nothing, at any hour", () => {
    const off: NotificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      loadOffers: false,
      routeAlerts: false,
      jobReminders: false,
      payouts: false,
    };

    for (const category of [
      "LOAD_OFFERS",
      "ROUTE_ALERTS",
      "JOB_REMINDERS",
      "PAYOUTS",
      "TIPS_AND_PROMOTIONS",
    ] as const) {
      expect(shouldSendPush(category, off, AFTERNOON)).toBe(false);
      expect(shouldSendPush(category, off, NIGHT)).toBe(false);
    }
  });

  test("document expiry cannot be switched off", () => {
    expect(shouldSendPush("DOCUMENT_EXPIRY", null, AFTERNOON)).toBe(true);
  });

  test("during quiet hours only urgent categories are sent", () => {
    const allOn: NotificationSettings = { ...QUIET, tipsAndPromotions: true };

    expect(shouldSendPush("LOAD_OFFERS", allOn, NIGHT)).toBe(true);
    expect(shouldSendPush("JOB_REMINDERS", allOn, NIGHT)).toBe(true);
    expect(shouldSendPush("ROUTE_ALERTS", allOn, NIGHT)).toBe(false);
    expect(shouldSendPush("PAYOUTS", allOn, NIGHT)).toBe(false);
    expect(shouldSendPush("DOCUMENT_EXPIRY", allOn, NIGHT)).toBe(false);
    expect(shouldSendPush("TIPS_AND_PROMOTIONS", allOn, NIGHT)).toBe(false);
  });

  test("outside quiet hours everything switched on is sent", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(
        shouldSendPush(
          category,
          { ...QUIET, tipsAndPromotions: true },
          AFTERNOON,
        ),
      ).toBe(true);
    }
  });

  test("an urgent category that is switched off stays off in quiet hours", () => {
    expect(
      shouldSendPush("LOAD_OFFERS", { ...QUIET, loadOffers: false }, NIGHT),
    ).toBe(false);
  });
});

test.describe("isInQuietHours", () => {
  test("23:00 to 07:00 Tbilisi, start included and end excluded", () => {
    // 22:59, 23:00, 06:59 and 07:00 in Tbilisi.
    expect(isInQuietHours(QUIET, new Date("2026-10-02T18:59:00.000Z"))).toBe(
      false,
    );
    expect(isInQuietHours(QUIET, new Date("2026-10-02T19:00:00.000Z"))).toBe(
      true,
    );
    expect(isInQuietHours(QUIET, new Date("2026-10-03T02:59:00.000Z"))).toBe(
      true,
    );
    expect(isInQuietHours(QUIET, new Date("2026-10-03T03:00:00.000Z"))).toBe(
      false,
    );
  });

  test("switched off, no hour is quiet", () => {
    expect(isInQuietHours(DEFAULT_NOTIFICATION_SETTINGS, NIGHT)).toBe(false);
  });

  test("a window that does not wrap works too", () => {
    const siesta = {
      ...QUIET,
      quietHoursStartMinute: 780,
      quietHoursEndMinute: 900,
    };

    expect(isInQuietHours(siesta, AFTERNOON)).toBe(true);
    expect(isInQuietHours(siesta, NIGHT)).toBe(false);
  });
});

test.describe("applyNotificationSettingsUpdate", () => {
  const apply = (body: unknown, current = DEFAULT_NOTIFICATION_SETTINGS) =>
    applyNotificationSettingsUpdate(current, body);

  test("changes only the fields sent", () => {
    expect(apply({ routeAlerts: false })).toEqual({
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, routeAlerts: false },
    });
    expect(apply({ quietHours: { enabled: true } })).toEqual({
      settings: QUIET,
    });
    expect(apply({ quietHours: { start: "22:30", end: "06:15" } })).toEqual({
      settings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        quietHoursStartMinute: 1350,
        quietHoursEndMinute: 375,
      },
    });
  });

  test("document expiry may be echoed back as true, never switched off", () => {
    expect(apply({ documentExpiry: true, payouts: false })).toEqual({
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, payouts: false },
    });
    expect(apply({ documentExpiry: false })).toEqual({
      refusal: { reason: "LOCKED_CATEGORY", field: "documentExpiry" },
    });
  });

  test("refuses a body that is not an object or changes nothing", () => {
    expect(apply([])).toEqual({ refusal: { reason: "NOT_AN_OBJECT" } });
    expect(apply("on")).toEqual({ refusal: { reason: "NOT_AN_OBJECT" } });
    expect(apply({})).toEqual({ refusal: { reason: "NOTHING_TO_UPDATE" } });
    expect(apply({ unknown: true })).toEqual({
      refusal: { reason: "NOTHING_TO_UPDATE" },
    });
  });

  test("refuses a switch that is not a boolean and a time that is not HH:MM", () => {
    expect(apply({ loadOffers: "yes" })).toEqual({
      refusal: { reason: "NOT_A_BOOLEAN", field: "loadOffers" },
    });
    expect(apply({ quietHours: { enabled: 1 } })).toEqual({
      refusal: { reason: "NOT_A_BOOLEAN", field: "quietHours.enabled" },
    });
    expect(apply({ quietHours: { start: "25:00" } })).toEqual({
      refusal: { reason: "INVALID_TIME", field: "quietHours.start" },
    });
    expect(apply({ quietHours: { end: "7am" } })).toEqual({
      refusal: { reason: "INVALID_TIME", field: "quietHours.end" },
    });
  });

  test("refuses quiet hours of no length", () => {
    expect(apply({ quietHours: { start: "07:00" } })).toEqual({
      refusal: { reason: "EMPTY_QUIET_WINDOW" },
    });
  });
});

test("the wire shape names every switch, with documentExpiry always true", () => {
  expect(describeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS)).toEqual({
    loadOffers: true,
    routeAlerts: true,
    jobReminders: true,
    payouts: true,
    documentExpiry: true,
    tipsAndPromotions: false,
    quietHours: {
      enabled: false,
      start: "23:00",
      end: "07:00",
      timeZone: "Asia/Tbilisi",
    },
  });
});

test("both push senders ask the one rule, through one gate", () => {
  const read = (...parts: string[]) =>
    readFileSync(join(REPO, "src", "lib", ...parts), "utf8");

  expect(read("push", "offer-notification.ts")).toContain(
    'usersAcceptingPush(\n      "LOAD_OFFERS"',
  );
  expect(read("route-alerts", "dispatch.ts")).toContain(
    'usersAcceptingPush(\n    "ROUTE_ALERTS"',
  );
  expect(read("notifications", "settings.ts")).toContain("shouldSendPush(");
});
