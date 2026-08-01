import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteVehiclePhotos } from "@/lib/supabase-storage";

/**
 * DELETE /api/driver-profile/vehicles/[id] — remove one of the signed-in
 * driver's vehicles.
 *
 * Ownership is part of the lookup, and a vehicle belonging to someone else is
 * reported as 404 rather than 403: a 403 would confirm that the id exists,
 * letting a caller enumerate other drivers' vehicles.
 *
 * The database row is the source of truth, so the Storage objects are deleted
 * best-effort afterwards — a failure there is logged and the request still
 * succeeds, leaving at worst an orphaned file.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "DRIVER") {
    return NextResponse.json(
      { error: "Only drivers can remove vehicles." },
      { status: 403 },
    );
  }

  const { id } = await params;

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!driverProfile) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  // Scoped by owner, so this returns nothing for another driver's vehicle.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, driverProfileId: driverProfile.id },
    select: { id: true, photoUrls: true },
  });

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  }

  await prisma.vehicle.delete({ where: { id: vehicle.id } });

  await deleteVehiclePhotos(vehicle.photoUrls).catch((error: unknown) => {
    console.error("Failed to delete vehicle photos from Storage:", error);
  });

  return NextResponse.json({ id: vehicle.id }, { status: 200 });
}
