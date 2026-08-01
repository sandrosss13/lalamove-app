import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/orders/[id]/location — the assigned driver's last known position for
 * a single order, polled by the client-facing tracking map.
 *
 * The live position lives on `DriverProfile`, but `Order.driverId` points at
 * `User` (named relation "DriverDeliveries"), so the profile is reached through
 * a nested select on `driver`.
 *
 * Only the two parties to the delivery — the ordering client and the assigned
 * driver — may read it, so a driver's whereabouts are never exposed to an
 * unrelated signed-in user.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      clientId: true,
      driverId: true,
      pickupLat: true,
      pickupLng: true,
      dropoffLat: true,
      dropoffLng: true,
      driver: {
        select: {
          driverProfile: {
            select: {
              currentLat: true,
              currentLng: true,
              locationUpdatedAt: true,
              isOnline: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const userId = session.user.id;
  if (order.clientId !== userId && order.driverId !== userId) {
    return NextResponse.json(
      { error: "You do not have access to this order." },
      { status: 403 },
    );
  }

  // Nobody has claimed the delivery yet — a null driver is a normal state the
  // map renders as "waiting", not an error.
  if (order.driverId === null) {
    return NextResponse.json({ driver: null }, { status: 200 });
  }

  // An assigned driver should always have a profile, but a driver account
  // created without one (or deleted since) must degrade to "no position known"
  // rather than throwing a 500 at a page that polls every few seconds.
  const driverProfile = order.driver?.driverProfile;

  return NextResponse.json(
    {
      driver: {
        lat: driverProfile?.currentLat ?? null,
        lng: driverProfile?.currentLng ?? null,
        updatedAt: driverProfile?.locationUpdatedAt ?? null,
        isOnline: driverProfile?.isOnline ?? false,
      },
    },
    { status: 200 },
  );
}
