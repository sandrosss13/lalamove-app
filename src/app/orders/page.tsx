import { headers } from "next/headers";
import Link from "next/link";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AcceptOrderButton } from "@/components/accept-order-button";

/** Tailwind classes per order status for a small colour-coded badge. */
const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  ACCEPTED: "bg-blue-100 text-blue-800",
  IN_TRANSIT: "bg-purple-100 text-purple-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">Your orders</h1>
        <p className="opacity-70">Please sign in to view your orders.</p>
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

  const { id: userId, role } = session.user;
  const isDriver = role === "DRIVER";

  // Clients see their own orders; drivers see open jobs plus their deliveries.
  const orders = await prisma.order.findMany({
    where: isDriver
      ? {
          OR: [
            { status: OrderStatus.PENDING, driverId: null },
            { driverId: userId },
          ],
        }
      : { clientId: userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {isDriver ? "Available & assigned deliveries" : "Your orders"}
        </h1>
        <Link href="/" className="text-sm font-medium hover:opacity-70">
          ← New order
        </Link>
      </div>

      {orders.length === 0 ? (
        <p className="opacity-70">
          {isDriver
            ? "No deliveries available right now."
            : "You haven't placed any orders yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded border p-4">
              <div className="flex items-center justify-between">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status]}`}
                >
                  {order.status}
                </span>
                <span className="text-sm font-semibold">
                  ${order.price.toFixed(2)}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="opacity-60">From</dt>
                <dd>{order.pickupAddress}</dd>
                <dt className="opacity-60">To</dt>
                <dd>{order.dropoffAddress}</dd>
                <dt className="opacity-60">Package</dt>
                <dd>{order.packageType}</dd>
                <dt className="opacity-60">Distance</dt>
                <dd>{order.distanceKm.toFixed(2)} km</dd>
              </dl>

              {/* Drivers can claim only orders that are still open (PENDING and
                  unassigned); their own accepted deliveries just show status. */}
              {isDriver &&
              order.status === OrderStatus.PENDING &&
              order.driverId === null ? (
                <AcceptOrderButton orderId={order.id} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
