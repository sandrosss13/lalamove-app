import { NextResponse } from "next/server";
import {
  OrderStatus,
  PackageType,
  VehicleType,
  type Prisma,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculatePrice, geocodeAddress, haversineDistanceKm } from "@/lib/geo";

/** Valid `PackageType` values, derived from the generated Prisma enum. */
const PACKAGE_TYPES = Object.values(PackageType);

/** Valid `VehicleType` values, derived from the generated Prisma enum. */
const VEHICLE_TYPES = Object.values(VehicleType);

/** Validated shape of an order-creation request body. */
type CreateOrderInput = {
  pickupAddress: string;
  dropoffAddress: string;
  packageType: PackageType;
  vehicleType: VehicleType;
  description?: string;
};

/**
 * Hand-rolled body validation (the project has no validation library, and this
 * stage does not warrant adding one). Returns the typed input or an error
 * message describing the first problem encountered.
 */
function parseCreateOrderBody(
  body: unknown,
): { data: CreateOrderInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const {
    pickupAddress,
    dropoffAddress,
    packageType,
    vehicleType,
    description,
  } = record;

  if (typeof pickupAddress !== "string" || pickupAddress.trim().length === 0) {
    return { error: "pickupAddress is required." };
  }

  if (
    typeof dropoffAddress !== "string" ||
    dropoffAddress.trim().length === 0
  ) {
    return { error: "dropoffAddress is required." };
  }

  if (
    typeof packageType !== "string" ||
    !PACKAGE_TYPES.includes(packageType as PackageType)
  ) {
    return {
      error: `packageType must be one of: ${PACKAGE_TYPES.join(", ")}.`,
    };
  }

  if (
    typeof vehicleType !== "string" ||
    !VEHICLE_TYPES.includes(vehicleType as VehicleType)
  ) {
    return {
      error: `vehicleType must be one of: ${VEHICLE_TYPES.join(", ")}.`,
    };
  }

  if (description !== undefined && typeof description !== "string") {
    return { error: "description must be a string when provided." };
  }

  return {
    data: {
      pickupAddress: pickupAddress.trim(),
      dropoffAddress: dropoffAddress.trim(),
      packageType: packageType as PackageType,
      vehicleType: vehicleType as VehicleType,
      description:
        typeof description === "string" && description.trim().length > 0
          ? description.trim()
          : undefined,
    },
  };
}

/**
 * POST /api/orders — create a delivery order for the signed-in client.
 * Geocodes both addresses, computes distance and price, and persists the order.
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
    packageType,
    vehicleType,
    description,
  } = parsed.data;

  // Resolve both addresses before doing any work so a failure short-circuits.
  const [pickup, dropoff] = await Promise.all([
    geocodeAddress(pickupAddress),
    geocodeAddress(dropoffAddress),
  ]);

  if (!pickup) {
    return NextResponse.json(
      { error: `Could not locate address: ${pickupAddress}` },
      { status: 422 },
    );
  }

  if (!dropoff) {
    return NextResponse.json(
      { error: `Could not locate address: ${dropoffAddress}` },
      { status: 422 },
    );
  }

  const distanceKm = haversineDistanceKm(pickup, dropoff);
  const price = calculatePrice(distanceKm);

  const order = await prisma.order.create({
    data: {
      packageType,
      vehicleType,
      description,
      pickupAddress,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffAddress,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      distanceKm,
      price,
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
      select: { vehicles: { select: { vehicleType: true } } },
    });

    const registeredVehicleTypes = [
      ...new Set(
        (driverProfile?.vehicles ?? []).map((vehicle) => vehicle.vehicleType),
      ),
    ];

    where = {
      OR: [
        {
          status: OrderStatus.PENDING,
          driverId: null,
          vehicleType: { in: registeredVehicleTypes },
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
