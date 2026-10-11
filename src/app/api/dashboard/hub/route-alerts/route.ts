import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type {
  HubRouteAlertResponse,
  HubRouteAlertsResponse,
} from "@/lib/mobile-api/contracts";
import {
  invalidSettingsRequest,
  readSettingsBody,
  requireSettingsDriver,
  settingsError,
  type SettingsRefusal,
} from "@/lib/mobile-api/driver-settings-api";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { prisma } from "@/lib/prisma";
import {
  ROUTE_ALERT_CITIES,
  ROUTE_ALERT_SELECT,
  routeAlertRefusalResponse,
  toHubRouteAlert,
  toRouteAlertColumns,
} from "@/lib/route-alerts/api";
import {
  applyRouteAlertInput,
  MAX_ROUTE_ALERTS_PER_DRIVER,
} from "@/lib/route-alerts/rules";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/route-alerts — the driver's saved routes, oldest
 * first, and how many they may have.
 *
 * How many open loads match each one is not here: the app counts that from
 * the board it already holds (`GET /api/loads`).
 */
export async function GET(
  request: Request,
): Promise<NextResponse<HubRouteAlertsResponse | SettingsRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireSettingsDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const rows = await prisma.routeAlert.findMany({
    where: { driverProfileId: resolved.driver.driverProfileId },
    select: ROUTE_ALERT_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return hubApiOk<HubRouteAlertsResponse>({
    alerts: rows.map(toHubRouteAlert),
    limit: MAX_ROUTE_ALERTS_PER_DRIVER,
  });
}

/**
 * POST /api/dashboard/hub/route-alerts — save a route. Body:
 * `HubRouteAlertCreateRequest`; only `fromCity` is required.
 *
 * At most `MAX_ROUTE_ALERTS_PER_DRIVER` per driver. The count and the insert
 * run in one transaction behind a row lock on the driver's profile, so two
 * simultaneous saves cannot both slip under the cap.
 *
 * A new alert says nothing about loads already on the board — alerts fire
 * when a load *opens*. The design's "N open loads match right now" is the
 * app's own count.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<HubRouteAlertResponse | SettingsRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireSettingsDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const read = await readSettingsBody(request, t);
  if ("response" in read) {
    return read.response;
  }

  const applied = applyRouteAlertInput(null, read.body, ROUTE_ALERT_CITIES);
  if ("refusal" in applied) {
    return routeAlertRefusalResponse(applied.refusal, t);
  }

  const columns = toRouteAlertColumns(applied.alert);
  if (columns === null) {
    return invalidSettingsRequest(
      t("errors.driverSettings.fieldMustBeASupportedCity", {
        field: "fromCity",
      }),
    );
  }

  const { driverProfileId } = resolved.driver;

  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "DriverProfile" WHERE "id" = ${driverProfileId} FOR UPDATE`;

    const saved = await tx.routeAlert.count({ where: { driverProfileId } });

    if (saved >= MAX_ROUTE_ALERTS_PER_DRIVER) {
      return null;
    }

    return tx.routeAlert.create({
      data: { driverProfileId, ...columns },
      select: ROUTE_ALERT_SELECT,
    });
  });

  if (created === null) {
    return settingsError(
      t("errors.driverSettings.routeAlertLimitReached", {
        max: MAX_ROUTE_ALERTS_PER_DRIVER,
      }),
      "ALERT_LIMIT_REACHED",
      409,
    );
  }

  return NextResponse.json<HubRouteAlertResponse>(
    { alert: toHubRouteAlert(created) },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
