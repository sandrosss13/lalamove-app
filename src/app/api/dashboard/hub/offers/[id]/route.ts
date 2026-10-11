import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type { HubOfferStateResponse } from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import {
  offerError,
  requireOfferDriver,
  type OfferRefusal,
} from "@/lib/offers/api";
import { getOfferState } from "@/lib/offers/driver-offers";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/hub/offers/[id] — what became of one of this driver's
 * offers: still live, accepted, declined, expired, or withdrawn because
 * someone else took the load.
 *
 * `…/offers/current` only ever returns a live offer, so this is how the app
 * tells "expired" from "claimed by someone else" when an offer disappears, and
 * how it resolves the offer id a push carried. Another driver's offer is a 404,
 * the same as one that does not exist.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<HubOfferStateResponse | OfferRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireOfferDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const { id } = await params;
  const now = new Date();
  const offer = await getOfferState(id, resolved.driver.driverProfileId, now);

  if (offer === null) {
    return offerError(t("errors.offers.offerNotFound"), "OFFER_NOT_FOUND", 404);
  }

  return hubApiOk<HubOfferStateResponse>({
    serverTime: now.toISOString(),
    id: offer.id,
    state: offer.state,
    jobId: offer.state === "ACCEPTED" ? offer.orderId : null,
  });
}
