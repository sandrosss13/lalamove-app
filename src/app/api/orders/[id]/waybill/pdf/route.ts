import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import {
  getRequestLocale,
  getRequestTranslations,
} from "@/i18n/request-locale";
import { buildServiceDocumentView } from "@/lib/orders/service-document-server";
import {
  isPdfLocale,
  renderServiceDocumentPdf,
  serviceDocumentPdfFilename,
  serviceDocumentPdfLabels,
  type PdfLocale,
  type PdfTranslator,
} from "@/lib/waybill/render-pdf";

import { authoriseServiceDocument } from "../access";

/**
 * GET /api/orders/[id]/waybill/pdf?lang=en|ka — the order-details document
 * ("Order Details / Invoice", "შეკვეთის დეტალები / ინვოისი") as a downloadable
 * A4 PDF in one language: order information, customer, carrier with driver
 * and vehicle, route, cargo, additional services and the money.
 *
 * **Who may read it.** Whatever `authoriseServiceDocument` (`../access.ts`)
 * allows — the same gate as the JSON `GET /api/orders/[id]/waybill`, so the
 * two endpoints can never disagree about who sees an order's document.
 *
 * **Language.** `?lang=en` or `?lang=ka` picks the document's language; with
 * no or an unrecognised `lang` it follows the request locale, like every other
 * response. The error messages always follow the request locale — they are
 * for the reader of the response, not printed on the document.
 *
 * **Node, never cached.** pdfkit needs Node APIs (`runtime = "nodejs"`), and
 * the carrier section changes until the trip starts, so the response is built
 * per request and marked `private, no-store`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function documentLocale(request: Request): Promise<PdfLocale> {
  const lang = new URL(request.url).searchParams.get("lang");
  return isPdfLocale(lang) ? lang : getRequestLocale();
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

  const locale = await documentLocale(request);
  const translate = await getTranslations({
    locale,
    namespace: undefined as string | undefined,
  });
  const pdfT: PdfTranslator = (key, values) => translate(key, values);
  const pdf = await renderServiceDocumentPdf(
    view,
    serviceDocumentPdfLabels(pdfT),
    { locale },
  );

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${serviceDocumentPdfFilename(view.reference, locale)}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
