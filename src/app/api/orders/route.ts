import { NextResponse } from "next/server";
import { OrderStatus, type Prisma } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { auth } from "@/lib/auth";
import { parseBookingBody } from "@/lib/orders/order-input";
import { prepareOrderWrite } from "@/lib/orders/order-write";
import {
  formatOrderReference,
  ORDER_REFERENCE_SEQUENCE,
} from "@/lib/orders/reference";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/orders — create a freight order for the signed-in client.
 *
 * Quoting goes through the same `estimateDelivery` the public estimate endpoint
 * uses, so the price booked here is the price that was quoted. The itemised
 * breakdown is persisted alongside the total: the order keeps showing how its
 * price was reached even after the underlying `PricingRule` is retuned.
 *
 * The service-level tier is the same story one step on: the client picks a tier
 * and the fare effect of that tier is derived here from the server's own quote,
 * so no figure the browser computed is ever booked.
 *
 * **The body rules and the pricing no longer live in this file.** Parsing is
 * `parseCreateOrderBody` (`src/lib/orders/order-input.ts`) and every check
 * between a parsed body and the row's columns — body type, cargo fit, class
 * serviceability, payment method, saved card, PO reference, the quote and the
 * payout derived from it — is `prepareOrderWrite`
 * (`src/lib/orders/order-write.ts`). They moved, unchanged, so that
 * `PATCH /api/orders/[id]` can hold an edit of an unpaid order to exactly the
 * rules a booking is held to; this handler still answers every request with the
 * same status and the same message it always did. What stays here is what only
 * a *create* does: the status it opens in, and the reference it draws.
 *
 * Goods-first booking: a body that lists `items` has its weight, dimensions,
 * category and (for individuals) body re-derived from the goods themselves
 * (`parseBookingBody` drops the typed envelope; `prepareOrderWrite` plans the
 * goods), and the order is written with one `OrderItem` snapshot per line. A
 * body without `items` is booked exactly as before.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseBookingBody(rawBody, t);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const prepared = await prepareOrderWrite(
    parsed.data.data,
    session.user.id,
    t,
    parsed.data.rawItems,
  );
  if (!prepared.ok) {
    return NextResponse.json(
      { error: prepared.error },
      { status: prepared.status },
    );
  }

  const { details, payment, items } = prepared.write;

  // Created `INITIATED` — off-market and unpaid — rather than letting the column
  // default supply a status. An order's opening state is a decision this path
  // makes, not one it inherits: nothing between here and settlement should be
  // able to put an unpaid job in front of a driver, and a status named at the
  // point of creation is a status a reader of this handler can see.
  //
  // The transaction changes only how the row acquires its human-readable
  // reference, not when the order becomes visible to anyone: settlement is still
  // `POST /api/orders/[id]/pay`'s job alone.
  const created = await prisma.$transaction(async (tx) => {
    // Drawn inside the same transaction as the insert it feeds, rather than
    // before the transaction opens: if the insert fails for any reason the whole
    // thing rolls back and this draw is never attached to a row, so nothing
    // anywhere observes it.
    //
    // `nextval` itself cannot be rolled back — Postgres sequences are
    // deliberately non-transactional — so a rolled-back insert still leaves a
    // gap in the numbering. That is fine: nothing depends on the sequence being
    // contiguous, and it starts at 48200 precisely so the numbers are not read
    // as a volume count. What must never happen is *reuse*, two orders sharing a
    // reference, and `nextval` never returning the same value twice is exactly
    // what rules that out.
    //
    // Passing the drawn value explicitly also means the create response carries
    // the reference without a second round-trip to read back what the column's
    // database default would otherwise have generated — and because the column
    // is named in the INSERT, that default never fires, so one order consumes
    // exactly one sequence value.
    const [drawn] = await tx.$queryRaw<{ value: bigint }[]>`
      SELECT nextval(${ORDER_REFERENCE_SEQUENCE}::regclass) AS value
    `;

    // `nextval` always returns exactly one row, so this cannot be reached; the
    // guard exists because `noUncheckedIndexedAccess` types the destructured
    // element as possibly undefined, and a thrown error rolls the transaction
    // back rather than writing an order with a bogus reference.
    if (!drawn) {
      throw new Error("Failed to draw an order reference from the sequence.");
    }

    const reference = formatOrderReference(Number(drawn.value));

    return tx.order.create({
      data: {
        status: OrderStatus.INITIATED,
        reference,
        // Every booked detail and every priced figure, from `prepareOrderWrite`
        // — the cities resolved from the geocoded addresses, never from the
        // body; the payout commissioned on the rounded billed basis.
        ...details,
        paymentMethodType: payment.paymentMethodType,
        savedCardId: payment.savedCardId,
        purchaseOrderRef: payment.purchaseOrderRef,
        clientId: session.user.id,
        // Items path only. One nested create, so the lines are written in the
        // same statement as the order and can never exist without it (or it
        // without them). The legacy path adds nothing here.
        ...(items !== null ? { items: { create: items } } : {}),
      },
    });
  });

  // Deliberately *not* settled here, and that is the whole shape of the booking
  // flow: settlement belongs to checkout. `POST /api/orders/[id]/pay` is the one
  // caller of `settleOrderPayment`, and that transition — `INITIATED` →
  // `PENDING` — is what puts the job in front of drivers.
  //
  // So the window between booking and payment is an intended state rather than a
  // race to be closed: the browser sends the client on to `/checkout/[id]` with
  // the id off this response, and an order whose client never finishes there
  // simply stays off the market. That is the failure direction worth having —
  // nobody is dispatched to an unpaid job.
  //
  // Both open-market queries filter `status: PENDING` by equality (`GET` below,
  // and `src/app/api/logistics-company/orders/route.ts`), so an `INITIATED`
  // order is invisible to every driver and company *by construction*, not by a
  // rule someone has to remember. Do not relax either into a `not`/`notIn`
  // filter: that would start listing unpaid work the moment a new status is
  // added.
  return NextResponse.json(created, { status: 201 });
}

