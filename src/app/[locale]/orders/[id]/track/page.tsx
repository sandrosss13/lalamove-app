import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { resolveTrackPageViewer } from "@/lib/orders/track-page";
import { prisma } from "@/lib/prisma";
import {
  OrderTrackView,
  TRACK_VIEW_ORDER_SELECT,
} from "@/components/orders/order-track-view";
import { CheckoutNotice } from "../../../checkout/checkout-shell";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * `/orders/[id]/track` — one order, followed from booking to proof. The
 * rendering is `OrderTrackView`, shared with the guest route `/track/[token]`;
 * this page owns the session, the query and the ownership check.
 *
 * Two readers reach it: the client who booked the order (from their order
 * list and order page) and the driver assigned to it (from the dashboard).
 * Who sees what is decided in one place, `src/lib/orders/track-page.ts`;
 * this page queries and renders accordingly:
 *
 * 1. **Header and summary** — reference, status, the route, and the one time
 *    that matters for the status (scheduled, on the way since, delivered).
 *    Both readers.
 * 2. **Live map + ETA** while the order is ACCEPTED or IN_TRANSIT. Before a
 *    driver accepts, and after cancellation, a one-line panel says why there
 *    is no map; after delivery there is nothing live left to follow, so the
 *    map gives way to the proof (client) or a "delivery complete" panel
 *    (driver).
 * 3. **Proof of delivery** — the recipient's signature and the drop-off
 *    photos, for the **client only**, once the order is completed (or as soon
 *    as any proof exists). Signed here with `toOrderProof`: five-minute
 *    signed read URLs on the private `delivery-proofs` bucket, the mechanism
 *    the job sheet already uses — never a public object, never a proxy that
 *    outlives the render. The proof rows are not even queried for a driver,
 *    so a driver's render cannot carry the client's URLs; the driver and the
 *    carrier company keep reading their proof on the job sheet, unchanged.
 * 4. **Order-details PDF** — the client (never the driver), paid and
 *    uncancelled orders, the same download block as the order page. Drawn
 *    right under the header and summary (1), above the live map.
 * 5. **Cargo photos** the client attached when booking, as before.
 *
 * Everything readable — the cargo-photo URLs and the proof URLs — is loaded
 * only *after* the ownership check below, and someone else's order is reported
 * exactly like a missing one, so this page cannot be used to probe which order
 * ids exist.
 */
export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const t = await getTranslations("orders.ordersTrack");
  const tShared = await getTranslations("common.shared");

  if (!session) {
    return (
      <CheckoutNotice title={t("trackDelivery")}>
        <p className="mt-3 text-[14px] text-muted">
          {t("pleaseSignInToTrackThis")}
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

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      ...TRACK_VIEW_ORDER_SELECT,
      clientId: true,
      driverId: true,
    },
  });

  const userId = session.user.id;

  // Clients come here from their own order list, providers from their
  // dashboard — /orders redirects a driver or company straight back out again.
  const backHref = session.user.role === "CLIENT" ? "/orders" : "/dashboard";
  const backLabel =
    session.user.role === "CLIENT" ? t("backToOrders") : t("backToDashboard");

  const viewer = order ? resolveTrackPageViewer(order, userId) : null;

  // Someone else's order is reported exactly like a missing one, so this page
  // can't be used to probe which order ids exist.
  if (!order || viewer === null) {
    return (
      <CheckoutNotice title={tShared("orderNotFound")}>
        <div className="mt-6 flex justify-center">
          <Link
            href={backHref}
            className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
          >
            {backLabel}
          </Link>
        </div>
      </CheckoutNotice>
    );
  }

  return (
    <OrderTrackView
      order={order}
      viewer={viewer}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
