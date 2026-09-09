/**
 * Everything the driver's **Job sheet** (`/dashboard/jobs/[id]`) renders for one
 * order, fetched and shaped in one server pass.
 *
 * ## Why a third view model
 *
 * The hub already has two `Order` view models and neither one fits this screen,
 * because they were each cut for a different question:
 *
 * - `HubJob` (`./jobs.ts`) answers *"what happened on this job?"* — contacts,
 *   the three real timestamps and the two payout columns — and carries **no
 *   cargo at all**. A driver standing at a loading bay needs to know it is 480 kg
 *   on four pallets before they open the shutter.
 * - `HubLoad` (`src/components/driver-hub/screens/loads-context.tsx`, mirroring
 *   `LoadBoardItem`) answers *"should I take this?"* — cargo, windows and the
 *   payout — and carries **no timeline and no raw status**. It serialises status
 *   as `"available" | "claimed" | "mine"`, which is a fact about the *board*,
 *   not about the order.
 *
 * The job sheet needs the union, so this module is the union: `HubLoad`'s stops
 * and cargo, `HubJob`'s timeline and money, and the one field neither exposes.
 *
 * ## The raw status, and why it is the point
 *
 * `toHubJobStatus` in `./jobs.ts` collapses `PENDING`, `CLAIMED` and `ACCEPTED`
 * into a single word, "Scheduled" — correct for a history table, where the
 * difference between them is dispatch mechanics nobody is acting on. It is
 * exactly wrong here. `POST /api/orders/[id]/start` refuses anything that is not
 * `ACCEPTED` and `POST /api/orders/[id]/complete` refuses anything that is not
 * `IN_TRANSIT`, so the distinction the history screen is right to discard is the
 * distinction that decides which of the two buttons this screen may offer. A
 * sheet built on "Scheduled" would show `Start delivery` on a `PENDING` order
 * and collect a 409 for it.
 *
 * So `HubJobSheet.status` is `OrderStatus` itself, unmapped. Presenting it —
 * "In transit", the pill tone — is the screen's job, and `hubStatusTone()`
 * already normalises the raw enum spelling.
 *
 * ## The money rule
 *
 * **A driver sees `driverPayout` and `overtimeDriverPayout`, and nothing else.**
 * `price`, `baseFare`, `distanceFare`, `timeFare`, `helperFee`, `overtimeFee`
 * and `serviceLevelAdjustment` are what the *client* pays; this screen answers
 * the carrier. They are absent from the `select` below rather than dropped from
 * the result afterwards, which is what makes the leak unrepresentable instead of
 * merely avoided: a column never asked for is absent from the type Prisma
 * infers, so a future line reaching for `order.price` here fails the build. The
 * same reasoning, at greater length, is in
 * `src/lib/order-response-select.ts` (`CARRIER_ORDER_PARTY_SELECT`) and in
 * `LOADS_SELECT` in `src/app/api/loads/route.ts`.
 *
 * Note that dropping `price` alone would not be a redaction: `price` is
 * `baseFare + distanceFare + timeFare + helperFee` floored at the rule's
 * minimum, so the components reconstruct it. All seven leave together.
 *
 * ## Server-only, plain data
 *
 * This module talks to Prisma directly and the object it returns crosses into a
 * `"use client"` tree, so — exactly as the sibling loaders in this directory do
 * — every timestamp is an ISO string and never a `Date`, every enum is the bare
 * string Prisma stores, and no Prisma model instance is handed out. Client
 * components import the type with `import type`, which TypeScript erases, so the
 * `server-only` boundary above is never crossed at runtime.
 */
import "server-only";

import type { OrderStatus } from "@prisma/client";

import { formatCity } from "@/lib/format-city";
import { prisma } from "@/lib/prisma";

