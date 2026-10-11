import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { loadOrderPhotoViews } from "@/lib/order-photos/views";
import { prisma } from "@/lib/prisma";
import { vehicleTypeSpecLabel } from "@/lib/vehicle-type-spec-labels";
import {
  ORDER_STATUS_PILL,
  ORDER_STATUS_PILL_BASE,
  orderStatusLabel,
} from "@/components/orders-format";
import { OrderPhotoGallery } from "@/components/order-photo-gallery";
import { OrderTrackingMap } from "@/components/order-tracking-map";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/** Pair a nullable lat/lng into a coordinate, or null when geocoding failed. */
function toLatLng(
  lat: number | null,
  lng: number | null,
): { lat: number; lng: number } | null {
  return lat !== null && lng !== null ? { lat, lng } : null;
}

export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const t = await getTranslations("orders.ordersTrack");
  const tShared = await getTranslations("common.shared");
  const tRoot = await getTranslations();

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">{t("trackDelivery")}</h1>
        <p className="opacity-70">{t("pleaseSignInToTrackThis")}</p>
        <div className="flex justify-center gap-3">
          <Link
            href="/sign-in"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            {tShared("signIn")}
          </Link>
          <Link
            href="/sign-up"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            {tShared("signUp")}
          </Link>
        </div>
      </main>
    );
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      clientId: true,
      driverId: true,
      status: true,
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
    },
  });

  const userId = session.user.id;

  // Clients come here from their own order list, providers from their
  // dashboard — /orders redirects a driver or company straight back out again.
  const backHref = session.user.role === "CLIENT" ? "/orders" : "/dashboard";
  const backLabel =
    session.user.role === "CLIENT" ? t("backToOrders") : t("backToDashboard");

  // Someone else's order is reported exactly like a missing one, so this page
  // can't be used to probe which order ids exist.
  if (!order || (order.clientId !== userId && order.driverId !== userId)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">{tShared("orderNotFound")}</h1>
        <Link href={backHref} className="text-sm font-medium hover:opacity-70">
          {backLabel}
        </Link>
      </main>
    );
  }

  // Only after the ownership check above: these are readable URLs.
  const photos = await loadOrderPhotoViews(order.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t("trackDelivery")}</h1>
        <Link href={backHref} className="text-sm font-medium hover:opacity-70">
          {backLabel}
        </Link>
      </div>

      <div className="rounded border p-4">
        <span
          className={`${ORDER_STATUS_PILL_BASE} ${ORDER_STATUS_PILL[order.status]}`}
        >
          {orderStatusLabel(order.status, tRoot)}
        </span>

        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="opacity-60">{tShared("from")}</dt>
          <dd>{order.pickupAddress}</dd>
          <dt className="opacity-60">{tShared("to")}</dt>
          <dd>{order.dropoffAddress}</dd>
          {/* Only set once the delivery has been accepted or dispatched, and
              nulled again if that vehicle is later removed. */}
          {order.vehicle ? (
            <>
              <dt className="opacity-60">{tShared("vehicle")}</dt>
              <dd>
                {order.vehicle.plateNumber} — {order.vehicle.make}{" "}
                {order.vehicle.model} (
                {vehicleTypeSpecLabel(
                  order.vehicle.vehicleTypeSpec.code,
                  order.vehicle.vehicleTypeSpec.label,
                  tRoot,
                )}
                )
              </dd>
            </>
          ) : null}
          {order.company ? (
            <>
              <dt className="opacity-60">{t("carrier")}</dt>
              <dd>{order.company.companyName}</dd>
            </>
          ) : null}
        </dl>

        <OrderPhotoGallery photos={photos} className="mt-4" />
      </div>

      <OrderTrackingMap
        orderId={order.id}
        pickup={toLatLng(order.pickupLat, order.pickupLng)}
        dropoff={toLatLng(order.dropoffLat, order.dropoffLng)}
      />
    </main>
  );
}
