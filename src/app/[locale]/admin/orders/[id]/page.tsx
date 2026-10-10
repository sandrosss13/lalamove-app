import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import {
  ADMIN_ORDER_DATE_TIME_FORMAT,
  ADMIN_ORDER_STATUS_KEYS,
  ADMIN_ORDER_STATUS_TONE,
  CHASSIS_TYPE_KEYS,
  CLIENT_ACCOUNT_TYPE_KEYS,
  PAYMENT_METHOD_TYPE_KEYS,
  PAYMENT_STATUS_KEYS,
  formatGel,
} from "@/components/admin/orders/order-format";
import { serviceLevelLabel } from "@/components/orders-format";
import { OrderPhotoGallery } from "@/components/order-photo-gallery";
import { Badge } from "@/components/ui/badge";
import { adminOrderTotalGel } from "@/lib/admin/orders-filters";
import { cargoCategoryLabel, cargoHandlingTagLabel } from "@/lib/cargo";
import { loadOrderPhotoViews } from "@/lib/order-photos/views";
import { prisma } from "@/lib/prisma";
import { vehicleTypeSpecLabel } from "@/lib/vehicle-type-spec-labels";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/** One label/value row. `null`/`undefined`/`""` renders nothing at all. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return (
    <div className="grid grid-cols-[minmax(7rem,40%)_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

/** A titled card holding a `<dl>` of `Field`s (or anything else). */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** A person's full name off a profile, or null when it carries neither part. */
function joinName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const name = [firstName, lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");

  return name === "" ? null : name;
}

