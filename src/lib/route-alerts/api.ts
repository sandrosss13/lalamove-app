// Names Prisma columns and builds `NextResponse`s; route handlers only.
import "server-only";

import type { NextResponse } from "next/server";
import { GeorgianCity, type Prisma } from "@prisma/client";

import type { RequestTranslator } from "@/i18n/request-locale";
import type {
  HubRouteAlert,
  HubSettingsErrorResponse,
} from "@/lib/mobile-api/contracts";
import { invalidSettingsRequest } from "@/lib/mobile-api/driver-settings-api";
import {
  MAX_ROUTE_ALERT_MIN_PAYOUT,
  type RouteAlertFields,
  type RouteAlertRefusal,
} from "@/lib/route-alerts/rules";
import { WEEKDAYS } from "@/lib/schedule/rules";

/** Exactly the columns `HubRouteAlert` is built from. */
export const ROUTE_ALERT_SELECT = {
  id: true,
  fromCity: true,
  toCity: true,
  minPayout: true,
  days: true,
  enabled: true,
  createdAt: true,
} as const;

type RouteAlertRow = Prisma.RouteAlertGetPayload<{
  select: typeof ROUTE_ALERT_SELECT;
}>;

/** One alert as its owner reads it. Field by field, like every wire shape. */
export function toHubRouteAlert(row: RouteAlertRow): HubRouteAlert {
  return {
    id: row.id,
    fromCity: row.fromCity,
    toCity: row.toCity,
    minPayout: row.minPayout,
    days: [...row.days],
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The real city enum's values — what `fromCity` / `toCity` are checked against. */
export const ROUTE_ALERT_CITIES: readonly GeorgianCity[] =
  Object.values(GeorgianCity);

/**
 * A validated alert as Prisma columns, or null if a city is somehow not an
 * enum member. `applyRouteAlertInput` checked both against
 * `ROUTE_ALERT_CITIES`, so null is unreachable; looking the member up hands
 * Prisma its own value instead of a string asserted to be one.
 */
export function toRouteAlertColumns(alert: RouteAlertFields): {
  fromCity: GeorgianCity;
  toCity: GeorgianCity | null;
  minPayout: number;
  days: RouteAlertFields["days"];
  enabled: boolean;
} | null {
  const cityOf = (value: string | null): GeorgianCity | null =>
    ROUTE_ALERT_CITIES.find((city) => city === value) ?? null;

  const fromCity = cityOf(alert.fromCity);

  return fromCity === null
    ? null
    : {
        fromCity,
        toCity: cityOf(alert.toCity),
        minPayout: alert.minPayout,
        days: alert.days,
        enabled: alert.enabled,
      };
}

/** The 400 for each way an alert body is refused. */
export function routeAlertRefusalResponse(
  refusal: RouteAlertRefusal,
  t: RequestTranslator,
): NextResponse<HubSettingsErrorResponse> {
  switch (refusal.reason) {
    case "NOT_AN_OBJECT":
      return invalidSettingsRequest(t("common.shared.requestBodyMustBeAJson"));
    case "NOTHING_TO_UPDATE":
      return invalidSettingsRequest(
        t("errors.driverSettings.sendAtLeastOneField"),
      );
    case "INVALID_CITY":
      return invalidSettingsRequest(
        t("errors.driverSettings.fieldMustBeASupportedCity", {
          field: refusal.field,
        }),
      );
    case "INVALID_MIN_PAYOUT":
      return invalidSettingsRequest(
        t("errors.driverSettings.minPayoutOutOfRange", {
          max: MAX_ROUTE_ALERT_MIN_PAYOUT,
        }),
      );
    case "INVALID_DAYS":
      return invalidSettingsRequest(
        t("errors.driverSettings.daysMustBeWeekdays", {
          allowed: WEEKDAYS.join(", "),
        }),
      );
    case "NOT_A_BOOLEAN":
      return invalidSettingsRequest(
        t("errors.driverSettings.fieldMustBeTrueOrFalse", {
          field: refusal.field,
        }),
      );
  }
}
