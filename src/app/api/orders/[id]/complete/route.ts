import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { runMatchingWithinBudget } from "@/lib/background/request-budget";
import { dispatchOfferForDriver } from "@/lib/offers/dispatch";
import { CARRIER_ORDER_PARTY_SELECT } from "@/lib/order-response-select";
import {
  orderActionError,
  passwordChangeRefusal,
} from "@/lib/orders/action-errors";
import { driverPayoutFor } from "@/lib/orders/payout";
import {
  isPodWaived,
  podCompletionDenial,
  type PodCompletionDenial,
} from "@/lib/orders/pod-rules";
import { prisma } from "@/lib/prisma";
import { creditWalletForOrderSafely } from "@/lib/wallet/ledger";

/** The message key each missing piece of proof is localised from. */
const POD_DENIAL_MESSAGE_KEYS: Record<PodCompletionDenial, string> = {
  POD_PHOTO_REQUIRED: "errors.ordersComplete.photoRequired",
  POD_SIGNATURE_REQUIRED: "errors.ordersComplete.signatureRequired",
};

/**
 * How long a recipient's name may be.
 *
 * A cap rather than no cap, because this is free text a driver types on a phone
 * and nothing downstream truncates it. Generous rather than tight: the field
 * collects "who did you hand it to", and in Georgia that is routinely a full
 * name plus a role or a department in mixed Georgian and Latin script, which
 * runs long. Matched to `MAX_TITLE_LENGTH` in the admin content routes, the
 * closest existing precedent for a short free-text column.
 *
 * Counted in UTF-16 code units, as every other `MAX_*_LENGTH` in this API is —
 * so a Georgian name gets the same 200 characters a Latin one does, and only an
 * astral-plane character (an emoji) counts double. That is fine for a cap whose
 * job is to bound the column, not to measure the text precisely.
 */
const MAX_RECEIVED_BY_LENGTH = 200;

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * `waitingMinutes` is required and its rules are unchanged. `receivedBy` is
 * optional in every sense: absent, `null`, and a string that is empty once
 * trimmed all mean the same thing and all resolve to `null`. A driver who does
 * not catch the recipient's name must still be able to close the delivery, so
 * this must never be a reason to refuse a completion — the only way it produces
 * a 400 is by being the wrong type or being unreasonably long, neither of which
 * the job sheet's own dialog can send.
 */
function parseCompleteOrderBody(
  body: unknown,
  t: RequestTranslator,
):
  | { data: { waitingMinutes: number; receivedBy: string | null } }
  | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const { waitingMinutes, receivedBy } = body as Record<string, unknown>;

  if (
    typeof waitingMinutes !== "number" ||
    !Number.isInteger(waitingMinutes) ||
    waitingMinutes < 0
  ) {
    return {
      error: t("errors.ordersComplete.waitingminutesIsRequiredAndMustBe"),
    };
  }

  // Absent and explicitly null are the same answer — "nobody was named" — and
  // both have to be accepted: an older client that has never heard of this
  // field sends neither.
  if (receivedBy === undefined || receivedBy === null) {
    return { data: { waitingMinutes, receivedBy: null } };
  }

  if (typeof receivedBy !== "string") {
    return { error: t("errors.ordersComplete.receivedByMustBeStringOrNull") };
  }

  const trimmedReceivedBy = receivedBy.trim();

  if (trimmedReceivedBy.length > MAX_RECEIVED_BY_LENGTH) {
    return {
      error: t("errors.ordersComplete.receivedByTooLong", {
        max: MAX_RECEIVED_BY_LENGTH,
      }),
    };
  }

  // An empty box in the dialog means "not recorded", not an empty string in the
  // column. Collapsing the two here is what lets every read site test the column
  // for null alone rather than for null-or-empty — see `Order.receivedBy`.
  return {
    data: {
      waitingMinutes,
      receivedBy: trimmedReceivedBy === "" ? null : trimmedReceivedBy,
    },
  };
}