/**
 * `/admin/orders/[id]` — one order in full, for staff: who placed it, where it
 * goes, what is being carried (photos included), who is carrying it and what
 * it costs.
 *
 * Read-only. The role gate is `../layout.tsx`; that gate is also what makes it
 * safe to sign the cargo photo URLs below, since `loadOrderPhotoViews` leaves
 * the access decision to its caller.
 *
 * Unlike the client's tracking page, an unknown id is a plain 404 — there is no
 * ownership to hide from staff who may read every order.
 */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      status: true,
      createdAt: true,
      scheduledAt: true,
      pickupWindowStart: true,
      pickupWindowEnd: true,
      deliveryDeadline: true,
      inTransitAt: true,
      completedAt: true,
      pickupAddress: true,
      dropoffAddress: true,
      pickupContactName: true,
      pickupContactPhone: true,
      pickupContactDetails: true,
      dropoffContactName: true,
      dropoffContactPhone: true,
      dropoffContactDetails: true,
      distanceKm: true,
      cargoCategory: true,
      bodyType: true,
      helperCount: true,
      description: true,
      serviceLevel: true,
      cargoWeightKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
      packagingDescription: true,
      itemQuantity: true,
      handlingTags: true,
      baseFare: true,
      distanceFare: true,
      timeFare: true,
      helperFee: true,
      overtimeFee: true,
      price: true,
      serviceLevelAdjustment: true,
      commissionRate: true,
      driverPayout: true,
      overtimeDriverPayout: true,
      paymentMethodType: true,
      purchaseOrderRef: true,
      receivedBy: true,
      vehicleTypeSpec: { select: { code: true, label: true } },
      client: {
        select: {
          name: true,
          email: true,
          clientProfile: {
            select: {
              accountType: true,
              phone: true,
              firstName: true,
              lastName: true,
              companyName: true,
            },
          },
        },
      },
      driver: {
        select: {
          name: true,
          email: true,
          driverProfile: {
            select: { firstName: true, lastName: true, phone: true },
          },
        },
      },
      company: { select: { companyName: true, phone: true } },
      vehicle: {
        select: {
          plateNumber: true,
          make: true,
          model: true,
          year: true,
          vehicleTypeSpec: { select: { code: true, label: true } },
        },
      },
      payment: {
        select: { status: true, provider: true, amount: true, paidAt: true },
      },
    },
  });

  if (!order) {
    notFound();
  }

  // Only after the order is known to exist; the role gate already ran.
  const photos = await loadOrderPhotoViews(order.id);

  const t = await getTranslations("admin.adminOrders");
  const tShared = await getTranslations("common.shared");
  // Root-scoped: every label helper below takes full dotted keys.
  const tRoot = await getTranslations();
  const format = await getFormatter();

  const formatDateTime = (value: Date | null): string | null =>
    value ? format.dateTime(value, ADMIN_ORDER_DATE_TIME_FORMAT) : null;
  const formatNumber = (value: number | null, unit: string): string | null =>
    value === null ? null : `${format.number(value)} ${unit}`;

  const pickupWindow =
    order.pickupWindowStart && order.pickupWindowEnd
      ? `${formatDateTime(order.pickupWindowStart)} – ${formatDateTime(order.pickupWindowEnd)}`
      : formatDateTime(order.pickupWindowStart ?? order.pickupWindowEnd);

  const clientProfile = order.client.clientProfile;
  const profileName =
    joinName(clientProfile?.firstName, clientProfile?.lastName) ??
    clientProfile?.companyName?.trim() ??
    null;

  const driverName = order.driver
    ? (joinName(
        order.driver.driverProfile?.firstName,
        order.driver.driverProfile?.lastName,
      ) ?? order.driver.name)
    : null;

  const hasAssignment =
    order.driver !== null || order.company !== null || order.vehicle !== null;
  // `price` already includes `helperFee`; the tier adjustment and any overtime
  // are settled on top — see `adminOrderTotalGel`.
  const total = adminOrderTotalGel(order);
  const hasStopContacts = [
    order.pickupContactName,
    order.pickupContactPhone,
    order.pickupContactDetails,
    order.dropoffContactName,
    order.dropoffContactPhone,
    order.dropoffContactDetails,
  ].some((value) => value !== null && value !== "");

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/orders"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("backToOrders")}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {t("orderTitle", { reference: order.reference })}
        </h1>
        <Badge
          variant="outline"
          className={ADMIN_ORDER_STATUS_TONE[order.status]}
        >
          {tRoot(ADMIN_ORDER_STATUS_KEYS[order.status])}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("summary")}>
          <dl className="divide-y divide-border">
            <Field label={t("reference")} value={order.reference} />
            <Field
              label={tShared("status")}
              value={tRoot(ADMIN_ORDER_STATUS_KEYS[order.status])}
            />
            <Field
              label={t("created")}
              value={formatDateTime(order.createdAt)}
            />
            <Field
              label={tShared("scheduled")}
              value={formatDateTime(order.scheduledAt)}
            />
            <Field label={t("pickupWindow")} value={pickupWindow} />
            <Field
              label={t("deliveryDeadline")}
              value={formatDateTime(order.deliveryDeadline)}
            />
            <Field
              label={t("inTransitSince")}
              value={formatDateTime(order.inTransitAt)}
            />
            <Field
              label={t("completedAt")}
              value={formatDateTime(order.completedAt)}
            />
            <Field label={t("receivedBy")} value={order.receivedBy} />
          </dl>
        </Section>

        <Section title={tShared("client")}>
          <dl className="divide-y divide-border">
            <Field label={tShared("name")} value={order.client.name} />
            {profileName && profileName !== order.client.name ? (
              <Field label={t("profileName")} value={profileName} />
            ) : null}
            <Field
              label={tShared("email")}
              value={
                <a
                  href={`mailto:${order.client.email}`}
                  className="underline-offset-4 hover:underline"
                >
                  {order.client.email}
                </a>
              }
            />
            <Field label={tShared("phone")} value={clientProfile?.phone} />
            <Field
              label={t("accountType")}
              value={
                clientProfile
                  ? tRoot(CLIENT_ACCOUNT_TYPE_KEYS[clientProfile.accountType])
                  : null
              }
            />
            <Field
              label={t("purchaseOrderRef")}
              value={order.purchaseOrderRef}
            />
          </dl>
        </Section>

        <Section title={tShared("route")}>
          <dl className="divide-y divide-border">
            <Field label={tShared("pickup")} value={order.pickupAddress} />
            <Field label={tShared("dropoff")} value={order.dropoffAddress} />
            <Field
              label={t("distance")}
              value={formatNumber(order.distanceKm, t("kmUnit"))}
            />
            {hasStopContacts ? (
              <>
                <Field
                  label={t("pickupContact")}
                  value={[order.pickupContactName, order.pickupContactPhone]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <Field
                  label={t("pickupDetails")}
                  value={order.pickupContactDetails}
                />
                <Field
                  label={t("dropoffContact")}
                  value={[order.dropoffContactName, order.dropoffContactPhone]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <Field
                  label={t("dropoffDetails")}
                  value={order.dropoffContactDetails}
                />
              </>
            ) : null}
          </dl>
        </Section>

        <Section title={tShared("cargo")}>
          <dl className="divide-y divide-border">
            <Field
              label={t("category")}
              value={cargoCategoryLabel(order.cargoCategory, tRoot)}
            />
            <Field
              label={tShared("bodyType")}
              value={
                order.bodyType ? tRoot(CHASSIS_TYPE_KEYS[order.bodyType]) : null
              }
            />
            <Field
              label={t("vehicleType")}
              value={vehicleTypeSpecLabel(
                order.vehicleTypeSpec.code,
                order.vehicleTypeSpec.label,
                tRoot,
              )}
            />
            <Field
              label={tShared("helpers")}
              value={String(order.helperCount)}
            />
            <Field
              label={tShared("serviceLevel")}
              value={serviceLevelLabel(order.serviceLevel, tRoot)}
            />
            <Field
              label={t("weight")}
              value={formatNumber(order.cargoWeightKg, t("kgUnit"))}
            />
            <Field
              label={tShared("length")}
              value={formatNumber(order.cargoLengthM, t("metreUnit"))}
            />
            <Field
              label={tShared("width")}
              value={formatNumber(order.cargoWidthM, t("metreUnit"))}
            />
            <Field
              label={tShared("height")}
              value={formatNumber(order.cargoHeightM, t("metreUnit"))}
            />
            <Field label={t("packaging")} value={order.packagingDescription} />
            <Field label={t("itemQuantity")} value={order.itemQuantity} />
            <Field
              label={t("handling")}
              value={order.handlingTags
                .map((tag) => cargoHandlingTagLabel(tag, tRoot))
                .join(", ")}
            />
            <Field
              label={t("description")}
              value={
                order.description ? (
                  <span className="whitespace-pre-line">
                    {order.description}
                  </span>
                ) : null
              }
            />
          </dl>
          <OrderPhotoGallery
            photos={photos}
            className="pt-2"
            headingLevel="h3"
            headingClassName="text-sm font-medium text-muted-foreground"
          />
        </Section>

        <Section title={t("assignment")}>
          {hasAssignment ? (
            <dl className="divide-y divide-border">
              <Field
                label={tShared("company")}
                value={
                  order.company
                    ? `${order.company.companyName} · ${order.company.phone}`
                    : null
                }
              />
              <Field label={tShared("driver")} value={driverName} />
              <Field
                label={tShared("phone")}
                value={order.driver?.driverProfile?.phone}
              />
              <Field label={tShared("email")} value={order.driver?.email} />
              <Field
                label={tShared("vehicle")}
                value={
                  order.vehicle
                    ? `${order.vehicle.make} ${order.vehicle.model} (${order.vehicle.year}) · ${vehicleTypeSpecLabel(
                        order.vehicle.vehicleTypeSpec.code,
                        order.vehicle.vehicleTypeSpec.label,
                        tRoot,
                      )}`
                    : null
                }
              />
              <Field
                label={tShared("plate")}
                value={order.vehicle?.plateNumber}
              />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("notAssignedYet")}
            </p>
          )}
        </Section>

        <Section title={t("priceAndPayment")}>
          <dl className="divide-y divide-border">
            <Field label={t("baseFare")} value={formatGel(order.baseFare)} />
            <Field
              label={t("distanceFare")}
              value={formatGel(order.distanceFare)}
            />
            <Field label={t("timeFare")} value={formatGel(order.timeFare)} />
            {order.helperFee !== 0 ? (
              <Field
                label={tShared("helperFee")}
                value={formatGel(order.helperFee)}
              />
            ) : null}
            <Field label={t("quotedPrice")} value={formatGel(order.price)} />
            {order.serviceLevelAdjustment !== 0 ? (
              <Field
                label={t("serviceLevelAdjustment")}
                value={formatGel(order.serviceLevelAdjustment)}
              />
            ) : null}
            {order.overtimeFee !== 0 ? (
              <Field
                label={t("overtimeFee")}
                value={formatGel(order.overtimeFee)}
              />
            ) : null}
            <Field
              label={tShared("total")}
              value={<span className="font-semibold">{formatGel(total)}</span>}
            />
            <Field
              label={t("driverPayout")}
              value={formatGel(order.driverPayout + order.overtimeDriverPayout)}
            />
            <Field
              label={t("commission")}
              value={format.number(order.commissionRate, {
                style: "percent",
                maximumFractionDigits: 1,
              })}
            />
            <Field
              label={tShared("paymentMethod")}
              value={
                order.paymentMethodType
                  ? tRoot(PAYMENT_METHOD_TYPE_KEYS[order.paymentMethodType])
                  : null
              }
            />
            <Field
              label={t("paymentStatusLabel")}
              value={
                order.payment
                  ? tRoot(PAYMENT_STATUS_KEYS[order.payment.status])
                  : t("noPaymentRecord")
              }
            />
            <Field
              label={t("paidAt")}
              value={formatDateTime(order.payment?.paidAt ?? null)}
            />
          </dl>
        </Section>
      </div>
    </div>
  );
}
