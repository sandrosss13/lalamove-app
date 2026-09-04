/**
 * Presentation helpers for the client's own order surfaces: the order list
 * (`/orders`) and the single-order tracking page (`/orders/[id]/track`).
 *
 * Per-screen by convention rather than shared app-wide —
 * `driver-hub/screens/earnings-format.ts` records the reason: a cross-screen
 * import ties one screen's money formatting to a file another screen is free to
 * change. The two client order surfaces are one screen's worth of vocabulary,
 * so they share this module and nothing beyond it does.
 *
 * `OrderStatus` is imported as a *type*. Prisma's enums are erased at compile
 * time and the `Record` keys below are written as string literals, so a client
 * component importing this module never pulls `@prisma/client`'s runtime into
 * the browser bundle — the same reasoning `@/lib/cargo` documents. The `Record`
 * keys still keep both tables exhaustive: adding a status fails typecheck until
 * it is listed here.
 */
import type { OrderStatus, ServiceLevel } from "@prisma/client";

/**
 * Two decimals, pinned to `en-GB` rather than left to the browser: a client on
 * a `de-DE` locale would otherwise read `₾1.200,50` beside a hard-coded
 * `₾0.40` and see two different currencies.
 */
const GEL_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * `18.4` → `₾18.40`.
 *
 * `Order.price` is already denominated in GEL major units, so nothing is
 * converted or divided here — only formatted.
 */
export function formatGel(amountGel: number): string {
  return `₾${GEL_FORMAT.format(amountGel)}`;
}

/**
 * `OrderStatus` rendered for humans. A lookup rather than a
 * `replace(/_/g, " ")` transform, so both words of every label are written out
 * where a reviewer can read them — the same convention as `ADMIN_ROLE_LABELS`
 * in `admin-shell.tsx`.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CLAIMED: "Claimed",
  ACCEPTED: "Accepted",
  IN_TRANSIT: "In transit",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * `ServiceLevel` in the words the client picked it by on the booking form, so
 * the tier named beside a price on `/orders` is the same word the client chose.
 *
 * A lookup rather than a title-casing transform, for the reason
 * `ORDER_STATUS_LABEL` above is one: adding a tier to the schema must fail
 * typecheck here rather than have a label invented for it.
 */
export const SERVICE_LEVEL_LABEL: Record<ServiceLevel, string> = {
  PRIORITY: "Priority",
  REGULAR: "Regular",
  POOLING: "Pooling",
};

/**
 * Geometry and type treatment shared by every status pill, composed with one
 * tone from `ORDER_STATUS_PILL` at each call site. Split from the tone map so
 * the list card and the tracking page cannot drift apart in shape while
 * agreeing on colour.
 *
 * `inline-block` because the tracking page renders the pill as a bare inline
 * span, where vertical padding on an `inline` box would not reserve any space.
 * Inside the card's flex row the value is blockified anyway, so it is inert
 * there.
 */
export const ORDER_STATUS_PILL_BASE =
  "inline-block rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.06em] uppercase";

/**
 * Per-status tone for the pill.
 *
 * These are Tailwind palette utilities, not landing tokens, because the landing
 * token set carries no semantic status colour at all — the same choice the
 * codebase already makes for this map and for the emerald "Best" badge on the
 * booking form. Do not translate them into `--landing-status-*` tokens.
 *
 * `IN_TRANSIT` is deliberately orange-from-the-palette rather than the brand
 * accent the design handoff assigns it: accent means "selected" everywhere else
 * on these surfaces, and one colour carrying two meanings on the same page is a
 * regression. Orange reads as the live state without spending the accent.
 */
export const ORDER_STATUS_PILL: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  // Violet rather than a second amber: a claimed order is off the open market
  // but not yet dispatched to a driver, so it has to read as its own state.
  CLAIMED: "bg-violet-100 text-violet-800",
  ACCEPTED: "bg-blue-100 text-blue-700",
  IN_TRANSIT: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};
