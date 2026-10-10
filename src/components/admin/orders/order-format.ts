/**
 * Presentation helpers for the back office's Orders section (`/admin/orders`
 * and `/admin/orders/[id]`).
 *
 * Per-screen rather than borrowed from `@/components/orders-format`, for the
 * reason that module records: a cross-screen import ties one screen's
 * vocabulary to a file another screen is free to change. It matters here in
 * substance, too — the client's surfaces deliberately collapse `CLAIMED` into
 * "Pending", while staff need to see it as its own dispatch step.
 *
 * Every Prisma import is type-only, so nothing of `@prisma/client`'s runtime is
 * pulled in; the `Record` annotations keep every table exhaustive.
 */
import type {
  ChassisType,
  ClientAccountType,
  OrderStatus,
  PaymentMethodType,
  PaymentStatus,
} from "@prisma/client";

/**
 * Two decimals, pinned to `en-GB` so the figure reads the same in both
 * locales — the convention every other `formatGel` in the app follows.
 */
const GEL_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `18.4` → `₾18.40`. Amounts are already GEL major units. */
export function formatGel(amountGel: number): string {
  return `₾${GEL_FORMAT.format(amountGel)}`;
}

/** Created/scheduled timestamps: date and time, in the request's time zone. */
export const ADMIN_ORDER_DATE_TIME_FORMAT = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const;

/** `admin.adminOrders.status.*` key for each status. */
export const ADMIN_ORDER_STATUS_KEYS: Record<OrderStatus, string> = {
  INITIATED: "admin.adminOrders.status.initiated",
  PENDING: "admin.adminOrders.status.pending",
  CLAIMED: "admin.adminOrders.status.claimed",
  ACCEPTED: "admin.adminOrders.status.accepted",
  IN_TRANSIT: "admin.adminOrders.status.inTransit",
  COMPLETED: "admin.adminOrders.status.completed",
  CANCELLED: "admin.adminOrders.status.cancelled",
};

/**
 * Per-status tone for the status `Badge`, layered over its `outline` variant.
 * Tailwind palette utilities, as on the client's pills, but with `CLAIMED`
 * given its own violet: on this surface it is a distinct state.
 */
export const ADMIN_ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  INITIATED: "border-transparent bg-slate-100 text-slate-700",
  PENDING: "border-transparent bg-amber-100 text-amber-800",
  CLAIMED: "border-transparent bg-violet-100 text-violet-700",
  ACCEPTED: "border-transparent bg-blue-100 text-blue-700",
  IN_TRANSIT: "border-transparent bg-orange-100 text-orange-700",
  COMPLETED: "border-transparent bg-emerald-100 text-emerald-700",
  CANCELLED: "border-transparent bg-red-100 text-red-700",
};

/** `ChassisType` → its existing `common.shared` label key. */
export const CHASSIS_TYPE_KEYS: Record<ChassisType, string> = {
  DRY_BOX: "common.shared.dryBox",
  REFRIGERATED: "common.shared.refrigeratedVehicle",
  OPEN_CHASSIS: "common.shared.openChassis",
};

/** `ClientAccountType` → its existing `common.shared` label key. */
export const CLIENT_ACCOUNT_TYPE_KEYS: Record<ClientAccountType, string> = {
  INDIVIDUAL: "common.shared.individual",
  BUSINESS: "common.shared.business",
};

/** `PaymentMethodType` → `admin.adminOrders.paymentMethod.*`. */
export const PAYMENT_METHOD_TYPE_KEYS: Record<PaymentMethodType, string> = {
  CASH: "admin.adminOrders.paymentMethod.cash",
  CARD: "admin.adminOrders.paymentMethod.card",
  BANK_TRANSFER: "admin.adminOrders.paymentMethod.bankTransfer",
};

/** `PaymentStatus` → `admin.adminOrders.paymentStatus.*`. */
export const PAYMENT_STATUS_KEYS: Record<PaymentStatus, string> = {
  PENDING: "admin.adminOrders.paymentStatus.pending",
  PAID: "admin.adminOrders.paymentStatus.paid",
  FAILED: "admin.adminOrders.paymentStatus.failed",
  REFUNDED: "admin.adminOrders.paymentStatus.refunded",
};
