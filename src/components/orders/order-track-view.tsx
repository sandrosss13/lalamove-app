import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { CircleCheck, Clock3, Truck } from "lucide-react";
import type { OrderStatus } from "@prisma/client";

import { Link } from "@/i18n/navigation";
import { loadOrderPhotoViews } from "@/lib/order-photos/views";
import { ORDER_PROOF_SELECT, toOrderProof } from "@/lib/orders/pod";
import {
  trackPageSections,
  type TrackPageViewer,
} from "@/lib/orders/track-page";
import { prisma } from "@/lib/prisma";
import { vehicleTypeSpecLabel } from "@/lib/vehicle-type-spec-labels";
import {
  ORDER_STATUS_PILL,
  ORDER_STATUS_PILL_BASE,
  orderStatusLabel,
} from "@/components/orders-format";
import { OrderPhotoGallery } from "@/components/order-photo-gallery";
import { LiveTrackingPanel } from "@/components/orders/live-tracking-panel";
import { ProofOfDeliverySection } from "@/components/orders/proof-of-delivery-section";
import {
  OrderDocumentDownload,
  isOrderDocumentAvailable,
} from "@/components/orders/order-document-download";

/**
 * The body of an order's tracking page, shared by the two routes that show it:
 *
 * - `/orders/[id]/track` — the signed-in client who booked it, or the driver
 *   assigned to it;
 * - `/track/[token]` — a guest's private link, for an order booked without an
 *   account (always rendered as the `CLIENT` viewer: the guest is the client).
 *
 * Each route does its own access check and query (with
 * `TRACK_VIEW_ORDER_SELECT`), and hands this component an order it has already
 * decided the reader may see. Everything readable beyond that row — the proof
 * URLs and the cargo photos — is loaded here, after that check, and only for
 * the viewer `trackPageSections` allows it for.
 */

/** Every panel on the page: the landing-token card the order page uses. */
const PANEL_CLASSES = "rounded-[14px] border border-line bg-surface p-5 sm:p-6";

/** The display-face section heading every panel opens with. */
const PANEL_HEADING_CLASSES =
  "font-display text-lg font-semibold tracking-[-0.01em] text-paper";

/** Date and time, formatted in the page's locale and `Asia/Tbilisi`. */
const DATE_TIME_FORMAT = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

/** The `Order` columns the view renders. Both routes select exactly these
 *  (plus whatever their own access check needs). */
export const TRACK_VIEW_ORDER_SELECT = {
  id: true,
  reference: true,
  status: true,
  scheduledAt: true,
  inTransitAt: true,
  completedAt: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  // The vehicle's class is read off the type spec — it is no longer a column
  // on `Vehicle`.
  vehicle: {
    select: {
      plateNumber: true,
      make: true,
      model: true,
      vehicleTypeSpec: { select: { code: true, label: true } },
    },
  },
  company: { select: { companyName: true } },
} as const;

export type TrackViewOrder = {
  id: string;
  reference: string;
  status: OrderStatus;
  scheduledAt: Date | null;
  inTransitAt: Date | null;
  completedAt: Date | null;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  vehicle: {
    plateNumber: string;
    make: string;
    model: string;
    vehicleTypeSpec: { code: string; label: string };
  } | null;
  company: { companyName: string } | null;
};

