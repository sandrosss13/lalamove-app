import type { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import type {
  HubOfferAcceptResponse,
  HubOfferErrorCode,
} from "@/lib/mobile-api/contracts";
import { hubApiOk } from "@/lib/mobile-api/hub-api-guard";
import {
  offerError,
  requireOfferDriver,
  type OfferRefusal,
} from "@/lib/offers/api";
import { getOfferState, markOfferAccepted } from "@/lib/offers/driver-offers";
import {
  claimOrderForDriver,
  type DriverClaimRefusalReason,
} from "@/lib/orders/driver-claim";

export const dynamic = "force-dynamic";

/**
 * The offer code each claim refusal is reported as. The claim's own reasons,
 * except the two that have a truer name here: an offer whose order is gone is
 * a missing offer, and a missing driver profile cannot reach this far (the
 * guard has already resolved one), so it borrows the wording it always had.
 */
const CLAIM_REFUSAL_CODES: Record<DriverClaimRefusalReason, HubOfferErrorCode> =
  {
    DRIVER_PROFILE_MISSING: "VEHICLE_NOT_FOUND",
    NOT_ACTIVATED: "NOT_ACTIVATED",
    DRIVER_OFFLINE: "DRIVER_OFFLINE",
    ORDER_NOT_FOUND: "OFFER_NOT_FOUND",
    VEHICLE_NOT_FOUND: "VEHICLE_NOT_FOUND",
    VEHICLE_BELOW_BOOKED_CLASS: "VEHICLE_BELOW_BOOKED_CLASS",
    VEHICLE_BODY_MISMATCH: "VEHICLE_BODY_MISMATCH",
    VEHICLE_TOO_SMALL: "VEHICLE_TOO_SMALL",
    ALREADY_CLAIMED: "ALREADY_CLAIMED",
  };

/**
 * POST /api/dashboard/hub/offers/[id]/accept — take the job a live offer is
 * for, with `{ vehicleId }`.
 *
 * **Not a second way to a job.** The offer only decides whether this request
 * may *try*: it must be this driver's, unanswered, inside its deadline by the
 * server's clock, and for a load that is still open. The taking is
 * `claimOrderForDriver` — the same function, the same checks (activated,
 * online, the vehicle is theirs and fits) and the same atomic compare-and-swap
 * as `POST /api/orders/[id]/accept`. An offer waives none of them, and several
 * drivers holding offers for one load race exactly as they would on the board:
 * one wins, the rest get `ALREADY_CLAIMED`.
 *
 * A refusal about the vehicle or the driver's state leaves the offer live, so
 * the driver can put it right and accept again inside the countdown. Accepting
 * an offer already accepted answers the same success, so a retry after a lost
 * response is safe.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<HubOfferAcceptResponse | OfferRefusal>> {
  const t = await getRequestTranslations();

  const resolved = await requireOfferDriver(request, t);
  if ("response" in resolved) {
    return resolved.response;
  }

  const { driver } = resolved;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return offerError(
      t("common.shared.requestBodyMustBeValidJson"),
      "INVALID_REQUEST",
      400,
    );
  }

  if (typeof rawBody !== "object" || rawBody === null) {
    return offerError(
      t("common.shared.requestBodyMustBeAJson"),
      "INVALID_REQUEST",
      400,
    );
  }

  const { vehicleId } = rawBody as Record<string, unknown>;

  if (typeof vehicleId !== "string" || vehicleId.trim() === "") {
    return offerError(
      t("common.shared.vehicleidIsRequired"),
      "INVALID_REQUEST",
      400,
    );
  }

  const { id } = await params;
  const now = new Date();
  const offer = await getOfferState(id, driver.driverProfileId, now);

  if (offer === null) {
    return offerError(t("errors.offers.offerNotFound"), "OFFER_NOT_FOUND", 404);
  }

  const accepted = () =>
    hubApiOk<HubOfferAcceptResponse>({
      offerId: offer.id,
      jobId: offer.orderId,
    });

  switch (offer.state) {
    case "ACCEPTED":
      return accepted();
    case "DECLINED":
      return offerError(
        t("errors.offers.offerAlreadyDeclined"),
        "OFFER_DECLINED",
        409,
      );
    case "EXPIRED":
      return offerError(t("errors.offers.offerExpired"), "OFFER_EXPIRED", 409);
    case "WITHDRAWN":
      return offerError(
        t("common.shared.thisLoadWasJustClaimedBy"),
        "ALREADY_CLAIMED",
        409,
        offer.reference,
      );
    case "LIVE":
      break;
  }

  const result = await claimOrderForDriver(
    {
      userId: driver.userId,
      orderId: offer.orderId,
      vehicleId: vehicleId.trim(),
    },
    t,
  );

  if (!result.ok) {
    return offerError(
      result.error,
      CLAIM_REFUSAL_CODES[result.reason],
      result.status,
      result.reference,
    );
  }

  await markOfferAccepted(offer.id, driver.driverProfileId, now);

  return accepted();
}
