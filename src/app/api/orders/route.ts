import { NextResponse } from "next/server";
import {
  ChassisType,
  ClientAccountType,
  OrderStatus,
  PaymentMethodType,
  ServiceLevel,
  type Prisma,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  estimateDelivery,
  parseQuoteFields,
  quoteFailureMessage,
  serviceLevelAdjustment,
  type QuoteInput,
} from "@/lib/pricing";

/** Valid values for each enum field, derived from the generated Prisma enums. */
const SERVICE_LEVELS = Object.values(ServiceLevel);
const BODY_TYPES = Object.values(ChassisType);
const PAYMENT_METHOD_TYPES = Object.values(PaymentMethodType);

/**
 * Longest accepted stop-contact field and purchase-order reference.
 *
 * These are free text by design — a contact name, a phone number in whatever
 * form the client keeps it, a block/floor/room note, a finance team's own
 * reference — so the only thing worth checking is that a booking cannot smuggle
 * an essay into a column the driver hub renders on one line.
 */
const FREE_TEXT_MAX_LENGTH = 200;

/**
 * A contact at one end of the job. Every field is optional and unvalidated in
 * shape: the booking form presents them as optional and never blocks on them.
 * `null` rather than `""` throughout, so a blank field is genuinely absent.
 */
type StopContact = {
  name: string | null;
  phone: string | null;
  details: string | null;
};

/** Validated shape of an order-creation request body. */
type CreateOrderInput = QuoteInput & {
  description?: string;
  /** When the client wants this picked up/delivered. Required — see below. */
  scheduledAt: Date;
  pickupContact: StopContact;
  dropoffContact: StopContact;
  /** The tier the client chose; the fare effect is derived server-side. */
  serviceLevel: ServiceLevel;
  /** The load space asked for, checked against the vehicle before the order lands. */
  bodyType: ChassisType | null;
  paymentMethodType: PaymentMethodType | null;
  savedCardId: string | null;
  /** Kept only for BUSINESS clients — see the ownership checks in `POST`. */
  purchaseOrderRef: string | null;
};

/**
 * How far into the past a submitted `scheduledAt` may fall before it's
 * rejected as stale rather than accepted. Exists only to absorb the gap
 * between the booking form reading "now" and this request landing — a slow
 * connection or a client clock a couple of minutes fast shouldn't turn a
 * pick of "today, right now" into a rejected submission.
 */
const SCHEDULED_AT_PAST_GRACE_MS = 5 * 60 * 1000;

/**
 * Trim an optional free-text field to its stored form: `null` when absent or
 * blank, the trimmed string otherwise, or an error when it is the wrong type or
 * over length. `fieldName` is the caller's own path (e.g. `pickupContact.name`)
 * so the message names the field the client actually sent.
 */
