import { headers } from "next/headers";
import Link from "next/link";
import { OrderStatus, type Order } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrderCard } from "@/components/order-card";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/** Order statuses that count as "current" (active, not yet resolved). */
const CURRENT_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.IN_TRANSIT,
];

/** Renders one titled group of orders, or an empty-state line when there are none. */
function OrderGroup({ title, orders }: { title: string; orders: Order[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">
        {title} <span className="opacity-60">({orders.length})</span>
      </h3>
      {orders.length === 0 ? (
        <p className="text-sm opacity-70">No orders yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">My account</h1>
        <p className="opacity-70">Please sign in to view your account.</p>
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

  // Drivers have their own deliveries view; this dashboard is client-only.
  if (session.user.role !== "CLIENT") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">My account</h1>
        <p className="opacity-70">This page is for client accounts.</p>
        <div className="flex justify-center">
          <Link
            href="/"
            className="rounded border px-4 py-2 font-medium hover:opacity-70"
          >
            ← Back home
          </Link>
        </div>
      </main>
    );
  }

  const [clientProfile, orders] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.order.findMany({
      where: { clientId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Display name: use the profile's identity when present, otherwise fall back
  // to the account name captured at sign-up.
  const displayName =
    clientProfile?.accountType === "BUSINESS"
      ? (clientProfile.companyName ?? session.user.name)
      : clientProfile?.accountType === "INDIVIDUAL"
        ? `${clientProfile.firstName ?? ""} ${clientProfile.lastName ?? ""}`.trim() ||
          session.user.name
        : session.user.name;

  const currentOrders = orders.filter((order) =>
    CURRENT_STATUSES.includes(order.status),
  );
  const completedOrders = orders.filter(
    (order) => order.status === OrderStatus.COMPLETED,
  );
  const canceledOrders = orders.filter(
    (order) => order.status === OrderStatus.CANCELLED,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">{displayName}</h1>
          <Link
            href="/account/profile"
            className="text-sm font-medium hover:opacity-70"
          >
            {clientProfile ? "My profile" : "Complete verification"} →
          </Link>
        </div>
        <p className="text-sm opacity-60">Account ID: {session.user.id}</p>
      </header>

      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-bold">My orders</h2>
        <OrderGroup title="Current" orders={currentOrders} />
        <OrderGroup title="Completed" orders={completedOrders} />
        <OrderGroup title="Canceled" orders={canceledOrders} />
      </div>
    </main>
  );
}
