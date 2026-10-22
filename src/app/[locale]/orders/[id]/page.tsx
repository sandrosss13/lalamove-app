import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type {
  CargoCategory,
  ChassisType,
  OrderStatus,
  ServiceLevel,
} from "@prisma/client";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localeHref } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { useCargoCategoryLabel } from "@/lib/cargo";
import { prisma } from "@/lib/prisma";
import { vehicleTypeSpecLabel } from "@/lib/vehicle-type-spec-labels";
import {
  ORDER_STATUS_PILL,
  ORDER_STATUS_PILL_BASE,
  formatGel,
  orderIsEditableByClient,
  orderIsTrackable,
  useOrderStatusLabel,
  useServiceLevelLabel,
} from "@/components/orders-format";
import {
  CheckoutHeader,
  CheckoutNotice,
  CheckoutOrderNotFoundNotice,
} from "../../checkout/checkout-shell";
import {
  formatBookedDistanceKm,
  formatScheduledAt,
  helperFeeSplit,
  useCheckoutLabels,
} from "../../checkout/checkout-format";
import { CancelOrderButton } from "./cancel-order-button";
import { StopContactLines } from "@/components/orders/stop-contact-lines";
import { stopInfoOf, type StopInfo } from "@/lib/orders/stop-info";
import { OrderDocumentDownload } from "@/components/orders/order-document-download";
import { LiveTrackingPanel } from "@/components/orders/live-tracking-panel";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * The `Order` columns this page reads, and the only ones it may read.
 *
 * A `select`, never an `include`, for the reason `CHECKOUT_ORDER_SELECT`
 * records: an unselected query hands every future column on `Order` to the RSC
 * payload. Every row here is the reader's own, but the payout, commission and
 * payment columns are still nothing the client is shown, so they are not read.
 *
 * `driverId` is selected only to decide whether the live-tracking panel
 * applies (see `orderIsTrackable`); it is compared on the server and never
 * rendered. The four coordinates are that panel's map markers.
 * `clientId` is not selected at all — the lookup is *scoped* by it, which is
 * what makes somebody else's order indistinguishable from a missing one.
 */
const ORDER_DETAIL_SELECT = {
  id: true,
  reference: true,
  status: true,
  driverId: true,
  scheduledAt: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  pickupBuildingName: true,
  pickupEntrance: true,
  pickupComment: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  dropoffBuildingName: true,
  dropoffEntrance: true,
  dropoffComment: true,
  cargoCategory: true,
  bodyType: true,
  helperCount: true,
  // Pricing model v1: helpers, floor and cargo elevator at each end;
  // `tariffVersion` is null on a pre-v1 order, which keeps its one crew size.
  pickupHelpers: true,
  pickupFloor: true,
  pickupCargoElevator: true,
  pickupPassengerElevator: true,
  dropoffHelpers: true,
  dropoffFloor: true,
  dropoffCargoElevator: true,
  dropoffPassengerElevator: true,
  tariffVersion: true,
  // The helper charge, split by end on a v1 order — see `helperFeeSplit`.
  helperFee: true,
  pickupHelperFee: true,
  dropoffHelperFee: true,
  description: true,
  distanceKm: true,
  price: true,
  serviceLevel: true,
  serviceLevelAdjustment: true,
  vehicleTypeSpec: { select: { code: true, label: true } },
  // Only set once a driver has accepted with one of their vehicles, and nulled
  // again if that vehicle is later removed.
  vehicle: { select: { plateNumber: true, make: true, model: true } },
} as const;

