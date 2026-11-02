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
 *
 * **"Pay later" (`CASH`) is a business arrangement.** An INDIVIDUAL client —
 * and a client whose profile row cannot be read, who is treated as one — never
 * gets it, and neither does a **guest** (a signed-out visitor checking out an
 * order they booked without an account), who is offered a one-off card and
 * nothing else. `POST /api/orders/[id]/pay` refuses `CASH` from both, so this
 * is the list matching what the server will take, not the guarantee.
 */
export async function loadBookingPaymentOptions(): Promise<BookingPaymentOptions> {
  const session = await auth.api.getSession({ headers: await headers() });

  // A driver or a logistics company gets the provider prompt and never renders
  // the booking form or checkout, so neither is worth a query. Whoever is left
  // (a client, a guest, or an admin looking at the client surface) is who the
  // payment step is rendered for.
  if (session?.user.role === "DRIVER" || session?.user.role === "COMPANY") {
    return NO_BOOKING_PAYMENT_OPTIONS;
  }

  // A guest: card only — a one-off card typed at checkout, never saved, so
  // there are no saved cards to list — and treated as an individual, which is
  // what keeps the BUSINESS-only purchase-order field hidden.
  if (!session) {
    const cardConfig = await prisma.paymentMethodConfig.findUnique({
      where: { type: "CARD" },
      select: { isEnabled: true },
    });

    return {
      enabledPaymentMethods: cardConfig?.isEnabled ? ["CARD"] : [],
      savedCards: [],
      accountType: "INDIVIDUAL",
    };
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

  const accountType = clientProfile?.accountType ?? null;

  return {
    // "Pay later" is for business accounts only — see this loader's doc
    // comment. An unreadable account type is not a business one.
    enabledPaymentMethods:
      accountType === "BUSINESS"
        ? enabledPaymentMethods
        : enabledPaymentMethods.filter((method) => method !== "CASH"),
    savedCards,
    // Absent for a client who has somehow no profile row: an account type that
    // cannot be read is not a business one, and the purchase-order field stays
    // hidden rather than being shown on a guess.
    accountType,
  };
}
