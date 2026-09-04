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
 *
 * Keyed in the schema's lifecycle order, and typed `Record<OrderStatus, string>`
 * so it stays exhaustive: `INITIATED` reached this file as a typecheck failure
 * rather than as a blank pill in production, which is the whole point of the
 * annotation. Do not loosen it to `Partial` or to a plain object.
 *
 * The client vocabulary is deliberately narrower than the enum: Initiated,
 * Pending, Accepted, In transit, Completed, Cancelled.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  // Pre-payment: the order exists but is not on the open market. Settlement is
  // instantaneous while Pay later is the only method, so a client will seldom
  // catch this state — it still has to render rather than fall through blank.
  INITIATED: "Initiated",
  PENDING: "Pending",
  // Intentionally *not* "Claimed", and not a mistake to be tidied back into a
  // distinct label. `CLAIMED` means a company has taken the order but has not
  // yet dispatched one of its own drivers — an internal dispatch step. To the
  // client it is the same fact as `PENDING`: no driver yet, nothing to act on.
  // Naming it would only prompt "claimed by whom?". The enum value stays; only
  // this client-facing label collapses. Company and driver surfaces still say
  // "Claimed" and get their vocabulary elsewhere.
  CLAIMED: "Pending",
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
  // Slate is the one entry with no hue, because `INITIATED` is the one state
  // where nothing has happened yet: every other tone here says something is
  // under way, waiting, done or wrong. Neutral therefore reads as earlier and
  // quieter than amber `PENDING` without reading as a warning, and it does not
  // spend the brand accent, which means "selected" on these surfaces for the
  // reason recorded above for `IN_TRANSIT`. slate-600 on slate-100 is 6.9:1,
  // so "quieter" is a step down in colour, not below the contrast floor these
  // 11px uppercase pills need.
  INITIATED: "bg-slate-100 text-slate-600",
  PENDING: "bg-amber-100 text-amber-800",
  // Amber, matching `PENDING`, because `ORDER_STATUS_LABEL` above renders both
  // as "Pending" for the client: two pills reading the same word in two colours
  // would invent a distinction the label deliberately removes. The violet this
  // entry used to carry was justified by `CLAIMED` reading as its own state,
  // which is exactly what no longer holds on client surfaces.
  CLAIMED: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-blue-100 text-blue-700",
  IN_TRANSIT: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};
