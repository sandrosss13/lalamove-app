import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/driver-profile/status — flip the signed-in driver's availability.
 *
 * Only DRIVER users may call this, and only once a driver profile exists:
 * `isOnline` lives on `DriverProfile`, so there is nothing to toggle before the
 * profile is created. The missing-profile case is an explicit 404 rather than an
 * upsert, because going online must not silently create a half-filled profile
 * (city, phone and account type are all required fields).
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers can update online status." },
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

  // Hand-rolled validation, consistent with the rest of the API (the project
  // deliberately uses no validation library).
  const isOnline =
    typeof rawBody === "object" && rawBody !== null
      ? (rawBody as Record<string, unknown>).isOnline
      : undefined;

  if (typeof isOnline !== "boolean") {
    return NextResponse.json(
      { error: "isOnline must be a boolean." },
      { status: 400 },
    );
  }

  // Check existence first so a missing profile is a clear 404 instead of the
  // "record to update not found" error the update would otherwise throw.
  const existing = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Complete your driver profile before going online." },
      { status: 404 },
    );
  }

  const updated = await prisma.driverProfile.update({
    where: { userId: session.user.id },
    data: { isOnline },
  });

  return NextResponse.json({ isOnline: updated.isOnline }, { status: 200 });
}
