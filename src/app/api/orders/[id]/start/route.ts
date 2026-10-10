import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { CARRIER_ORDER_PARTY_SELECT } from "@/lib/order-response-select";
import {
  orderActionError,
  passwordChangeRefusal,
} from "@/lib/orders/action-errors";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/orders/[id]/start — the assigned driver marks their delivery as
 * under way (ACCEPTED → IN_TRANSIT), stamping `inTransitAt`.
 *
 * Only the driver the order is assigned to may call this, whether they took the
 * job themselves or their company dispatched it to them: after dispatch the two
 * paths are identical, so there is one lifecycle endpoint rather than one per
 * supply side.
 *
 * Unlike accepting, this needs no conditional `updateMany`: exactly one driver
 * is assigned to an order, so there is no second caller to race with, and the
 * status check below is not subject to a lost update.
 *
 * Refusals carry a stable `code` beside the localised `error` — see
 * `OrderActionErrorCode` in `src/lib/mobile-api/contracts.ts`.
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

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, driverId: true, status: true },
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

  if (order.status !== OrderStatus.ACCEPTED) {
    return orderActionError(
      t("errors.ordersStart.thisDeliveryCannotBeStartedRight"),
      "INVALID_STATE",
      409,
    );
  }

  // Carrier-only response — see `CARRIER_ORDER_PARTY_SELECT`'s doc comment;
  // never `ORDER_PARTY_SELECT` here. This route has no explicit role check, but
  // the `order.driverId !== session.user.id` guard a few lines above means the
  // assigned driver is the only account that ever reaches this update, so the
  // audience is a carrier by construction rather than by a role test.
  const updated = await prisma.order.update({
    where: { id },
    data: { status: OrderStatus.IN_TRANSIT, inTransitAt: new Date() },
    select: CARRIER_ORDER_PARTY_SELECT,
  });

  return NextResponse.json(updated, { status: 200 });
}
