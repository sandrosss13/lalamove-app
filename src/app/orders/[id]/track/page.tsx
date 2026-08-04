import { headers } from "next/headers";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_STYLES } from "@/components/order-card";
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

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">Track delivery</h1>
        <p className="opacity-70">Please sign in to track this delivery.</p>
        <div className="flex justify-center gap-3">
          <Link
            href="/sign-in"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            Sign up
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
          vehicleTypeSpec: { select: { label: true } },
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
    session.user.role === "CLIENT" ? "← Back to orders" : "← Back to dashboard";

  // Someone else's order is reported exactly like a missing one, so this page
  // can't be used to probe which order ids exist.
  if (!order || (order.clientId !== userId && order.driverId !== userId)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">Order not found.</h1>
        <Link href={backHref} className="text-sm font-medium hover:opacity-70">
          {backLabel}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Track delivery</h1>
        <Link href={backHref} className="text-sm font-medium hover:opacity-70">
          {backLabel}
        </Link>
      </div>

      <div className="rounded border p-4">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status]}`}
        >
          {order.status}
        </span>

        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="opacity-60">From</dt>
          <dd>{order.pickupAddress}</dd>
          <dt className="opacity-60">To</dt>
          <dd>{order.dropoffAddress}</dd>
          {/* Only set once the delivery has been accepted or dispatched, and
              nulled again if that vehicle is later removed. */}
          {order.vehicle ? (
            <>
              <dt className="opacity-60">Vehicle</dt>
              <dd>
                {order.vehicle.plateNumber} — {order.vehicle.make}{" "}
                {order.vehicle.model} ({order.vehicle.vehicleTypeSpec.label})
              </dd>
            </>
          ) : null}
          {order.company ? (
            <>
              <dt className="opacity-60">Carrier</dt>
              <dd>{order.company.companyName}</dd>
            </>
          ) : null}
        </dl>
      </div>

      <OrderTrackingMap
        orderId={order.id}
        pickup={toLatLng(order.pickupLat, order.pickupLng)}
        dropoff={toLatLng(order.dropoffLat, order.dropoffLng)}
      />
    </main>
  );
}