/**
 * `/orders/[id]` — one of the client's own orders, in full, and what they can
 * still do with it.
 *
 * What they can do depends on one thing: whether it is paid. An `INITIATED`
 * order is invisible to every driver and company (both load boards filter
 * `status: PENDING`), so it is still the client's to change — they can pay for
 * it, edit it or cancel it. From the moment checkout settles it, someone may
 * already be planning around it, and this page shows details only (plus the
 * live map once a driver is on the way — the same panel `/orders/[id]/track`
 * shows, rendered inline so the client never has to leave this page). `orderIsEditableByClient` is that
 * rule; the endpoints behind the buttons enforce it again.
 *
 * Figures are read off the persisted row, as checkout reads them: the total is
 * `price + serviceLevelAdjustment`, the same sum the order list prints.
 *
 * Gates mirror `/checkout/[id]` exactly — signed out gets a sign-in prompt,
 * a provider is sent to `/dashboard`, and someone else's order reads as no
 * order at all. The not-found branch reuses `CheckoutOrderNotFoundNotice`
 * rather than copying it, because that notice is a security surface and one
 * wording is the only way two pages cannot drift into telling "not yours"
 * from "doesn't exist" apart.
 *
 * The checkout screen's shell and label helpers are imported across the screen
 * boundary on purpose: this page prints the same order in the same vocabulary
 * (load space, helpers, schedule), and a client who reads "Load space" on one
 * page and something else on the next has been shown two words for one thing.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const t = await getTranslations("orders.orderDetail");
  const tShared = await getTranslations("common.shared");

  if (!session) {
    return (
      <CheckoutNotice title={t("title")}>
        <p className="mt-3 text-[14px] text-muted">
          {t("signInToViewThisOrder")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-ink transition-transform hover:-translate-y-0.5"
          >
            {tShared("signIn")}
          </Link>
          <Link
            href="/sign-up"
            className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
          >
            {tShared("signUp")}
          </Link>
        </div>
      </CheckoutNotice>
    );
  }

  // The client's own order surface. Drivers and companies follow orders from
  // /dashboard — the same redirect `/orders` and checkout make.
  if (session.user.role !== "CLIENT") {
    redirect(await localeHref("/dashboard"));
  }

  const { id } = await params;

  // Scoped to the caller, which is what collapses "not yours" into "not found".
  const order = await prisma.order.findFirst({
    where: { id, clientId: session.user.id },
    select: ORDER_DETAIL_SELECT,
  });

  if (!order) {
    return <CheckoutOrderNotFoundNotice />;
  }

  // Driver assigned and on the job: the live map is shown below the status.
  const trackable = orderIsTrackable(order);

  return (
    // Painted on `main` so the ground covers the viewport — see the note on
    // `CheckoutNotice`.
    <main className="min-h-screen bg-ink text-paper">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 pt-8 pb-16 sm:px-8">
        <CheckoutHeader
          eyebrow={t("eyebrow", { reference: order.reference })}
          title={t("title")}
          backHref="/orders"
          backLabel={t("backToOrders")}
        />

        {/* The same two-column shape as checkout: the order to read on one
            side, what to do about it on the other. Single column below `lg`,
            details first. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
          <div className="flex flex-col gap-6">
            <RoutePanel order={order} />
            <DetailsPanel order={order} />
            {/* Under the details it documents. Every client's, business or
                individual, once the order is paid and not cancelled. */}
            <OrderDocumentDownload orderId={order.id} status={order.status} />
          </div>

          {/* Sticky only while the column is short: with the live map in it the
              column can outgrow the viewport, and a sticky column taller than
              the screen has its bottom cut off. */}
          <div
            className={`flex flex-col gap-6 ${trackable ? "" : "lg:sticky lg:top-8"}`}
          >
            <ActionsPanel order={order} />
            {trackable ? (
              <LiveTrackingPanel
                order={order}
                className="rounded-xl border border-line bg-surface p-5"
                headingClassName="font-display text-base font-semibold text-paper"
              />
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

/** The selected row, nothing wider. */
type OrderDetail = {
  id: string;
  reference: string;
  status: OrderStatus;
  driverId: string | null;
  scheduledAt: Date | null;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupContactDetails: string | null;
  pickupBuildingName: string | null;
  pickupEntrance: string | null;
  pickupComment: string | null;
  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  dropoffContactDetails: string | null;
  dropoffBuildingName: string | null;
  dropoffEntrance: string | null;
  dropoffComment: string | null;
  cargoCategory: CargoCategory;
  bodyType: ChassisType | null;
  helperCount: number;
  pickupHelpers: number;
  pickupFloor: number;
  pickupCargoElevator: boolean;
  pickupPassengerElevator: boolean;
  dropoffHelpers: number;
  dropoffFloor: number;
  dropoffCargoElevator: boolean;
  dropoffPassengerElevator: boolean;
  tariffVersion: number | null;
  helperFee: number;
  pickupHelperFee: number;
  dropoffHelperFee: number;
  description: string | null;
  distanceKm: number;
  price: number;
  serviceLevel: ServiceLevel;
  serviceLevelAdjustment: number;
  vehicleTypeSpec: { code: string; label: string };
  vehicle: { plateNumber: string; make: string; model: string } | null;
};

/** Both ends of the job, each with whoever the driver should ask for there. */
function RoutePanel({ order }: { order: OrderDetail }) {
  const tShared = useTranslations("common.shared");

  return (
    <section
      aria-labelledby="order-route-heading"
      className="rounded-xl border border-line bg-surface p-5"
    >
      <h2
        id="order-route-heading"
        className="font-display text-base font-semibold text-paper"
      >
        {tShared("route")}
      </h2>

      <div className="mt-4 flex flex-col gap-4">
        <RouteStop
          badge="P"
          name={tShared("pickup")}
          address={order.pickupAddress}
          contactName={order.pickupContactName}
          contactPhone={order.pickupContactPhone}
          info={stopInfoOf(order, "pickup")}
        />
        <RouteStop
          badge="D"
          name={tShared("dropoff")}
          address={order.dropoffAddress}
          contactName={order.dropoffContactName}
          contactPhone={order.dropoffContactPhone}
          info={stopInfoOf(order, "dropoff")}
        />
      </div>
    </section>
  );
}

/**
 * One end of the route: the address, then the contact captured for it on the
 * booking form. Every contact field is optional there, so each line is printed
 * only if it exists, and a stop with none says so rather than leaving a gap the
 * client might read as a fault.
 */
function RouteStop({
  badge,
  name,
  address,
  contactName,
  contactPhone,
  info,
}: {
  badge: string;
  name: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  info: StopInfo;
}) {
  const t = useTranslations("orders.orderDetail");

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {/* Bare initial, so the stop it names is spoken from the `sr-only` word
          beside it — the same treatment as the order card. */}
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent"
      >
        {badge}
      </span>
      <div className="min-w-0">
        <p className="text-[14px] leading-snug text-paper">
          <span className="sr-only">{name}: </span>
          {address}
        </p>
        <StopContactLines
          name={contactName}
          phone={contactPhone}
          info={info}
          emptyLabel={t("noContact")}
        />
      </div>
    </div>
  );
}

/** Everything that describes the job, as the checkout summary lays it out. */
function DetailsPanel({ order }: { order: OrderDetail }) {
  const t = useTranslations("orders.orderDetail");
  const tCheckout = useTranslations("checkout.checkout");
  const tShared = useTranslations("common.shared");
  const tRoot = useTranslations();
  const locale = useLocale();
  const cargoCategoryLabel = useCargoCategoryLabel();
  const serviceLevelLabel = useServiceLevelLabel();
  const labels = useCheckoutLabels();
  const helperLocations = labels.helperLocations(order);
  // Each end's quoted helper charge beside its crew, so the client reads what
  // the pickup and the drop-off helpers cost separately (v1 orders only).
  const helperSplit = helperFeeSplit(order);
  const withFee = (label: string, fee: number | undefined): string =>
    fee !== undefined && fee > 0 ? `${label} · ${formatGel(fee)}` : label;

  return (
    <section
      aria-labelledby="order-details-heading"
      className="rounded-xl border border-line bg-surface p-5"
    >
      <h2
        id="order-details-heading"
        className="font-display text-base font-semibold text-paper"
      >
        {t("details")}
      </h2>

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <DetailRow label={t("reference")} value={order.reference} numeric />
        {/* Nullable on the column: orders placed before the date step existed
            have none. */}
        {order.scheduledAt ? (
          <DetailRow
            label={tShared("scheduled")}
            value={formatScheduledAt(order.scheduledAt, locale)}
          />
        ) : null}
        <DetailRow
          label={tCheckout("goods")}
          value={cargoCategoryLabel(order.cargoCategory)}
        />
        <DetailRow
          label={t("vehicleClass")}
          value={vehicleTypeSpecLabel(
            order.vehicleTypeSpec.code,
            order.vehicleTypeSpec.label,
            tRoot,
          )}
        />
        {order.bodyType ? (
          <DetailRow
            label={tCheckout("loadSpace")}
            value={labels.bodyType(order.bodyType)}
          />
        ) : null}
        {helperLocations ? (
          <>
            <DetailRow
              label={tCheckout("helpersAtPickup")}
              value={withFee(helperLocations.pickup, helperSplit?.pickup)}
            />
            <DetailRow
              label={tCheckout("helpersAtDropoff")}
              value={withFee(helperLocations.dropoff, helperSplit?.dropoff)}
            />
          </>
        ) : (
          <DetailRow
            label={tCheckout("helpers")}
            value={labels.helperCount(order.helperCount)}
          />
        )}
        <DetailRow
          label={tShared("serviceLevel")}
          value={serviceLevelLabel(order.serviceLevel)}
        />
        <DetailRow
          label={tShared("distance")}
          value={formatBookedDistanceKm(order.distanceKm)}
          numeric
        />
        {order.vehicle ? (
          <DetailRow
            label={t("assignedVehicle")}
            value={`${order.vehicle.plateNumber} — ${order.vehicle.make} ${order.vehicle.model}`}
          />
        ) : null}
        {/* Full width: the one free-text field, passed the span rather than
            wrapped in it, since a `dl`'s `div` groups may not nest. */}
        {order.description ? (
          <DetailRow
            label={tCheckout("notes")}
            value={order.description}
            className="sm:col-span-2"
          />
        ) : null}
      </dl>
    </section>
  );
}

/**
 * Status, total, and the actions this order still allows.
 *
 * The actions are decided here, on the server, from the row just read — and
 * decided again by each endpoint when it is called, which is what makes a
 * stale page harmless: a client who paid in another tab and then presses
 * Cancel here gets the endpoint's 409 explained, not a cancelled paid order.
 */
function ActionsPanel({ order }: { order: OrderDetail }) {
  const t = useTranslations("orders.orderDetail");
  const tShared = useTranslations("common.shared");
  const statusLabel = useOrderStatusLabel();
  const serviceLevelLabel = useServiceLevelLabel();

  const editable = orderIsEditableByClient(order);
  const cancelled = order.status === "CANCELLED";

  return (
    <section
      aria-labelledby="order-actions-heading"
      className="rounded-xl border border-line bg-surface p-5"
    >
      <h2 id="order-actions-heading" className="sr-only">
        {t("status")}
      </h2>

      <div className="flex items-start justify-between gap-4">
        <span
          className={`${ORDER_STATUS_PILL_BASE} ${ORDER_STATUS_PILL[order.status]}`}
        >
          {statusLabel(order.status)}
        </span>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            {tShared("total")}
          </span>
          {/* The sum, never `price` alone — see `OrderCard`. Struck through on
              a cancelled order, which is owed by nobody. */}
          <span
            className={`font-price text-[24px] font-semibold tracking-[-0.01em] tabular-nums ${
              cancelled ? "text-muted line-through" : "text-paper"
            }`}
          >
            {formatGel(order.price + order.serviceLevelAdjustment)}
          </span>
          <span className="text-[13px] text-muted">
            {serviceLevelLabel(order.serviceLevel)}
          </span>
        </div>
      </div>

      <p className="mt-4 border-t border-line pt-4 text-[13px] leading-snug text-muted">
        {editable
          ? t("unpaidNote")
          : cancelled
            ? t("cancelledNote")
            : t("paidNote")}
      </p>

      {editable ? (
        <div className="mt-4 flex flex-col gap-2.5">
          <Link
            href={`/checkout/${order.id}`}
            className="rounded-full bg-accent px-5 py-2.5 text-center text-[14px] font-semibold text-ink transition-transform hover:-translate-y-0.5"
          >
            {t("completePayment")}
          </Link>
          <Link
            href={`/orders/${order.id}/edit`}
            className="rounded-full border border-line px-5 py-2.5 text-center text-[14px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
          >
            {t("editOrder")}
          </Link>
          <CancelOrderButton orderId={order.id} />
        </div>
      ) : null}
    </section>
  );
}

/** One labelled fact about the job — the checkout summary's row, verbatim. */
function DetailRow({
  label,
  value,
  numeric = false,
  className,
}: {
  label: string;
  value: string;
  /** Renders the value in the tabular face — the reference and the distance. */
  numeric?: boolean;
  /** Grid placement for the one row that wants the full width. */
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 text-[13px] font-medium break-words text-paper ${
          numeric ? "font-price tabular-nums" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
