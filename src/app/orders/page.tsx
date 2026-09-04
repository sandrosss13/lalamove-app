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
      // Same shell as the signed-in list below: the background is painted on
      // `main` so it covers the full viewport, because `body` still resolves
      // `--background`, which is near-black under a dark system preference.
      // Both auth states then read as one page rather than two.
      <main className="min-h-screen bg-ink text-paper">
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-8 py-16">
          <div className="rounded-[14px] border border-line bg-surface p-8 text-center">
            <h1 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.025em] text-paper">
              Your orders
            </h1>
            <p className="mt-3 text-[14px] text-muted">
              Sign in to view your orders.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/sign-in"
                className="rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-ink transition-transform hover:-translate-y-0.5"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // This page is the client's own order list. Drivers and logistics companies
  // take and dispatch deliveries on /dashboard instead.
  if (session.user.role !== "CLIENT") {
    redirect("/dashboard");
  }

  // `include` rather than `select`, so every `Order` scalar comes back and the
  // card is free to read another column without this query being edited in
  // step — which is how `serviceLevel` and `serviceLevelAdjustment` reach the
  // price it prints. `vehicle` is narrowed because it is a relation, and a
  // relation is not included unless it is asked for.
  const orders = await prisma.order.findMany({
    where: { clientId: session.user.id },
    include: {
      vehicle: { select: { plateNumber: true, make: true, model: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    // The page background is painted on `main` rather than on the centred
    // column so it covers the full viewport: `body` still resolves
    // `--background`, which is near-black under a dark system preference, and a
    // column-width background would leave that showing down both gutters. Same
    // shape as the booking page this list is styled after.
    <main className="min-h-screen bg-ink text-paper">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 pt-8 pb-16">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.24em] text-accent uppercase">
              Your deliveries
            </p>
            <h1 className="font-display mt-2 text-[2.5rem] leading-none font-semibold tracking-[-0.025em] text-paper">
              Your orders
            </h1>
          </div>
          <Link
            href="/"
            className="text-[14px] font-semibold text-paper transition-colors hover:text-accent"
          >
            ← New order
          </Link>
        </header>

        {orders.length === 0 ? (
          <div className="rounded-[14px] border border-line bg-surface p-8 text-center">
            <p className="text-[14px] text-muted">
              You haven&apos;t placed any orders yet.
            </p>
            <p className="mt-1.5 text-[14px] text-muted">
              Book your first delivery with{" "}
              <span className="font-semibold text-paper">New order</span> above.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order}>
                {/* Tracking only means something once someone is on their way to
                    the pickup, so the link waits for an assigned driver. */}
                {order.driverId !== null &&
                (order.status === OrderStatus.ACCEPTED ||
                  order.status === OrderStatus.IN_TRANSIT) ? (
                  <Link
                    href={`/orders/${order.id}/track`}
                    className="mt-3.5 inline-block text-[14px] font-semibold text-accent transition-colors hover:text-accent-hover"
                  >
                    Track delivery →
                  </Link>
                ) : null}
              </OrderCard>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
