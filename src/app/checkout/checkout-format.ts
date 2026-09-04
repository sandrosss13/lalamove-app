/**
 * Presentation helpers for the checkout screen — the review-and-pay page
 * (`/checkout/[id]`) and the confirmation that follows it
 * (`/checkout/[id]/success`).
 *
 * Per-screen by the convention `src/components/driver-hub/screens/earnings-format.ts`
 * records: a cross-screen import ties one screen's vocabulary to a file another
 * screen is free to change. The two checkout pages are one screen's worth, so
 * they share this module and nothing beyond it does.
 *
 * The one deliberate exception is money and the tier name: `formatGel` and
 * `SERVICE_LEVEL_LABEL` are imported from `@/components/orders-format` by both
 * pages, because the total a client is asked to pay here and the total their
 * order list prints afterwards must be the same string, formatted by the same
 * code. A local copy would be a second place for them to drift apart.
 *
 * The Prisma enums are imported as *types* — erased at compile time — and the
 * `Record` keys are written as string literals, so nothing here would drag
 * `@prisma/client`'s runtime into a browser bundle if a client component ever
 * imported it. The annotations still keep both tables exhaustive: adding an enum
 * member fails typecheck until it is named here.
 */

import type { ChassisType, PaymentMethodType } from "@prisma/client";

/**
 * The scheduled pickup, spelled out. `en-GB` and not the runtime's own locale,
 * for the reason `booking-format.ts` records for its money formatters: a
 * hard-coded locale is the only way two figures on one page are guaranteed to
 * read as the same convention.
 *
 * Rendered in the server's timezone, which is what every other server-rendered
 * date on this app already does. Both checkout pages are server components, so
 * there is no client re-render for this string to disagree with.
 */
const SCHEDULED_AT_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `Fri, 5 Sep 2026, 14:30` — the date and time the client picked. */
export function formatScheduledAt(scheduledAt: Date): string {
  return SCHEDULED_AT_FORMAT.format(scheduledAt);
}

/**
 * The distance a booked order was priced at, to two decimals.
 *
 * Two decimals rather than the one a live estimate gets: by this point the
 * figure is a record of what was quoted rather than a moving estimate, so it is
 * printed at the precision the server stored. Grouping is off — a road distance
 * on this map never reaches four digits, and the separator would only invite
 * confusion with the grouped money beside it.
 */
const BOOKED_DISTANCE_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

/** `12.345` → `12.35 km`. */
export function formatBookedDistanceKm(distanceKm: number): string {
  return `${BOOKED_DISTANCE_FORMAT.format(distanceKm)} km`;
}

/**
 * The load space, in the words the booking form offered it by, so the summary
 * names the thing the client actually clicked.
 */
export const BODY_TYPE_LABEL: Record<ChassisType, string> = {
  DRY_BOX: "Dry box",
  REFRIGERATED: "Refrigerated",
  OPEN_CHASSIS: "Open chassis",
};

/**
 * How a settled order says it was paid for.
 *
 * `CASH` reads "Pay later" because that is the only name the client has ever
 * seen it under — the booking flow never shows the enum value, and a
 * confirmation page that suddenly said "Cash" would be describing a choice the
 * client does not recognise making. `BANK_TRANSFER` is unreachable from
 * checkout (see `CHECKOUT_PAYMENT_METHODS` in `POST /api/orders/[id]/pay`) but
 * is named anyway: the `Record` has to stay exhaustive, and an order settled by
 * some later surface must not render blank here.
 */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethodType, string> = {
  CASH: "Pay later",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
};

/**
 * The crew, counted the way the client chose it: the booking form asks for a
 * total of 1–4 people where the first is the driver, while the column stores the
 * *extra* helpers. Pluralised rather than printed as a bare "1 people".
 */
export function crewSizeLabel(helperCount: number): string {
  const size = helperCount + 1;
  return `${size} ${size === 1 ? "person" : "people"}`;
}

/**
 * Everything charged for moving the load, as one figure.
 *
 * Derived by subtracting the helper fee from the quoted fare rather than by
 * adding the base, distance and time components, and the difference is not
 * academic: `price` is floored at the pricing rule's minimum fare, so on a short
 * hop those three sum to *less* than the total. Adding them would print lines
 * that visibly fail to reach the total beneath them; subtracting makes the
 * breakdown reconcile at every distance. Same derivation as the booking form's
 * own breakdown, so the client is shown the same line twice rather than two
 * figures that disagree.
 */
export function transportationCost(order: {
  price: number;
  helperFee: number;
}): number {
  return order.price - order.helperFee;
}
