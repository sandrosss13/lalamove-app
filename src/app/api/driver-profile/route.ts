import { NextResponse } from "next/server";
import { GeorgianCity, VehicleType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Valid `GeorgianCity` values, derived from the generated Prisma enum. */
const GEORGIAN_CITIES = Object.values(GeorgianCity);

/** Valid `VehicleType` values, derived from the generated Prisma enum. */
const VEHICLE_TYPES = Object.values(VehicleType);

/** Validated shape of a driver-profile creation request body. */
type CreateDriverProfileInput = {
  city: GeorgianCity;
  vehicleType: VehicleType;
};

/**
 * Hand-rolled body validation (the project has no validation library, and this
 * stage does not warrant adding one). Returns the typed input or an error
 * message describing the first problem encountered.
 */
function parseCreateDriverProfileBody(
  body: unknown,
): { data: CreateDriverProfileInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const { city, vehicleType } = record;

  if (
    typeof city !== "string" ||
    !GEORGIAN_CITIES.includes(city as GeorgianCity)
  ) {
    return {
      error: `city must be one of: ${GEORGIAN_CITIES.join(", ")}.`,
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

  return {
    data: {
      city: city as GeorgianCity,
      vehicleType: vehicleType as VehicleType,
    },
  };
}

/**
 * POST /api/driver-profile — create or update the signed-in driver's profile.
 * Only DRIVER users may call this. The write is an upsert keyed on the user id
 * so retries and re-submits are idempotent rather than an error.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers can create a driver profile." },
      { status: 403 },
    );
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

  const parsed = parseCreateDriverProfileBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { city, vehicleType } = parsed.data;

  const driverProfile = await prisma.driverProfile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, city, vehicleType },
    update: { city, vehicleType },
  });

  return NextResponse.json(driverProfile, { status: 201 });
}
