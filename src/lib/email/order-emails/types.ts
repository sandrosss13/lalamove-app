/**
 * The contract between the two halves of the client order emails:
 *
 * - `@/lib/email/order-emails/render` — pure: `OrderEmailData` + locale in,
 *   `{ subject, html, text }` out. No Prisma, no env, no `next/*`.
 * - `@/lib/email/order-emails/send` — loads the order, decides whether and to
 *   whom to send, builds `OrderEmailData`, renders, hands it to the sender.
 *
 * Every value here is already safe to show to the client (no driver payout,
 * commission, driver name or phone). Dates are real `Date`s and money is GEL
 * numbers: formatting belongs to the renderer, in the reader's locale and the
 * Asia/Tbilisi time zone.
 */

import type { AppLocale } from "@/i18n/routing";

export type OrderEmailKind =
  "ORDER_CONFIRMED" | "DRIVER_ASSIGNED" | "ORDER_DELIVERED" | "ORDER_CANCELLED";

export type OrderEmailStop = {
  address: string;
  /** null when not given. 0 = ground floor. */
  floor: number | null;
  passengerElevator: boolean;
  cargoElevator: boolean;
};

export type OrderEmailBase = {
  locale: AppLocale;
  /** e.g. "GE-48210". */
  reference: string;
  /** The client's (or guest's) first name, or null — the greeting then drops it. */
  firstName: string | null;
  isGuest: boolean;
  /** Pickup window; `pickupWindowEnd` may be null (exact time). */
  pickupWindowStart: Date | null;
  pickupWindowEnd: Date | null;
  pickup: OrderEmailStop;
  dropoff: OrderEmailStop;
  links: {
    /**
     * Tracking page. Registered client: /{locale}/orders/{id}/track. Guest:
     * /{locale}/track/{rawToken} — only in ORDER_CONFIRMED (the raw token
     * exists only at pay time); null in later guest emails, which then tell the
     * guest to use the link from the booking email.
     */
    track: string | null;
    /** Registered client's order page (edit/cancel); null for guests. */
    order: string | null;
    /** Order-details PDF; registered clients only, ORDER_DELIVERED only. */
    receipt: string | null;
    /** /{locale} on the client host — "Book again". */
    bookAgain: string;
  };
  /** CLIENT_SUPPORT_PHONE, or null when unset (the line is then omitted). */
  supportPhone: string | null;
  /**
   * Whether a reply reaches someone: true only when `EMAIL_REPLY_TO` is
   * configured (the message then carries it as Reply-To). False, the copy never
   * says "reply to this email" — `EMAIL_FROM` is a no-reply address — and
   * falls back to the phone, or drops the line when there is no phone either.
   */
  canReply: boolean;
};

export type OrderConfirmedData = OrderEmailBase & {
  kind: "ORDER_CONFIRMED";
  /** Localised vehicle type label, e.g. "Van · up to 1.5 t"; null if none. */
  vehicleLabel: string | null;
  /** Extra helpers beyond the driver (Order.helperCount), 0–3. */
  helperCount: number;
  items: { label: string; quantity: number }[];
  paymentMethod: "CARD" | "CASH" | "BANK_TRANSFER" | null;
  paid: boolean;
  /** Amount charged at checkout, GEL. */
  totalGel: number;
};

export type DriverAssignedData = OrderEmailBase & {
  kind: "DRIVER_ASSIGNED";
  vehicleLabel: string | null;
  /** The assigned vehicle; any part may be null. */
  vehicle: { make: string | null; model: string | null; plate: string | null };
  /** Logistics company name when a company carries it, else null. */
  companyName: string | null;
};

export type OrderDeliveredData = OrderEmailBase & {
  kind: "ORDER_DELIVERED";
  completedAt: Date;
  /** Who signed for it (Order.receivedBy), or null. */
  receivedBy: string | null;
  /** Final total incl. overtime, GEL. */
  totalGel: number;
  /** Overtime part of the total, GEL; 0 when none (the line is then omitted). */
  overtimeGel: number;
};

export type OrderCancelledData = OrderEmailBase & {
  kind: "ORDER_CANCELLED";
  /** CLIENT: they cancelled it themselves. CARRIER: the logistics company did. */
  cancelledBy: "CLIENT" | "CARRIER";
  /** A payment had been taken — the email then points to support for a refund. */
  wasPaid: boolean;
};

export type OrderEmailData =
  | OrderConfirmedData
  | DriverAssignedData
  | OrderDeliveredData
  | OrderCancelledData;

export type RenderedOrderEmail = {
  subject: string;
  html: string;
  text: string;
};