/**
 * The columns `GET` reads back, and the only ones it may return.
 *
 * The *absence* of a select is what made this endpoint leak: a `findMany`
 * carrying only a `where` returns every column of `Order`, so each column added
 * to the model silently joined the response — which is how a client's stop
 * contacts ended up in the open, unassigned jobs any activated driver can list.
 * Naming the fields means a column added later cannot start leaking through
 * this response by accident; anything new belongs here deliberately or not at
 * all.
 *
 * `savedCardId` and `purchaseOrderRef` are deliberately absent and must stay
 * absent: one is the client's chosen payment instrument, the other their
 * finance team's internal reference, and no consumer of this endpoint has any
 * business with either. The six stop-contact columns *are* selected, because
 * the two parties to a job do need them, and are then withheld per row — see
 * `canSeeStopContacts`.
 *
 * Relations are not selected because the handler never included any; this list
 * is the scalar row and nothing more.
 */
const ORDER_LIST_SELECT = {
  id: true,
  cargoCategory: true,
  description: true,
  bodyType: true,
  helperCount: true,
  scheduledAt: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  distanceKm: true,
  baseFare: true,
  distanceFare: true,
  timeFare: true,
  helperFee: true,
  overtimeFee: true,
  price: true,
  serviceLevel: true,
  serviceLevelAdjustment: true,
  vehicleTypeSpecId: true,
  status: true,
  clientId: true,
  companyId: true,
  driverId: true,
  vehicleId: true,
  paymentMethodType: true,
  inTransitAt: true,
  completedAt: true,
  waitingMinutes: true,
  createdAt: true,
  updatedAt: true,
  reference: true,
  cargoWeightKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
  packagingDescription: true,
  itemQuantity: true,
  handlingTags: true,
  pickupWindowStart: true,
  pickupWindowEnd: true,
  deliveryDeadline: true,
  driverPayout: true,
  // `commissionRate` deliberately excluded, and must stay excluded: it is an
  // internal figure with no consumer on any surface this endpoint feeds — only
  // the resolved payout is anyone's business — matching how `savedCardId` and
  // `purchaseOrderRef` are withheld above.
  //
  // This constant is now **client-only**. It keeps the full itemised fare
  // because the client who booked the order is commercially party to every line
  // of it, and `GET` below hands it to the client branch alone; a driver session
  // is answered from `DRIVER_ORDER_LIST_SELECT` instead. `driverPayout` stays
  // selected here rather than being pulled back out — a client's own row
  // carrying the figure is harmless, and removing it would be a change to the
  // client's response shape that nothing asked for.
} as const;