/** Round a currency amount to whole cents. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * POST /api/orders/[id]/complete — the assigned driver closes their delivery
 * (IN_TRANSIT → COMPLETED), reporting the loading/unloading minutes it took.
 *
 * Waiting time is reported once at completion rather than timed live, and only
 * the part beyond the vehicle type's `freeLoadingMinutes` is charged, at that
 * type's `overtimeRatePerMinute`. The result is stored as `overtimeFee` and
 * settled on top of `price`, which is left exactly as it was quoted — a booked
 * fare never changes after the fact.
 *
 * `overtimeFee` is what the CLIENT pays for that waiting time, so the platform's
 * commission comes off it exactly as it comes off the fare. The driver's share
 * is resolved in the same step, at the commission rate **stored on the order** —
 * never the current global constant — and written to `overtimeDriverPayout` in
 * the same update, so the client-facing fee and the driver-facing payout can
 * never diverge. `driverPayout` is deliberately not touched here; see the
 * comment at the computation below.
 *
 * The body also accepts an optional `receivedBy`, the name of whoever took
 * delivery, collected in the job sheet's confirmation dialog beside the waiting
 * figure. It is optional in the API because it is optional in the dialog: a
 * driver who did not catch a name must still be able to close the job, so a
 * missing `receivedBy` is a valid completion and never a 400. It changes no
 * money and no state — it is recorded exactly as given, trimmed — and it is not
 * itself proof of delivery.
 *
 * ## Proof of delivery
 *
 * The proof is one to three photos and the recipient's signature, registered
 * beforehand through `POST /api/orders/[id]/pod` while the order is
 * `IN_TRANSIT`. **This route refuses to complete without them** — 409
 * `POD_PHOTO_REQUIRED`, then 409 `POD_SIGNATURE_REQUIRED` — and the body is
 * unchanged: the proof is read from the database, never sent here.
 *
 * Required by default, for every caller, with one declared exemption: the web
 * hub's job sheet has no capture step (the design draws the camera and the
 * signature pad for the phone only), so its dialog sends the
 * `x-pod-waiver: web-hub` header and completes as it always has. See
 * `POD_WAIVER_HEADER` in `src/lib/orders/pod-rules.ts` for why that is an
 * exemption and not a security boundary, and when it goes.
 *
 * The check and the status change share one transaction under the order's row
 * lock — the same lock every POD write takes — so a photo cannot be deleted
 * between "there is one" and "completed".
 *
 * Every refusal carries a stable `code` beside the localised `error` (see
 * `OrderActionErrorCode`); the wording and statuses of the refusals that
 * existed before are unchanged.
 *
 * It is deliberately absent from the response. `CARRIER_ORDER_PARTY_SELECT` is
 * the shape all six lifecycle endpoints answer with, and adding a column to it
 * for one route's benefit widens the other five as well. The only caller that
 * wants the value back is the job sheet, which re-reads the order through
 * `getHubJobSheet` (`src/lib/dashboard/hub/job-sheet.ts`) on the refresh that
 * follows this call — and which already has the string, having just sent it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return orderActionError(
      t("common.shared.unauthorized"),
      "UNAUTHENTICATED",
      401,
    );
  }

  const passwordRefusal = passwordChangeRefusal(session.user, t);
  if (passwordRefusal) {
    return passwordRefusal;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return orderActionError(
      t("common.shared.requestBodyMustBeValidJson"),
      "INVALID_REQUEST",
      400,
    );
  }

  const parsed = parseCompleteOrderBody(rawBody, t);
  if ("error" in parsed) {
    return orderActionError(parsed.error, "INVALID_REQUEST", 400);
  }

  const { waitingMinutes, receivedBy } = parsed.data;
  const { id } = await params;

  // The overtime rates come from the type booked on the order, not from the
  // vehicle that happened to fulfil it, so the charge matches what was quoted.
  // `commissionRate` is selected for the same reason: the driver's share of the
  // overtime must be computed at the rate this order was booked under.
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      driverId: true,
      status: true,
      commissionRate: true,
      vehicleTypeSpec: {
        select: {
          pricingRule: {
            select: { freeLoadingMinutes: true, overtimeRatePerMinute: true },
          },
        },
      },
    },
  });

  if (!order) {
    return orderActionError(t("common.shared.orderNotFound"), "NOT_FOUND", 404);
  }

  if (order.driverId !== session.user.id) {
    return orderActionError(
      t("common.shared.youAreNotAssignedToThis"),
      "NOT_ASSIGNED",
      403,
    );
  }

  const invalidState = () =>
    orderActionError(
      t("errors.ordersComplete.thisDeliveryCannotBeCompletedRight"),
      "INVALID_STATE",
      409,
    );

  if (order.status !== OrderStatus.IN_TRANSIT) {
    return invalidState();
  }

  const pricingRule = order.vehicleTypeSpec.pricingRule;

  // Every seeded vehicle type has a rule, so this only guards against
  // hand-edited data. Failing loudly beats silently waiving the overtime.
  if (!pricingRule) {
    return orderActionError(
      t("errors.ordersComplete.thisDeliverySVehicleTypeHas"),
      "SERVER_ERROR",
      500,
    );
  }

  const overtimeMinutes = Math.max(
    0,
    waitingMinutes - pricingRule.freeLoadingMinutes,
  );
  const overtimeFee = roundCurrency(
    overtimeMinutes * pricingRule.overtimeRatePerMinute,
  );

  // `order.commissionRate` — the rate stamped onto this row at booking — and
  // never `PLATFORM_COMMISSION_RATE` or `driverPayoutFor`'s default. That is the
  // whole reason the column exists: a job booked at 15% and completed after the
  // global rate was retuned to 18% would otherwise end up with a `driverPayout`
  // at one rate and an `overtimeDriverPayout` at another, with nothing on the
  // row to explain the disagreement.
  //
  // `driverPayout` is NOT recomputed here, and completion must never write to
  // it. It holds one stable meaning for the life of an order — what the job was
  // quoted to pay, the same figure the load board showed the driver when they
  // took it. Merging the two would make the board's historical number and the
  // earnings screen's number for one job silently disagree, and would fold a
  // figure only knowable at completion (overtime depends on `waitingMinutes`,
  // reported just now) into one that was settled at booking.
  const overtimeDriverPayout = driverPayoutFor(
    overtimeFee,
    order.commissionRate,
  );

  const proofWaived = isPodWaived(request.headers);

  const outcome = await prisma.$transaction(async (tx) => {
    // The lock every POD write also takes (`lockOrderForPod`): from here to the
    // commit no photo can be added or removed and no second completion can run.
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;

    const locked = await tx.order.findUnique({
      where: { id },
      select: {
        status: true,
        podSignaturePath: true,
        _count: { select: { podPhotos: true } },
      },
    });

    // Re-checked under the lock: the read above was a pre-check for readable
    // refusals, and a second device may have completed the job since.
    if (!locked || locked.status !== OrderStatus.IN_TRANSIT) {
      return { kind: "INVALID_STATE" } as const;
    }

    if (!proofWaived) {
      const denial = podCompletionDenial({
        photoCount: locked._count.podPhotos,
        hasSignature: locked.podSignaturePath !== null,
      });

      if (denial !== null) {
        return { kind: "PROOF_MISSING", denial } as const;
      }
    }

    // Both figures in one update: an order can never carry a non-zero
    // `overtimeFee` alongside a stale, default-`0` `overtimeDriverPayout`,
    // whether from a crash between two writes or from a later refactor
    // splitting them.
    const updated = await tx.order.update({
      where: { id },
      data: {
        status: OrderStatus.COMPLETED,
        completedAt: new Date(),
        waitingMinutes,
        overtimeFee,
        overtimeDriverPayout,
        // Written unconditionally, `null` included. This is the only write path
        // for the column and it only ever runs once per order — the IN_TRANSIT
        // guard above makes a second completion a 409 — so there is no earlier
        // value a null here could erase.
        receivedBy,
      },
      // Carrier-only response — see `CARRIER_ORDER_PARTY_SELECT`'s doc comment;
      // never `ORDER_PARTY_SELECT` here. Only the order's assigned driver reaches
      // this update, and this route was the worst of the six: it returned bare
      // `ORDER_PARTY_SELECT`, handing the completing driver `price` and the
      // `overtimeFee` this very call had just computed — the client's side of both
      // halves of the job.
      //
      // The `data:` object above is untouched by this select. `overtimeFee` is
      // still written (the client is billed it) and `overtimeDriverPayout` is
      // still commissioned from it at the order's own stored rate; the response
      // simply reports the second and not the first.
      select: CARRIER_ORDER_PARTY_SELECT,
    });

    return { kind: "COMPLETED", updated } as const;
  });

  if (outcome.kind === "INVALID_STATE") {
    return invalidState();
  }

  if (outcome.kind === "PROOF_MISSING") {
    return orderActionError(
      t(POD_DENIAL_MESSAGE_KEYS[outcome.denial]),
      outcome.denial,
      409,
    );
  }

  // The job is done: credit the driver's wallet **if** a payment gateway has
  // already confirmed the client's payment. No gateway is integrated, so today
  // this credits nothing — see `walletCreditDecisionFor`. When the confirmation
  // arrives after completion instead, `confirmGatewayPayment` makes the same
  // call. Never throws: the completion has committed and is what this request
  // reports, and the credit is idempotent, so a failure here is recoverable.
  await creditWalletForOrderSafely(id);

  // The driver is free again: offer them the best load waiting on the board.
  // Never throws — the completion above has committed and is what this
  // request reports. A driver who went offline meanwhile is offered nothing.
  //
  // Within the matching budget only: a slow match is finished after the
  // response rather than holding "Delivered" open — see
  // `runMatchingWithinBudget`. (The wallet credit above is *not* budgeted: it
  // is the driver's money, one short transaction, and is worth the wait.)
  const userId = session.user.id;

  await runMatchingWithinBudget(() => dispatchOfferForDriver(userId));

  return NextResponse.json(outcome.updated, { status: 200 });
}
