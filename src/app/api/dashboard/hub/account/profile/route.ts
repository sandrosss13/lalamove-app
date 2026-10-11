import type { NextResponse } from "next/server";
import { GeorgianCity } from "@prisma/client";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import { getHubAccountSettings } from "@/lib/dashboard/hub/account-settings";
import {
  MAX_EMERGENCY_CONTACT_NAME_LENGTH,
  parseDriverProfileUpdate,
  type DriverProfileRefusal,
} from "@/lib/dashboard/hub/profile-rules";
import type {
  HubAccountDriverSettings,
  HubSettingsErrorResponse,
} from "@/lib/mobile-api/contracts";
import {
  invalidSettingsRequest,
  settingsError,
  type SettingsRefusal,
} from "@/lib/mobile-api/driver-settings-api";
import {
  hubApiOk,
  hubApiProfileMissing,
  requireHubApiAccount,
} from "@/lib/mobile-api/hub-api-guard";
import { toHubAccountResponse } from "@/lib/mobile-api/serializers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function refusalResponse(
  refusal: DriverProfileRefusal,
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
        t("errors.driverSettings.fieldMustBeASupportedCity", { field: "city" }),
      );
    case "NOT_TEXT":
      return invalidSettingsRequest(
        t("errors.driverSettings.fieldMustBeTextOrNull", {
          field: refusal.field,
        }),
      );
    case "NAME_TOO_LONG":
      return invalidSettingsRequest(
        t("errors.driverSettings.emergencyContactNameTooLong", {
          max: MAX_EMERGENCY_CONTACT_NAME_LENGTH,
        }),
      );
    case "INVALID_PHONE":
      return invalidSettingsRequest(
        t("errors.driverSettings.emergencyContactPhoneInvalid"),
      );
  }
}

/**
 * PATCH /api/dashboard/hub/account/profile — a driver edits their own home
 * base and emergency contact. Body: `HubDriverProfileUpdateRequest`.
 *
 * Deliberately narrow. The three fields `parseDriverProfileUpdate` reads are
 * the only ones written; name, ID number and date of birth were verified at
 * onboarding and stay read-only, and the sign-in phone number is not changed
 * here (that needs a re-verification flow that does not exist). Anything else
 * in the body is ignored.
 *
 * Scoped to the session's own driver profile — the route takes no id.
 *
 * 200: the driver's account settings as `GET /api/dashboard/hub/account` now
 * returns them.
 */
export async function PATCH(
  request: Request,
): Promise<NextResponse<HubAccountDriverSettings | SettingsRefusal>> {
  const t = await getRequestTranslations();
  const guard = await requireHubApiAccount(request, t);

  if (!guard.ok) {
    return guard.response;
  }

  const { account } = guard;

  if (account.driverProfileId === null) {
    return settingsError(
      t("errors.driverSettings.onlyDriversHaveTheseSettings"),
      "ROLE_NOT_ALLOWED",
      403,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidSettingsRequest(
      t("common.shared.requestBodyMustBeValidJson"),
    );
  }

  const cities = Object.values(GeorgianCity);
  const parsed = parseDriverProfileUpdate(body, cities);

  if ("refusal" in parsed) {
    return refusalResponse(parsed.refusal, t);
  }

  const { city, emergencyContactName, emergencyContactPhone } = parsed.changes;

  await prisma.driverProfile.update({
    where: { id: account.driverProfileId },
    data: {
      // The parser checked `city` against this same list; `find` hands Prisma
      // its own enum member rather than a string asserted to be one.
      city: cities.find((candidate) => candidate === city),
      emergencyContactName,
      emergencyContactPhone,
    },
    select: { id: true },
  });

  const settings = await getHubAccountSettings(account, guard.email);

  // Unreachable in practice — the row was just updated — but the loader's
  // `null`, and its company shape, are answered rather than asserted away.
  if (settings === null || settings.shape !== "DRIVER") {
    return hubApiProfileMissing(t, false);
  }

  const response = toHubAccountResponse(settings);

  return response.shape === "DRIVER"
    ? hubApiOk<HubAccountDriverSettings>(response)
    : hubApiProfileMissing(t, false);
}
