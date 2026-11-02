import { NextResponse } from "next/server";

import type { RequestTranslator } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import {
  isGuestAccessTokenShape,
  readGuestOrderToken,
} from "@/lib/orders/guest-access";
import { resolveServiceDocumentAccess } from "@/lib/orders/service-document-server";

/**
 * The gate both order-details endpoints (`GET /api/orders/[id]/waybill` and
 * its `/pdf`) share. Returns the order id or the response to send:
 *
 * - 401 — the request carries neither a session nor a guest token for the
 *   order;
 * - 404 — not staff, not the order's own client and not holding its guest
 *   token: the same answer as an order that does not exist, for the assigned
 *   driver, the carrier company and everyone else;
 * - 409 — the order is unpaid (`INITIATED`) or `CANCELLED`.
 *
 * The rules themselves are `resolveServiceDocumentAccess`
 * (`src/lib/orders/service-document-server.ts`). A guest's token comes from
 * the booking browser's cookie or, on any other device following the private
 * `/track/<token>` link, from `?token=` — exactly as
 * `GET /api/orders/[id]/location` reads it. Unlike there, the token is read
 * even alongside a session, so someone who booked as a guest and signed in
 * afterwards keeps their document.
 */
export async function authoriseServiceDocument(
  request: Request,
  orderId: string,
  t: RequestTranslator,
): Promise<{ orderId: string } | { response: NextResponse }> {
  const session = await auth.api.getSession({ headers: request.headers });

  const queryToken = new URL(request.url).searchParams.get("token");
  const guestToken =
    (await readGuestOrderToken(orderId)) ??
    (queryToken && isGuestAccessTokenShape(queryToken) ? queryToken : null);

  if (!session && !guestToken) {
    return {
      response: NextResponse.json(
        { error: t("common.shared.unauthorized") },
        { status: 401 },
      ),
    };
  }

  const access = await resolveServiceDocumentAccess(orderId, {
    session,
    guestToken,
  });
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
    case "NOT_AVAILABLE":
      return {
        response: NextResponse.json(
          { error: t("orderDocument.errors.notAvailable") },
          { status: 409 },
        ),
      };
  }
}
