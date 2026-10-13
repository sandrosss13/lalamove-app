import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { guestTokenWhere } from "@/lib/orders/guest-access";
import { prisma } from "@/lib/prisma";
import {
  OrderTrackView,
  TRACK_VIEW_ORDER_SELECT,
} from "@/components/orders/order-track-view";
import { CheckoutNotice } from "../../checkout/checkout-shell";

// Prisma access per request; a tracking page is never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // A private link: never a search result, and never handed on as a referrer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * `/track/[token]` — a guest's private tracking link.
 *
 * A guest (someone who booked without an account) is shown this link on the
 * success page. The token in it is the only credential: the order is looked
 * up by the token's hash with `guestTokenWhere`, which only ever matches an
 * order that has no client account, so the link can never open an account
 * order. No session is consulted — the link works from any device.
 *
 * The rendering is the same `OrderTrackView` the signed-in route uses, as the
 * `CLIENT` viewer (the guest is the person who booked and paid). A token that
 * matches nothing gets the same notice the checkout pages give a missing
 * order, so the route cannot be used to test tokens beyond yes/no.
 */
export default async function GuestTrackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const order = await prisma.order.findFirst({
    // base64url, so the segment arrives exactly as minted — nothing to decode.
    where: guestTokenWhere(token),
    select: TRACK_VIEW_ORDER_SELECT,
  });

  if (!order) {
    const t = await getTranslations("checkout.guestTrack");
    const tShared = await getTranslations("common.shared");

    return (
      <CheckoutNotice title={tShared("orderNotFound")}>
        <p className="mt-3 text-[14px] text-muted">{t("linkNotRecognised")}</p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/"
            className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
          >
            {t("backToHome")}
          </Link>
        </div>
      </CheckoutNotice>
    );
  }

  const t = await getTranslations("checkout.guestTrack");

  return (
    <OrderTrackView
      order={order}
      viewer="CLIENT"
      isBusinessClient={false}
      backHref="/"
      backLabel={t("backToHome")}
      guestToken={token}
    />
  );
}
