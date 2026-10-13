import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { runMatchingWithinBudget } from "@/lib/background/request-budget";
import type { HubOfferStateResponse } from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import {
  offerError,
  requireOfferDriver,
  type OfferRefusal,
} from "@/lib/offers/api";
import { dispatchOffersForLoad } from "@/lib/offers/dispatch";
import { declineLiveOffer, getOfferState } from "@/lib/offers/driver-offers";

export const dynamic = "force-dynamic";

/**
 * POST /api/dashboard/hub/offers/[id]/decline — dismiss an offer. No body.
 *
 * Declining is about the offer, not the load: the load stays on the public
 * board, where this driver can still claim it, but it is never pushed to them
 * again. The slot the decline frees is offered to the next eligible driver
 * straight away.
 *
 * Idempotent, and forgiving of the clock: declining an offer that has already
 * been declined, has expired, or was withdrawn answers 200 with what it is —
 * the driver wanted it gone and it is. Only an offer they already *accepted*
 * is refused, because that one is now a job.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<HubOfferStateResponse | OfferRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireOfferDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const { driverProfileId } = resolved.driver;
  const { id } = await params;
  const now = new Date();

  let offer = await getOfferState(id, driverProfileId, now);

  if (offer === null) {
    return offerError(t("errors.offers.offerNotFound"), "OFFER_NOT_FOUND", 404);
  }

  if (offer.state === "LIVE") {
    if (await declineLiveOffer(id, driverProfileId, now)) {
      // Pass the load on. Never throws — a matching failure must not turn a
      // decline that has been recorded into an error — and never holds the
      // decline beyond the matching budget (`runMatchingWithinBudget`).
      const { orderId } = offer;

      await runMatchingWithinBudget(() => dispatchOffersForLoad(orderId));

      offer = { ...offer, state: "DECLINED" };
    } else {
      // Something else settled it between the read and the write (an accept
      // on another device, the deadline). Report what it became.
      offer = (await getOfferState(id, driverProfileId, now)) ?? offer;
    }
  }

  if (offer.state === "ACCEPTED") {
    return offerError(
      t("errors.offers.offerAlreadyAccepted"),
      "OFFER_ACCEPTED",
      409,
    );
  }

  return hubApiOk<HubOfferStateResponse>({
    serverTime: now.toISOString(),
    id: offer.id,
    state: offer.state,
    jobId: null,
  });
}