/**
 * `ORDER_LIST_SELECT`'s driver-facing sibling: the same row **minus every column
 * describing what the client pays**, plus the driver's own two payout columns.
 *
 * *"Driver should see only its net, not total paid."* `Order.price` and
 * `Order.overtimeFee` are the client's money; `Order.driverPayout` and
 * `Order.overtimeDriverPayout` are the driver's. This endpoint answers both
 * audiences from one handler — a client listing their own bookings, and a driver
 * browsing open `PENDING` work plus their own assignments — so the redaction is
 * per **requester role**, not per route, and this is the half of it a driver
 * sees.
 *
 * **All seven money columns leave together, and that is the whole mechanism.**
 * `price` is `baseFare + distanceFare + timeFare + helperFee` floored at the
 * pricing rule's `minimumFare` (`src/lib/pricing.ts`), so a response that omits
 * `price` while keeping its four components has redacted nothing — the client's
 * total is one addition away on all but the shortest jobs. Dropping the lot,
 * plus `overtimeFee` and `serviceLevelAdjustment`, is the only version of this
 * that holds.
 *
 * Omission rather than nulling, deliberately, and the contrast with
 * `canSeeStopContacts` below is worth reading: contact entitlement varies **row
 * by row** inside one response — a driver's list mixes open work they have not
 * accepted with jobs already assigned to them — so contacts are selected and
 * then nulled, keeping every row the same shape. Money entitlement does not vary
 * that way. There is no row in a driver's response allowed to carry the client's
 * price, open or assigned, so nothing needs a stable shape and the stronger
 * mechanism is available: a column that was never selected is absent from the
 * type Prisma infers, so a future `order.price` on this path is a compile error
 * rather than a runtime `null` that `formatGel` would render as `₾0.00`.
 *
 * Kept as its own route-local constant rather than importing
 * `CARRIER_ORDER_PARTY_SELECT` from `src/lib/order-response-select.ts` — see
 * that constant for the full reasoning this one shares — for exactly the reason
 * `ORDER_LIST_SELECT` above is route-local and not `ORDER_PARTY_SELECT`: a
 * listing endpoint serves requesters who are not yet a party to most of what it
 * lists, and must stay free to withhold more than the lifecycle endpoints do.
 * Named `DRIVER_...` rather than `CARRIER_...` because this file's `GET` has no
 * company branch; only a driver session ever reaches it.
 */
const DRIVER_ORDER_LIST_SELECT = {
  id: true,
  cargoCategory: true,
  description: true,
  bodyType: true,
  helperCount: true,
  scheduledAt: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  pickupContactName: true,
  pickupContactPhone: true,
  pickupContactDetails: true,
  dropoffContactName: true,
  dropoffContactPhone: true,
  dropoffContactDetails: true,
  distanceKm: true,
  serviceLevel: true,
  vehicleTypeSpecId: true,
  status: true,
  clientId: true,
  companyId: true,
  driverId: true,
  vehicleId: true,
  paymentMethodType: true,
  inTransitAt: true,
  completedAt: true,
  waitingMinutes: true,
  createdAt: true,
  updatedAt: true,
  reference: true,
  cargoWeightKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
  packagingDescription: true,
  itemQuantity: true,
  handlingTags: true,
  pickupWindowStart: true,
  pickupWindowEnd: true,
  deliveryDeadline: true,
  driverPayout: true,
  overtimeDriverPayout: true,
} as const;

/**
 * Whether the requester may see one order's stop contacts.
 *
 * A stop contact is a named person and their phone number, collected so that
 * whoever turns up knows who to ask for. Exactly two parties need that: the
 * driver the job is assigned to, and the client who booked it. A driver
 * browsing the open, unassigned PENDING work this endpoint also lists has
 * accepted nothing and is entitled to nothing beyond where the job goes and
 * what it pays — the contacts become theirs when the job does.
 */
function canSeeStopContacts(
  order: { clientId: string; driverId: string | null },
  userId: string,
): boolean {
  return order.clientId === userId || order.driverId === userId;
}

