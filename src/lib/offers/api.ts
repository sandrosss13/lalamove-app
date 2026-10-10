// Builds `NextResponse`s and reads the session; route handlers only.
import "server-only";

import { NextResponse } from "next/server";

import type { RequestTranslator } from "@/i18n/request-locale";
import type {
  HubApiErrorResponse,
  HubOfferErrorCode,
  HubOfferErrorResponse,
} from "@/lib/mobile-api/contracts";
import { requireHubApiAccount } from "@/lib/mobile-api/hub-api-guard";

/** Any refusal an offer route can answer with. */
export type OfferRefusal = HubOfferErrorResponse | HubApiErrorResponse;

/** A refusal in the offer routes' shape. Never cached. */
export function offerError(
  message: string,
  code: HubOfferErrorCode,
  status: number,
  reference?: string,
): NextResponse<HubOfferErrorResponse> {
  return NextResponse.json<HubOfferErrorResponse>(
    reference === undefined
      ? { error: message, code }
      : { error: message, code, reference },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** The driver an offer route is acting for. */
export type OfferDriver = { userId: string; driverProfileId: string };

/**
 * The offer routes' gate: the hub's own (`requireHubApiAccount` — session,
 * suspension, forced password change, role, profile) narrowed to an individual
 * driver. A logistics company has no offers: it claims from the board and
 * dispatches from the job sheet.
 */
export async function requireOfferDriver(
  request: Request,
  t: RequestTranslator,
): Promise<{ driver: OfferDriver } | { response: NextResponse<OfferRefusal> }> {
  const guard = await requireHubApiAccount(request, t);

  if (!guard.ok) {
    return { response: guard.response };
  }

  const { userId, driverProfileId } = guard.account;

  if (driverProfileId === null) {
    return {
      response: offerError(
        t("errors.offers.onlyDriversReceiveOffers"),
        "ROLE_NOT_ALLOWED",
        403,
      ),
    };
  }

  return { driver: { userId, driverProfileId } };
}