/**
 * The `Order` columns the job sheet may read, and the only ones it may return.
 *
 * A fourth route-local allowlist rather than a reuse of
 * `CARRIER_ORDER_PARTY_SELECT`, for the reason `src/lib/order-response-select.ts`
 * gives for the two listing endpoints keeping their own: that constant is the
 * shape the six *lifecycle* endpoints answer with, and this screen needs a
 * different set — it wants the cargo and window columns that shape has never
 * carried, and does not want `clientId`, `paymentMethodType` or `vehicleId`.
 * Sharing a list between two surfaces that want different columns ends with the
 * union of both, which is how a shape stops being an allowlist.
 *
 * **The seven client-side money columns are deliberately absent**, and this is
 * the list to check against if that ever looks like an oversight: `price`,
 * `baseFare`, `distanceFare`, `timeFare`, `helperFee`, `overtimeFee`,
 * `serviceLevelAdjustment`. So is `commissionRate` — an internal figure no party
 * to a job has business with — and so are `savedCardId` and `purchaseOrderRef`,
 * the client's payment instrument and their finance team's internal reference.
 *
 * `driverId` and `status` are read for the ownership and gating checks below.
 * `driverId` never reaches `HubJobSheet`: the loader only ever returns a row
 * whose `driverId` equals the caller, so the field would carry no information
 * the reader does not already have.
 */
const JOB_SHEET_SELECT = {
  id: true,
  reference: true,
  status: true,
  // Read to authorise, not to render. See the doc comment above.
  driverId: true,

  // Stops. `pickupLat`/`pickupLng` are null on every seeded order and on any
  // address the geocode lookup could not resolve, so the screen must treat a
  // missing coordinate as a first-class state rather than an error — it is what
  // decides whether a "Navigate" affordance can be offered at all.
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  pickupCity: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  dropoffCity: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  // The load's own pickup-to-dropoff trip, which the route section prints under
  // the two stops. Not a money column and not derived from one.
  distanceKm: true,

  // Cargo — the half `HubJob` has never carried.
  cargoCategory: true,
  description: true,
  packagingDescription: true,
  itemQuantity: true,
  cargoWeightKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
  handlingTags: true,
  helperCount: true,
  bodyType: true,

  // Timing. `createdAt`, `inTransitAt` and `completedAt` are the timeline; the
  // other three are the client's requested slot and its refinements.
  createdAt: true,
  scheduledAt: true,
  pickupWindowStart: true,
  pickupWindowEnd: true,
  deliveryDeadline: true,
  inTransitAt: true,
  completedAt: true,

  // Money — the carrier's two columns, and the two facts recorded at completion
  // that explain the second of them.
  driverPayout: true,
  overtimeDriverPayout: true,
  waitingMinutes: true,
  receivedBy: true,
} as const;

/**
 * One order as its assigned driver works from it.
 *
 * Every timestamp is an ISO string, every enum is the bare stored string, and
 * there is no `Date` and no Prisma model instance anywhere in it — this whole
 * object is passed into `"use client"` components.
 *
 * **There is no `price` field here and there must never be one**, nor any of the
 * six fare components that sum toward it. See the module comment.
 */
