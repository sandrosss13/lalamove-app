/**
 * The pure decisions behind the client order emails: who gets one, in which
 * language, with which links, and the `OrderEmailData` the renderer is handed.
 * `./send` does the I/O (load the order, translate, render, send) and nothing
 * else; everything it decides is decided here, so
 * `tests/order-emails-send.spec.ts` pins it with no database and no server.
 *
 * No Prisma values, no `next/*`, no env reads: every input is a parameter.
 */

import {
  DEFAULT_LOCALE,
  fromContentLocale,
  type AppLocale,
} from "@/i18n/routing";
import type {
  OrderEmailData,
  OrderEmailKind,
  OrderEmailStop,
  RenderedOrderEmail,
} from "@/lib/email/order-emails/types";
import type { EmailMessage } from "@/lib/email/sender";
import { adminOrderTotalGel } from "@/lib/admin/orders-filters";
import { isPhonePlaceholderEmail } from "@/lib/phone-placeholder-email";

/**
 * The order as `./send` loads it (`ORDER_EMAIL_SELECT` there) — a plain
 * object, so a spec can build one by hand. Field names match the Prisma
 * columns one to one.
 */
export type OrderEmailSource = {
  id: string;
  reference: string;
  /** `Order.locale` — `ContentLocale`, set at pay. */
  locale: "KA" | "EN" | null;
  clientId: string | null;
  client: {
    email: string;
    deactivatedAt: Date | null;
    clientProfile: { firstName: string | null } | null;
  } | null;
  guestEmail: string | null;
  guestFirstName: string | null;

  pickupWindowStart: Date | null;
  pickupWindowEnd: Date | null;
  /** The single booked instant; stands in for a missing window start. */
  scheduledAt: Date | null;

  pickupAddress: string;
  pickupFloor: number;
  pickupPassengerElevator: boolean;
  pickupCargoElevator: boolean;
  dropoffAddress: string;
  dropoffFloor: number;
  dropoffPassengerElevator: boolean;
  dropoffCargoElevator: boolean;

  helperCount: number;
  items: { label: string; quantity: number }[];
  paymentMethodType: "CARD" | "CASH" | "BANK_TRANSFER" | null;
  payment: { status: string } | null;

  price: number;
  serviceLevelAdjustment: number;
  overtimeFee: number;
  helperOvertimeFee: number;

  completedAt: Date | null;
  receivedBy: string | null;

  vehicle: {
    make: string | null;
    model: string | null;
    plateNumber: string | null;
  } | null;
};

/** Why no email was sent. Logged with the order id, never an address. */
export type OrderEmailSkipReason =
  | "ORDER_NOT_FOUND"
  | "NO_ADDRESS"
  | "PHONE_PLACEHOLDER_ADDRESS"
  | "ACCOUNT_DEACTIVATED"
  | "EMAIL_UNCONFIGURED";

export type OrderEmailRecipient =
  | { ok: true; to: string; firstName: string | null; isGuest: boolean }
  | { ok: false; reason: OrderEmailSkipReason };

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";

  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Who the email goes to. An account order goes to the account's address only —
 * never a phone account's placeholder (`isPhonePlaceholderEmail`), and never a
 * deactivated (anonymised) account. A guest order (`clientId: null`) goes to
 * the `guestEmail` written at pay. No fallback between the two: `guestEmail`
 * is only ever written for guests.
 */
export function orderEmailRecipient(
  source: Pick<
    OrderEmailSource,
    "clientId" | "client" | "guestEmail" | "guestFirstName"
  >,
): OrderEmailRecipient {
  if (source.clientId !== null) {
    const client = source.client;

    if (!client) {
      return { ok: false, reason: "NO_ADDRESS" };
    }

    if (client.deactivatedAt !== null) {
      return { ok: false, reason: "ACCOUNT_DEACTIVATED" };
    }

    const email = nonEmpty(client.email);

    if (email === null) {
      return { ok: false, reason: "NO_ADDRESS" };
    }

    if (isPhonePlaceholderEmail(email)) {
      return { ok: false, reason: "PHONE_PLACEHOLDER_ADDRESS" };
    }

    return {
      ok: true,
      to: email,
      firstName: nonEmpty(client.clientProfile?.firstName),
      isGuest: false,
    };
  }

  const email = nonEmpty(source.guestEmail);

  if (email === null) {
    return { ok: false, reason: "NO_ADDRESS" };
  }

  return {
    ok: true,
    to: email,
    firstName: nonEmpty(source.guestFirstName),
    isGuest: true,
  };
}

/**
 * The email's language: the one stored on the order at pay, else the request's
 * (only the client-cancel path passes one — the client is the requester there,
 * and an unpaid order has no stored locale yet), else Georgian.
 */
export function orderEmailLocale(
  orderLocale: OrderEmailSource["locale"],
  requestLocale?: AppLocale | null,
): AppLocale {
  return fromContentLocale(orderLocale) ?? requestLocale ?? DEFAULT_LOCALE;
}

/**
 * The email's links, on the client host. See `OrderEmailBase["links"]`:
 *
 * - track: registered → `/{locale}/orders/{id}/track`; guest →
 *   `/{locale}/track/{rawToken}`, and only in ORDER_CONFIRMED with a token in
 *   hand (it exists only in the pay request); otherwise null.
 * - order: registered only.
 * - receipt: registered only, ORDER_DELIVERED only.
 * - bookAgain: always `/{locale}`.
 */
