import { NextResponse } from "next/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { buildServiceDocumentView } from "@/lib/orders/service-document-server";

import { authoriseServiceDocument } from "./access";

/**
 * GET /api/orders/[id]/waybill — the client's order-details document for one
 * order, as JSON: `{ document: ServiceDocumentView }` (see
 * `src/lib/orders/service-document.ts`). The same view the PDF at
 * `/api/orders/[id]/waybill/pdf` prints. Read-only: the client enters nothing,
 * so there is no PUT or DELETE.
 *
 * 401 signed out · 404 not the order's client (or no such order) · 403 not a
 * BUSINESS account · 409 order unpaid (`INITIATED`) or `CANCELLED`.
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