export type HubJobSheet = {
  /** `Order.id` — the id the two transition endpoints are called with. */
  id: string;
  /**
   * The human-readable `GE-48210` handle, in mono. This is a real stored
   * column, unlike `HubJob.shortId`, which derives a display id from the cuid
   * because the history screen predates `Order.reference`. Prefer this one.
   */
  reference: string;
  /**
   * The stored `OrderStatus`, **unmapped** — not `HubJobStatus`, which cannot
   * tell `ACCEPTED` from `PENDING` and so cannot gate the two action buttons.
   * See the module comment.
   *
   * `INITIATED` is representable in the type and unreachable in practice: an
   * unpaid order has no `driverId`, and the loader below returns null for any
   * order this caller is not the assigned driver of. It is left in the type
   * rather than narrowed away because narrowing it would mean asserting a
   * property of the *write* paths inside a *read* model.
   */
  status: OrderStatus;

  /* ---- Stops ---------------------------------------------------------- */

  pickupAddress: string;
  /** Null whenever the address could not be geocoded — a first-class state. */
  pickupLat: number | null;
  pickupLng: number | null;
  /** Display label ("Tbilisi"), or null when the city could not be resolved. */
  pickupCity: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  /** Block, floor or room — free text, as the schema stores it. */
  pickupContactDetails: string | null;
  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  /** Display label ("Tbilisi"), or null when the city could not be resolved. */
  dropoffCity: string | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  dropoffContactDetails: string | null;
  /**
   * The job's own pickup-to-dropoff distance in km — never how far the driver
   * currently is from the pickup, which this loader does not measure.
   */
  distanceKm: number;

  /* ---- Cargo ---------------------------------------------------------- */

  /** Raw `CargoCategory`; render through `cargoCategoryLabel()`. */
  cargoCategory: string;
  description: string | null;
  /** The form the load takes ("4 pallets"). */
  packagingDescription: string | null;
  /** What is inside it ("96 cartons"). */
  itemQuantity: string | null;
  /**
   * The declared envelope. All nullable, and null means *undeclared* rather
   * than zero: every order placed before the load board existed has none.
   */
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  /**
   * Raw `CargoHandlingTag` values, in whatever order the booking form appended
   * them. Empty array, never null. Render them through `sortedHandlingTags()` —
   * never in array order.
   */
  handlingTags: string[];
  /** Extra helpers booked *beyond* the driver, 0-3. */
  helperCount: number;
  /** Raw `ChassisType`, or null on any order placed before the filter existed. */
  bodyType: string | null;

  /* ---- Timing --------------------------------------------------------- */

  /**
   * The three honest timeline points are `createdAt`, `inTransitAt` and
   * `completedAt`, and there are no others. `Order` carries no `acceptedAt`,
   * `claimedAt`, `dispatchedAt` or `cancelledAt`, so a cancelled job genuinely
   * cannot say when it was cancelled and a four-step tracker cannot be built
   * from this data without inventing a timestamp.
   */
  createdAt: string;
  /** The single instant the booking form collects; null on older orders. */
  scheduledAt: string | null;
  /** The window the client will release the load in. */
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  /** The time the load must arrive by. */
  deliveryDeadline: string | null;
  inTransitAt: string | null;
  completedAt: string | null;

  /* ---- Money ---------------------------------------------------------- */

  /**
   * The carrier's commissioned share of the client's quoted total, stored at
   * booking. This and the next field are the ONLY money a driver may be shown;
   * the client's `price` and its six components never leave the database on
   * this path — see the module comment and `JOB_SHEET_SELECT`.
   */
  driverPayout: number;
  /**
   * The carrier's share of `Order.overtimeFee`, written at completion at the
   * order's own stored rate. Zero on every job that finished inside the free
   * loading allowance, and on every job not yet completed.
   *
   * Deliberately *not* summed with `driverPayout` into a single `fare` the way
   * `HubJob` does. This screen shows a job in progress, where the two figures
   * mean different things at different moments: one is what the job was quoted
   * to pay and is known now, the other is only decided by the waiting minutes
   * the driver is about to report. Summing them before completion would print a
   * total that is about to change.
   */
  overtimeDriverPayout: number;
  /**
   * Total loading/unloading minutes the driver reported at completion. Null
   * until then — which is also what tells the completed view whether there is a
   * waiting figure to print at all.
   */
  waitingMinutes: number | null;
  /**
   * Who the driver handed the load to, optionally captured at completion. Null
   * on every order completed before the field existed and on every delivery
   * confirmed without a name. A record of what the driver reported, not
   * evidence of delivery — v1 captures no photo and no signature.
   */
  receivedBy: string | null;
};

/**
 * A stored free-text value, or null when it holds nothing worth printing.
 *
 * The contact and cargo description fields are optional inputs, so a
 * submitted-but-empty field can reach the column as `""` rather than as SQL
 * NULL. Both mean "not given" and both must render as one em dash, so they are
 * collapsed to one representation here rather than leaving the screen to draw a
 * blank line that looks like a rendering fault.
 *
 * Deliberately a private copy of `textOrNull` in `./jobs.ts` rather than an
 * import: that one is module-private there, and this file is not the place to
 * widen another loader's surface. Four lines with no behaviour to drift.
 */
function textOrNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";

  return trimmed === "" ? null : trimmed;
}

