import { Download } from "lucide-react";
import { useTranslations } from "next-intl";

import { formatGel } from "@/components/orders-format";
import {
  driverFullName,
  vehicleMakeModel,
  type ServiceDocumentParty,
  type ServiceDocumentView,
} from "@/lib/orders/service-document";

const PANEL_CLASSES = "rounded-xl border border-line bg-surface p-5";
const LABEL_CLASSES =
  "text-[11px] font-semibold tracking-[0.1em] text-muted uppercase";

/**
 * A read-only summary of the client's order-details document — client, seller
 * (zomo), service provider, driver and vehicle, and the transportation amount
 * split into net / VAT / grand total — with the PDF download. The client
 * enters nothing here: every value comes from their profile, zomo's
 * configuration and the carrier who ran the trip.
 *
 * Shared by the two client surfaces that show one order — the order page
 * (`/orders/[id]`) and the tracking page (`/orders/[id]/track`) — so the
 * document reads the same on both, which is why it lives in
 * `src/components/orders` rather than beside either route. Each page builds
 * the `ServiceDocumentView` itself with `buildServiceDocumentView`.
 *
 * Rendered only for BUSINESS clients on a paid, uncancelled order (the page
 * decides, with the same rule `GET /api/orders/[id]/waybill` applies). A
 * server component: no state, and the download is a plain link.
 */
export function ServiceDocumentSection({
  orderId,
  document,
}: {
  orderId: string;
  document: ServiceDocumentView;
}) {
  const t = useTranslations("orderDocument.section");
  const rate = Math.round(document.amounts.vatRate * 100 * 100) / 100;

  const party = (heading: string, value: ServiceDocumentParty | null) => (
    <div className="min-w-0">
      <h3 className={LABEL_CLASSES}>{heading}</h3>
      {value === null ? (
        <p className="mt-1.5 text-[13px] text-muted">{t("notAssigned")}</p>
      ) : (
        <div className="mt-1.5 text-[13px] leading-snug">
          <p className="font-semibold text-paper">
            {value.name ?? t("notProvided")}
          </p>
          {value.taxId ? (
            <p className="text-muted">{t("taxId", { taxId: value.taxId })}</p>
          ) : null}
          {value.address ? <p className="text-muted">{value.address}</p> : null}
        </div>
      )}
    </div>
  );

  const driver = driverFullName(document.driver);
  const vehicle = vehicleMakeModel(document.vehicle);

  return (
    <section aria-labelledby="order-document-heading" className={PANEL_CLASSES}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="order-document-heading"
            className="font-display text-base font-semibold text-paper"
          >
            {t("title")}
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            {t("description")}
          </p>
        </div>
        {/* A plain link: the server sends the PDF as an attachment. */}
        <a
          href={`/api/orders/${encodeURIComponent(orderId)}/waybill/pdf`}
          download
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
        >
          <Download aria-hidden="true" className="size-4" />
          {t("download")}
        </a>
      </div>

      {document.preliminary ? (
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[13px] leading-snug text-amber-800 dark:text-amber-300">
          {t("preliminary")}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {party(t("client"), document.client)}
        {party(t("seller"), document.seller)}
        {party(t("serviceProvider"), document.provider)}
        <div className="min-w-0">
          <h3 className={LABEL_CLASSES}>{t("driverVehicle")}</h3>
          {driver === null && vehicle === null && !document.vehicle.plate ? (
            <p className="mt-1.5 text-[13px] text-muted">{t("notAssigned")}</p>
          ) : (
            <div className="mt-1.5 text-[13px] leading-snug">
              <p className="font-semibold text-paper">
                {driver ?? t("notProvided")}
              </p>
              <p className="text-muted">
                {t("personalId", {
                  personalId: document.driver.personalId ?? t("notProvided"),
                })}
              </p>
              <p className="text-muted">
                {[vehicle, document.vehicle.plate].filter(Boolean).join(" · ")}
              </p>
              {document.vehicle.trailerPlate ? (
                <p className="text-muted">
                  {t("trailer", { plate: document.vehicle.trailerPlate })}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 border-t border-line pt-4 text-[13px]">
        <dt className="text-paper">{t("transportationService")}</dt>
        <dd className="text-right font-price text-paper tabular-nums">
          {formatGel(document.amounts.gross)}
        </dd>
        <dt className="text-muted">{t("net")}</dt>
        <dd className="text-right font-price text-muted tabular-nums">
          {formatGel(document.amounts.net)}
        </dd>
        <dt className="text-muted">{t("vat", { rate })}</dt>
        <dd className="text-right font-price text-muted tabular-nums">
          {formatGel(document.amounts.vat)}
        </dd>
        <dt className="font-semibold text-paper">{t("grandTotal")}</dt>
        <dd className="text-right font-price font-semibold text-paper tabular-nums">
          {formatGel(document.amounts.gross)}
        </dd>
      </dl>
    </section>
  );
}
