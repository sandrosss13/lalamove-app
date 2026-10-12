import { NextResponse } from "next/server";

import type { RequestTranslator } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { resolveServiceDocumentAccess } from "@/lib/orders/service-document-server";

/**
 * The gate both order-details endpoints (`GET /api/orders/[id]/waybill` and
 * its `/pdf`) share: signed in (401), the order's own client (404 — the same
 * answer as an order that does not exist, for the assigned driver, the carrier
 * company and everyone else), a BUSINESS account (403), and an order that is
 * paid and not cancelled (409). Returns the order id or the response to send.
 */
export async function authoriseServiceDocument(
  request: Request,
  orderId: string,
  t: RequestTranslator,
): Promise<{ orderId: string } | { response: NextResponse }> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return {
      response: NextResponse.json(
        { error: t("common.shared.unauthorized") },
        { status: 401 },
      ),
    };
  }

  const access = await resolveServiceDocumentAccess(orderId, session.user.id);
  switch (access.kind) {
    case "OK":
      return { orderId: access.orderId };
    case "NOT_FOUND":
      return {
        response: NextResponse.json(
          { error: t("common.shared.orderNotFound") },
          { status: 404 },
        ),
      };
    case "NOT_BUSINESS":
      return {
        response: NextResponse.json(
          { error: t("orderDocument.errors.businessOnly") },
          { status: 403 },
        ),
      };
    case "NOT_AVAILABLE":
      return {
        response: NextResponse.json(
          { error: t("orderDocument.errors.notAvailable") },
          { status: 409 },
        ),
      };
  }
}