/**
 * GET /api/orders — list orders relevant to the signed-in user.
 *
 * Clients see their own orders. Drivers see open (unassigned, PENDING) orders
 * they could actually take — i.e. asking for a vehicle type they have
 * registered — plus deliveries already assigned to them, which are not
 * type-filtered because that match was made when the order was accepted. A
 * driver with no registered vehicle — or one whose account is not yet activated
 * — has nothing to take, so they only ever see their own deliveries. Newest
 * first.
 *
 * The filter mirrors the driver-facing `/orders` page, so the API can't hand
 * back jobs the UI deliberately hides.
 *
 * Every row is trimmed to a select, and the stop contacts within it are returned
 * as `null` on any row the requester is not a party to, so an open job in a
 * driver's listing never carries the client's name and phone number.
 *
 * **The two branches differ in `select`, not only in `where`.** A client is
 * answered from `ORDER_LIST_SELECT` with their full itemised quote, unchanged; a
 * driver is answered from `DRIVER_ORDER_LIST_SELECT`, which carries their own
 * payout and no column describing what the client paid. One handler, two
 * audiences, one rule — the redaction is per requester role, because this route
 * has no other way to tell the two apart.
 *
 * The tail is written as two explicit paths rather than one query with a ternary
 * `select`: a conditional select gives Prisma two row types to union, and the
 * resulting inferred type would carry `price` as optional on the driver's rows —
 * exactly the "present but must not be rendered" state the redaction exists to
 * avoid. Two queries, two clean types.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const t = await getRequestTranslations();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: t("common.shared.unauthorized") },
      { status: 401 },
    );
  }

  const { id: userId, role } = session.user;

  let where: Prisma.OrderWhereInput = { clientId: userId };

  if (role === "DRIVER") {
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId },
      select: {
        activatedAt: true,
        vehicles: { select: { vehicleTypeSpecId: true } },
      },
    });

    const registeredVehicleTypeSpecIds = [
      ...new Set(
        (driverProfile?.vehicles ?? []).map(
          (vehicle) => vehicle.vehicleTypeSpecId,
        ),
      ),
    ];

    where = {
      OR: [
        // A non-activated driver has nothing open to take — same reasoning as
        // the existing "no registered vehicle → nothing to take" case, extended
        // to cover "not yet approved" too. Deliveries already assigned to them
        // stay visible either way.
        ...(driverProfile?.activatedAt
          ? [
              {
                status: OrderStatus.PENDING,
                driverId: null,
                vehicleTypeSpecId: { in: registeredVehicleTypeSpecIds },
              },
            ]
          : []),
        { driverId: userId },
      ],
    };
  }

  if (role === "DRIVER") {
    const driverOrders = await prisma.order.findMany({
      where,
      select: DRIVER_ORDER_LIST_SELECT,
      orderBy: { createdAt: "desc" },
    });

    // The same per-row contact redaction the client path below applies, and it
    // is still needed here despite the money redaction the select already
    // applied to every row: the two answer different questions. Money
    // entitlement is uniform across a driver's response — no row may carry the
    // client's price — while contact entitlement is per row, because this
    // listing mixes open work the driver has not accepted with deliveries
    // already assigned to them.
    const visibleDriverOrders = driverOrders.map((order) =>
      canSeeStopContacts(order, userId)
        ? order
        : {
            ...order,
            pickupContactName: null,
            pickupContactPhone: null,
            pickupContactDetails: null,
            dropoffContactName: null,
            dropoffContactPhone: null,
            dropoffContactDetails: null,
          },
    );

    return NextResponse.json(visibleDriverOrders, { status: 200 });
  }

  const orders = await prisma.order.findMany({
    where,
    select: ORDER_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });

  // Redacted here rather than in the query because the entitlement is per row,
  // not per request. On this branch that mixing is rarer than on the driver's —
  // a client is a party to every order in their own list — but the mapping is
  // kept identical rather than dropped, because the branch also catches every
  // other role that falls through to `{ clientId: userId }`.
  //
  // Duplicated across the two branches rather than factored into a helper: the
  // two selects infer two different row types, and sharing the five-line block
  // would mean fighting that inference with a generic for no behavioural gain.
  // This file already makes the same call about `canSeeStopContacts` itself,
  // which is duplicated in `src/app/api/logistics-company/orders/route.ts`.
  const visibleOrders = orders.map((order) =>
    canSeeStopContacts(order, userId)
      ? order
      : {
          ...order,
          pickupContactName: null,
          pickupContactPhone: null,
          pickupContactDetails: null,
          dropoffContactName: null,
          dropoffContactPhone: null,
          dropoffContactDetails: null,
        },
  );

  return NextResponse.json(visibleOrders, { status: 200 });
}