export async function OrderTrackView({
  order,
  viewer,
  backHref,
  backLabel,
  guestToken,
}: {
  order: TrackViewOrder;
  viewer: TrackPageViewer;
  backHref: string;
  backLabel: string;
  /** The guest route's token, so the live map can poll the driver's position
   *  (and the order-details PDF can be downloaded) without a session or the
   *  order's cookie. */
  guestToken?: string;
}) {
  const tPage = await getTranslations("orderTracking.page");
  const tShared = await getTranslations("common.shared");
  const tRoot = await getTranslations();
  const format = await getFormatter();

  // Only after the ownership check above: from here on, everything loaded is
  // readable by whoever this page is rendered for.
  const isClient = viewer === "CLIENT";

  // The proof rows are read for the client and nobody else — not filtered out
  // of a driver's render afterwards, but never queried for one.
  const proofRows = isClient
    ? await prisma.order.findUnique({
        where: { id: order.id },
        select: ORDER_PROOF_SELECT,
      })
    : null;
  const hasProof =
    proofRows !== null &&
    (proofRows.podSignaturePath !== null || proofRows.podPhotos.length > 0);

  const sections = trackPageSections({
    viewer,
    status: order.status,
    hasProof,
    documentAvailable: isOrderDocumentAvailable(order.status),
  });

  const [photos, proof] = await Promise.all([
    loadOrderPhotoViews(order.id),
    sections.proofOfDelivery && proofRows ? toOrderProof(proofRows) : null,
  ]);

  const formatDateTime = (date: Date) =>
    format.dateTime(date, DATE_TIME_FORMAT);

  const title = sections.delivered
    ? tPage("titleDelivered")
    : sections.cancelledNotice
      ? tPage("titleCancelled")
      : sections.waitingNotice
        ? tPage("titleWaiting")
        : tPage("titleLive");

  // The one time that matters for where the order is now, plus the booked
  // slot while it still lies ahead.
  const timeline: { key: string; icon: ReactNode; text: string }[] = [];
  if (order.completedAt && order.status === "COMPLETED") {
    timeline.push({
      key: "delivered",
      icon: (
        <CircleCheck
          aria-hidden="true"
          className="size-4 text-emerald-600 dark:text-emerald-400"
        />
      ),
      text: tPage("deliveredAt", { time: formatDateTime(order.completedAt) }),
    });
  } else if (order.inTransitAt && order.status === "IN_TRANSIT") {
    timeline.push({
      key: "inTransit",
      icon: (
        <Truck
          aria-hidden="true"
          className="size-4 text-orange-600 dark:text-orange-400"
        />
      ),
      text: tPage("onTheWaySince", { time: formatDateTime(order.inTransitAt) }),
    });
  }
  if (order.scheduledAt && order.status !== "COMPLETED") {
    timeline.push({
      key: "scheduled",
      icon: <Clock3 aria-hidden="true" className="size-4 text-muted" />,
      text: tPage("scheduledFor", { time: formatDateTime(order.scheduledAt) }),
    });
  }

  return (
    // Painted on `main` so the ground covers the viewport — see the note on
    // `CheckoutNotice`.
    <main className="min-h-screen bg-ink text-paper">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pt-8 pb-16 sm:gap-6 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="font-price text-[11px] font-semibold tracking-[0.24em] text-accent uppercase tabular-nums">
              {tPage("eyebrow", { reference: order.reference })}
            </p>
            <h1 className="font-display mt-2 text-[2rem] leading-none font-semibold tracking-[-0.025em] text-paper sm:text-[2.5rem]">
              {title}
            </h1>
          </div>
          <Link
            href={backHref}
            className="text-[14px] font-semibold text-paper transition-colors hover:text-accent"
          >
            {backLabel}
          </Link>
        </header>

        <section aria-label={tPage("route")} className={PANEL_CLASSES}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
            <span
              className={`${ORDER_STATUS_PILL_BASE} ${ORDER_STATUS_PILL[order.status]}`}
            >
              {orderStatusLabel(order.status, tRoot)}
            </span>
            {timeline.map((entry) => (
              <p
                key={entry.key}
                className="flex items-center gap-1.5 text-[13px] font-medium text-paper tabular-nums"
              >
                {entry.icon}
                {entry.text}
              </p>
            ))}
          </div>

          <ol className="mt-5 flex flex-col">
            <RouteStop
              badge="P"
              name={tShared("pickup")}
              address={order.pickupAddress}
              connector
            />
            <RouteStop
              badge="D"
              name={tShared("dropoff")}
              address={order.dropoffAddress}
            />
          </ol>

          {/* Only set once the delivery has been accepted or dispatched, and
              nulled again if that vehicle is later removed. */}
          {order.vehicle || order.company ? (
            <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2">
              {order.vehicle ? (
                <MetaRow label={tPage("vehicle")}>
                  <span className="font-price tabular-nums">
                    {order.vehicle.plateNumber}
                  </span>{" "}
                  · {order.vehicle.make} {order.vehicle.model}
                  <span className="block text-[12.5px] text-muted">
                    {vehicleTypeSpecLabel(
                      order.vehicle.vehicleTypeSpec.code,
                      order.vehicle.vehicleTypeSpec.label,
                      tRoot,
                    )}
                  </span>
                </MetaRow>
              ) : null}
              {order.company ? (
                <MetaRow label={tPage("carrier")}>
                  {order.company.companyName}
                </MetaRow>
              ) : null}
            </dl>
          ) : null}
        </section>

        {/* Under the details it documents, above the live map. */}
        {sections.serviceDocument ? (
          <OrderDocumentDownload
            orderId={order.id}
            status={order.status}
            guestToken={guestToken}
            className={PANEL_CLASSES}
          />
        ) : null}

        {sections.liveMap ? (
          <LiveTrackingPanel
            order={order}
            guestToken={guestToken}
            className={PANEL_CLASSES}
            headingClassName={PANEL_HEADING_CLASSES}
          />
        ) : null}

        {sections.waitingNotice || sections.cancelledNotice ? (
          <p className={`${PANEL_CLASSES} text-[14px] leading-snug text-muted`}>
            {sections.cancelledNotice
              ? tPage("cancelledNotice")
              : tPage("waitingNotice")}
          </p>
        ) : null}

        {/* The driver's view of a finished order; the client reads the same
            moment in the proof below. */}
        {sections.delivered && !sections.proofOfDelivery ? (
          <section
            aria-labelledby="delivered-heading"
            className={`${PANEL_CLASSES} flex items-start gap-3`}
          >
            <CircleCheck
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            <div>
              <h2 id="delivered-heading" className={PANEL_HEADING_CLASSES}>
                {tPage("deliveredHeading")}
              </h2>
              {order.completedAt ? (
                <p className="mt-1 text-[13px] leading-snug text-muted">
                  {tPage("deliveredBody", {
                    time: formatDateTime(order.completedAt),
                  })}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {proof ? (
          <ProofOfDeliverySection
            proof={{
              hasSignature: proof.hasSignature,
              signatureUrl: proof.signatureUrl,
              photos: proof.photos.map((photo) => ({
                id: photo.id,
                url: photo.url,
                takenAtLabel: formatDateTime(new Date(photo.takenAt)),
              })),
            }}
            completedLabel={
              order.completedAt ? formatDateTime(order.completedAt) : null
            }
          />
        ) : null}

        {photos.length > 0 ? (
          <div className={PANEL_CLASSES}>
            <OrderPhotoGallery
              photos={photos}
              headingClassName={PANEL_HEADING_CLASSES}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}

/**
 * One end of the route, with the dotted line down to the next stop. The
 * badge is a bare initial and hidden from assistive technology; the stop's
 * name is printed as a visible label above the address instead.
 */
function RouteStop({
  badge,
  name,
  address,
  connector = false,
}: {
  badge: string;
  name: string;
  address: string;
  connector?: boolean;
}) {
  return (
    <li className="relative flex min-w-0 items-start gap-3 pb-1">
      {connector ? (
        <span
          aria-hidden="true"
          className="absolute top-7 bottom-0 left-[11px] border-l border-dashed border-line"
        />
      ) : null}
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent"
      >
        {badge}
      </span>
      <div className={`min-w-0 ${connector ? "pb-4" : ""}`}>
        <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
          {name}
        </p>
        <p className="mt-0.5 text-[14.5px] leading-snug break-words text-paper">
          {address}
        </p>
      </div>
    </li>
  );
}

/** One label / value pair in the summary's footer. */
function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[14px] leading-snug break-words text-paper">
        {children}
      </dd>
    </div>
  );
}
