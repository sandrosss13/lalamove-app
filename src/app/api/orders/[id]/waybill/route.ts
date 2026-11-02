import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { buildServiceDocumentView } from "@/lib/orders/service-document-server";

import { authoriseServiceDocument } from "./access";

/**
 * GET /api/orders/[id]/waybill — the order-details document for one order, as
 * JSON: `{ document: ServiceDocumentView }` (see
 * `src/lib/orders/service-document.ts`). The same view the PDF at
 * `/api/orders/[id]/waybill/pdf` prints. Read-only: nobody enters anything,
 * so there is no PUT or DELETE — though the first read assigns the order its
 * document number (`buildServiceDocumentView`).
 *
 * Open to staff, the order's own client (business or individual) and the guest
 * holding its token (cookie or `?token=`) — see `./access.ts`.
 * 401 no session and no guest token · 404 none of those (or no such order) ·
 * 409 order unpaid (`INITIATED`) or `CANCELLED`.
 *
 * The URL keeps its historical `waybill` segment so existing links work.
 */

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const t = await getRequestTranslations();
  const { id } = await context.params;

  const gate = await authoriseServiceDocument(request, id, t);
  if ("response" in gate) {
    return gate.response;
  }

  const document = await buildServiceDocumentView(gate.orderId);
  if (!document) {
    return NextResponse.json(
      { error: t("common.shared.orderNotFound") },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { document },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