function parseOptionalText(
  value: unknown,
  fieldName: string,
): { value: string | null } | { error: string } {
  if (value === undefined || value === null) {
    return { value: null };
  }

  if (typeof value !== "string") {
    return { error: `${fieldName} must be a string when provided.` };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { value: null };
  }

  if (trimmed.length > FREE_TEXT_MAX_LENGTH) {
    return {
      error: `${fieldName} must be ${FREE_TEXT_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { value: trimmed };
}

/**
 * Validate one stop's contact block. An omitted block is an empty contact
 * rather than an error: the dialog that fills it can be skipped entirely.
 */
function parseStopContact(
  value: unknown,
  fieldName: string,
): { data: StopContact } | { error: string } {
  const empty: StopContact = { name: null, phone: null, details: null };

  if (value === undefined || value === null) {
    return { data: empty };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: `${fieldName} must be a JSON object when provided.` };
  }

  const record = value as Record<string, unknown>;

  const name = parseOptionalText(record.name, `${fieldName}.name`);
  if ("error" in name) {
    return name;
  }

  const phone = parseOptionalText(record.phone, `${fieldName}.phone`);
  if ("error" in phone) {
    return phone;
  }

  const details = parseOptionalText(record.details, `${fieldName}.details`);
  if ("error" in details) {
    return details;
  }

  return {
    data: { name: name.value, phone: phone.value, details: details.value },
  };
}

/**
 * Hand-rolled body validation (the project has no validation library, and this
 * stage does not warrant adding one). The quote fields are validated by the
 * shared parser so this route and the public estimate endpoint reject the same
 * input with the same messages. Returns the typed input or an error message
 * describing the first problem encountered.
 */
function parseCreateOrderBody(
  body: unknown,
): { data: CreateOrderInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  const quote = parseQuoteFields(record);
  if ("error" in quote) {
    return quote;
  }

  const { description, scheduledAt } = record;

  if (description !== undefined && typeof description !== "string") {
    return { error: "description must be a string when provided." };
  }

  if (typeof scheduledAt !== "string" || scheduledAt.trim().length === 0) {
    return { error: "scheduledAt is required." };
  }

  const scheduledAtDate = new Date(scheduledAt);
  if (Number.isNaN(scheduledAtDate.getTime())) {
    return { error: "scheduledAt must be a valid date and time." };
  }

  if (scheduledAtDate.getTime() < Date.now() - SCHEDULED_AT_PAST_GRACE_MS) {
    return { error: "scheduledAt cannot be in the past." };
  }

  const pickupContact = parseStopContact(record.pickupContact, "pickupContact");
  if ("error" in pickupContact) {
    return pickupContact;
  }

  const dropoffContact = parseStopContact(
    record.dropoffContact,
    "dropoffContact",
  );
  if ("error" in dropoffContact) {
    return dropoffContact;
  }

  // An omitted tier is Regular — the same value the column defaults to, and the
  // one every order predating the picker was in fact served at.
  const { serviceLevel } = record;
  if (
    serviceLevel !== undefined &&
    (typeof serviceLevel !== "string" ||
      !SERVICE_LEVELS.includes(serviceLevel as ServiceLevel))
  ) {
    return {
      error: `serviceLevel must be one of: ${SERVICE_LEVELS.join(", ")}.`,
    };
  }

  const { bodyType } = record;
  if (
    bodyType !== undefined &&
    (typeof bodyType !== "string" ||
      !BODY_TYPES.includes(bodyType as ChassisType))
  ) {
    return { error: `bodyType must be one of: ${BODY_TYPES.join(", ")}.` };
  }

  const { paymentMethodType } = record;
  if (
    paymentMethodType !== undefined &&
    (typeof paymentMethodType !== "string" ||
      !PAYMENT_METHOD_TYPES.includes(paymentMethodType as PaymentMethodType))
  ) {
    return {
      error: `paymentMethodType must be one of: ${PAYMENT_METHOD_TYPES.join(", ")}.`,
    };
  }

  const { savedCardId } = record;
  if (
    savedCardId !== undefined &&
    (typeof savedCardId !== "string" || savedCardId.trim().length === 0)
  ) {
    return { error: "savedCardId must be a non-empty string when provided." };
  }

  const chosenCardId =
    typeof savedCardId === "string" ? savedCardId.trim() : null;

  // A card and the method it pays with have to agree. Paying by card without
  // naming one is unbookable, and a card sent alongside cash or a bank transfer
  // means the client changed method without clearing its card — either way, say
  // which of the two to change rather than quietly picking one.
  if (paymentMethodType === PaymentMethodType.CARD && chosenCardId === null) {
    return { error: "Choose a saved card to pay by card." };
  }

  if (paymentMethodType !== PaymentMethodType.CARD && chosenCardId !== null) {
    return { error: "Send savedCardId only when paymentMethodType is CARD." };
  }

  const purchaseOrderRef = parseOptionalText(
    record.purchaseOrderRef,
    "purchaseOrderRef",
  );
  if ("error" in purchaseOrderRef) {
    return purchaseOrderRef;
  }

  return {
    data: {
      ...quote.data,
      description:
        typeof description === "string" && description.trim().length > 0
          ? description.trim()
          : undefined,
      scheduledAt: scheduledAtDate,
      pickupContact: pickupContact.data,
      dropoffContact: dropoffContact.data,
      serviceLevel:
        (serviceLevel as ServiceLevel | undefined) ?? ServiceLevel.REGULAR,
      bodyType: (bodyType as ChassisType | undefined) ?? null,
      paymentMethodType:
        (paymentMethodType as PaymentMethodType | undefined) ?? null,
      savedCardId: chosenCardId,
      purchaseOrderRef: purchaseOrderRef.value,
    },
  };
}

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
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseCreateOrderBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const {
    pickupAddress,
    dropoffAddress,
    vehicleTypeCode,
    cargoCategory,
    helperCount,
    description,
    scheduledAt,
    pickupContact,
    dropoffContact,
    serviceLevel,
    bodyType,
    paymentMethodType,
    savedCardId,
    purchaseOrderRef,
  } = parsed.data;

  // Everything below is a cheap local query, so all of it runs before
  // `estimateDelivery` spends geocoding lookups on a request that cannot be
  // booked anyway — the same reasoning the quote itself applies to its vehicle
  // and cargo checks.

  // The booking form only offers vehicles that carry the chosen body, but the
  // request can be edited after that filter ran. An unknown `vehicleTypeCode`
  // is deliberately left to the quote, which already has the wording for it.
  if (bodyType !== null) {
    const spec = await prisma.vehicleTypeSpec.findUnique({
      where: { code: vehicleTypeCode },
      select: { bodyTypes: true },
    });

    if (spec && !spec.bodyTypes.includes(bodyType)) {
      return NextResponse.json(
        { error: "That vehicle does not offer the load space you selected." },
        { status: 400 },
      );
    }
  }

  // Admin owns which methods the platform accepts. A method with no config row
  // has never been switched on — the admin endpoints seed new rows disabled and
  // treat turning one on as a deliberate act — so a missing row is a disabled
  // one, and both are refused here.
  if (paymentMethodType !== null) {
    const paymentMethodConfig = await prisma.paymentMethodConfig.findUnique({
      where: { type: paymentMethodType },
      select: { isEnabled: true },
    });

    if (!paymentMethodConfig?.isEnabled) {
      return NextResponse.json(
        { error: "That payment method is not available." },
        { status: 400 },
      );
    }
  }

  // A card belonging to somebody else is not a card this client may book
  // against; scoping the lookup to the session makes "not yours" and "does not
  // exist" the same answer, which is the one worth giving either way.
  if (savedCardId !== null) {
    const savedCard = await prisma.savedCard.findFirst({
      where: { id: savedCardId, clientId: session.user.id },
      select: { id: true },
    });

    if (!savedCard) {
      return NextResponse.json(
        { error: "Choose a card saved to your own payment methods." },
        { status: 400 },
      );
    }
  }

  // The PO / cost-centre reference is a BUSINESS-only field: an Individual
  // client's booking form never renders it, so a value arriving from one is a
  // stale client rather than an attack. Drop it instead of failing the booking.
  let businessPurchaseOrderRef: string | null = null;
  if (purchaseOrderRef !== null) {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: session.user.id },
      select: { accountType: true },
    });

    if (clientProfile?.accountType === ClientAccountType.BUSINESS) {
      businessPurchaseOrderRef = purchaseOrderRef;
    }
  }

  const result = await estimateDelivery(parsed.data);

  if (!result.ok) {
    // An address the geocoder cannot place is well-formed input the server
    // could not act on (422); an unknown vehicle type or an ineligible
    // cargo/vehicle pairing is bad input (400).
    const status = result.reason === "unresolved_address" ? 422 : 400;
    return NextResponse.json(
      { error: quoteFailureMessage(result) },
      { status },
    );
  }

  const { pickup, dropoff, distanceKm, vehicleTypeSpecId, breakdown } =
    result.estimate;

  // Derived from the server's own quote, never from a figure the browser sent:
  // the client chooses a tier, not a price. Stored beside `price` rather than
  // folded into it, so the itemised breakdown still reconciles against its own
  // total and the minimum-fare floor keeps meaning what it says.
  const adjustment = serviceLevelAdjustment(serviceLevel, breakdown.price);

  // Created `INITIATED` — off-market and unpaid — rather than letting the column
  // default supply a status. An order's opening state is a decision this path
  // makes, not one it inherits: nothing between here and settlement should be
  // able to put an unpaid job in front of a driver, and a status named at the
  // point of creation is a status a reader of this handler can see.
  const created = await prisma.order.create({
    data: {
      status: OrderStatus.INITIATED,
      cargoCategory,
      bodyType,
      helperCount,
      description,
      scheduledAt,
      pickupAddress,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      pickupContactName: pickupContact.name,
      pickupContactPhone: pickupContact.phone,
      pickupContactDetails: pickupContact.details,
      dropoffAddress,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      dropoffContactName: dropoffContact.name,
      dropoffContactPhone: dropoffContact.phone,
      dropoffContactDetails: dropoffContact.details,
      distanceKm,
      vehicleTypeSpecId,
      baseFare: breakdown.baseFare,
      distanceFare: breakdown.distanceFare,
      timeFare: breakdown.timeFare,
      helperFee: breakdown.helperFee,
      price: breakdown.price,
      serviceLevel,
      serviceLevelAdjustment: adjustment,
      paymentMethodType,
      savedCardId,
      purchaseOrderRef: businessPurchaseOrderRef,
      clientId: session.user.id,
    },
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
 * Every row is trimmed to `ORDER_LIST_SELECT`, and the stop contacts within it
 * are returned as `null` on any row the requester is not a party to, so an open
 * job in a driver's listing never carries the client's name and phone number.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

  const orders = await prisma.order.findMany({
    where,
    select: ORDER_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });

  // Redacted here rather than in the query because the entitlement is per row,
  // not per request: a driver's listing mixes deliveries assigned to them, whose
  // contacts they need, with open work they have not accepted, whose contacts
  // they must not have. Expressing that in the `where` would mean two queries
  // and a merge to restore the ordering, for a result this mapping gives exactly.
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
