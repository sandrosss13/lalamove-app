import type { NextResponse } from "next/server";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import type {
  HubRouteAlertDeleteResponse,
  HubRouteAlertResponse,
  HubSettingsErrorResponse,
} from "@/lib/mobile-api/contracts";
import {
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
import { applyRouteAlertInput } from "@/lib/route-alerts/rules";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The 404 for an alert that does not exist **or is another driver's** — one
 * answer for both, so alert ids cannot be probed.
 */
function alertNotFound(
  t: RequestTranslator,
): NextResponse<HubSettingsErrorResponse> {
  return settingsError(
    t("errors.driverSettings.routeAlertNotFound"),
    "ALERT_NOT_FOUND",
    404,
  );
}

/**
 * PATCH /api/dashboard/hub/route-alerts/[id] — change one of the driver's own
 * alerts; the design's on/off switch is `{ enabled }`. Body:
 * `HubRouteAlertUpdateRequest`, fields left out keep their value.
 *
 * Every query is scoped to the session's driver profile as well as the id.
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<HubRouteAlertResponse | SettingsRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireSettingsDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const { id } = await context.params;
  const { driverProfileId } = resolved.driver;

  const current = await prisma.routeAlert.findFirst({
    where: { id, driverProfileId },
    select: ROUTE_ALERT_SELECT,
  });

  if (current === null) {
    return alertNotFound(t);
  }

  const read = await readSettingsBody(request, t);
  if ("response" in read) {
    return read.response;
  }

  const applied = applyRouteAlertInput(
    {
      fromCity: current.fromCity,
      toCity: current.toCity,
      minPayout: current.minPayout,
      days: [...current.days],
      enabled: current.enabled,
    },
    read.body,
    ROUTE_ALERT_CITIES,
  );

  if ("refusal" in applied) {
    return routeAlertRefusalResponse(applied.refusal, t);
  }

  const columns = toRouteAlertColumns(applied.alert);

  // `updateMany` so the write itself carries the owner, not only the read
  // above; zero rows means the alert was deleted in between.
  const { count } =
    columns === null
      ? { count: 0 }
      : await prisma.routeAlert.updateMany({
          where: { id, driverProfileId },
          data: columns,
        });

  const saved =
    count === 0
      ? null
      : await prisma.routeAlert.findFirst({
          where: { id, driverProfileId },
          select: ROUTE_ALERT_SELECT,
        });

  return saved === null
    ? alertNotFound(t)
    : hubApiOk<HubRouteAlertResponse>({ alert: toHubRouteAlert(saved) });
}

/**
 * DELETE /api/dashboard/hub/route-alerts/[id] — remove one of the driver's
 * own alerts. The record of loads it already fired for is kept (its `alertId`
 * is set null), so deleting and re-creating a route does not re-alert them.
 */
export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<HubRouteAlertDeleteResponse | SettingsRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireSettingsDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const { id } = await context.params;

  const { count } = await prisma.routeAlert.deleteMany({
    where: { id, driverProfileId: resolved.driver.driverProfileId },
  });

  return count === 0
    ? alertNotFound(t)
    : hubApiOk<HubRouteAlertDeleteResponse>({ deleted: true });
}
