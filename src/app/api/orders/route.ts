import { NextResponse } from "next/server";
import { OrderStatus, type Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  estimateDelivery,
  parseQuoteFields,
  quoteFailureMessage,
  type QuoteInput,
} from "@/lib/pricing";

/** Validated shape of an order-creation request body. */
type CreateOrderInput = QuoteInput & {
  description?: string;
};

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

  const { description } = record;

  if (description !== undefined && typeof description !== "string") {
    return { error: "description must be a string when provided." };
  }

  return {
    data: {
      ...quote.data,
      description:
        typeof description === "string" && description.trim().length > 0
          ? description.trim()
          : undefined,
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
    cargoCategory,
    requiresHelper,
    description,
  } = parsed.data;

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

  const order = await prisma.order.create({
    data: {
      cargoCategory,
      requiresHelper,
      description,
      pickupAddress,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffAddress,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      distanceKm,
      vehicleTypeSpecId,
      baseFare: breakdown.baseFare,
      distanceFare: breakdown.distanceFare,
      timeFare: breakdown.timeFare,
      helperFee: breakdown.helperFee,
      price: breakdown.price,
      clientId: session.user.id,
    },
  });

  return NextResponse.json(order, { status: 201 });
}

/**
 * GET /api/orders — list orders relevant to the signed-in user.
 *
 * Clients see their own orders. Drivers see open (unassigned, PENDING) orders
 * they could actually take — i.e. asking for a vehicle type they have
 * registered — plus deliveries already assigned to them, which are not
 * type-filtered because that match was made when the order was accepted. A
 * driver with no registered vehicle has nothing to take, so they only ever see
 * their own deliveries. Newest first.
 *
 * The filter mirrors the driver-facing `/orders` page, so the API can't hand
 * back jobs the UI deliberately hides.
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
      select: { vehicles: { select: { vehicleTypeSpecId: true } } },
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
        {
          status: OrderStatus.PENDING,
          driverId: null,
          vehicleTypeSpecId: { in: registeredVehicleTypeSpecIds },
        },
        { driverId: userId },
      ],
    };
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orders, { status: 200 });
}