/**
 * The job sheet for one order, or **null when this driver may not see it**.
 *
 * ## The null is doing two jobs, and that is the security property
 *
 * There is one null for three different situations — no such order, an order
 * belonging to another driver, and an order with no driver at all — and they
 * are indistinguishable to the caller on purpose. A "not yours" that reads
 * differently from a "no such id" turns this route into an oracle: a caller
 * could walk ids and learn which ones exist, and roughly how much work the
 * platform is carrying, without ever being authorised to see one.
 * `src/app/orders/[id]/track/page.tsx` reports someone else's order exactly
 * like a missing one for this reason; this matches it.
 *
 * That is also why this returns `null` rather than throwing or returning a
 * `{ reason }` discriminant. A reason is a thing a caller can accidentally
 * render, and one careful page plus one careless one is all it takes to leak the
 * distinction the null exists to hide. The page has nothing to render but a
 * generic not-found, so there is nothing for it to get wrong.
 *
 * ## Who may see it
 *
 * Only the driver the order is assigned to: `order.driverId === userId`. Not the
 * client — this screen carries the driver's payout, and the client has no
 * business with what the platform pays its carrier — and not the logistics
 * company holding the order either. A company's people do need this
 * information, but through a company-scoped surface with its own tenancy clause
 * (`companyId`, as `hubOrderScope` in `./jobs.ts` does); widening the test here
 * to `driverId === userId || company.ownerId === userId` would put a second
 * tenancy rule in a function whose whole job is one.
 *
 * The check is a comparison after the read rather than a `where` clause because
 * the row must be fetched to be checked at all, and Prisma's `findUnique` takes
 * a unique field. Reading first and refusing second is the same guarantee: the
 * row is discarded here and no part of it reaches the caller.
 *
 * @param orderId `Order.id` from the route segment — untrusted, and only ever
 *   used as an equality lookup, never interpolated.
 * @param userId The signed-in user's id, from the session. Never from the
 *   request body or a query parameter.
 */
export async function getHubJobSheet(
  orderId: string,
  userId: string,
): Promise<HubJobSheet | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: JOB_SHEET_SELECT,
  });

  // No such order, or not this driver's. One answer for both — see the doc
  // comment. `order.driverId` is nullable, and `null === userId` is false for
  // any real session, so an unassigned order falls out here too.
  if (!order || order.driverId !== userId) {
    return null;
  }

  return {
    id: order.id,
    reference: order.reference,
    status: order.status,

    pickupAddress: order.pickupAddress,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    // `formatCity` at the shaping step, matching `GET /api/loads`: the enum
    // spelling ("TBILISI") is the database's vocabulary and never the reader's.
    pickupCity: order.pickupCity === null ? null : formatCity(order.pickupCity),
    pickupContactName: textOrNull(order.pickupContactName),
    pickupContactPhone: textOrNull(order.pickupContactPhone),
    pickupContactDetails: textOrNull(order.pickupContactDetails),
    dropoffAddress: order.dropoffAddress,
    dropoffLat: order.dropoffLat,
    dropoffLng: order.dropoffLng,
    dropoffCity:
      order.dropoffCity === null ? null : formatCity(order.dropoffCity),
    dropoffContactName: textOrNull(order.dropoffContactName),
    dropoffContactPhone: textOrNull(order.dropoffContactPhone),
    dropoffContactDetails: textOrNull(order.dropoffContactDetails),
    distanceKm: order.distanceKm,

    cargoCategory: order.cargoCategory,
    description: textOrNull(order.description),
    packagingDescription: textOrNull(order.packagingDescription),
    itemQuantity: textOrNull(order.itemQuantity),
    cargoWeightKg: order.cargoWeightKg,
    cargoLengthM: order.cargoLengthM,
    cargoWidthM: order.cargoWidthM,
    cargoHeightM: order.cargoHeightM,
    // Copied into a plain array rather than passed through. Prisma hands back a
    // fresh array here, but this object is serialised across the server/client
    // boundary and the copy makes it a plain one by construction.
    handlingTags: [...order.handlingTags],
    helperCount: order.helperCount,
    bodyType: order.bodyType,

    createdAt: order.createdAt.toISOString(),
    scheduledAt: order.scheduledAt?.toISOString() ?? null,
    pickupWindowStart: order.pickupWindowStart?.toISOString() ?? null,
    pickupWindowEnd: order.pickupWindowEnd?.toISOString() ?? null,
    deliveryDeadline: order.deliveryDeadline?.toISOString() ?? null,
    inTransitAt: order.inTransitAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,

    driverPayout: order.driverPayout,
    overtimeDriverPayout: order.overtimeDriverPayout,
    waitingMinutes: order.waitingMinutes,
    receivedBy: textOrNull(order.receivedBy),
  };
}
