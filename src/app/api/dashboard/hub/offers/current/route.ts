import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type { HubCurrentOfferResponse } from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import { toHubOffer } from "@/lib/mobile-api/serializers";
import { requireOfferDriver, type OfferRefusal } from "@/lib/offers/api";
import { getCurrentOffer } from "@/lib/offers/driver-offers";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/offers/current — the signed-in driver's live load
 * offer, or `offer: null`.
 *
 * **This is the polling channel.** There is no socket on this stack and a push
 * may not arrive, so the app asks here while the driver is online and the app
 * is in the foreground. It is deliberately cheap: the session, the account,
 * and one indexed read that returns at most one row.
 *
 * It only reads. No offer is ever *created* here — that happens where the
 * facts change (a load opening, a driver going online or finishing a job) —
 * so polling cannot generate work, however often it runs.
 *
 * `serverTime` and the offer's `secondsRemaining` let the app run its
 * countdown without trusting the device clock. Whether an offer is still
 * answerable is decided on every call from the server's clock; one that has
 * expired, or whose load was taken, is not returned.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<HubCurrentOfferResponse | OfferRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireOfferDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const now = new Date();
  const offer = await getCurrentOffer(resolved.driver.driverProfileId, now);

  return hubApiOk<HubCurrentOfferResponse>({
    serverTime: now.toISOString(),
    offer: offer === null ? null : toHubOffer(offer),
  });
}
