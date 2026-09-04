import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  NO_BOOKING_PAYMENT_OPTIONS,
  type BookingPaymentOptions,
} from "@/components/home/payment-methods";

/**
 * What the booking form's payment step needs, resolved on the server: which
 * payment methods admin has switched on, the client's saved cards, and whether
 * the client is a business.
 *
 * All three are deliberately server-resolved rather than fetched by the form.
 *
 * - The **enabled set** is the admin's own switchboard (`PaymentMethodConfig`),
 *   and `POST /api/orders` refuses a method whose row is disabled or missing.
 *   A step that offered one would hand the client an error they cannot act on,
 *   so the filtering has to happen before the markup exists — and there is no
 *   client-facing endpoint that exposes the set, nor should there be.
 * - The **account type** decides whether the BUSINESS-only purchase-order field
 *   renders at all. Deciding that in the browser would mean shipping the field
 *   to every client and hiding it from most, which is a different guarantee
 *   from never rendering it.
 * - The **saved cards** come down with the page so the step's default card is
 *   selected on first paint rather than after a round trip.
 *
 * This is the first non-admin reader of `PaymentMethodConfig`; the model has
 * existed unread since it was added.
 *
 * Nothing here can charge anybody. No gateway is integrated, so a card is
 * display metadata and a chosen method is an intention recorded on the order.
 */
export async function loadBookingPaymentOptions(): Promise<BookingPaymentOptions> {
  const session = await auth.api.getSession({ headers: await headers() });

  // A signed-out visitor gets the marketing page, and a driver or a logistics
  // company gets the provider prompt — none of the three ever renders the
  // booking form, so none of them is worth a query. The branch mirrors
  // `HomeEntry`'s own: whoever is left (a client, or an admin looking at the
  // client surface) is who the form is rendered for.
  if (
    !session ||
    session.user.role === "DRIVER" ||
    session.user.role === "COMPANY"
  ) {
    return NO_BOOKING_PAYMENT_OPTIONS;
  }

  const enabledConfigs = await prisma.paymentMethodConfig.findMany({
    where: { isEnabled: true },
    select: { type: true },
  });

  const enabledPaymentMethods = enabledConfigs.map((config) => config.type);

  // Saved cards and the account type are a client's own; an admin viewing this
  // surface has neither, and `GET /api/saved-cards` says the same thing by
  // refusing a non-client outright.
  if (session.user.role !== "CLIENT") {
    return { ...NO_BOOKING_PAYMENT_OPTIONS, enabledPaymentMethods };
  }

  const [savedCards, clientProfile] = await Promise.all([
    // Default first, then newest first — the same order `GET /api/saved-cards`
    // and the wallet page return, so the list does not reshuffle depending on
    // which read path produced it. `providerToken` is never selected: it is the
    // gateway's own handle for a card and nothing on the client needs it.
    prisma.savedCard.findMany({
      where: { clientId: session.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        brand: true,
        last4: true,
        expMonth: true,
        expYear: true,
        holderName: true,
        isDefault: true,
      },
    }),
    prisma.clientProfile.findUnique({
      where: { userId: session.user.id },
      select: { accountType: true },
    }),
  ]);

  return {
    enabledPaymentMethods,
    savedCards,
    // Absent for a client who has somehow no profile row: an account type that
    // cannot be read is not a business one, and the purchase-order field stays
    // hidden rather than being shown on a guess.
    accountType: clientProfile?.accountType ?? null,
  };
}
