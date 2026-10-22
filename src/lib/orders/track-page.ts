/**
 * What the order tracking page (`/orders/[id]/track`) shows, and to whom.
 *
 * One page answers two readers — the client who booked the order and the
 * driver assigned to it — and the sections on it are not all for both. This
 * module is the whole of that rule, written once and pinned by
 * `tests/order-track-page.spec.ts`:
 *
 * - **Who is reading.** `resolveTrackPageViewer` decides from the two id
 *   columns. Anyone who is neither — the carrier company's own account, another
 *   driver, another client — is `null`, and the page answers them exactly as it
 *   answers an order that does not exist.
 * - **What they see.** `trackPageSections` turns the viewer, the order's status
 *   and two facts the page has already looked up into the list of sections to
 *   render. The proof of delivery (signature and photos) and the order-details
 *   document are the client's alone; the driver keeps the map they always had
 *   here, and reads their own proof on the job sheet.
 *
 * Deliberately no runtime imports — no `server-only`, no Prisma, no Storage —
 * so the spec can exercise every branch without a database or a browser, the
 * same shape as `src/lib/dashboard/hub/job-sheet-access.ts`. The page does the
 * querying and the URL signing; it asks this module only *whether* to.
 */

import type { OrderStatus } from "@prisma/client";

/** The two readers the tracking page serves. */
export type TrackPageViewer = "CLIENT" | "DRIVER";

/**
 * Which reader `userId` is for this order, or `null` for anyone with no claim
 * on it.
 *
 * The client check comes first: an account that is somehow both (a test
 * account driving its own booking) is shown the client's page, which is the
 * superset — nothing on it is withheld from the person who paid.
 */
export function resolveTrackPageViewer(
  order: { clientId: string | null; driverId: string | null },
  userId: string,
): TrackPageViewer | null {
  if (order.clientId === userId) {
    return "CLIENT";
  }
  if (order.driverId !== null && order.driverId === userId) {
    return "DRIVER";
  }
  return null;
}

/**
 * Statuses with a vehicle on the road (or about to be): the live map and the
 * ETA mean something. Before a driver accepts there is nobody to follow, and
 * after delivery the map would only show where the truck went next.
 */
const LIVE_STATUSES: readonly OrderStatus[] = ["ACCEPTED", "IN_TRANSIT"];

/** Statuses before any driver has taken the order on. */
const WAITING_STATUSES: readonly OrderStatus[] = [
  "INITIATED",
  "PENDING",
  "CLAIMED",
];

/** Whether the live map (and its ETA line) belongs on the page. */
export function isLiveTrackingStatus(status: OrderStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

/**
 * The page's sections, top to bottom after the header, as flags.
 *
 * - `liveMap` — ACCEPTED / IN_TRANSIT, for either reader.
 * - `waitingNotice` / `cancelledNotice` — the one-line panel that stands in for
 *   the map when there is nothing to follow yet, or nothing ever will be.
 * - `delivered` — the completed state's summary in place of the map.
 * - `proofOfDelivery` — the **client only**, once the order is COMPLETED or
 *   as soon as any proof exists (a driver can register photos before closing
 *   the job). A driver reaching this page never gets the client's signed
 *   proof URLs: the page does not even query the proof rows for them.
 * - `serviceDocument` — the **client only** (business or individual, or the
 *   guest who booked), and only when the order has a document at all
 *   (`isOrderDocumentAvailable`) — the same gate the PDF route applies, so
 *   the card never offers a download that answers 404.
 */
export type TrackPageSections = {
  liveMap: boolean;
  waitingNotice: boolean;
  cancelledNotice: boolean;
  delivered: boolean;
  proofOfDelivery: boolean;
  serviceDocument: boolean;
};

export function trackPageSections(input: {
  viewer: TrackPageViewer;
  status: OrderStatus;
  /** A signature or at least one delivery photo is on file. */
  hasProof: boolean;
  /** `isOrderDocumentAvailable(status)`, computed by the caller. */
  documentAvailable: boolean;
}): TrackPageSections {
  const { viewer, status, hasProof, documentAvailable } = input;
  const isClient = viewer === "CLIENT";

  return {
    liveMap: isLiveTrackingStatus(status),
    waitingNotice: WAITING_STATUSES.includes(status),
    cancelledNotice: status === "CANCELLED",
    delivered: status === "COMPLETED",
    proofOfDelivery: isClient && (status === "COMPLETED" || hasProof),
    serviceDocument: isClient && documentAvailable,
  };
}
