import type { NextResponse } from "next/server";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import type {
  HubNotificationSettingsResponse,
  HubSettingsErrorResponse,
} from "@/lib/mobile-api/contracts";
import {
  invalidSettingsRequest,
  readSettingsBody,
  requireSettingsDriver,
  type SettingsRefusal,
} from "@/lib/mobile-api/driver-settings-api";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import {
  applyNotificationSettingsUpdate,
  DEFAULT_NOTIFICATION_SETTINGS,
  describeNotificationSettings,
  type NotificationSettingsRefusal,
} from "@/lib/notifications/rules";
import {
  NOTIFICATION_SETTINGS_SELECT,
  toNotificationSettings,
} from "@/lib/notifications/settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function refusalResponse(
  refusal: NotificationSettingsRefusal,
  t: RequestTranslator,
): NextResponse<HubSettingsErrorResponse> {
  switch (refusal.reason) {
    case "NOT_AN_OBJECT":
      return invalidSettingsRequest(t("common.shared.requestBodyMustBeAJson"));
    case "NOTHING_TO_UPDATE":
      return invalidSettingsRequest(
        t("errors.driverSettings.sendAtLeastOneField"),
      );
    case "NOT_A_BOOLEAN":
      return invalidSettingsRequest(
        t("errors.driverSettings.fieldMustBeTrueOrFalse", {
          field: refusal.field,
        }),
      );
    case "LOCKED_CATEGORY":
      return invalidSettingsRequest(
        t("errors.driverSettings.documentExpiryIsAlwaysOn"),
      );
    case "INVALID_TIME":
      return invalidSettingsRequest(
        t("errors.driverSettings.fieldMustBeATime", { field: refusal.field }),
      );
    case "EMPTY_QUIET_WINDOW":
      return invalidSettingsRequest(
        t("errors.driverSettings.quietHoursCannotBeEmpty"),
      );
  }
}

/**
 * GET /api/dashboard/hub/notification-settings — the driver's notification
 * switches and quiet hours.
 *
 * A driver who never changed anything has no row and is answered the defaults
 * (`DEFAULT_NOTIFICATION_SETTINGS`); reading creates nothing.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<HubNotificationSettingsResponse | SettingsRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireSettingsDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const row = await prisma.driverNotificationSettings.findUnique({
    where: { driverProfileId: resolved.driver.driverProfileId },
    select: NOTIFICATION_SETTINGS_SELECT,
  });

  return hubApiOk<HubNotificationSettingsResponse>({
    settings: describeNotificationSettings(
      toNotificationSettings(row) ?? DEFAULT_NOTIFICATION_SETTINGS,
    ),
  });
}

/**
 * PATCH /api/dashboard/hub/notification-settings — change some of them. Body:
 * `HubNotificationSettingsUpdateRequest`; fields left out keep their value.
 *
 * The design's screen "saves straight away", one switch at a time, so this is
 * a merge: the body is applied over the stored row (or the defaults) and the
 * whole result upserted.
 *
 * Only `loadOffers` and `routeAlerts` change what is sent today; the other
 * switches are stored for senders that do not exist yet.
 */
export async function PATCH(
  request: Request,
): Promise<NextResponse<HubNotificationSettingsResponse | SettingsRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireSettingsDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const read = await readSettingsBody(request, t);
  if ("response" in read) {
    return read.response;
  }

  const { driverProfileId } = resolved.driver;

  const row = await prisma.driverNotificationSettings.findUnique({
    where: { driverProfileId },
    select: NOTIFICATION_SETTINGS_SELECT,
  });

  const applied = applyNotificationSettingsUpdate(
    toNotificationSettings(row) ?? DEFAULT_NOTIFICATION_SETTINGS,
    read.body,
  );

  if ("refusal" in applied) {
    return refusalResponse(applied.refusal, t);
  }

  const saved = await prisma.driverNotificationSettings.upsert({
    where: { driverProfileId },
    create: { driverProfileId, ...applied.settings },
    update: applied.settings,
    select: NOTIFICATION_SETTINGS_SELECT,
  });

  return hubApiOk<HubNotificationSettingsResponse>({
    settings: describeNotificationSettings(
      toNotificationSettings(saved) ?? applied.settings,
    ),
  });
}
