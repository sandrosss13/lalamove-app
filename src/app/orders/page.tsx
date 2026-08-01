import { headers } from "next/headers";
import Link from "next/link";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AcceptOrderButton } from "@/components/accept-order-button";
import { DriverStatusToggle } from "@/components/driver-status-toggle";
import { OrderCard } from "@/components/order-card";

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

  // Drivers get an availability toggle, but only once they have a profile —
  // there is no `isOnline` flag to drive it before then.
  const driverProfile = isDriver
    ? await prisma.driverProfile.findUnique({
        where: { userId },
        select: { isOnline: true },
      })
    : null;

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

      {driverProfile ? (
        <DriverStatusToggle initialIsOnline={driverProfile.isOnline} />
      ) : null}

      {orders.length === 0 ? (
        <p className="opacity-70">
          {isDriver
            ? "No deliveries available right now."
            : "You haven't placed any orders yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order}>
              {/* Drivers can claim only orders that are still open (PENDING and
                  unassigned); their own accepted deliveries just show status. */}
              {isDriver &&
              order.status === OrderStatus.PENDING &&
              order.driverId === null ? (
                <AcceptOrderButton orderId={order.id} />
              ) : null}
              {order.driverId !== null &&
              (order.status === OrderStatus.ACCEPTED ||
                order.status === OrderStatus.IN_TRANSIT) ? (
                <Link
                  href={`/orders/${order.id}/track`}
                  className="mt-3 inline-block text-sm font-medium hover:opacity-70"
                >
                  Track delivery →
                </Link>
              ) : null}
            </OrderCard>
          ))}
        </ul>
      )}
    </main>
  );
}