export function orderEmailLinks(input: {
  origin: string;
  locale: AppLocale;
  orderId: string;
  kind: OrderEmailKind;
  isGuest: boolean;
  guestToken?: string | null;
}): OrderEmailData["links"] {
  const origin = input.origin.replace(/\/+$/, "");
  const base = `${origin}/${input.locale}`;
  const id = encodeURIComponent(input.orderId);

  if (input.isGuest) {
    const token =
      input.kind === "ORDER_CONFIRMED" ? nonEmpty(input.guestToken) : null;

    return {
      track: token ? `${base}/track/${encodeURIComponent(token)}` : null,
      order: null,
      receipt: null,
      bookAgain: base,
    };
  }

  return {
    track: `${base}/orders/${id}/track`,
    order: `${base}/orders/${id}`,
    receipt:
      input.kind === "ORDER_DELIVERED"
        ? `${origin}/api/orders/${id}/waybill/pdf?lang=${input.locale}`
        : null,
    bookAgain: base,
  };
}

function roundGel(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * What the client was charged at checkout: `price + serviceLevelAdjustment`,
 * rounded to cents — the same sum `POST /api/orders/[id]/pay` writes into
 * `Payment.amount`. Overtime is not in it; it is settled at completion.
 */
export function confirmedTotalGel(
  source: Pick<OrderEmailSource, "price" | "serviceLevelAdjustment">,
): number {
  return roundGel(source.price + source.serviceLevelAdjustment);
}

/** The overtime part of the final total: transport plus helper overtime. */
export function overtimeGel(
  source: Pick<OrderEmailSource, "overtimeFee" | "helperOvertimeFee">,
): number {
  return roundGel(source.overtimeFee + source.helperOvertimeFee);
}

function stop(
  address: string,
  floor: number,
  passengerElevator: boolean,
  cargoElevator: boolean,
): OrderEmailStop {
  return { address, floor, passengerElevator, cargoElevator };
}

export type BuildOrderEmailInput = {
  kind: OrderEmailKind;
  source: OrderEmailSource;
  recipient: { firstName: string | null; isGuest: boolean };
  locale: AppLocale;
  links: OrderEmailData["links"];
  supportPhone: string | null;
  /** The configured reply address (`getEmailReplyTo()`), or null for none. */
  replyTo: string | null;
  /** Localised `vehicleTypeSpecLabel`, or null. */
  vehicleLabel: string | null;
  /** DRIVER_ASSIGNED: the carrying company's name, or null. */
  companyName?: string | null;
  /** ORDER_CANCELLED: who cancelled. Defaults to CARRIER. */
  cancelledBy?: "CLIENT" | "CARRIER";
};

/**
 * `OrderEmailData` for one kind. Returns null only for ORDER_DELIVERED on an
 * order with no `completedAt` — the one field that kind cannot do without.
 */
export function buildOrderEmailData(
  input: BuildOrderEmailInput,
): OrderEmailData | null {
  const { source } = input;
  const base = {
    locale: input.locale,
    reference: source.reference,
    firstName: input.recipient.firstName,
    isGuest: input.recipient.isGuest,
    pickupWindowStart: source.pickupWindowStart ?? source.scheduledAt,
    pickupWindowEnd: source.pickupWindowEnd,
    pickup: stop(
      source.pickupAddress,
      source.pickupFloor,
      source.pickupPassengerElevator,
      source.pickupCargoElevator,
    ),
    dropoff: stop(
      source.dropoffAddress,
      source.dropoffFloor,
      source.dropoffPassengerElevator,
      source.dropoffCargoElevator,
    ),
    links: input.links,
    supportPhone: input.supportPhone,
    canReply: nonEmpty(input.replyTo) !== null,
  };

  switch (input.kind) {
    case "ORDER_CONFIRMED":
      return {
        ...base,
        kind: "ORDER_CONFIRMED",
        vehicleLabel: input.vehicleLabel,
        helperCount: source.helperCount,
        items: source.items.map(({ label, quantity }) => ({ label, quantity })),
        paymentMethod: source.paymentMethodType,
        paid: source.payment?.status === "PAID",
        totalGel: confirmedTotalGel(source),
      };
    case "DRIVER_ASSIGNED":
      return {
        ...base,
        kind: "DRIVER_ASSIGNED",
        vehicleLabel: input.vehicleLabel,
        vehicle: {
          make: nonEmpty(source.vehicle?.make),
          model: nonEmpty(source.vehicle?.model),
          plate: nonEmpty(source.vehicle?.plateNumber),
        },
        companyName: nonEmpty(input.companyName),
      };
    case "ORDER_DELIVERED":
      if (!source.completedAt) {
        return null;
      }

      return {
        ...base,
        kind: "ORDER_DELIVERED",
        completedAt: source.completedAt,
        receivedBy: nonEmpty(source.receivedBy),
        totalGel: adminOrderTotalGel(source),
        overtimeGel: overtimeGel(source),
      };
    case "ORDER_CANCELLED":
      return {
        ...base,
        kind: "ORDER_CANCELLED",
        cancelledBy: input.cancelledBy ?? "CARRIER",
        wasPaid: source.payment?.status === "PAID",
      };
  }
}

/** Resend idempotency key: one email of each kind per order. */
export function orderEmailIdempotencyKey(
  kind: OrderEmailKind,
  orderId: string,
): string {
  return `order-email/${kind}/${orderId}`;
}

/**
 * The message handed to the sender: the rendered email, the idempotency key,
 * and `replyTo` only when a reply address is configured.
 */
export function orderEmailMessage(input: {
  to: string;
  rendered: RenderedOrderEmail;
  kind: OrderEmailKind;
  orderId: string;
  replyTo: string | null;
}): EmailMessage {
  const replyTo = nonEmpty(input.replyTo);

  return {
    to: input.to,
    ...input.rendered,
    idempotencyKey: orderEmailIdempotencyKey(input.kind, input.orderId),
    ...(replyTo ? { replyTo } : {}),
  };
}
