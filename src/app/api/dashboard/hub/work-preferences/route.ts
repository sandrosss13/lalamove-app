import type { NextResponse } from "next/server";
import { CargoHandlingTag, GeorgianCity } from "@prisma/client";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import { HUB_TIME_ZONE } from "@/lib/dashboard/hub/timezone";
import type {
  HubSettingsErrorResponse,
  HubWorkPreferences,
  HubWorkPreferencesResponse,
} from "@/lib/mobile-api/contracts";
import {
  invalidSettingsRequest,
  readSettingsBody,
  requireSettingsDriver,
  type SettingsRefusal,
} from "@/lib/mobile-api/driver-settings-api";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { prisma } from "@/lib/prisma";
import { formatTimeOfDay, WEEKDAYS } from "@/lib/schedule/rules";
import {
  applyWorkPreferencesUpdate,
  HANDLING_TAGS,
  MAX_TRIP_KM_LIMIT,
  type WorkPreferencesRefusal,
} from "@/lib/work-preferences/rules";
import {
  toWorkPreferences,
  WORK_PREFERENCES_SELECT,
} from "@/lib/work-preferences/store";

export const dynamic = "force-dynamic";

const CITIES: readonly GeorgianCity[] = Object.values(GeorgianCity);
const TAGS: readonly CargoHandlingTag[] = Object.values(CargoHandlingTag);

/** The stored row as the app reads it. Field by field. */
function toHubWorkPreferences(row: {
  cities: GeorgianCity[];
  intercity: boolean;
  maxTripKm: number | null;
  days: HubWorkPreferences["days"];
  startMinute: number;
  endMinute: number;
  excludedHandlingTags: CargoHandlingTag[];
  canBringHelper: boolean;
}): HubWorkPreferences {
  return {
    cities: [...row.cities],
    intercity: row.intercity,
    maxTripKm: row.maxTripKm,
    days: [...row.days],
    hours: {
      start: formatTimeOfDay(row.startMinute),
      end: formatTimeOfDay(row.endMinute),
      timeZone: HUB_TIME_ZONE,
    },
    excludedHandlingTags: [...row.excludedHandlingTags],
    canBringHelper: row.canBringHelper,
  };
}

function refusalResponse(
  refusal: WorkPreferencesRefusal,
  t: RequestTranslator,
): NextResponse<HubSettingsErrorResponse> {
  switch (refusal.reason) {
    case "NOT_AN_OBJECT":
      return invalidSettingsRequest(t("common.shared.requestBodyMustBeAJson"));
    case "NOTHING_TO_UPDATE":
      return invalidSettingsRequest(
        t("errors.driverSettings.sendAtLeastOneField"),
      );
    case "INVALID_CITIES":
      return invalidSettingsRequest(
        t("errors.driverSettings.citiesMustBeSupportedCities"),
      );
    case "NO_AREA":
      return invalidSettingsRequest(
        t("errors.driverSettings.pickAtLeastOneArea"),
      );
    case "NOT_A_BOOLEAN":
      return invalidSettingsRequest(
        t("errors.driverSettings.fieldMustBeTrueOrFalse", {
          field: refusal.field,
        }),
      );
    case "INVALID_MAX_TRIP_KM":
      return invalidSettingsRequest(
        t("errors.driverSettings.maxTripKmOutOfRange", {
          max: MAX_TRIP_KM_LIMIT,
        }),
      );
    case "INVALID_DAYS":
      return invalidSettingsRequest(
        t("errors.driverSettings.daysMustBeWeekdays", {
          allowed: WEEKDAYS.join(", "),
        }),
      );
    case "INVALID_TIME":
      return invalidSettingsRequest(
        t("errors.driverSettings.fieldMustBeATime", { field: refusal.field }),
      );
    case "INVALID_HANDLING_TAGS":
      return invalidSettingsRequest(
        t("errors.driverSettings.handlingTagsMustBeOneOf", {
          allowed: HANDLING_TAGS.join(", "),
        }),
      );
  }
}

/**
 * GET /api/dashboard/hub/work-preferences — what the driver wants to be
 * offered, or `{ preferences: null }` when they have never saved any.
 *
 * Null is a real answer, not a missing default: until a driver saves
 * preferences the offer matcher applies none.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<HubWorkPreferencesResponse | SettingsRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireSettingsDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const row = await prisma.driverWorkPreferences.findUnique({
    where: { driverProfileId: resolved.driver.driverProfileId },
    select: WORK_PREFERENCES_SELECT,
  });

  return hubApiOk<HubWorkPreferencesResponse>({
    preferences: row === null ? null : toHubWorkPreferences(row),
  });
}

/**
 * PATCH /api/dashboard/hub/work-preferences — save them. Body:
 * `HubWorkPreferencesUpdateRequest`; fields left out keep their value, and a
 * first save starts from "nothing restricted" and must name an area.
 *
 * These reach the **offer matcher only**. `GET /api/loads` is untouched: the
 * driver still sees, and may claim, every load they are eligible for.
 */
export async function PATCH(
  request: Request,
): Promise<NextResponse<HubWorkPreferencesResponse | SettingsRefusal>> {
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

  const row = await prisma.driverWorkPreferences.findUnique({
    where: { driverProfileId },
    select: WORK_PREFERENCES_SELECT,
  });

  const applied = applyWorkPreferencesUpdate(
    toWorkPreferences(row),
    read.body,
    CITIES,
  );

  if ("refusal" in applied) {
    return refusalResponse(applied.refusal, t);
  }

  const { preferences } = applied;

  // The parser checked both lists against the enums' own values; filtering
  // the enums by them hands Prisma its members rather than asserted strings.
  const data = {
    cities: CITIES.filter((city) => preferences.cities.includes(city)),
    intercity: preferences.intercity,
    maxTripKm: preferences.maxTripKm,
    days: preferences.days,
    startMinute: preferences.startMinute,
    endMinute: preferences.endMinute,
    excludedHandlingTags: TAGS.filter((tag) =>
      preferences.excludedHandlingTags.includes(tag),
    ),
    canBringHelper: preferences.canBringHelper,
  };

  const saved = await prisma.driverWorkPreferences.upsert({
    where: { driverProfileId },
    create: { driverProfileId, ...data },
    update: data,
    select: WORK_PREFERENCES_SELECT,
  });

  return hubApiOk<HubWorkPreferencesResponse>({
    preferences: toHubWorkPreferences(saved),
  });
}
