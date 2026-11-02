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
import { useTranslations } from "next-intl";

import type { Translator } from "@/i18n/translator";

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
const SCHEDULED_AT_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

const SCHEDULED_AT_FORMAT = new Intl.DateTimeFormat(
  "en-GB",
  SCHEDULED_AT_OPTIONS,
);

/** The same format in Georgian, for the `/ka` pages. */
const SCHEDULED_AT_FORMAT_KA = new Intl.DateTimeFormat(
  "ka-GE",
  SCHEDULED_AT_OPTIONS,
);

/**
 * `Fri, 5 Sep 2026, 14:30` — the date and time the client picked. Pass the
 * route's `locale` to get the Georgian month and weekday names on `/ka`; with
 * no locale it stays the English form it always was.
 */
export function formatScheduledAt(scheduledAt: Date, locale?: string): string {
  return (
    locale === "ka" ? SCHEDULED_AT_FORMAT_KA : SCHEDULED_AT_FORMAT
  ).format(scheduledAt);
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
 * The helpers booked on top of the driver, counted the way the booking form
 * asks for them (0–4). Pluralised rather than printed as a bare "1 helpers".
 */
export function helperCountLabel(helperCount: number): string {
  if (helperCount === 0) {
    return "No helpers";
  }
  return `${helperCount} ${helperCount === 1 ? "helper" : "helpers"}`;
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
  /**
   * Pricing model v1's stored transport charge (base + distance + time +
   * return allowance, floored for a city trip). Null on a pre-v1 order, which
   * falls back to the subtraction above.
   */
  transportFare?: number | null;
}): number {
  if (typeof order.transportFare === "number") {
    return order.transportFare;
  }
  return order.price - order.helperFee;
}

/**
 * The quoted helper charge split by end — `pickupHelperFee` and
 * `dropoffHelperFee`, stamped at booking since pricing model v1 — or `null`
 * when the order should keep ONE helper line: a pre-v1 order (one crew size,
 * one `helperFee`), or a row whose split does not add up to its `helperFee`
 * (never expected; printing two lines that fail to reconcile against the
 * total would be worse than one line that does).
 */
export function helperFeeSplit(order: {
  tariffVersion: number | null;
  helperFee: number;
  pickupHelperFee: number;
  dropoffHelperFee: number;
}): { pickup: number; dropoff: number } | null {
  if (order.tariffVersion === null || order.helperFee <= 0) {
    return null;
  }
  const sum = order.pickupHelperFee + order.dropoffHelperFee;
  if (Math.abs(sum - order.helperFee) > 0.005) {
    return null;
  }
  return { pickup: order.pickupHelperFee, dropoff: order.dropoffHelperFee };
}

/** The per-location helper columns an order carries (pricing model v1). */
export type OrderHelperLocations = {
  helperCount: number;
  pickupHelpers: number;
  pickupFloor: number;
  pickupCargoElevator: boolean;
  pickupPassengerElevator: boolean;
  dropoffHelpers: number;
  dropoffFloor: number;
  dropoffCargoElevator: boolean;
  dropoffPassengerElevator: boolean;
  /** Null on an order priced before pricing model v1. */
  tariffVersion: number | null;
};

/**
 * One end's helpers in words — `2 helpers · floor 3 · cargo elevator`, or
 * `No helpers` — given a root `t`. The floor and the elevators are only named
 * when someone is there to use them (the stop's Contact Info shows them
 * regardless).
 */
export function helperLocationLabel(
  help: {
    helpers: number;
    floor: number;
    cargoElevator: boolean;
    passengerElevator?: boolean;
  },
  t: Translator,
): string {
  const parts = [t("checkout.helperCount", { count: help.helpers })];
  if (help.helpers > 0) {
    parts.push(
      help.floor === 0
        ? t("checkout.groundFloor")
        : t("checkout.helperFloor", { floor: help.floor }),
    );
    if (help.passengerElevator) {
      parts.push(t("checkout.passengerElevator"));
    }
    if (help.cargoElevator) {
      parts.push(t("checkout.cargoElevator"));
    }
  }
  return parts.join(" · ");
}

/**
 * The pickup and drop-off helper lines for an order, or `null` for a pre-v1
 * order, which recorded one crew size (`helperCount`) and keeps its single
 * "Helpers" row.
 */
export function helperLocationLabels(
  order: OrderHelperLocations,
  t: Translator,
): { pickup: string; dropoff: string } | null {
  if (order.tariffVersion === null) {
    return null;
  }
  return {
    pickup: helperLocationLabel(
      {
        helpers: order.pickupHelpers,
        floor: order.pickupFloor,
        cargoElevator: order.pickupCargoElevator,
        passengerElevator: order.pickupPassengerElevator,
      },
      t,
    ),
    dropoff: helperLocationLabel(
      {
        helpers: order.dropoffHelpers,
        floor: order.dropoffFloor,
        cargoElevator: order.dropoffCargoElevator,
        passengerElevator: order.dropoffPassengerElevator,
      },
      t,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Localised labels                                                           */
/* -------------------------------------------------------------------------- */

/** Message keys for `BODY_TYPE_LABEL`, which stays as the English source. */
const BODY_TYPE_KEY: Record<ChassisType, string> = {
  DRY_BOX: "checkout.bodyType.dryBox",
  REFRIGERATED: "checkout.bodyType.refrigerated",
  OPEN_CHASSIS: "checkout.bodyType.openChassis",
};

/** Message keys for `PAYMENT_METHOD_LABEL`; `CASH` is "Pay later" here too. */
const PAYMENT_METHOD_KEY: Record<PaymentMethodType, string> = {
  CASH: "checkout.paymentMethod.cash",
  CARD: "checkout.paymentMethod.card",
  BANK_TRANSFER: "checkout.paymentMethod.bankTransfer",
};

/** `BODY_TYPE_LABEL[bodyType]` in the reader's language, given a root `t`. */
export function bodyTypeLabel(bodyType: ChassisType, t: Translator): string {
  return t(BODY_TYPE_KEY[bodyType]);
}

/** `PAYMENT_METHOD_LABEL[method]` in the reader's language, given a root `t`. */
export function paymentMethodLabel(
  method: PaymentMethodType,
  t: Translator,
): string {
  return t(PAYMENT_METHOD_KEY[method]);
}

/** `helperCountLabel` in the reader's language (ICU plural), given a root `t`. */
export function localizedHelperCountLabel(
  helperCount: number,
  t: Translator,
): string {
  return t("checkout.helperCount", { count: helperCount });
}

/** Component hook: localised `bodyTypeLabel`, `paymentMethodLabel` and helper count. */
export function useCheckoutLabels() {
  const t = useTranslations();

  return {
    bodyType: (bodyType: ChassisType) => bodyTypeLabel(bodyType, t),
    paymentMethod: (method: PaymentMethodType) => paymentMethodLabel(method, t),
    helperCount: (helperCount: number) =>
      localizedHelperCountLabel(helperCount, t),
    helperLocations: (order: OrderHelperLocations) =>
      helperLocationLabels(order, t),
  };
}
