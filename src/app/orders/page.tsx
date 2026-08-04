import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  // This page is the client's own order list. Drivers and logistics companies
  // take and dispatch deliveries on /dashboard instead.
  if (session.user.role !== "CLIENT") {
    redirect("/dashboard");
  }

  const orders = await prisma.order.findMany({
    where: { clientId: session.user.id },
    include: {
      vehicle: { select: { plateNumber: true, make: true, model: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Your orders</h1>
        <Link href="/" className="text-sm font-medium hover:opacity-70">
          ← New order
        </Link>
      </div>

      {orders.length === 0 ? (
        <p className="opacity-70">You haven&apos;t placed any orders yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order}>
              {/* Tracking only means something once someone is on their way to
                  the pickup, so the link waits for an assigned driver. */}
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
