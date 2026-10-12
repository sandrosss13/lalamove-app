import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { getRequestTranslations } from "@/i18n/request-locale";
import { buildServiceDocumentView } from "@/lib/orders/service-document-server";
import {
  renderServiceDocumentPdf,
  serviceDocumentPdfLocaleLabels,
  type PdfTranslator,
  type ServiceDocumentPdfLabels,
} from "@/lib/waybill/render-pdf";

import { authoriseServiceDocument } from "../access";

/**
 * GET /api/orders/[id]/waybill/pdf — the client's order-details document
 * ("შეკვეთის დეტალები / Invoice / Order details") as a downloadable A4 PDF:
 * client, seller (zomo), service provider with driver and vehicle, route, and
 * the transportation service amount with net / VAT / grand total.
 *
 * **Who may read it.** The client who booked the order, and nobody else —
 * the same gate as `GET /api/orders/[id]/waybill` (`./access.ts`): 404 for
 * every other session including the assigned driver and the carrier company,
 * 403 for a non-business client, 409 for an unpaid or cancelled order.
 *
 * **Labels in both locales, regardless of the request locale.** The document
 * is bilingual by design ("{ka} / {en}"), so both catalogs are read here and
 * handed to the renderer as a plain object; the error messages, which are for
 * the reader of the response, follow the request locale as usual.
 *
 * **Node, never cached.** pdfkit needs Node APIs (`runtime = "nodejs"`), and
 * the provider section changes until the trip starts, so the response is
 * built per request and marked `private, no-store`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function loadLabels(): Promise<ServiceDocumentPdfLabels> {
  const [ka, en] = await Promise.all([
    getTranslations({
      locale: "ka",
      namespace: undefined as string | undefined,
    }),
    getTranslations({
      locale: "en",
      namespace: undefined as string | undefined,
    }),
  ]);
  const kaT: PdfTranslator = (key, values) => ka(key, values);
  const enT: PdfTranslator = (key, values) => en(key, values);

  return {
    ka: serviceDocumentPdfLocaleLabels(kaT),
    en: serviceDocumentPdfLocaleLabels(enT),
  };
}

/**
 * A filename safe in a quoted `Content-Disposition`: references look like
 * `GE-48239`, but anything outside that alphabet is replaced rather than
 * trusted, so a stray quote or newline can never split the header.
 */
function pdfFilename(reference: string): string {
  const safe = reference.replace(/[^A-Za-z0-9._-]/g, "_") || "order";
  return `order-${safe}.pdf`;
}

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

  const view = await buildServiceDocumentView(gate.orderId);
  if (!view) {
    return NextResponse.json(
      { error: t("common.shared.orderNotFound") },
      { status: 404 },
    );
  }

  const pdf = await renderServiceDocumentPdf(view, await loadLabels());

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFilename(view.reference)}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
