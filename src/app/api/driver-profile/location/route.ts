import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Inclusive latitude bounds of a real-world WGS84 coordinate. */
const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;
/** Inclusive longitude bounds of a real-world WGS84 coordinate. */
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;

/** Validated shape of a location-ping request body. */
type LocationInput = {
  lat: number;
  lng: number;
};

/**
 * Hand-rolled body validation (the project has no validation library, and a
 * two-field payload does not warrant adding one). Rejects non-numbers, NaN and
 * ±Infinity via `Number.isFinite`, then anything outside real-world coordinate
 * range — a bad ping must never be persisted as the driver's position.
 */
function parseLocationBody(
  body: unknown,
): { data: LocationInput } | { error: string } {
  const invalid = { error: "lat and lng must be valid coordinates." };

  if (typeof body !== "object" || body === null) {
    return invalid;
  }

  const { lat, lng } = body as Record<string, unknown>;

  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    lat < MIN_LATITUDE ||
    lat > MAX_LATITUDE
  ) {
    return invalid;
  }

  if (
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    lng < MIN_LONGITUDE ||
    lng > MAX_LONGITUDE
  ) {
    return invalid;
  }

  return { data: { lat, lng } };
}

/**
 * POST /api/driver-profile/location — record the signed-in driver's latest
 * position. Called periodically by the driver's online beacon, so it is written
 * as a single keyed update with a server-generated `locationUpdatedAt`: the
 * timestamp must reflect when the server accepted the ping, never a client
 * clock, so consumers can reliably judge how stale a position is.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers can update location." },
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

  const parsed = parseLocationBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { lat, lng } = parsed.data;

  // Check existence first so a missing profile is a clear 404 instead of the
  // "record to update not found" error the update would otherwise throw.
  const existing = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Complete your driver profile before sharing location." },
      { status: 404 },
    );
  }

  const updated = await prisma.driverProfile.update({
    where: { userId: session.user.id },
    data: {
      currentLat: lat,
      currentLng: lng,
      locationUpdatedAt: new Date(),
    },
  });

  return NextResponse.json(
    {
      currentLat: updated.currentLat,
      currentLng: updated.currentLng,
      locationUpdatedAt: updated.locationUpdatedAt,
    },
    { status: 200 },
  );
}
