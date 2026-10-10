/**
 * Shared request checks for the proof-of-delivery endpoints (issuing an upload
 * URL, recording an upload, deleting a photo). All three need the same session,
 * assignment and status guards, so they live here rather than being written
 * three times and drifting — the arrangement the onboarding documents routes
 * have in their own `guard.ts`, whose body helpers are reused below.
 */

import type { NextResponse } from "next/server";
import { OrderStatus, type Prisma } from "@prisma/client";

import type { RequestTranslator } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import type { OrderActionErrorResponse } from "@/lib/mobile-api/contracts";
import {
  orderActionError,
  passwordChangeRefusal,
} from "@/lib/orders/action-errors";
import { prisma } from "@/lib/prisma";

export {
  asRecord,
  nonEmptyString,
} from "@/app/api/driver-profile/onboarding/documents/guard";

/** What a POD route has in hand once the caller has cleared every check. */
export type PodContext = {
  /** The order, confirmed to exist — also the Storage path prefix. */
  orderId: string;
  /** The assigned driver's user id (`Order.driverId`). */
  driverUserId: string;
  /**
   * When the driver started the job (`Order.inTransitAt`) — the earliest a
   * proof photo can honestly have been taken. Null only for an order put
   * `IN_TRANSIT` by something other than `POST /api/orders/[id]/start`.
   */
  inTransitAt: Date | null;
};

export type PodGuardResult =
  | { context: PodContext }
  | { response: NextResponse<OrderActionErrorResponse> };

/**
 * The 409 for an order that is not `IN_TRANSIT`. One wording for every POD
 * write: before pick-up there is no delivery to prove, and after completion the
 * proof is frozen.
 */
export function podInvalidState(
  t: RequestTranslator,
): NextResponse<OrderActionErrorResponse> {
  return orderActionError(
    t("errors.ordersPod.onlyWhileInTransit"),
    "INVALID_STATE",
    409,
  );
}

/**
 * Authenticates the caller and confirms they may change this order's proof:
 * signed in, not behind a forced password change, **the driver the order is
 * assigned to**, and the order `IN_TRANSIT`.
 *
 * The refusals mirror `POST /api/orders/[id]/complete`, the route this proof
 * exists to gate — 404 for no such order, 403 for somebody else's, 409 for the
 * wrong state — so a driver app handles one family of answers for the whole
 * delivery step. A company holding the order is *not* let through: proof is
 * captured at the door by the person standing at it.
 *
 * Does not read the request body; callers parse their own afterwards.
 *
 * The status read here is a pre-check for a readable refusal. The two routes
 * that write re-check it under a row lock, so a completion landing between this
 * read and the write cannot be followed by a change to its proof.
 */
export async function resolvePodContext(
  request: Request,
  orderId: string,
  t: RequestTranslator,
): Promise<PodGuardResult> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return {
      response: orderActionError(
        t("common.shared.unauthorized"),
        "UNAUTHENTICATED",
        401,
      ),
    };
  }

  const passwordRefusal = passwordChangeRefusal(session.user, t);
  if (passwordRefusal) {
    return { response: passwordRefusal };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, driverId: true, status: true, inTransitAt: true },
  });

  if (!order) {
    return {
      response: orderActionError(
        t("common.shared.orderNotFound"),
        "NOT_FOUND",
        404,
      ),
    };
  }

  if (order.driverId !== session.user.id) {
    return {
      response: orderActionError(
        t("common.shared.youAreNotAssignedToThis"),
        "NOT_ASSIGNED",
        403,
      ),
    };
  }

  if (order.status !== OrderStatus.IN_TRANSIT) {
    return { response: podInvalidState(t) };
  }

  return {
    context: {
      orderId: order.id,
      driverUserId: session.user.id,
      inTransitAt: order.inTransitAt,
    },
  };
}

/** Reads a JSON body, or returns the 400 for one that is not JSON. */
export async function readPodJsonBody(
  request: Request,
  t: RequestTranslator,
): Promise<
  { body: unknown } | { response: NextResponse<OrderActionErrorResponse> }
> {
  try {
    return { body: await request.json() };
  } catch {
    return {
      response: orderActionError(
        t("common.shared.requestBodyMustBeValidJson"),
        "INVALID_REQUEST",
        400,
      ),
    };
  }
}

/**
 * Takes the per-order lock every POD write and the completion itself hold, and
 * reports whether the order is still this driver's and still `IN_TRANSIT`.
 *
 * `SELECT … FOR UPDATE` on the order row serialises: registering a photo
 * against the three-photo cap (two concurrent registrations would otherwise
 * both count two and both insert), a delete against a completion (which would
 * otherwise leave a completed job with no photo), and any write against the
 * status change. Must be called first inside the transaction.
 */
export async function lockOrderForPod(
  tx: Prisma.TransactionClient,
  context: PodContext,
): Promise<boolean> {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${context.orderId} FOR UPDATE`;

  const order = await tx.order.findUnique({
    where: { id: context.orderId },
    select: { driverId: true, status: true },
  });

  return (
    order !== null &&
    order.driverId === context.driverUserId &&
    order.status === OrderStatus.IN_TRANSIT
  );
}
