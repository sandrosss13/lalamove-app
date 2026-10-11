// Builds `NextResponse`s and reads the session; route handlers only.
import "server-only";

import { NextResponse } from "next/server";

import type { RequestTranslator } from "@/i18n/request-locale";
import type {
  HubApiErrorResponse,
  HubSettingsErrorCode,
  HubSettingsErrorResponse,
} from "@/lib/mobile-api/contracts";
import { requireHubApiAccount } from "@/lib/mobile-api/hub-api-guard";

/*
 * What the driver's own settings routes share — profile, notification
 * settings, route alerts, work preferences: one error shape, one gate, one way
 * of reading a body.
 */

/** Any refusal a settings route can answer with. */
export type SettingsRefusal = HubSettingsErrorResponse | HubApiErrorResponse;

/** A refusal in the settings routes' shape. Never cached. */
export function settingsError(
  message: string,
  code: HubSettingsErrorCode,
  status: number,
): NextResponse<HubSettingsErrorResponse> {
  return NextResponse.json<HubSettingsErrorResponse>(
    { error: message, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** A 400 `INVALID_REQUEST` with `message`. */
export function invalidSettingsRequest(
  message: string,
): NextResponse<HubSettingsErrorResponse> {
  return settingsError(message, "INVALID_REQUEST", 400);
}

/** The driver a settings route is acting for. */
export type SettingsDriver = { userId: string; driverProfileId: string };

/**
 * The settings routes' gate: the hub's own (`requireHubApiAccount` — session,
 * suspension, forced password change, role, profile) narrowed to an individual
 * driver. A logistics company has no offers, alerts or working hours of its
 * own, so it is refused rather than given a row nothing reads.
 *
 * The driver is the session's, always: no settings route takes a driver,
 * profile or account id from the request.
 */
export async function requireSettingsDriver(
  request: Request,
  t: RequestTranslator,
): Promise<
  { driver: SettingsDriver } | { response: NextResponse<SettingsRefusal> }
> {
  const guard = await requireHubApiAccount(request, t);

  if (!guard.ok) {
    return { response: guard.response };
  }

  const { userId, driverProfileId } = guard.account;

  if (driverProfileId === null) {
    return {
      response: settingsError(
        t("errors.driverSettings.onlyDriversHaveTheseSettings"),
        "ROLE_NOT_ALLOWED",
        403,
      ),
    };
  }

  return { driver: { userId, driverProfileId } };
}

/**
 * The request body as parsed JSON, or the 400 for one that is not JSON at all.
 * Whether it is an *object* is each parser's first check (`NOT_AN_OBJECT`), so
 * the rule lives with the rest of that route's validation.
 */
export async function readSettingsBody(
  request: Request,
  t: RequestTranslator,
): Promise<
  { body: unknown } | { response: NextResponse<HubSettingsErrorResponse> }
> {
  try {
    return { body: await request.json() };
  } catch {
    return {
      response: invalidSettingsRequest(
        t("common.shared.requestBodyMustBeValidJson"),
      ),
    };
  }
}
